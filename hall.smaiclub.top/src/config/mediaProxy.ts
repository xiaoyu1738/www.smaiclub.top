const DEFAULT_PROXY_PLAYER_ORIGIN = 'https://proxyplayer.smaiclub.top';
const LEGACY_WORKER_ORIGINS = ['https://hall-worker.xiaoyu1738jw.workers.dev'];

export const PROXY_PLAYER_ORIGIN =
  import.meta.env.VITE_WORKER_HOST?.replace(/\/+$/, '') ?? DEFAULT_PROXY_PLAYER_ORIGIN;

export function normalizeProxyOriginUrl(url: string): string {
  const normalizedUrl = url.trim();
  if (!normalizedUrl) {
    return normalizedUrl;
  }

  const matchedLegacyOrigin = LEGACY_WORKER_ORIGINS.find((origin) => normalizedUrl.startsWith(origin));
  if (!matchedLegacyOrigin) {
    return normalizedUrl;
  }

  return `${PROXY_PLAYER_ORIGIN}${normalizedUrl.slice(matchedLegacyOrigin.length)}`;
}
