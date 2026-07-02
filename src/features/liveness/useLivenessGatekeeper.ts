import { useCallback, useMemo, useRef, useState } from 'react';
import type { Face } from 'react-native-vision-camera-face-detector';
import type { LivenessPrompt } from '../../api/liveness';
import {
  advanceBlinkState,
  advanceNodState,
  computePositionVariance,
  evaluateInstantGate,
  GATE_HINTS,
  initialBlinkState,
  initialNodState,
  type BlinkState,
  type GateBlockReason,
  type NodState,
  type OvalGuide,
} from './gatekeeper';

export type GatekeeperPhase = 'idle' | 'instruction' | 'capturing';

const THROTTLE_MS = 95;
const READY_DEBOUNCE_MS = 420;
const STATIC_VARIANCE_MAX = 8;
const STATIC_DURATION_MS = 1400;
const MOTION_MAX_SAMPLES = 14;

export function useLivenessGatekeeper(params: {
  prompt: LivenessPrompt | undefined;
  gatePhase: GatekeeperPhase;
  oval: OvalGuide;
  sceneMeanLuma?: number;
}) {
  const { prompt, gatePhase, oval, sceneMeanLuma } = params;

  const motionSamplesRef = useRef<{ cx: number; cy: number }[]>([]);
  const lowMotionSinceRef = useRef<number | null>(null);
  const readySinceRef = useRef<number | null>(null);
  const lastProcessAtRef = useRef(0);

  const blinkStateRef = useRef<BlinkState>(initialBlinkState());
  const nodStateRef = useRef<NodState>(initialNodState());

  const [blockReason, setBlockReason] = useState<GateBlockReason | null>('no_face');
  const [instructionReady, setInstructionReady] = useState(false);
  const [instantOk, setInstantOk] = useState(false);

  const prevReasonRef = useRef<GateBlockReason | null>(null);
  const prevInstrReadyRef = useRef(false);
  const prevInstantRef = useRef(false);

  const gateHint = useMemo(
    () => (blockReason ? GATE_HINTS[blockReason] : ''),
    [blockReason],
  );

  const resetTemporalState = useCallback(() => {
    motionSamplesRef.current = [];
    lowMotionSinceRef.current = null;
    readySinceRef.current = null;
    lastProcessAtRef.current = 0;
    blinkStateRef.current = initialBlinkState();
    nodStateRef.current = initialNodState();
  }, []);

  const onFacesDetected = useCallback(
    (faces: Face[], now: number = Date.now()) => {
      if (gatePhase === 'idle' || !prompt) return;
      if (now - lastProcessAtRef.current < THROTTLE_MS) return;
      lastProcessAtRef.current = now;

      if (faces.length === 1) {
        const face = faces[0];
        if (prompt === 'blink') {
          const leftEye = face.leftEyeOpenProbability ?? 1;
          const rightEye = face.rightEyeOpenProbability ?? 1;
          blinkStateRef.current = advanceBlinkState(blinkStateRef.current, leftEye, rightEye, now);
        }
        if (prompt === 'nod') {
          const pitch = face.pitchAngle ?? 0;
          nodStateRef.current = advanceNodState(nodStateRef.current, pitch);
        }
      } else {
        blinkStateRef.current = initialBlinkState();
        nodStateRef.current = initialNodState();
      }

      const blinkDetected = blinkStateRef.current.phase === 'detected';
      const nodDetected = nodStateRef.current.wentDown;

      const instant = evaluateInstantGate({
        faces,
        prompt,
        oval,
        sceneMeanLuma,
        blinkDetected,
        nodDetected,
      });

      if (faces.length === 1 && instant.ok) {
        const b = faces[0].bounds;
        motionSamplesRef.current.push({ cx: b.x + b.width / 2, cy: b.y + b.height / 2 });
        while (motionSamplesRef.current.length > MOTION_MAX_SAMPLES) {
          motionSamplesRef.current.shift();
        }
      } else {
        motionSamplesRef.current = [];
        lowMotionSinceRef.current = null;
      }

      let reason: GateBlockReason | null = instant.reason;

      if (gatePhase === 'instruction' && faces.length === 1 && instant.ok) {
        const varI = computePositionVariance(motionSamplesRef.current);
        if (varI < STATIC_VARIANCE_MAX) {
          if (lowMotionSinceRef.current == null) lowMotionSinceRef.current = now;
        } else {
          lowMotionSinceRef.current = null;
        }
        if (lowMotionSinceRef.current != null && now - lowMotionSinceRef.current > STATIC_DURATION_MS) {
          reason = 'anti_static';
        }
      } else {
        lowMotionSinceRef.current = null;
      }

      const okForDebounce = instant.ok && reason === null;
      if (gatePhase === 'instruction' && okForDebounce) {
        if (readySinceRef.current == null) readySinceRef.current = now;
      } else {
        readySinceRef.current = null;
      }

      const instrReady =
        gatePhase === 'instruction' &&
        okForDebounce &&
        readySinceRef.current != null &&
        now - readySinceRef.current >= READY_DEBOUNCE_MS;

      const instantOkOut = instant.ok && (gatePhase === 'capturing' ? reason == null : true);

      if (
        reason !== prevReasonRef.current ||
        instrReady !== prevInstrReadyRef.current ||
        instantOkOut !== prevInstantRef.current
      ) {
        prevReasonRef.current = reason;
        prevInstrReadyRef.current = instrReady;
        prevInstantRef.current = instantOkOut;
        setBlockReason(reason);
        setInstructionReady(instrReady);
        setInstantOk(instantOkOut);
      }
    },
    [gatePhase, oval, prompt, sceneMeanLuma],
  );

  return {
    onFacesDetected,
    gateHint,
    blockReason,
    instructionReady,
    instantOk,
    resetTemporalState,
  };
}
