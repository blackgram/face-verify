# Face Verify App

A React Native (Expo) application for facial liveness verification. Users complete a series of face prompts (look straight, turn, blink, smile) captured via the front camera, which are then submitted to a backend API for anti-spoofing analysis and identity verification.

## Features

- **Real-time face detection** — ML Kit face detector running on camera frames via Vision Camera v5
- **Liveness gatekeeper** — Client-side gate logic validates pose, blink, smile, and head turn before capturing
- **Auto-capture** — Photos are taken automatically when liveness conditions are met (no manual shutter)
- **Anti-spoof checks** — Motion variance detection blocks flat photos and screen replays
- **Guided UX** — Animated ring, progress dots, and contextual hints guide the user through each prompt
- **Server-driven prompts** — The backend controls which prompts to issue and in what order

## Screens

| Screen | Purpose |
|---|---|
| **BvnEntry** | Collects BVN and account number, initiates a liveness session |
| **Instructions** | Displays tips (lighting, obstructions, phone position) before capture |
| **FaceCapture** | Camera view with circular guide overlay, real-time face gating, and auto-capture |
| **Results** | Shows verification outcome (pass / fail / spoof detected / retry / step-up) |

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/) / React Native 0.86 |
| Camera | [react-native-vision-camera v5](https://react-native-vision-camera.com/) |
| Face Detection | [react-native-vision-camera-face-detector v2](https://github.com/nonam4/react-native-vision-camera-face-detector) (Google ML Kit) |
| Navigation | React Navigation v7 (Native Stack) |
| Image Processing | expo-image-manipulator (frame compression before upload) |
| UI | react-native-svg (overlay mask), react-native-safe-area-context, react-native-reanimated |

## Project Structure

```
src/
├── api/
│   ├── liveness.ts            # API client — livenessStart(), livenessVerify()
│   └── apiLogger.ts           # Request/response logging overlay
├── components/
│   └── ApiLogOverlay.tsx       # Debug overlay for API traffic
├── features/
│   └── liveness/
│       ├── gatekeeper.ts       # Gate logic, thresholds, blink/nod state machines
│       ├── useLivenessGatekeeper.ts  # React hook — temporal gating, motion analysis
│       └── sceneExposure.ts    # Brightness/exposure gate
├── navigation/
│   └── AppNavigator.tsx        # Stack navigator (BvnEntry → Instructions → FaceCapture → Results)
├── screens/
│   ├── BvnEntryScreen.tsx
│   ├── InstructionsScreen.tsx
│   ├── FaceCaptureScreen.tsx
│   └── ResultsScreen.tsx
├── config.ts                   # API base URL
└── theme.ts                    # Colors, spacing, radii
```

## Prerequisites

- **Node.js** ≥ 18
- **Xcode** ≥ 15 (iOS) / **Android Studio** (Android)
- Physical device (camera features do not work in simulators)
- An API backend implementing the `/api/kyc/liveness/start` and `/api/kyc/liveness/verify` endpoints

## Getting Started

```bash
# Install dependencies
npm install

# Install iOS native pods
cd ios && pod install && cd ..

# Run on a connected iOS device
npx expo run:ios --device

# Run on a connected Android device
npx expo run:android --device
```

## Configuration

Set the API base URL via environment variable or edit `src/config.ts`:

```bash
EXPO_PUBLIC_API_URL=https://your-api.example.com npx expo start
```

## API Contract

### `POST /api/kyc/liveness/start`

**Request:**
```json
{ "bvn": "12345678901", "account_no": "0012345678" }
```

**Response:**
```json
{
  "session_id": "uuid",
  "customer_id": "uuid",
  "nonce": "random-string",
  "prompts": ["look_straight", "blink", "turn_left", "smile"],
  "expires_at": "2026-07-02T12:00:00Z",
  "max_retries": 3
}
```

### `POST /api/kyc/liveness/verify`

**Request:** `multipart/form-data` with compressed JPEG frames, session ID, and nonce.

**Response:**
```json
{
  "overall_result": "pass | fail | spoof_detected | retry | step_up",
  "per_frame_scores": [...],
  "face_verification": { "match": true, "similarity": 0.95 }
}
```

## Liveness Prompts

The server controls which prompts are issued. Supported prompts:

| Prompt | What the user does | Detection method |
|---|---|---|
| `look_straight` | Face the camera with eyes open | Yaw/pitch within ±5°, eyes open ≥85% |
| `turn_left` | Turn head to the left | Yaw angle threshold |
| `turn_right` | Turn head to the right | Yaw angle threshold |
| `blink` | Blink naturally | Eye-open probability state machine (open → closed → recovery) |
| `smile` | Smile naturally | Smile probability ≥75% |
| `nod` | Nod head downward | Pitch angle state machine (down → recovery) |

**Recommended combo:** `look_straight` → `blink` → `turn_left` → `smile` (covers still-photo, flat-screen, and expression-based anti-spoof vectors).

## Permissions

| Platform | Permission | Reason |
|---|---|---|
| iOS | `NSCameraUsageDescription` | Front camera access for face capture |
| Android | `android.permission.CAMERA` | Front camera access for face capture |

## License

See [LICENSE](LICENSE).
