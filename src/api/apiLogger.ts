import { Platform } from 'react-native';

export interface ApiLogEntry {
  id: number;
  timestamp: string;
  method: string;
  url: string;
  status?: number;
  durationMs?: number;
  requestBody?: string;
  responseBody?: string;
  error?: string;
}

type Listener = () => void;

let nextId = 1;
const logs: ApiLogEntry[] = [];
const listeners = new Set<Listener>();

function notify() {
  listeners.forEach((l) => l());
}

export function addApiLog(entry: Omit<ApiLogEntry, 'id' | 'timestamp'>): ApiLogEntry {
  const log: ApiLogEntry = {
    ...entry,
    id: nextId++,
    timestamp: new Date().toISOString(),
  };
  logs.unshift(log);
  if (logs.length > 50) logs.pop();

  // Console output
  const tag = `[API ${log.method} ${log.status ?? '...'}]`;
  const info = `${tag} ${log.url}${log.durationMs != null ? ` (${log.durationMs}ms)` : ''}`;
  if (log.error) {
    console.error(info, '\n  Error:', log.error);
  } else {
    console.log(info);
  }
  if (log.requestBody) console.log('  Request:', log.requestBody);
  if (log.responseBody) console.log('  Response:', log.responseBody.slice(0, 500));

  notify();
  return log;
}

export function getApiLogs(): readonly ApiLogEntry[] {
  return logs;
}

export function subscribeApiLogs(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearApiLogs() {
  logs.length = 0;
  notify();
}
