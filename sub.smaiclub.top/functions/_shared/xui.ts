import type { Env } from './types.ts';

interface XuiClientStat {
  uuid: string;
  used: number;
}

export interface XuiSyncResult {
  attempted: boolean;
  ok: boolean;
  message?: string;
}

interface XuiClientOptions {
  email?: string;
  expiryTime?: number;
  totalBytes?: number;
}

export async function setXuiClientEnabled(
  env: Env,
  uuid: string,
  enabled: boolean,
  options: XuiClientOptions = {},
): Promise<XuiSyncResult> {
  if (!env.XUI_BASE_URL || !env.XUI_INBOUND_ID) {
    return { attempted: false, ok: false, message: 'XUI env is not configured' };
  }

  try {
    const cookie = await getXuiCookie(env);
    if (!cookie) return { attempted: true, ok: false, message: 'XUI auth is not configured' };
    const response = await fetch(`${trimSlash(env.XUI_BASE_URL)}/panel/api/inbounds/updateClient/${uuid}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({
        id: Number(env.XUI_INBOUND_ID),
        settings: JSON.stringify({
          clients: [{ id: uuid, enable: enabled }],
        }),
      }),
    });
    if (response.ok) return { attempted: true, ok: true };
    if (enabled) {
      const created = await addXuiClient(env, cookie, uuid, options);
      if (created.ok) return created;
    }
    return { attempted: true, ok: false, message: `3x-ui returned ${response.status}` };
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

async function addXuiClient(
  env: Env,
  cookie: string,
  uuid: string,
  options: XuiClientOptions,
): Promise<XuiSyncResult> {
  const response = await fetch(`${trimSlash(env.XUI_BASE_URL || '')}/panel/api/inbounds/addClient`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify({
      id: Number(env.XUI_INBOUND_ID),
      settings: JSON.stringify({
        clients: [{
          id: uuid,
          flow: env.REALITY_FLOW || 'xtls-rprx-vision',
          email: options.email || uuid,
          enable: true,
          expiryTime: options.expiryTime || 0,
          totalGB: options.totalBytes || 0,
        }],
      }),
    }),
  });

  return {
    attempted: true,
    ok: response.ok,
    message: response.ok ? 'created' : `3x-ui addClient returned ${response.status}`,
  };
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
  const stats: XuiClientStat[] = [];
  const inbounds = extractInbounds(payload);

  for (const inbound of inbounds) {
    const clientStats = Array.isArray(inbound.clientStats) ? inbound.clientStats : [];
    for (const stat of clientStats) {
      if (!stat || typeof stat !== 'object') continue;
      const candidate = stat as Record<string, unknown>;
      const uuid = String(candidate.email || candidate.id || candidate.uuid || '').trim();
      const up = Number(candidate.up || candidate.upload || 0);
      const down = Number(candidate.down || candidate.download || 0);
      if (uuid) stats.push({ uuid, used: Math.max(0, up + down) });
    }

    const settings = typeof inbound.settings === 'string' ? safeJson(inbound.settings) : inbound.settings;
    const clients = settings && typeof settings === 'object' && Array.isArray((settings as { clients?: unknown[] }).clients)
      ? (settings as { clients: Record<string, unknown>[] }).clients
      : [];
    for (const client of clients) {
      const uuid = String(client.id || client.uuid || '').trim();
      const up = Number(client.up || client.upload || 0);
      const down = Number(client.down || client.download || 0);
      if (uuid && up + down > 0) stats.push({ uuid, used: Math.max(0, up + down) });
    }
  }

  return dedupeStats(stats);
}

async function getXuiCookie(env: Env): Promise<string | null> {
  if (env.XUI_COOKIE) return env.XUI_COOKIE;
  if (!env.XUI_BASE_URL || !env.XUI_USERNAME || !env.XUI_PASSWORD) return null;

  const response = await fetch(`${trimSlash(env.XUI_BASE_URL)}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      username: env.XUI_USERNAME,
      password: env.XUI_PASSWORD,
    }),
  });
  if (!response.ok) return null;
  return response.headers.get('set-cookie');
}

function extractInbounds(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== 'object') return [];
  const object = payload as Record<string, unknown>;
  if (Array.isArray(object.obj)) return object.obj as Record<string, unknown>[];
  if (Array.isArray(object.data)) return object.data as Record<string, unknown>[];
  if (Array.isArray(object.inbounds)) return object.inbounds as Record<string, unknown>[];
  return [];
}

function dedupeStats(stats: XuiClientStat[]): XuiClientStat[] {
  const merged = new Map<string, number>();
  for (const stat of stats) {
    merged.set(stat.uuid, Math.max(merged.get(stat.uuid) ?? 0, stat.used));
  }
  return Array.from(merged, ([uuid, used]) => ({ uuid, used }));
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}
