export interface Env {
  DB: D1Database;
  XUI_BASE_URL?: string;
  XUI_USERNAME?: string;
  XUI_PASSWORD?: string;
  XUI_COOKIE?: string;
  XUI_INBOUND_ID?: string;
  XUI_HY2_INBOUND_ID?: string;
  XUI_ACCESS_CLIENT_ID?: string;
  XUI_ACCESS_CLIENT_SECRET?: string;
  XUI_ACCESS_AUTH_HEADER?: string;
}

interface XuiSession {
  cookie: string;
  csrfToken?: string;
}

export interface XuiClientStat {
  uuid: string;
  used: number;
}

export async function setXuiClientEnabled(env: Env, uuid: string, enabled: boolean, email = uuid): Promise<boolean> {
  if (!env.XUI_BASE_URL || !parsePositiveInteger(env.XUI_INBOUND_ID)) return false;
  const session = await getXuiSession(env);
  if (!session) return false;
  return setXuiClientEnabledByEmail(env, session, email, enabled);
}

export async function fetchXuiClientStats(env: Env): Promise<XuiClientStat[]> {
  if (!env.XUI_BASE_URL) return [];
  const session = await getXuiSession(env);
  if (!session) return [];
  const response = await fetch(`${trimSlash(env.XUI_BASE_URL)}/panel/api/inbounds/list`, {
    headers: xuiSessionHeaders(env, session),
  });
  if (!response.ok) return [];
  const payload = await response.json().catch(() => null);
  return parseXuiClientStats(payload);
}

export function parseXuiClientStats(payload: unknown): XuiClientStat[] {
  const inbounds = extractInbounds(payload);
  const stats: XuiClientStat[] = [];
  for (const inbound of inbounds) {
    const clientStats = Array.isArray(inbound.clientStats) ? inbound.clientStats : [];
    for (const raw of clientStats) {
      if (!raw || typeof raw !== 'object') continue;
      const stat = raw as Record<string, unknown>;
      const uuid = String(stat.uuid || stat.id || stat.auth || stat.email || '').trim();
      const used = Number(stat.up || stat.upload || 0) + Number(stat.down || stat.download || 0);
      if (uuid) stats.push({ uuid, used: Math.max(0, used) });
    }
  }
  return stats;
}

async function getXuiSession(env: Env): Promise<XuiSession | null> {
  if (env.XUI_COOKIE) {
    const csrfToken = env.XUI_BASE_URL
      ? await fetchXuiCsrfToken(env, trimSlash(env.XUI_BASE_URL), env.XUI_COOKIE).catch(() => undefined)
      : undefined;
    return { cookie: env.XUI_COOKIE, csrfToken };
  }
  if (!env.XUI_BASE_URL || !env.XUI_USERNAME || !env.XUI_PASSWORD) return null;

  const baseUrl = trimSlash(env.XUI_BASE_URL);
  const bootstrap = await fetch(`${baseUrl}/`, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...xuiAccessHeaders(env),
    },
  });
  const bootstrapText = await bootstrap.clone().text().catch(() => '');
  const bootstrapCookie = cookieHeaderFromResponse(bootstrap.headers);
  const csrfToken = extractCsrfToken(bootstrapText)
    || await fetchXuiCsrfToken(env, baseUrl, bootstrapCookie).catch(() => undefined);

  const headers: Record<string, string> = {
    ...xuiAccessHeaders(env),
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    Accept: 'application/json, text/plain, */*',
    Origin: xuiOrigin(baseUrl),
    Referer: `${baseUrl}/`,
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (bootstrapCookie) headers.Cookie = bootstrapCookie;
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

  const response = await fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers,
    body: new URLSearchParams({ username: env.XUI_USERNAME, password: env.XUI_PASSWORD }),
  });
  const payload = await response.clone().json().catch(() => null) as { success?: boolean } | null;
  const cookie = mergeCookieHeaders(bootstrapCookie, cookieHeaderFromResponse(response.headers));
  return response.ok && cookie && payload?.success !== false ? { cookie, csrfToken } : null;
}

async function setXuiClientEnabledByEmail(
  env: Env,
  session: XuiSession,
  email: string,
  enabled: boolean,
): Promise<boolean> {
  const action = enabled ? 'bulkEnable' : 'bulkDisable';
  const response = await fetch(`${trimSlash(env.XUI_BASE_URL || '')}/panel/api/clients/${action}`, {
    method: 'POST',
    headers: xuiSessionHeaders(env, session, 'application/json'),
    body: JSON.stringify({ emails: [email] }),
  });
  if (!response.ok) return false;

  const payload = await response.json().catch(() => null) as { success?: boolean } | null;
  return payload ? payload.success !== false : true;
}

