const DEFAULT_API_BASE = "https://chat-api.smaiclub.top";

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export const CHAT_API_BASE = trimTrailingSlash(
  import.meta.env.VITE_CHAT_API_BASE || DEFAULT_API_BASE,
);

export const IS_DEMO_MODE = import.meta.env.VITE_CHAT_DEMO === "1";

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${CHAT_API_BASE}${normalizedPath}`;
}

export function websocketUrl(path: string) {
  const apiBase = new URL(CHAT_API_BASE);
  apiBase.protocol = apiBase.protocol === "https:" ? "wss:" : "ws:";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${apiBase.origin}${normalizedPath}`;
}
