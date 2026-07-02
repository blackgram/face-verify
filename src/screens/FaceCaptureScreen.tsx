import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Defs, Mask, Rect as SvgRect, Ellipse } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Brightness from 'expo-brightness';
import { Camera, useCameraDevice, useCameraPermission, usePhotoOutput } from 'react-native-vision-camera';
import type { CameraRef } from 'react-native-vision-camera';
import { useFaceDetectorOutput } from 'react-native-vision-camera-face-detector';
import type { Face } from 'react-native-vision-camera-face-detector';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import type { LivenessPrompt } from '../api/liveness';
import { livenessVerify, ApiError } from '../api/liveness';
import { useLivenessGatekeeper } from '../features/liveness/useLivenessGatekeeper';
import { colors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'FaceCapture'>;

type ScreenPhase = 'instruction' | 'capturing' | 'flash' | 'submitting' | 'error';
type RingState = 'neutral' | 'warning' | 'success';

const PROMPT_LABELS: Record<LivenessPrompt, string> = {
  look_straight: 'Look straight at the camera',
  turn_left: 'Turn your head to the left',
  turn_right: 'Turn your head to the right',
  smile: 'Smile naturally',
  blink: 'Blink naturally',
  nod: 'Nod your head gently',
};

const PROMPT_ICONS: Record<LivenessPrompt, string> = {
  look_straight: '👤',
  turn_left: '👈',
  turn_right: '👉',
  smile: '😊',
  blink: '😑',
  nod: '🙂',
};

const OVAL_W = 280;
const OVAL_H = 280;
const OVAL_RX = 140;
const MASK_ID = 'faceCaptureOvalMask';

export default function FaceCaptureScreen({ navigation, route }: Props) {
  const { bvn, accountNo, sessionId, customerId, nonce, prompts, expiresAt } = route.params;
  const expiresAtMs = new Date(expiresAt).getTime();

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('front');
  const cameraRef = useRef<CameraRef>(null);
  const capturingRef = useRef(false);

  const [phase, setPhase] = useState<ScreenPhase>('instruction');
  const [errorMessage, setErrorMessage] = useState('');
  const [promptIndex, setPromptIndex] = useState(0);
  const [frames, setFrames] = useState<{ uri: string; capturedAtMs: number }[]>([]);
  const [faceDetectionActive, setFaceDetectionActive] = useState(true);

  const currentPrompt = prompts[promptIndex] as LivenessPrompt;
  const { width: winW, height: winH } = useWindowDimensions();
  const [ovalCenter, setOvalCenter] = useState<{ cx: number; cy: number } | null>(null);
  const cutout = ovalCenter ?? { cx: winW / 2, cy: winH / 2 };

  const onOvalLayout = useCallback((e: LayoutChangeEvent) => {
    e.currentTarget.measureInWindow((x, y, w, h) => {
      setOvalCenter({ cx: x + w / 2, cy: y + h / 2 });
    });
  }, []);

  const gatePhase = useMemo(() => {
    if (phase === 'instruction') return 'instruction' as const;
    if (phase === 'capturing' || phase === 'flash') return 'capturing' as const;
    return 'idle' as const;
  }, [phase]);

  const ovalGuide = useMemo(
    () => ({ cx: cutout.cx, cy: cutout.cy, width: OVAL_W, height: OVAL_H, edgeInsetPx: 14 }),
    [cutout.cx, cutout.cy],
  );

  const { onFacesDetected, gateHint, instructionReady, instantOk, resetTemporalState } =
    useLivenessGatekeeper({ prompt: currentPrompt, gatePhase, oval: ovalGuide });

  const handleFaces = useCallback(
    (faces: Face[]) => onFacesDetected(faces, Date.now()),
    [onFacesDetected],
  );

  // v5 face detection output
  const faceDetectorOutput = useFaceDetectorOutput({
    onFacesDetected: handleFaces,
    onError: (e) => console.warn('[FaceDetector]', e),
    performanceMode: 'fast',
    runClassifications: true,
    runLandmarks: false,
    runContours: false,
    minFaceSize: 0.15,
    trackingEnabled: true,
    autoMode: faceDetectionActive,
    windowWidth: winW,
    windowHeight: winH,
    cameraFacing: 'front',
  });

  // v5 photo output
  const photoOutput = usePhotoOutput({ qualityPrioritization: 'speed' });

  const cameraOutputs = useMemo(
    () => [faceDetectorOutput, photoOutput],
    [faceDetectorOutput, photoOutput],
  );

  // Reset temporal state on prompt change
  useEffect(() => { resetTemporalState(); }, [currentPrompt, promptIndex, resetTemporalState]);

  // Max brightness while on this screen
  const savedBrightness = useRef<number | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = await Brightness.getSystemBrightnessAsync();
        if (!cancelled) savedBrightness.current = current;
        await Brightness.setBrightnessAsync(1);
      } catch {}
    })();
    return () => {
      cancelled = true;
      if (savedBrightness.current != null) {
        Brightness.setBrightnessAsync(savedBrightness.current).catch(() => {});
      }
    };
  }, []);

  // Request permission
  useEffect(() => { if (!hasPermission) requestPermission(); }, [hasPermission, requestPermission]);

  // instruction → capturing when ready
  useEffect(() => {
    if (phase !== 'instruction' || !instructionReady) return;
    const id = setTimeout(() => { setPhase('capturing'); }, 450);
    return () => clearTimeout(id);
  }, [phase, instructionReady]);

  // Auto-capture immediately when conditions are met
  useEffect(() => {
    if (phase !== 'capturing' || !instantOk) return;
    if (capturingRef.current) return;
    capturingRef.current = true;
    let cancelled = false;

    // Pause face detection to free AVCaptureSession for photo capture
    setFaceDetectionActive(false);

    const captureTimeout = setTimeout(async () => {
      try {
        const photoFile = await photoOutput.capturePhotoToFile(
          { flashMode: 'off', enableShutterSound: false },
          {},
        );
        if (cancelled) return;
        const uri = photoFile.filePath.startsWith('file://')
          ? photoFile.filePath
          : `file://${photoFile.filePath}`;
        setFrames((prev) => [...prev, { uri, capturedAtMs: Date.now() }]);
        setPhase('flash');
      } catch (e) {
        if (cancelled) return;
        // Retry once after a longer delay on AVFoundation errors
        try {
          await new Promise((r) => setTimeout(r, 200));
          const retryFile = await photoOutput.capturePhotoToFile(
            { flashMode: 'off', enableShutterSound: false },
            {},
          );
          if (cancelled) return;
          const uri = retryFile.filePath.startsWith('file://')
            ? retryFile.filePath
            : `file://${retryFile.filePath}`;
          setFrames((prev) => [...prev, { uri, capturedAtMs: Date.now() }]);
          setPhase('flash');
        } catch (retryErr) {
          if (cancelled) return;
          setErrorMessage(retryErr instanceof Error ? retryErr.message : 'Capture failed.');
          setPhase('error');
        }
      } finally {
        capturingRef.current = false;
        if (!cancelled) setFaceDetectionActive(true);
      }
    }, 150); // Allow 150ms for AVFoundation to release frame pipeline

    return () => {
      cancelled = true;
      clearTimeout(captureTimeout);
      capturingRef.current = false;
      setFaceDetectionActive(true);
    };
  }, [phase, instantOk, photoOutput]);

  // After flash → next prompt or submit
  useEffect(() => {
    if (phase !== 'flash') return;
    const id = setTimeout(() => {
      if (promptIndex >= prompts.length - 1) {
        setPhase('submitting');
      } else {
        setPromptIndex((p) => p + 1);
        setPhase('instruction');
      }
    }, 500);
    return () => clearTimeout(id);
  }, [phase, promptIndex, prompts.length]);

  // Submit
  useEffect(() => {
    if (phase !== 'submitting') return;
    let cancelled = false;
    (async () => {
      if (Date.now() >= expiresAtMs) {
        setErrorMessage('Session expired. Please go back and start again.');
        setPhase('error');
        return;
      }
      try {
        const result = await livenessVerify({
          sessionId,
          nonce,
          frames,
        });
        if (cancelled) return;

        if (result.overall_result === 'retry') {
          // Reset and try same session again
          setFrames([]);
          setPromptIndex(0);
          resetTemporalState();
          setPhase('instruction');
          return;
        }

        navigation.replace('Results', { bvn, accountNo, result });
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 410) {
          setErrorMessage('Session expired. Please go back and start a new session.');
        } else {
          setErrorMessage(e instanceof Error ? e.message : 'Verification failed.');
        }
        setPhase('error');
      }
    })();
    return () => { cancelled = true; };
  }, [phase, sessionId, customerId, accountNo, frames, expiresAtMs, navigation, bvn, resetTemporalState, prompts.length]);

  // ─── Ring / footer ───

  const ringState: RingState = useMemo(() => {
    if (phase === 'flash') return 'success';
    if (phase === 'capturing') return instantOk ? 'success' : 'warning';
    if (phase === 'instruction') return instructionReady ? 'success' : 'warning';
    return 'neutral';
  }, [phase, instantOk, instructionReady]);

  const footerText = useMemo(() => {
    if (phase === 'instruction' && instructionReady) return 'Looks good — hold still';
    if (phase === 'capturing') return gateHint || 'Hold still for auto-capture';
    if (phase === 'instruction' && gateHint) return gateHint;
    return currentPrompt ? PROMPT_LABELS[currentPrompt] : 'Follow the prompt';
  }, [phase, instructionReady, gateHint, currentPrompt]);

  const dotColor = useCallback(
    (i: number) => {
      if (i < promptIndex) return colors.success;
      if (i === promptIndex) {
        if (phase === 'flash') return colors.success;
        if (phase === 'capturing') return colors.primary;
        return colors.warning;
      }
      return colors.disabled;
    },
    [promptIndex, phase],
  );

  // ─── Non-camera states ───

  if (!hasPermission) {
    return (
      <SafeAreaView style={styles.centeredSafe} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <Text style={styles.msgTitle}>Camera permission required</Text>
          <Text style={styles.msgSub}>Allow camera access to verify your identity.</Text>
          <Pressable style={styles.primaryBtn} onPress={requestPermission}>
            <Text style={styles.primaryBtnText}>Allow Camera</Text>
          </Pressable>
          <Pressable style={styles.secondaryBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.secondaryBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'submitting') {
    return (
      <SafeAreaView style={styles.centeredSafe} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.msgSub, { marginTop: 16 }]}>Verifying captured frames…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (phase === 'error') {
    return (
      <SafeAreaView style={styles.centeredSafe} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <Text style={styles.errorIcon}>✕</Text>
          <Text style={styles.msgTitle}>Verification Error</Text>
          <Text style={styles.msgSub}>{errorMessage}</Text>
          <Pressable style={styles.primaryBtn} onPress={() => navigation.popToTop()}>
            <Text style={styles.primaryBtnText}>Start Over</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (!device) {
    return (
      <SafeAreaView style={styles.centeredSafe} edges={['top', 'bottom']}>
        <View style={styles.centered}>
          <Text style={styles.msgTitle}>No front camera found</Text>
          <Pressable style={styles.secondaryBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.secondaryBtnText}>Go Back</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Camera phase ───
  return (
    <View style={styles.cameraRoot}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={phase === 'instruction' || phase === 'capturing' || phase === 'flash'}
        outputs={cameraOutputs}
      />

      {/* White mask overlay with oval cutout + colored border */}
      <Svg width={winW} height={winH} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <Mask id={MASK_ID} maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse">
            <SvgRect width={winW} height={winH} fill="#ffffff" />
            <SvgRect
              x={cutout.cx - OVAL_W / 2}
              y={cutout.cy - OVAL_H / 2}
              width={OVAL_W}
              height={OVAL_H}
              rx={OVAL_RX}
              ry={OVAL_RX}
              fill="#000000"
            />
          </Mask>
        </Defs>
        <SvgRect width={winW} height={winH} fill="#ffffff" mask={`url(#${MASK_ID})`} />
        {/* Oval border ring */}
        <Ellipse
          cx={cutout.cx}
          cy={cutout.cy}
          rx={OVAL_W / 2 + 2}
          ry={OVAL_H / 2 + 2}
          fill="none"
          stroke={ringState === 'success' ? colors.success : ringState === 'warning' ? colors.warning : 'rgba(0,0,0,0.2)'}
          strokeWidth={4}
        />
      </Svg>

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <Pressable style={styles.closeBtn} onPress={() => navigation.popToTop()}>
            <Text style={styles.closeBtnText}>✕</Text>
          </Pressable>
          <View style={styles.stepBadge}>
            <Text style={styles.stepBadgeText}>
              {Math.min(promptIndex + 1, prompts.length)} / {prompts.length}
            </Text>
          </View>
        </View>

        {/* Prompt */}
        <View style={styles.promptCard}>
          <Text style={styles.promptEmoji}>{currentPrompt ? PROMPT_ICONS[currentPrompt] : '👤'}</Text>
          <Text style={styles.promptTitle}>
            {currentPrompt ? PROMPT_LABELS[currentPrompt] : 'Follow the prompt'}
          </Text>
        </View>

        {/* Oval area */}
        <View style={styles.ovalWrap} onLayout={onOvalLayout}>
          <View style={styles.ovalPlate}>
            <View style={styles.ovalHud} pointerEvents="none">
              {phase === 'flash' && <Text style={styles.captured}>✓</Text>}
            </View>
          </View>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.dots}>
            {prompts.map((_, i) => (
              <View
                key={i}
                style={[styles.dot, { backgroundColor: dotColor(i) }, i === promptIndex && styles.dotActive]}
              />
            ))}
          </View>
          <Text style={styles.footerText}>{footerText}</Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  // Centered states
  centeredSafe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  msgTitle: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 8 },
  msgSub: { fontSize: 15, color: colors.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  errorIcon: { fontSize: 48, color: colors.error, fontWeight: '800', marginBottom: 12 },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 24, width: '100%', maxWidth: 320, alignItems: 'center', marginBottom: 10 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  secondaryBtn: { borderRadius: 14, paddingVertical: 14, width: '100%', maxWidth: 320, alignItems: 'center', backgroundColor: colors.backgroundSecondary, borderWidth: 1, borderColor: colors.border },
  secondaryBtnText: { color: colors.text, fontWeight: '600', fontSize: 16 },

  // Camera
  cameraRoot: { flex: 1, backgroundColor: '#fff' },
  overlay: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: 'transparent', zIndex: 2 },

  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  closeBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.08)' },
  closeBtnText: { color: colors.text, fontSize: 18, fontWeight: '700' },
  stepBadge: { backgroundColor: 'rgba(0,0,0,0.08)', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 6 },
  stepBadgeText: { color: colors.text, fontSize: 13, fontWeight: '600' },

  promptCard: { alignSelf: 'center', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.06)', borderWidth: 1, borderColor: 'rgba(0,0,0,0.08)' },
  promptEmoji: { fontSize: 28, marginBottom: 6 },
  promptTitle: { color: colors.primary, fontSize: 17, fontWeight: '700', textAlign: 'center' },

  ovalWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  ovalPlate: { width: OVAL_W, height: OVAL_H, borderRadius: OVAL_W / 2, zIndex: 1, alignItems: 'center', justifyContent: 'center' },
  ovalHud: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },

  captured: { color: colors.success, fontSize: 54, fontWeight: '800', textShadowColor: 'rgba(0,0,0,0.3)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },

  footer: { marginBottom: 6 },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotActive: { width: 10, height: 10, borderRadius: 5 },
  footerText: { color: colors.text, fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
