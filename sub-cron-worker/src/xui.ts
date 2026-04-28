export interface Env {
  DB: D1Database;
  XUI_BASE_URL?: string;
  XUI_USERNAME?: string;
  XUI_PASSWORD?: string;
  XUI_COOKIE?: string;
  XUI_INBOUND_ID?: string;
  XUI_ACCESS_CLIENT_ID?: string;
  XUI_ACCESS_CLIENT_SECRET?: string;
  XUI_ACCESS_AUTH_HEADER?: string;
}

export interface XuiClientStat {
  uuid: string;
  used: number;
}

export async function setXuiClientEnabled(env: Env, uuid: string, enabled: boolean): Promise<boolean> {
  if (!env.XUI_BASE_URL || !env.XUI_INBOUND_ID) return false;
  const cookie = await getXuiCookie(env);
  if (!cookie) return false;
  const response = await fetch(`${trimSlash(env.XUI_BASE_URL)}/panel/api/inbounds/updateClient/${uuid}`, {
    method: 'POST',
    headers: {
      ...xuiAccessHeaders(env),
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify({
      id: Number(env.XUI_INBOUND_ID),
      settings: JSON.stringify({ clients: [{ id: uuid, enable: enabled }] }),
    }),
  });
  return response.ok;
}

export async function fetchXuiClientStats(env: Env): Promise<XuiClientStat[]> {
  if (!env.XUI_BASE_URL) return [];
  const cookie = await getXuiCookie(env);
  if (!cookie) return [];
  const response = await fetch(`${trimSlash(env.XUI_BASE_URL)}/panel/api/inbounds/list`, {
    headers: {
      ...xuiAccessHeaders(env),
      Cookie: cookie,
    },
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
      const uuid = String(stat.uuid || stat.id || stat.email || '').trim();
      const used = Number(stat.up || stat.upload || 0) + Number(stat.down || stat.download || 0);
      if (uuid) stats.push({ uuid, used: Math.max(0, used) });
    }
  }
  return stats;
}

async function getXuiCookie(env: Env): Promise<string | null> {
  if (env.XUI_COOKIE) return env.XUI_COOKIE;
  if (!env.XUI_BASE_URL || !env.XUI_USERNAME || !env.XUI_PASSWORD) return null;
  const response = await fetch(`${trimSlash(env.XUI_BASE_URL)}/login`, {
    method: 'POST',
    headers: {
      ...xuiAccessHeaders(env),
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json, text/plain, */*',
      Origin: trimSlash(env.XUI_BASE_URL),
      Referer: `${trimSlash(env.XUI_BASE_URL)}/login`,
    },
    body: new URLSearchParams({ username: env.XUI_USERNAME, password: env.XUI_PASSWORD }),
  });
  return response.ok ? response.headers.get('set-cookie') : null;
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
