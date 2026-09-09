import NetInfo from '@react-native-community/netinfo';

export async function safeFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const state = await NetInfo.fetch();

  if (!state.isConnected) {
    const err = new Error('OFFLINE') as Error & { code: string };
    err.code = 'OFFLINE';
    throw err;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timeout);
  }
}

export async function safeFetchJson<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await safeFetch(url, options);

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  return res.json();
}