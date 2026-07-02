import type { Face } from 'react-native-vision-camera-face-detector';
import type { LivenessPrompt } from '../../api/liveness';
import { exposureWouldBlock } from './sceneExposure';

export type GateBlockReason =
  | 'no_face'
  | 'multi_face'
  | 'too_dark'
  | 'face_too_small'
  | 'face_not_in_oval'
  | 'pose_look_straight'
  | 'pose_turn_left'
  | 'pose_turn_right'
  | 'pose_nod'
  | 'blink_required'
  | 'smile_required'
  | 'anti_static';

export const GATE_HINTS: Record<GateBlockReason, string> = {
  no_face: "We can't see your face. Center yourself in the guide.",
  multi_face: 'Only one face should be visible.',
  too_dark: 'Too dark — move to a brighter spot, then try again.',
  face_too_small: 'Move a little closer.',
  face_not_in_oval: 'Align your face inside the circle.',
  pose_look_straight: 'Look straight at the camera with eyes open.',
  pose_turn_left: 'Turn your head to the left.',
  pose_turn_right: 'Turn your head to the right.',
  pose_nod: 'Nod your head downward.',
  blink_required: 'Blink naturally.',
  smile_required: 'Give a clear, natural smile.',
  anti_static: 'Hold the phone naturally and move slightly — avoid a flat photo or screen.',
};

/** Capsule / oval guide in screen space. */
export type OvalGuide = {
  cx: number;
  cy: number;
  width: number;
  height: number;
  edgeInsetPx: number;
};

// ─── Thresholds ───
const MIN_FACE_WIDTH_FRAC = 0.17;

const STRAIGHT_YAW_MAX = 5;
const STRAIGHT_PITCH_MAX = 5;
const STRAIGHT_EYE_OPEN_MIN = 0.85;

const TURN_YAW_MIN = 18;
const TURN_PITCH_MAX = 15;

const NOD_PITCH_DOWN = -12;

const SMILE_MIN = 0.75;

export const BLINK_OPEN_MIN = 0.80;
export const BLINK_CLOSED_MAX = 0.30;
export const BLINK_RECOVERY_MIN = 0.55;
export const BLINK_MAX_DURATION_MS = 1500;

/** Blink detection state machine phases. */
export type BlinkPhase = 'waiting_open' | 'waiting_closed' | 'waiting_recovery' | 'detected';

export interface BlinkState {
  phase: BlinkPhase;
  openDetectedAt: number | null;
}

export function initialBlinkState(): BlinkState {
  return { phase: 'waiting_open', openDetectedAt: null };
}

export function advanceBlinkState(
  state: BlinkState,
  leftEye: number,
  rightEye: number,
  now: number,
): BlinkState {
  const avgOpen = (leftEye + rightEye) / 2;
  const bothOpen = avgOpen > BLINK_OPEN_MIN;
  const bothClosed = avgOpen < BLINK_CLOSED_MAX;
  const bothRecovered = avgOpen > BLINK_RECOVERY_MIN;

  switch (state.phase) {
    case 'waiting_open':
      if (bothOpen) return { phase: 'waiting_closed', openDetectedAt: now };
      return state;

    case 'waiting_closed':
      if (bothClosed) {
        if (state.openDetectedAt != null && now - state.openDetectedAt > BLINK_MAX_DURATION_MS) {
          return initialBlinkState();
        }
        return { ...state, phase: 'waiting_recovery' };
      }
      if (bothOpen) return state;
      if (state.openDetectedAt != null && now - state.openDetectedAt > BLINK_MAX_DURATION_MS) {
        return initialBlinkState();
      }
      return state;

    case 'waiting_recovery':
      if (bothRecovered) {
        if (state.openDetectedAt != null && now - state.openDetectedAt <= BLINK_MAX_DURATION_MS) {
          return { phase: 'detected', openDetectedAt: state.openDetectedAt };
        }
        return initialBlinkState();
      }
      if (state.openDetectedAt != null && now - state.openDetectedAt > BLINK_MAX_DURATION_MS) {
        return initialBlinkState();
      }
      return state;

    case 'detected':
      return state;
  }
}

/** Nod detection: track whether pitch went below threshold. */
export interface NodState {
  wentDown: boolean;
  recoveredUp: boolean;
}

export function initialNodState(): NodState {
  return { wentDown: false, recoveredUp: false };
}

