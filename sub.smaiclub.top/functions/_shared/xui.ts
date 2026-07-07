import type { Env } from './types.ts';

const DEFAULT_HY2_INBOUND_ID = '2';
const DEFAULT_XUI_FETCH_TIMEOUT_MS = 6_000;
const MAX_XUI_FETCH_TIMEOUT_MS = 12_000;

interface XuiClientStat {
  uuid: string;
  used: number;
}

type XuiInboundProtocol = 'vless' | 'hysteria2';

interface XuiInboundTarget {
  id: number;
  protocol: XuiInboundProtocol;
  label: string;
}

interface XuiTargetSyncResult {
  attempted: boolean;
  ok: boolean;
  action?: string;
  message?: string;
  status?: number;
  body?: string;
  config?: XuiConfigDiagnostic;
  contentType?: string | null;
  hasSetCookie?: boolean;
  inboundId: number;
  protocol: XuiInboundProtocol;
  label: string;
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
  targets?: XuiTargetSyncResult[];
}

export interface XuiConfigDiagnostic {
  hasBaseUrl: boolean;
  hasInboundId: boolean;
  hasHy2InboundId: boolean;
  hasUsername: boolean;
  hasPassword: boolean;
  hasCookie: boolean;
  hasAccessClientId: boolean;
  hasAccessClientSecret: boolean;
  hasAccessAuthHeader: boolean;
  fetchTimeoutMs: number;
}

interface XuiClientOptions {
  email?: string;
  createOnly?: boolean;
  subId?: string;
}

interface XuiCookieResult {
  cookie?: string;
  error?: XuiSyncResult;
}

export async function setXuiClientEnabled(
  env: Env,
  uuid: string,
  enabled: boolean,
  options: XuiClientOptions = {},
): Promise<XuiSyncResult> {
  const targets = xuiInboundTargets(env);
  if (!env.XUI_BASE_URL || !parsePositiveInteger(env.XUI_INBOUND_ID)) {
    return {
      attempted: false,
      ok: false,
      message: 'XUI env is not configured',
      config: xuiConfigDiagnostic(env),
    };
  }

  try {
    const cookie = await getXuiCookie(env);
    if (!cookie.cookie) {
      return cookie.error || {
        attempted: true,
        ok: false,
        message: 'XUI auth is not configured',
        config: xuiConfigDiagnostic(env),
      };
    }

    const syncOptions = enabled && options.createOnly
      ? { ...options, subId: options.subId || generateXuiSubId() }
      : options;
    const results: XuiTargetSyncResult[] = [];
    for (const target of targets) {
      results.push(await syncXuiClientTarget(env, cookie.cookie, uuid, enabled, syncOptions, target));
    }
    return summarizeXuiTargetResults(results, env);
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
    hasInboundId: Boolean(parsePositiveInteger(env.XUI_INBOUND_ID)),
    hasHy2InboundId: Boolean(parsePositiveInteger(env.XUI_HY2_INBOUND_ID || DEFAULT_HY2_INBOUND_ID)),
    hasUsername: Boolean(env.XUI_USERNAME),
    hasPassword: Boolean(env.XUI_PASSWORD),
    hasCookie: Boolean(env.XUI_COOKIE),
    hasAccessClientId: Boolean(env.XUI_ACCESS_CLIENT_ID),
    hasAccessClientSecret: Boolean(env.XUI_ACCESS_CLIENT_SECRET),
    hasAccessAuthHeader: Boolean(env.XUI_ACCESS_AUTH_HEADER),
    fetchTimeoutMs: xuiFetchTimeoutMs(env),
  };
}