function xuiAccessHeaders(env: Env): Record<string, string> {
  if (!env.XUI_ACCESS_CLIENT_ID || !env.XUI_ACCESS_CLIENT_SECRET) return {};
  if (env.XUI_ACCESS_AUTH_HEADER) {
    return {
      [env.XUI_ACCESS_AUTH_HEADER]: JSON.stringify({
        'cf-access-client-id': env.XUI_ACCESS_CLIENT_ID,
        'cf-access-client-secret': env.XUI_ACCESS_CLIENT_SECRET,
      }),
    };
  }
  return {
    'CF-Access-Client-Id': env.XUI_ACCESS_CLIENT_ID,
    'CF-Access-Client-Secret': env.XUI_ACCESS_CLIENT_SECRET,
  };
}

async function fetchXuiCsrfToken(env: Env, baseUrl: string, cookie?: string): Promise<string | undefined> {
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'X-Requested-With': 'XMLHttpRequest',
    ...xuiAccessHeaders(env),
  };
  if (cookie) headers.Cookie = cookie;

  const response = await fetch(`${baseUrl}/csrf-token`, { headers });
  if (!response.ok) return undefined;
  const text = await response.text().catch(() => '');
  return extractCsrfTokenFromPayload(safeJson(text)) || extractCsrfToken(text);
}

function xuiSessionHeaders(env: Env, session: XuiSession, contentType?: string): Record<string, string> {
  const headers: Record<string, string> = {
    ...xuiAccessHeaders(env),
    Accept: 'application/json, text/plain, */*',
    Cookie: session.cookie,
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (contentType) headers['Content-Type'] = contentType;
  if (session.csrfToken) headers['X-CSRF-Token'] = session.csrfToken;
  return headers;
}

function extractCsrfToken(value: string): string | undefined {
  const match = /<meta\b(?=[^>]*\bname=["']csrf-token["'])(?=[^>]*\bcontent=["']([^"']+)["'])[^>]*>/i.exec(value);
  if (!match) return undefined;
  const token = decodeHtmlEntities(match[1]).trim();
  return token || undefined;
}

function extractCsrfTokenFromPayload(payload: unknown): string | undefined {
  if (!payload) return undefined;
  if (typeof payload === 'string') return payload.trim() || undefined;
  if (typeof payload !== 'object') return undefined;

  const object = payload as Record<string, unknown>;
  for (const key of ['csrfToken', 'csrf_token', 'token', 'csrf']) {
    const value = object[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return extractCsrfTokenFromPayload(object.obj) || extractCsrfTokenFromPayload(object.data);
}

function cookieHeaderFromResponse(headers: Headers): string | undefined {
  const headersWithCookies = headers as Headers & { getSetCookie?: () => string[] };
  const setCookies = typeof headersWithCookies.getSetCookie === 'function'
    ? headersWithCookies.getSetCookie()
    : splitSetCookieHeader(headers.get('set-cookie') || '');
  return mergeCookieHeaders(...setCookies.map(cookiePairFromSetCookie));
}

function cookiePairFromSetCookie(value: string): string | undefined {
  const pair = value.split(';', 1)[0]?.trim();
  return pair && pair.includes('=') ? pair : undefined;
}

function splitSetCookieHeader(value: string): string[] {
  return value ? value.split(/,(?=\s*[^;,]+=)/).map(cookie => cookie.trim()).filter(Boolean) : [];
}

function mergeCookieHeaders(...headers: Array<string | undefined>): string | undefined {
  const pairs = new Map<string, string>();
  for (const header of headers) {
    if (!header) continue;
    for (const rawPair of header.split(/;\s*/)) {
      const pair = rawPair.trim();
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      const name = pair.slice(0, separator).trim();
      if (!name || isCookieAttribute(name)) continue;
      pairs.set(name, `${name}=${pair.slice(separator + 1).trim()}`);
    }
  }
  const cookie = Array.from(pairs.values()).join('; ');
  return cookie || undefined;
}

function isCookieAttribute(name: string): boolean {
  return /^(path|expires|max-age|domain|secure|httponly|samesite)$/i.test(name);
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function xuiOrigin(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return baseUrl;
  }
}

function extractInbounds(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return [];
  const object = payload as Record<string, unknown>;
  if (Array.isArray(object.obj)) return object.obj as Record<string, unknown>[];
  if (Array.isArray(object.data)) return object.data as Record<string, unknown>[];
  return [];
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function parsePositiveInteger(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
