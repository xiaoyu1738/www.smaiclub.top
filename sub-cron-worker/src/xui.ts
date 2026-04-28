export interface Env {
  DB: D1Database;
  XUI_BASE_URL?: string;
  XUI_USERNAME?: string;
  XUI_PASSWORD?: string;
  XUI_COOKIE?: string;
  XUI_INBOUND_ID?: string;
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
    headers: { Cookie: cookie },
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
      const uuid = String(stat.email || stat.id || stat.uuid || '').trim();
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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: env.XUI_USERNAME, password: env.XUI_PASSWORD }),
  });
  return response.ok ? response.headers.get('set-cookie') : null;
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