export async function fetchXuiClientStats(env: Env): Promise<XuiClientStat[]> {
  if (!env.XUI_BASE_URL) return [];
  const cookie = await getXuiCookie(env);
  if (!cookie.cookie) return [];

  const response = await xuiFetch(env, `${trimSlash(env.XUI_BASE_URL)}/panel/api/inbounds/list`, {
    headers: {
      ...xuiAccessHeaders(env),
      Cookie: cookie.cookie,
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
      const uuid = String(candidate.uuid || candidate.id || candidate.auth || candidate.email || '').trim();
      const up = Number(candidate.up || candidate.upload || 0);
      const down = Number(candidate.down || candidate.download || 0);
      if (uuid) stats.push({ uuid, used: Math.max(0, up + down) });
    }

    const settings = typeof inbound.settings === 'string' ? safeJson(inbound.settings) : inbound.settings;
    const clients = settings && typeof settings === 'object' && Array.isArray((settings as { clients?: unknown[] }).clients)
      ? (settings as { clients: Record<string, unknown>[] }).clients
      : [];
    for (const client of clients) {
      const uuid = String(client.id || client.uuid || client.auth || '').trim();
      const up = Number(client.up || client.upload || 0);
      const down = Number(client.down || client.download || 0);
      if (uuid && up + down > 0) stats.push({ uuid, used: Math.max(0, up + down) });
    }
  }

  return dedupeStats(stats);
}

async function syncXuiClientTarget(
  env: Env,
  cookie: string,
  uuid: string,
  enabled: boolean,
  options: XuiClientOptions,
  target: XuiInboundTarget,
): Promise<XuiTargetSyncResult> {
  try {
    if (enabled && options.createOnly) {
      const created = await addXuiClient(env, cookie, uuid, options, target);
      if (created.ok || !shouldAttemptFallback(created)) return created;

      const attached = await attachExistingXuiClient(env, cookie, uuid, options, target);
      return attached.ok ? attached : created;
    }

    const client = buildXuiClient(env, uuid, enabled, options, target, 'update');
    const response = await xuiFetch(env, `${trimSlash(env.XUI_BASE_URL || '')}/panel/api/inbounds/updateClient/${uuid}`, {
      method: 'POST',
      headers: {
        ...xuiAccessHeaders(env),
        'Content-Type': 'application/json',
        Cookie: cookie,
      },
      body: JSON.stringify({
        id: target.id,
        settings: JSON.stringify({
          clients: [client],
        }),
      }),
    });
    const updateResult = withTarget(await parseXuiMutationResponse(response, 'updateClient'), target);
    if (updateResult.ok) return updateResult;

    if (enabled && shouldAttemptFallback(updateResult)) {
      const attached = await attachExistingXuiClient(env, cookie, uuid, options, target);
      if (attached.ok) return attached;

      const created = await addXuiClient(env, cookie, uuid, options, target);
      if (created.ok) return created;
    }

    return updateResult;
  } catch (error) {
    return withTarget({
      attempted: true,
      ok: false,
      action: 'syncClient',
      message: error instanceof Error ? error.message : String(error),
      config: xuiConfigDiagnostic(env),
    }, target);
  }
}

async function addXuiClient(
  env: Env,
  cookie: string,
  uuid: string,
  options: XuiClientOptions,
  target: XuiInboundTarget,
): Promise<XuiTargetSyncResult> {
  const body = new URLSearchParams();
  body.set('id', String(target.id));
  body.set('settings', JSON.stringify({
    clients: [buildXuiClient(env, uuid, true, options, target, 'create')],
  }));

  const response = await xuiFetch(env, `${trimSlash(env.XUI_BASE_URL || '')}/panel/api/inbounds/addClient`, {
    method: 'POST',
    headers: {
      ...xuiAccessHeaders(env),
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookie,
    },
    body,
  });

  const result = withTarget(await parseXuiMutationResponse(response, 'addClient'), target);
  if (result.ok) return result;

  if (response.ok && await xuiClientExists(env, cookie, uuid, target, options)) {
    return {
      attempted: true,
      ok: true,
      action: 'addClient',
      status: response.status,
      contentType: result.contentType,
      message: 'addClient verified by inbound list',
      inboundId: target.id,
      protocol: target.protocol,
      label: target.label,
    };
  }
  return result;
}

async function attachExistingXuiClient(
  env: Env,
  cookie: string,
  uuid: string,
  options: XuiClientOptions,
  target: XuiInboundTarget,
): Promise<XuiTargetSyncResult> {
  const email = options.email || uuid;
  const response = await xuiFetch(env, `${trimSlash(env.XUI_BASE_URL || '')}/panel/api/clients/${encodeURIComponent(email)}/attach`, {
    method: 'POST',
    headers: {
      ...xuiAccessHeaders(env),
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      Cookie: cookie,
    },
    body: JSON.stringify({
      inboundIds: [target.id],
    }),
  });

  const result = withTarget(await parseXuiMutationResponse(response, 'attachClient'), target);
  if (result.ok) return result;

  if (response.ok && await xuiClientExists(env, cookie, uuid, target, options)) {
    return {
      attempted: true,
      ok: true,
      action: 'attachClient',
      status: response.status,
      contentType: result.contentType,
      message: 'attachClient verified by inbound list',
      inboundId: target.id,
      protocol: target.protocol,
      label: target.label,
    };
  }
  return result;
}

async function parseXuiMutationResponse(response: Response, action: string): Promise<XuiSyncResult> {
  const text = await response.clone().text().catch(() => '');
  const payload = safeJson(text) as { success?: boolean; msg?: string; message?: string } | null;
  const contentType = response.headers.get('content-type');

  if (isHtmlResponse(contentType, text)) {
    const title = extractHtmlTitle(text);
    return {
      attempted: true,
      ok: false,
      action,
      status: response.status,
      contentType,
      message: `3x-ui ${action} returned HTML (${response.status})${title ? `: ${title}` : ''}`,
      body: summarizeHtmlBody(text),
    };
  }

  const businessOk = payload ? payload.success !== false : false;
  const ok = response.ok && businessOk;
  return {
    attempted: true,
    ok,
    action,
    status: response.status,
    contentType,
    message: ok ? action : xuiPayloadMessage(payload) || `3x-ui ${action} returned ${response.status}`,
    body: ok ? undefined : summarizeBody(text),
  };
}

async function getXuiCookie(env: Env): Promise<XuiCookieResult> {
  if (env.XUI_COOKIE) {
    return { cookie: env.XUI_COOKIE };
  }
  if (!env.XUI_BASE_URL || !env.XUI_USERNAME || !env.XUI_PASSWORD) {
    return { error: { attempted: false, ok: false, message: 'XUI auth is not configured', config: xuiConfigDiagnostic(env) } };
  }

  const response = await xuiFetch(env, `${trimSlash(env.XUI_BASE_URL)}/login`, {
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

  const cookie = response.headers.get('set-cookie') || undefined;
  const text = await response.clone().text().catch(() => '');
  const contentType = response.headers.get('content-type');
  const payload = safeJson(text) as { success?: boolean; msg?: string; message?: string } | null;

  if (isHtmlResponse(contentType, text)) {
    const title = extractHtmlTitle(text);
    return {
      error: {
        attempted: true,
        ok: false,
        action: 'login',
        status: response.status,
        contentType,
        hasSetCookie: Boolean(cookie),
        message: `3x-ui login returned HTML (${response.status})${title ? `: ${title}` : ''}`,
        body: summarizeHtmlBody(text),
        config: xuiConfigDiagnostic(env),
      },
    };
  }

  if (!response.ok || !cookie || payload?.success === false) {
    return {
      error: {
        attempted: true,
        ok: false,
        action: 'login',
        status: response.status,
        contentType,
        hasSetCookie: Boolean(cookie),
        message: xuiPayloadMessage(payload) || (!cookie ? '3x-ui login did not return a session cookie' : `3x-ui login returned ${response.status}`),
        body: summarizeBody(text),
        config: xuiConfigDiagnostic(env),
      },
    };
  }

  return { cookie };
}

function summarizeXuiTargetResults(results: XuiTargetSyncResult[], env: Env): XuiSyncResult {
  const failed = results.filter(result => !result.ok);
  if (failed.length === 0) {
    return {
      attempted: results.some(result => result.attempted),
      ok: true,
      action: results.map(result => `${result.label}:${result.action || 'sync'}`).join(','),
      message: `synced ${results.length} x-ui inbound${results.length === 1 ? '' : 's'}`,
      config: xuiConfigDiagnostic(env),
      targets: results,
    };
  }

  const first = failed[0];
  return {
    attempted: results.some(result => result.attempted),
    ok: false,
    action: first.action,
    status: first.status,
    body: first.body,
    contentType: first.contentType,
    message: `${failed.length}/${results.length} x-ui target sync failed: ${failed.map(formatTargetFailure).join('; ')}`,
    config: xuiConfigDiagnostic(env),
    targets: results,
  };
}

function formatTargetFailure(result: XuiTargetSyncResult): string {
  return `${result.label}/${result.inboundId}(${result.action || 'sync'}): ${result.message || 'failed'}`;
}

function withTarget(result: XuiSyncResult, target: XuiInboundTarget): XuiTargetSyncResult {
  return {
    attempted: result.attempted,
    ok: result.ok,
    action: result.action,
    message: result.message,
    status: result.status,
    body: result.body,
    config: result.config,
    contentType: result.contentType,
    hasSetCookie: result.hasSetCookie,
    inboundId: target.id,
    protocol: target.protocol,
    label: target.label,
  };
}

function xuiInboundTargets(env: Env): XuiInboundTarget[] {
  const targets: XuiInboundTarget[] = [];
  const realityInboundId = parsePositiveInteger(env.XUI_INBOUND_ID);
  if (realityInboundId) {
    targets.push({ id: realityInboundId, protocol: 'vless', label: 'reality' });
  }

  const hy2InboundId = parsePositiveInteger(env.XUI_HY2_INBOUND_ID || DEFAULT_HY2_INBOUND_ID);
  if (hy2InboundId && !targets.some(target => target.id === hy2InboundId)) {
    targets.push({ id: hy2InboundId, protocol: 'hysteria2', label: 'hy2' });
  }

  return targets;
}

function buildXuiClient(
  env: Env,
  uuid: string,
  enabled: boolean,
  options: XuiClientOptions,
  target: XuiInboundTarget,
  mode: 'create' | 'update',
): Record<string, unknown> {
  const client: Record<string, unknown> = {
    id: uuid,
    email: options.email || uuid,
    limitIp: 0,
    totalGB: 0,
    expiryTime: 0,
    enable: enabled,
    tgId: 0,
    comment: '',
    reset: 0,
  };

  if (mode === 'create') {
    client.subId = options.subId || generateXuiSubId();
  }

  if (target.protocol === 'hysteria2') {
    return {
      ...client,
      auth: uuid,
    };
  }

  return {
    ...client,
    security: '',
    password: '',
    flow: env.REALITY_FLOW || 'xtls-rprx-vision',
  };
}

async function xuiClientExists(
  env: Env,
  cookie: string,
  uuid: string,
  target: XuiInboundTarget,
  options: XuiClientOptions,
): Promise<boolean> {
  const response = await xuiFetch(env, `${trimSlash(env.XUI_BASE_URL || '')}/panel/api/inbounds/list`, {
    headers: {
      ...xuiAccessHeaders(env),
      Cookie: cookie,
    },
  });
  if (!response.ok) return false;

  const payload = await response.json().catch(() => null);
  const inbounds = extractInbounds(payload);
  const email = options.email || uuid;
  for (const inbound of inbounds) {
    if (Number(inbound.id) !== target.id) continue;
    const settings = typeof inbound.settings === 'string' ? safeJson(inbound.settings) : inbound.settings;
    const clients = settings && typeof settings === 'object' && Array.isArray((settings as { clients?: unknown[] }).clients)
      ? (settings as { clients: Record<string, unknown>[] }).clients
      : [];
    if (clients.some(client => {
      const clientId = String(client.id || client.uuid || client.auth || '').trim();
      const clientEmail = String(client.email || '').trim();
      return clientId === uuid || clientEmail === email;
    })) return true;
  }
  return false;
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

function summarizeBody(value: string): string | undefined {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return undefined;
  return compact.slice(0, 240);
}

function summarizeHtmlBody(value: string): string {
  const title = extractHtmlTitle(value);
  return title ? `html_response:${title}` : 'html_response';
}

function isHtmlResponse(contentType: string | null, value: string): boolean {
  const start = value.trimStart().slice(0, 32).toLowerCase();
  return isHtmlContentType(contentType) || start.startsWith('<!doctype html') || start.startsWith('<html');
}

function isHtmlContentType(contentType: string | null | undefined): boolean {
  return (contentType || '').toLowerCase().includes('text/html');
}

function shouldAttemptFallback(result: XuiSyncResult): boolean {
  if (!result.status || isHtmlContentType(result.contentType)) return false;
  return result.status < 500;
}

function extractHtmlTitle(value: string): string | undefined {
  const match = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(value);
  if (!match) return undefined;
  const title = decodeHtmlEntities(match[1].replace(/\s+/g, ' ').trim());
  return title ? title.slice(0, 120) : undefined;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function xuiPayloadMessage(payload: { msg?: string; message?: string } | null): string | undefined {
  return payload?.msg || payload?.message;
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

function parsePositiveInteger(value: string | undefined): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function xuiFetch(env: Env, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetchWithTimeout(input, init, xuiFetchTimeoutMs(env));
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit | undefined, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) {
      throw new Error(`3x-ui request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function xuiFetchTimeoutMs(env: Env): number {
  const parsed = Number(env.XUI_FETCH_TIMEOUT_MS);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_XUI_FETCH_TIMEOUT_MS;
  return Math.min(Math.floor(parsed), MAX_XUI_FETCH_TIMEOUT_MS);
}

function generateXuiSubId(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('');
}
