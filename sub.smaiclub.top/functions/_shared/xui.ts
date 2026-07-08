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

interface XuiSession {
  cookie: string;
  csrfToken?: string;
}

interface XuiSessionResult {
  session?: XuiSession;
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
    const session = await getXuiSession(env);
    if (!session.session) {
      return session.error || {
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
      results.push(await syncXuiClientTarget(env, session.session, uuid, enabled, syncOptions, target));
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
  const session = await getXuiSession(env);
  if (!session.session) return [];

  const response = await xuiFetch(env, `${trimSlash(env.XUI_BASE_URL)}/panel/api/inbounds/list`, {
    headers: xuiSessionHeaders(env, session.session),
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
  session: XuiSession,
  uuid: string,
  enabled: boolean,
  options: XuiClientOptions,
  target: XuiInboundTarget,
): Promise<XuiTargetSyncResult> {
  try {
    if (enabled && options.createOnly) {
      const created = await addXuiClient(env, session, uuid, options, target);
      if (created.ok || !shouldAttemptFallback(created)) return created;

      const attached = await attachExistingXuiClient(env, session, uuid, options, target);
      return attached.ok ? attached : created;
    }

    const updateResult = await setXuiClientEnabledByEmail(env, session, xuiClientEmail(uuid, options), enabled, target);
    if (updateResult.ok) {
      if (!enabled || await xuiClientExists(env, session, uuid, target, options)) return updateResult;

      const attached = await attachExistingXuiClient(env, session, uuid, options, target);
      if (attached.ok) return attached;

      const created = await addXuiClient(env, session, uuid, options, target);
      return created.ok ? created : attached;
    }

    if (enabled && shouldAttemptFallback(updateResult)) {
      const attached = await attachExistingXuiClient(env, session, uuid, options, target);
      if (attached.ok) return attached;

      const created = await addXuiClient(env, session, uuid, options, target);
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

async function setXuiClientEnabledByEmail(
  env: Env,
  session: XuiSession,
  email: string,
  enabled: boolean,
  target: XuiInboundTarget,
): Promise<XuiTargetSyncResult> {
  const action = enabled ? 'bulkEnable' : 'bulkDisable';
  const response = await xuiFetch(env, `${trimSlash(env.XUI_BASE_URL || '')}/panel/api/clients/${action}`, {
    method: 'POST',
    headers: xuiSessionHeaders(env, session, 'application/json'),
    body: JSON.stringify({ emails: [email] }),
  });
  return withTarget(await parseXuiMutationResponse(response, action), target);
}

async function addXuiClient(
  env: Env,
  session: XuiSession,
  uuid: string,
  options: XuiClientOptions,
  target: XuiInboundTarget,
): Promise<XuiTargetSyncResult> {
  const response = await xuiFetch(env, `${trimSlash(env.XUI_BASE_URL || '')}/panel/api/clients/add`, {
    method: 'POST',
    headers: xuiSessionHeaders(env, session, 'application/json'),
    body: JSON.stringify({
      client: buildXuiClient(env, uuid, true, options, target, 'create'),
      inboundIds: [target.id],
    }),
  });

  const result = withTarget(await parseXuiMutationResponse(response, 'addClient'), target);
  if (result.ok) return result;

  if (response.ok && await xuiClientExists(env, session, uuid, target, options)) {
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
  session: XuiSession,
  uuid: string,
  options: XuiClientOptions,
  target: XuiInboundTarget,
): Promise<XuiTargetSyncResult> {
  const email = options.email || uuid;
  const response = await xuiFetch(env, `${trimSlash(env.XUI_BASE_URL || '')}/panel/api/clients/${encodeURIComponent(email)}/attach`, {
    method: 'POST',
    headers: xuiSessionHeaders(env, session, 'application/json'),
    body: JSON.stringify({
      inboundIds: [target.id],
    }),
  });

  const result = withTarget(await parseXuiMutationResponse(response, 'attachClient'), target);
  if (result.ok) return result;

  if (response.ok && await xuiClientExists(env, session, uuid, target, options)) {
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

async function getXuiSession(env: Env): Promise<XuiSessionResult> {
  if (env.XUI_COOKIE) {
    const csrfToken = env.XUI_BASE_URL
      ? await fetchXuiCsrfToken(env, trimSlash(env.XUI_BASE_URL), env.XUI_COOKIE).catch(() => undefined)
      : undefined;
    return { session: { cookie: env.XUI_COOKIE, csrfToken } };
  }
  if (!env.XUI_BASE_URL || !env.XUI_USERNAME || !env.XUI_PASSWORD) {
    return { error: { attempted: false, ok: false, message: 'XUI auth is not configured', config: xuiConfigDiagnostic(env) } };
  }

  const baseUrl = trimSlash(env.XUI_BASE_URL);
  const bootstrap = await xuiFetch(env, `${baseUrl}/`, {
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...xuiAccessHeaders(env),
    },
  });
  const bootstrapText = await bootstrap.clone().text().catch(() => '');
  const bootstrapContentType = bootstrap.headers.get('content-type');
  const bootstrapCookie = cookieHeaderFromResponse(bootstrap.headers);
  let csrfToken = extractCsrfToken(bootstrapText);
  if (!csrfToken) {
    csrfToken = await fetchXuiCsrfToken(env, baseUrl, bootstrapCookie).catch(() => undefined);
  }

  if (!bootstrap.ok && !csrfToken) {
    const title = isHtmlResponse(bootstrapContentType, bootstrapText) ? extractHtmlTitle(bootstrapText) : undefined;
    return {
      error: {
        attempted: true,
        ok: false,
        action: 'csrf',
        status: bootstrap.status,
        contentType: bootstrapContentType,
        hasSetCookie: Boolean(bootstrapCookie),
        message: `3x-ui csrf bootstrap returned ${isHtmlResponse(bootstrapContentType, bootstrapText) ? 'HTML ' : ''}${bootstrap.status}${title ? `: ${title}` : ''}`,
        body: isHtmlResponse(bootstrapContentType, bootstrapText) ? summarizeHtmlBody(bootstrapText) : summarizeBody(bootstrapText),
        config: xuiConfigDiagnostic(env),
      },
    };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
    Accept: 'application/json, text/plain, */*',
    Origin: xuiOrigin(baseUrl),
    Referer: `${baseUrl}/`,
    'X-Requested-With': 'XMLHttpRequest',
    ...xuiAccessHeaders(env),
  };
  if (bootstrapCookie) headers.Cookie = bootstrapCookie;
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;

  const response = await xuiFetch(env, `${baseUrl}/login`, {
    method: 'POST',
    headers,
    body: new URLSearchParams({
      username: env.XUI_USERNAME,
      password: env.XUI_PASSWORD,
    }),
  });

  const cookie = mergeCookieHeaders(bootstrapCookie, cookieHeaderFromResponse(response.headers));
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
        message: xuiPayloadMessage(payload) || (!response.ok ? `3x-ui login returned ${response.status}` : !cookie ? '3x-ui login did not return a session cookie' : `3x-ui login returned ${response.status}`),
        body: summarizeBody(text),
        config: xuiConfigDiagnostic(env),
      },
    };
  }

  return { session: { cookie, csrfToken } };
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

function xuiClientEmail(uuid: string, options: XuiClientOptions): string {
  return options.email || uuid;
}

async function xuiClientExists(
  env: Env,
  session: XuiSession,
  uuid: string,
  target: XuiInboundTarget,
  options: XuiClientOptions,
): Promise<boolean> {
  const response = await xuiFetch(env, `${trimSlash(env.XUI_BASE_URL || '')}/panel/api/inbounds/list`, {
    headers: xuiSessionHeaders(env, session),
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

async function fetchXuiCsrfToken(env: Env, baseUrl: string, cookie?: string): Promise<string | undefined> {
  const headers: Record<string, string> = {
    Accept: 'application/json, text/plain, */*',
    'X-Requested-With': 'XMLHttpRequest',
    ...xuiAccessHeaders(env),
  };
  if (cookie) headers.Cookie = cookie;

  const response = await xuiFetch(env, `${baseUrl}/csrf-token`, { headers });
  if (!response.ok) return undefined;

  const text = await response.text().catch(() => '');
  if (isHtmlResponse(response.headers.get('content-type'), text)) return undefined;
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

function xuiOrigin(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin;
  } catch {
    return baseUrl;
  }
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
