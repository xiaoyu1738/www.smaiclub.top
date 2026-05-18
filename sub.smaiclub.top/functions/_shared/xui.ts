import type { Env } from './types.ts';

interface XuiClientStat {
  uuid: string;
  used: number;
}

export interface XuiSyncResult {
  attempted: boolean;
  ok: boolean;
  action?: string;
  message?: string;
  status?: number;
  body?: string;
  config?: XuiConfigDiagnostic;
  contentType?: string | null;
  hasSetCookie?: boolean;
}

export interface XuiConfigDiagnostic {
  hasBaseUrl: boolean;
  hasInboundId: boolean;
  hasUsername: boolean;
  hasPassword: boolean;
  hasCookie: boolean;
  hasAccessClientId: boolean;
  hasAccessClientSecret: boolean;
  hasAccessAuthHeader: boolean;
}

interface XuiClientOptions {
  email?: string;
  createOnly?: boolean;
}

export async function setXuiClientEnabled(
  env: Env,
  uuid: string,
  enabled: boolean,
  options: XuiClientOptions = {},
): Promise<XuiSyncResult> {
  if (!env.XUI_BASE_URL || !env.XUI_INBOUND_ID) {
    return {
      attempted: false,
      ok: false,
      message: 'XUI env is not configured',
      config: xuiConfigDiagnostic(env),
    };
  }

  try {
    const cookie = await getXuiCookie(env);
    if (!cookie) {
      return {
        attempted: true,
        ok: false,
        message: 'XUI auth is not configured',
        config: xuiConfigDiagnostic(env),
      };
    }
    if (enabled && options.createOnly) {
      return addXuiClient(env, cookie, uuid, options);
    }
    const client = buildXuiClient(env, uuid, enabled, options);
    const response = await fetch(`${trimSlash(env.XUI_BASE_URL)}/panel/api/inbounds/updateClient/${uuid}`, {
      method: 'POST',
      headers: {
        ...xuiAccessHeaders(env),
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({
        id: Number(env.XUI_INBOUND_ID),
        settings: JSON.stringify({
          clients: [client],
        }),
      }),
    });
    const updateResult = await parseXuiMutationResponse(response, 'updateClient');
    if (updateResult.ok) return updateResult;
    if (enabled) {
      const created = await addXuiClient(env, cookie, uuid, options);
      if (created.ok) return created;
    }
    return updateResult;
  } catch (error) {
    return {
      attempted: true,
      ok: false,
      message: error instanceof Error ? error.message : String(error),
      config: xuiConfigDiagnostic(env),
    };
  }
}

export function xuiConfigDiagnostic(env: Env): XuiConfigDiagnostic {
  return {
    hasBaseUrl: Boolean(env.XUI_BASE_URL),
    hasInboundId: Boolean(env.XUI_INBOUND_ID),
    hasUsername: Boolean(env.XUI_USERNAME),
    hasPassword: Boolean(env.XUI_PASSWORD),
    hasCookie: Boolean(env.XUI_COOKIE),
    hasAccessClientId: Boolean(env.XUI_ACCESS_CLIENT_ID),
    hasAccessClientSecret: Boolean(env.XUI_ACCESS_CLIENT_SECRET),
    hasAccessAuthHeader: Boolean(env.XUI_ACCESS_AUTH_HEADER),
  };
}

async function addXuiClient(
  env: Env,
  cookie: string,
  uuid: string,
  options: XuiClientOptions,
): Promise<XuiSyncResult> {
  const body = new URLSearchParams();
  body.set('id', String(Number(env.XUI_INBOUND_ID)));
  body.set('settings', JSON.stringify({ clients: [buildXuiClient(env, uuid, true, options)] }));

  const response = await fetch(`${trimSlash(env.XUI_BASE_URL || '')}/panel/api/inbounds/addClient`, {
    method: 'POST',
    headers: {
      ...xuiAccessHeaders(env),
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookie,
    },
    body,
  });

  const result = await parseXuiMutationResponse(response, 'addClient');
  if (result.ok) return result;

  if (response.ok && await xuiClientExists(env, cookie, uuid)) {
    return {
      attempted: true,
      ok: true,
      action: 'addClient',
      status: response.status,
      contentType: result.contentType,
      message: 'addClient verified by inbound list',
    };
  }
  return result;
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
  const stats: XuiClientStat[] = [];
  const inbounds = extractInbounds(payload);

  for (const inbound of inbounds) {
    const clientStats = Array.isArray(inbound.clientStats) ? inbound.clientStats : [];
    for (const stat of clientStats) {
      if (!stat || typeof stat !== 'object') continue;
      const candidate = stat as Record<string, unknown>;
      const uuid = String(candidate.uuid || candidate.id || candidate.email || '').trim();
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

async function parseXuiMutationResponse(response: Response, action: string): Promise<XuiSyncResult> {
  const text = await response.clone().text().catch(() => '');
  const payload = safeJson(text) as { success?: boolean; msg?: string } | null;
  const contentType = response.headers.get('content-type');
  const businessOk = payload ? payload.success !== false : false;
  const ok = response.ok && businessOk;
  return {
    attempted: true,
    ok,
    action,
    status: response.status,
    contentType,
    message: ok ? action : payload?.msg || `3x-ui ${action} returned ${response.status}`,
    body: ok ? undefined : summarizeBody(text),
  };
}

async function getXuiCookie(env: Env): Promise<string | null> {
  if (env.XUI_COOKIE) {
    return env.XUI_COOKIE;
  }
  if (!env.XUI_BASE_URL || !env.XUI_USERNAME || !env.XUI_PASSWORD) {
    return null;
  }

  const response = await fetch(`${trimSlash(env.XUI_BASE_URL)}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json, text/plain, */*',
      Origin: trimSlash(env.XUI_BASE_URL),
      Referer: `${trimSlash(env.XUI_BASE_URL)}/login`,
      ...xuiAccessHeaders(env),
    },
    body: new URLSearchParams({
      username: env.XUI_USERNAME,
      password: env.XUI_PASSWORD,
    }),
  });
  const cookie = response.headers.get('set-cookie');
  if (!response.ok) return null;
  return cookie;
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

function buildXuiClient(env: Env, uuid: string, enabled: boolean, options: XuiClientOptions): Record<string, unknown> {
  return {
    id: uuid,
    security: '',
    password: '',
    flow: env.REALITY_FLOW || 'xtls-rprx-vision',
    email: options.email || uuid,
    limitIp: 0,
    totalGB: 0,
    expiryTime: 0,
    enable: enabled,
    tgId: 0,
    subId: generateXuiSubId(),
    comment: '',
    reset: 0,
  };
}

async function xuiClientExists(env: Env, cookie: string, uuid: string): Promise<boolean> {
  const response = await fetch(`${trimSlash(env.XUI_BASE_URL || '')}/panel/api/inbounds/list`, {
    headers: {
      ...xuiAccessHeaders(env),
      Cookie: cookie,
    },
  });
  if (!response.ok) return false;
  const payload = await response.json().catch(() => null);
  const inbounds = extractInbounds(payload);
  for (const inbound of inbounds) {
    const settings = typeof inbound.settings === 'string' ? safeJson(inbound.settings) : inbound.settings;
    const clients = settings && typeof settings === 'object' && Array.isArray((settings as { clients?: unknown[] }).clients)
      ? (settings as { clients: Record<string, unknown>[] }).clients
      : [];
    if (clients.some(client => String(client.id || client.uuid || '').trim() === uuid)) return true;
  }
  return false;
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function summarizeBody(value: string): string | undefined {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return undefined;
  return compact.slice(0, 240);
}

function xuiAccessHeaders(env: Env, mode: 'paired' | 'authorization' = 'paired'): Record<string, string> {
  if (!env.XUI_ACCESS_CLIENT_ID || !env.XUI_ACCESS_CLIENT_SECRET) return {};
  if (env.XUI_ACCESS_AUTH_HEADER || mode === 'authorization') {
    return {
      [env.XUI_ACCESS_AUTH_HEADER || 'Authorization']: JSON.stringify({
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

function trimSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function generateXuiSubId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
}
