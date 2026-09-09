type OfflineAction = {
  id: string;
  url: string;
  method: string;
  body?: unknown;
  headers?: Record<string, string>;
  timestamp: number;
};

const STORAGE_KEY = '@vaultiline_offline_queue';
let queue: OfflineAction[] = [];
let isProcessing = false;

export function addToQueue(action: Omit<OfflineAction, 'id' | 'timestamp'>): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  queue.push({ ...action, id, timestamp: Date.now() });
  persistQueue();
  return id;
}

export function getQueue(): OfflineAction[] {
  return [...queue];
}

export function clearQueue(): void {
  queue = [];
  AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
}

async function persistQueue() {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Storage full or unavailable — queue will be in-memory only
  }
}

export async function loadQueue(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored) {
      queue = JSON.parse(stored);
    }
  } catch {
    queue = [];
  }
}

export async function processQueue(): Promise<number> {
  if (isProcessing) return 0;
  isProcessing = true;

  let processed = 0;
  const failed: OfflineAction[] = [];

  while (queue.length > 0) {
    const action = queue.shift();
    if (!action) break;
    try {
      const res = await fetch(action.url, {
        method: action.method,
        headers: {
          'Content-Type': 'application/json',
          ...action.headers,
        },
        body: action.body ? JSON.stringify(action.body) : undefined,
      });
      if (res.ok) {
        processed++;
      } else {
        failed.push(action);
      }
    } catch {
      failed.push(action);
      break;
    }
  }

  queue = failed;
  await persistQueue();
  isProcessing = false;
  return processed;
}

import AsyncStorage from '@react-native-async-storage/async-storage';