export function advanceNodState(state: NodState, pitch: number): NodState {
  if (!state.wentDown) {
    if (pitch < NOD_PITCH_DOWN) return { wentDown: true, recoveredUp: false };
    return state;
  }
  if (!state.recoveredUp) {
    if (pitch > -5) return { wentDown: true, recoveredUp: true };
    return state;
  }
  return state;
}

function faceCenter(face: Face): { cx: number; cy: number } {
  const { bounds } = face;
  return { cx: bounds.x + bounds.width / 2, cy: bounds.y + bounds.height / 2 };
}

/** Axis-aligned check inside inset oval bounding box. */
export function faceCenterInOval(center: { cx: number; cy: number }, oval: OvalGuide): boolean {
  const halfW = oval.width / 2 - oval.edgeInsetPx;
  const halfH = oval.height / 2 - oval.edgeInsetPx;
  if (halfW <= 0 || halfH <= 0) return false;
  return (
    center.cx >= oval.cx - halfW &&
    center.cx <= oval.cx + halfW &&
    center.cy >= oval.cy - halfH &&
    center.cy <= oval.cy + halfH
  );
}

export function computePositionVariance(samples: { cx: number; cy: number }[]): number {
  if (samples.length < 3) return Number.POSITIVE_INFINITY;
  let mx = 0;
  let my = 0;
  for (const s of samples) { mx += s.cx; my += s.cy; }
  mx /= samples.length;
  my /= samples.length;
  let acc = 0;
  for (const s of samples) {
    const dx = s.cx - mx;
    const dy = s.cy - my;
    acc += dx * dx + dy * dy;
  }
  return acc / samples.length;
}

export function evaluateInstantGate(params: {
  faces: Face[];
  prompt: LivenessPrompt;
  oval: OvalGuide;
  sceneMeanLuma?: number;
  blinkDetected?: boolean;
  nodDetected?: boolean;
}): { ok: boolean; reason: GateBlockReason | null } {
  const { faces, prompt, oval, sceneMeanLuma, blinkDetected, nodDetected } = params;

  if (exposureWouldBlock(sceneMeanLuma)) return { ok: false, reason: 'too_dark' };
  if (faces.length === 0) return { ok: false, reason: 'no_face' };
  if (faces.length > 1) return { ok: false, reason: 'multi_face' };

  const face = faces[0];
  const { bounds } = face;
  const center = faceCenter(face);

  if (bounds.width < oval.width * MIN_FACE_WIDTH_FRAC) return { ok: false, reason: 'face_too_small' };
  if (!faceCenterInOval(center, oval)) return { ok: false, reason: 'face_not_in_oval' };

  const yaw = face.yawAngle ?? 0;
  const pitch = face.pitchAngle ?? 0;
  const leftEye = face.leftEyeOpenProbability ?? 1;
  const rightEye = face.rightEyeOpenProbability ?? 1;
  const smileScore = face.smilingProbability ?? 0;

  switch (prompt) {
    case 'look_straight':
      if (Math.abs(yaw) > STRAIGHT_YAW_MAX) return { ok: false, reason: 'pose_look_straight' };
      if (Math.abs(pitch) > STRAIGHT_PITCH_MAX) return { ok: false, reason: 'pose_look_straight' };
      if (leftEye < STRAIGHT_EYE_OPEN_MIN || rightEye < STRAIGHT_EYE_OPEN_MIN) return { ok: false, reason: 'pose_look_straight' };
      break;
    case 'turn_left':
      if (yaw > -TURN_YAW_MIN) return { ok: false, reason: 'pose_turn_left' };
      if (Math.abs(pitch) > TURN_PITCH_MAX) return { ok: false, reason: 'pose_turn_left' };
      break;
    case 'turn_right':
      if (yaw < TURN_YAW_MIN) return { ok: false, reason: 'pose_turn_right' };
      if (Math.abs(pitch) > TURN_PITCH_MAX) return { ok: false, reason: 'pose_turn_right' };
      break;
    case 'nod':
      if (!nodDetected) return { ok: false, reason: 'pose_nod' };
      break;
    case 'blink':
      if (!blinkDetected) return { ok: false, reason: 'blink_required' };
      break;
    case 'smile':
      if (smileScore < SMILE_MIN) return { ok: false, reason: 'smile_required' };
      break;
  }

  return { ok: true, reason: null };
}
