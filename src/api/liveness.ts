import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { API_BASE_URL } from '../config';
import { addApiLog } from './apiLogger';

// ─── Types ───

export type LivenessPrompt =
  | 'look_straight'
  | 'turn_left'
  | 'turn_right'
  | 'smile'
  | 'blink'
  | 'nod';

export interface LivenessStartResponse {
  session_id: string;
  customer_id: string;
  nonce: string;
  prompts: LivenessPrompt[];
  expires_at: string;
  max_retries: number;
}

export interface PerFrameScore {
  prompt: string;
  is_real: boolean;
  confidence: number;
  reason?: string;
}

export interface ReplaySignals {
  phash_distances: number[];
  brightness_stddev_spread: number;
  is_suspicious_identical: boolean;
  is_suspicious_scene_change: boolean;
  is_suspicious_uniform_brightness: boolean;
  notes: string[];
}

export interface LivenessVerifyResponse {
  session_id: string;
  liveness_check: { is_real: boolean; confidence: number };
  face_verification: { verified: boolean; confidence: number; distance: number };
  overall_result: 'pass' | 'fail' | 'spoof_detected' | 'retry' | 'step_up';
  message: string;
  per_frame_scores: PerFrameScore[];
  replay_signals: ReplaySignals;
  risk_flags: string[];
}

// ─── Error class ───

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// ─── Helpers ───

const TIMEOUT_MS = 120_000;

const DEFAULT_HEADERS: Record<string, string> = {
  'X-Client-Id': 'liveliness',
  'X-Client-Secret': '3F9kPvb2uPjuamGtMn8UmyRbW2woILksI874e2hwvKWDHQot/58wPEiBCSZevhyB',
};

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      headers: { ...DEFAULT_HEADERS, ...(init.headers as Record<string, string>) },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.detail) msg = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail);
    } catch { /* ignore parse errors */ }
    throw new ApiError(msg, res.status);
  }
  return res.json() as Promise<T>;
}

// ─── API calls ───

export async function livenessStart(
  bvn: string,
  accountNo: string,
): Promise<LivenessStartResponse> {
  const url = `${API_BASE_URL}/api/kyc/liveness/start`;
  const body = new URLSearchParams({
    customer_bvn: bvn,
    account_no: accountNo,
    app_id: 'face-verify-app',
  }).toString();

  const start = Date.now();
  addApiLog({ method: 'POST', url, requestBody: JSON.stringify({ customer_bvn: bvn, account_no: accountNo, app_id: 'face-verify-app' }) });
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = await handleResponse<LivenessStartResponse>(res);
    addApiLog({ method: 'POST', url, status: res.status, durationMs: Date.now() - start, responseBody: JSON.stringify(data) });
    return data;
  } catch (e: any) {
    addApiLog({ method: 'POST', url, durationMs: Date.now() - start, error: e.message ?? String(e), status: e.status });
    throw e;
  }
}

async function compressFrame(uri: string): Promise<string> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: 720 });
  const ref = await context.renderAsync();
  const result = await ref.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  return result.uri;
}

export async function livenessVerify(params: {
  sessionId: string;
  nonce: string;
  frames: { uri: string; capturedAtMs: number }[];
}): Promise<LivenessVerifyResponse> {
  const url = `${API_BASE_URL}/api/kyc/liveness/verify`;
  const { sessionId, nonce, frames } = params;

  // Compress frames before uploading to avoid 413 errors
  const compressedUris = await Promise.all(frames.map((f) => compressFrame(f.uri)));

  const form = new FormData();
  form.append('session_id', sessionId);
  form.append('nonce', nonce);
  form.append('timestamps', JSON.stringify(frames.map((f) => f.capturedAtMs)));

  for (let i = 0; i < frames.length; i++) {
    form.append(`frame_${i}`, {
      uri: compressedUris[i],
      name: `frame_${i}.jpg`,
      type: 'image/jpeg',
    } as unknown as Blob);
  }

  const start = Date.now();
  addApiLog({ method: 'POST', url, requestBody: JSON.stringify({ session_id: sessionId, nonce, frames: frames.length }) });

  return new Promise<LivenessVerifyResponse>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('X-Client-Id', DEFAULT_HEADERS['X-Client-Id']);
    xhr.setRequestHeader('X-Client-Secret', DEFAULT_HEADERS['X-Client-Secret']);
    xhr.timeout = TIMEOUT_MS;

    xhr.onload = () => {
      const durationMs = Date.now() - start;
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          addApiLog({ method: 'POST', url, status: xhr.status, durationMs, responseBody: xhr.responseText.slice(0, 500) });
          resolve(data as LivenessVerifyResponse);
        } else {
          const msg = data.detail
            ? typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)
            : `Request failed (${xhr.status})`;
          addApiLog({ method: 'POST', url, status: xhr.status, durationMs, error: msg });
          reject(new ApiError(msg, xhr.status));
        }
      } catch {
        addApiLog({ method: 'POST', url, status: xhr.status, durationMs, error: 'Invalid JSON response' });
        reject(new ApiError('Invalid JSON response', xhr.status));
      }
    };

    xhr.onerror = () => {
      const durationMs = Date.now() - start;
      addApiLog({ method: 'POST', url, durationMs, error: 'Network error' });
      reject(new ApiError('Network error', 0));
    };

    xhr.ontimeout = () => {
      const durationMs = Date.now() - start;
      addApiLog({ method: 'POST', url, durationMs, error: 'Request timed out' });
      reject(new ApiError('Request timed out', 0));
    };

    xhr.send(form);
  });
}
