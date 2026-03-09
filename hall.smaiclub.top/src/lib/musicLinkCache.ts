export interface MusicLinkCacheEntry {
  url: string;
  expiresAt: number;
}

export type MusicLinkSource = 'local' | 'remote';

export interface MusicLinkResolution extends MusicLinkCacheEntry {
  source: MusicLinkSource;
}

interface MusicLinkApiSuccess {
  code: 200;
  url: string;
}

interface MusicLinkApiError {
  code: number;
  error?: string;
}

const MUSIC_LINK_STORAGE_KEY_PREFIX = 'hall.musicLinkCache.v1:';
const MUSIC_LINK_TTL_MS = 7_200_000;
const EARLY_EXPIRY_MS = 5 * 60 * 1000;
const MUSIC_LINK_API_URL =
  import.meta.env.VITE_MUSIC_LINK_API_URL ?? 'https://hall-worker.xiaoyu1738jw.workers.dev/api/music/get-link';

const inflightRequests = new Map<string, Promise<MusicLinkResolution>>();

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function getStorageKey(path: string): string {
  return `${MUSIC_LINK_STORAGE_KEY_PREFIX}${encodeURIComponent(path)}`;
}

function readEntry(path: string): MusicLinkCacheEntry | null {
  if (!canUseLocalStorage()) {
    return null;
  }

  const rawValue = window.localStorage.getItem(getStorageKey(path));
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<MusicLinkCacheEntry>;
    if (typeof parsed.url !== 'string' || typeof parsed.expiresAt !== 'number') {
      window.localStorage.removeItem(getStorageKey(path));
      return null;
    }

    return parsed as MusicLinkCacheEntry;
  } catch {
    window.localStorage.removeItem(getStorageKey(path));
    return null;
  }
}

function writeEntry(path: string, entry: MusicLinkCacheEntry): void {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(getStorageKey(path), JSON.stringify(entry));
  } catch {
    window.localStorage.removeItem(getStorageKey(path));
  }
}

export function invalidateMusicLink(path: string): void {
  if (!canUseLocalStorage()) {
    return;
  }

  window.localStorage.removeItem(getStorageKey(path));
}

export function getCachedMusicLink(path: string): MusicLinkResolution | null {
  const normalizedPath = path.trim();
  if (!normalizedPath) {
    return null;
  }

  const entry = readEntry(normalizedPath);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt - EARLY_EXPIRY_MS <= Date.now()) {
    invalidateMusicLink(normalizedPath);
    return null;
  }

  return {
    ...entry,
    source: 'local'
  };
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return '获取音频直链失败，请稍后重试。';
}

function isMusicLinkApiSuccess(payload: unknown): payload is MusicLinkApiSuccess {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<MusicLinkApiSuccess>;
  return candidate.code === 200 && typeof candidate.url === 'string';
}

function getApiErrorMessage(payload: MusicLinkApiSuccess | MusicLinkApiError | null): string | null {
  if (!payload || payload.code === 200) {
    return null;
  }

  return payload.error?.trim() || null;
}

async function fetchMusicLink(path: string): Promise<MusicLinkResolution> {
  const endpoint = new URL(MUSIC_LINK_API_URL);
  endpoint.searchParams.set('path', path);

  const response = await fetch(endpoint.toString(), {
    method: 'GET'
  });

  let payload: MusicLinkApiSuccess | MusicLinkApiError | null = null;
  try {
    payload = (await response.json()) as MusicLinkApiSuccess | MusicLinkApiError;
  } catch {
    throw new Error(`直链接口返回了不可解析的响应，HTTP ${response.status}`);
  }

  if (!response.ok || !isMusicLinkApiSuccess(payload)) {
    const message = getApiErrorMessage(payload);
    throw new Error(message || `直链接口请求失败，HTTP ${response.status}`);
  }

  const entry: MusicLinkCacheEntry = {
    url: payload.url,
    expiresAt: Date.now() + MUSIC_LINK_TTL_MS
  };

  writeEntry(path, entry);

  return {
    ...entry,
    source: 'remote'
  };
}

export async function resolveMusicLink(path: string): Promise<MusicLinkResolution> {
  const normalizedPath = path.trim();
  if (!normalizedPath) {
    throw new Error('音频路径不能为空。');
  }

  const cached = getCachedMusicLink(normalizedPath);
  if (cached) {
    return cached;
  }

  const existingRequest = inflightRequests.get(normalizedPath);
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetchMusicLink(normalizedPath).finally(() => {
    inflightRequests.delete(normalizedPath);
  });

  inflightRequests.set(normalizedPath, request);
  return request;
}

export function toMusicLinkErrorMessage(error: unknown): string {
  return getErrorMessage(error);
}
