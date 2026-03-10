interface Env {
  ALIST_HOST: string;
  ALIST_TOKEN?: string;
  ALIST_USERNAME?: string;
  ALIST_PASSWORD?: string;
  ALIST_PASSWORD_HASH?: string;
  PRODUCTION_ORIGIN: string;
  MUSIC_CACHE: KVNamespace;
}

interface AListEnvelope<T> {
  code: number;
  message?: string;
  data?: T;
}

type AListFsGetResponse = AListEnvelope<{ raw_url?: string }>;
type AListLoginResponse = AListEnvelope<{ token?: string }>;

const CACHE_TTL_SECONDS = 7_200;
const REQUEST_TIMEOUT_MS = 30_000;
const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;
const MUSIC_PATH_PREFIX = '/aliyun/music/';
const STREAM_REQUEST_HEADERS = ['range', 'if-range', 'if-none-match', 'if-modified-since'] as const;
const STREAM_RESPONSE_HEADERS = [
  'accept-ranges',
  'cache-control',
  'content-disposition',
  'content-length',
  'content-range',
  'content-type',
  'etag',
  'last-modified',
  'content-encoding',
] as const;

const ALLOWED_AUDIO_EXTENSIONS = new Set([
  '.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.opus', '.ape',
]);

const ALLOWED_ASSET_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif', '.bmp',
  '.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.opus', '.ape',
]);

let runtimeAListToken: string | null = null;
let runtimeLoginPromise: Promise<string> | null = null;

class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function normalizeAListHost(env: Env): string {
  return env.ALIST_HOST.replace(/\/+$/, '');
}

function buildCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  const allowedOrigin =
    origin === env.PRODUCTION_ORIGIN || LOCAL_ORIGIN_PATTERN.test(origin || '')
      ? origin!
      : env.PRODUCTION_ORIGIN;

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range, If-Range, If-None-Match, If-Modified-Since',
    'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range, Content-Type, ETag',
    Vary: 'Origin',
  };
}

function jsonResponse(
  request: Request,
  env: Env,
  body: Record<string, unknown>,
  status = 200,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...buildCorsHeaders(request, env),
      ...extraHeaders,
    },
  });
}

function validatePathStructure(path: string): void {
  if (!path.startsWith('/')) {
    throw new HttpError(400, '路径必须以 "/" 开头');
  }
  if (/\/\.\.(?:\/|$)/.test(path) || path.includes('\0')) {
    throw new HttpError(400, '路径包含不安全的遍历段');
  }
  if (/\/{2,}/.test(path)) {
    throw new HttpError(400, '路径不能包含连续斜杠');
  }
}

function validateMusicPath(path: string): void {
  validatePathStructure(path);

  if (!path.startsWith(MUSIC_PATH_PREFIX)) {
    throw new HttpError(403, `路径必须位于 ${MUSIC_PATH_PREFIX} 下`);
  }

  const dotIndex = path.lastIndexOf('.');
  if (dotIndex < 0) {
    throw new HttpError(400, '路径缺少文件扩展名');
  }

  const ext = path.slice(dotIndex).toLowerCase();
  if (!ALLOWED_AUDIO_EXTENSIONS.has(ext)) {
    throw new HttpError(400, `不允许的文件类型: ${ext}`);
  }
}

function validateAssetPath(path: string): void {
  validatePathStructure(path);

  if (!path.startsWith(MUSIC_PATH_PREFIX)) {
    throw new HttpError(403, `路径必须位于 ${MUSIC_PATH_PREFIX} 下`);
  }

  const dotIndex = path.lastIndexOf('.');
  if (dotIndex < 0) {
    throw new HttpError(400, '路径缺少文件扩展名');
  }

  const ext = path.slice(dotIndex).toLowerCase();
  if (!ALLOWED_ASSET_EXTENSIONS.has(ext)) {
    throw new HttpError(400, `不允许的资源类型: ${ext}`);
  }
}

async function fetchWithTimeout(
  input: string | URL | Request,
  init?: RequestInit,
  timeoutMs = REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new HttpError(504, `上游请求超时（${Math.round(timeoutMs / 1000)}s）`);
    }
    throw new HttpError(
      502,
      `无法连接上游服务: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseJsonEnvelope<T>(payload: unknown): AListEnvelope<T> {
  if (!payload || typeof payload !== 'object') {
    throw new HttpError(502, 'AList 返回了不可解析的 JSON 响应');
  }

  const candidate = payload as Partial<AListEnvelope<T>>;
  if (typeof candidate.code !== 'number') {
    throw new HttpError(502, 'AList JSON 响应缺少 code 字段');
  }

  return candidate as AListEnvelope<T>;
}

function mapAListBusinessError(payload: AListEnvelope<unknown>): HttpError {
  const message = payload.message?.trim() || 'AList 业务层拒绝请求';
  const normalizedMessage = message.toLowerCase();
  const status =
    payload.code === 401 || payload.code === 403 ? 403 :
      payload.code === 404 || normalizedMessage.includes('not found') ? 404 :
        502;

  return new HttpError(status, message);
}

function hasAListLoginCredentials(env: Env): boolean {
  const username = env.ALIST_USERNAME?.trim();
  const secret = env.ALIST_PASSWORD_HASH?.trim() || env.ALIST_PASSWORD?.trim();
  return Boolean(username && secret);
}

function clearRuntimeAListToken(): void {
  runtimeAListToken = null;
}

async function performAListRequest<T>(
  env: Env,
  path: string,
  body: Record<string, unknown>,
  token: string
): Promise<AListEnvelope<T>> {
  const response = await fetchWithTimeout(`${normalizeAListHost(env)}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: token,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new HttpError(502, `AList 上游返回 HTTP ${response.status}`);
  }

  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    throw new HttpError(502, `AList 返回了非 JSON 响应 (Content-Type: ${contentType})`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new HttpError(502, 'AList 响应 JSON 解析失败');
  }

  return parseJsonEnvelope<T>(payload);
}

async function loginToAList(env: Env): Promise<string> {
  if (runtimeLoginPromise) {
    return runtimeLoginPromise;
  }

  const username = env.ALIST_USERNAME?.trim();
  const passwordHash = env.ALIST_PASSWORD_HASH?.trim();
  const password = env.ALIST_PASSWORD?.trim();

  if (!username || (!passwordHash && !password)) {
    throw new HttpError(500, 'AList Token 已失效，且未配置自动登录凭证');
  }

  runtimeLoginPromise = (async () => {
    const loginPath = passwordHash ? '/api/auth/login/hash' : '/api/auth/login';
    const loginBody = passwordHash
      ? { username, password: passwordHash }
      : { username, password };

    const response = await fetchWithTimeout(`${normalizeAListHost(env)}${loginPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(loginBody),
    });

    if (!response.ok) {
      throw new HttpError(502, `AList 登录接口返回 HTTP ${response.status}`);
    }

    const contentType = response.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
      throw new HttpError(502, `AList 登录接口返回了非 JSON 响应 (Content-Type: ${contentType})`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new HttpError(502, 'AList 登录响应 JSON 解析失败');
    }

    const loginPayload = parseJsonEnvelope<AListLoginResponse['data']>(payload);
    if (loginPayload.code !== 200) {
      throw mapAListBusinessError(loginPayload);
    }

    const nextToken = loginPayload.data?.token?.trim();
    if (!nextToken) {
      throw new HttpError(502, 'AList 登录成功但没有返回 token');
    }

    runtimeAListToken = nextToken;
    return nextToken;
  })();

  try {
    return await runtimeLoginPromise;
  } finally {
    runtimeLoginPromise = null;
  }
}

async function getAListAccessToken(env: Env, forceRefresh = false): Promise<string> {
  if (!forceRefresh && runtimeAListToken) {
    return runtimeAListToken;
  }

  if (!forceRefresh) {
    const staticToken = env.ALIST_TOKEN?.trim();
    if (staticToken) {
      return staticToken;
    }
  }

  if (hasAListLoginCredentials(env)) {
    return loginToAList(env);
  }

  const fallbackToken = env.ALIST_TOKEN?.trim();
  if (fallbackToken) {
    return fallbackToken;
  }

  throw new HttpError(500, '未配置 ALIST_TOKEN，也未配置自动登录凭证');
}

async function requestAListRawUrl(env: Env, path: string): Promise<string> {
  const firstToken = await getAListAccessToken(env);
  let payload = await performAListRequest<{ raw_url?: string }>(env, '/api/fs/get', { path, password: '' }, firstToken);

  if ((payload.code === 401 || payload.code === 403) && hasAListLoginCredentials(env)) {
    clearRuntimeAListToken();
    const refreshedToken = await getAListAccessToken(env, true);
    payload = await performAListRequest<{ raw_url?: string }>(
      env,
      '/api/fs/get',
      { path, password: '' },
      refreshedToken
    );
  }

  if (payload.code !== 200) {
    const error = mapAListBusinessError(payload);
    if (error.status === 403 && !hasAListLoginCredentials(env)) {
      throw new HttpError(403, `${error.message}。请更新 ALIST_TOKEN 或配置自动登录凭证`);
    }
    throw error;
  }

  const rawUrl = payload.data?.raw_url?.trim();
  if (!rawUrl) {
    throw new HttpError(404, 'AList 未返回 raw_url，文件可能不存在');
  }

  return rawUrl;
}

async function readCachedRawUrl(env: Env, cacheKey: string): Promise<string | null> {
  const cached = await env.MUSIC_CACHE.get(cacheKey);
  return cached?.trim() || null;
}

function writeCachedRawUrl(env: Env, ctx: ExecutionContext, cacheKey: string, rawUrl: string, label: string): void {
  ctx.waitUntil(
    env.MUSIC_CACHE.put(cacheKey, rawUrl, { expirationTtl: CACHE_TTL_SECONDS }).catch((err) => {
      console.error(`${label} KV 缓存写入失败`, {
        cacheKey,
        error: err instanceof Error ? err.message : String(err),
      });
    })
  );
}

function deleteCachedRawUrl(env: Env, ctx: ExecutionContext, cacheKey: string, label: string): void {
  ctx.waitUntil(
    env.MUSIC_CACHE.delete(cacheKey).catch((err) => {
      console.error(`${label} KV 缓存删除失败`, {
        cacheKey,
        error: err instanceof Error ? err.message : String(err),
      });
    })
  );
}

async function getOrCreateRawUrl(
  env: Env,
  ctx: ExecutionContext,
  cacheKey: string,
  path: string,
  label: string
): Promise<{ rawUrl: string; cache: 'kv' | 'origin' }> {
  const cached = await readCachedRawUrl(env, cacheKey);
  if (cached) {
    return { rawUrl: cached, cache: 'kv' };
  }

  const rawUrl = await requestAListRawUrl(env, path);
  writeCachedRawUrl(env, ctx, cacheKey, rawUrl, label);
  return { rawUrl, cache: 'origin' };
}

function buildMusicStreamUrl(request: Request, path: string): string {
  const streamUrl = new URL(request.url);
  streamUrl.pathname = '/api/music/stream';
  streamUrl.search = '';
  streamUrl.searchParams.set('path', path);
  return streamUrl.toString();
}

function copyStreamRequestHeaders(request: Request): Headers {
  const headers = new Headers();

  for (const headerName of STREAM_REQUEST_HEADERS) {
    const value = request.headers.get(headerName);
    if (value) {
      headers.set(headerName, value);
    }
  }

  return headers;
}

async function fetchMusicStreamFromRawUrl(request: Request, rawUrl: string): Promise<Response> {
  return fetchWithTimeout(rawUrl, {
    method: request.method,
    headers: copyStreamRequestHeaders(request),
  });
}

function createStreamResponse(request: Request, env: Env, upstream: Response): Response {
  const headers = new Headers(buildCorsHeaders(request, env));

  for (const headerName of STREAM_RESPONSE_HEADERS) {
    const value = upstream.headers.get(headerName);
    if (value) {
      headers.set(headerName, value);
    }
  }

  headers.set('Cache-Control', 'private, no-store');

  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

async function handleGetCatalog(request: Request, env: Env): Promise<Response> {
  const dbPath = '/aliyun/music/database.json';
  const rawUrl = await requestAListRawUrl(env, dbPath);
  const response = await fetchWithTimeout(rawUrl, { method: 'GET' });

  if (!response.ok) {
    throw new HttpError(502, `无法读取 database.json: HTTP ${response.status}`);
  }

  const contentType = response.headers.get('Content-Type') || '';

  try {
    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...buildCorsHeaders(request, env),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    throw new HttpError(
      502,
      `文件内容解析 JSON 失败 (实际类型: ${contentType})，请确认 AList 里的文件内容是否损坏`
    );
  }
}

async function handleGetMusicLink(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.searchParams.get('path')?.trim();

  if (!path) {
    throw new HttpError(400, '缺少必需的 path 查询参数');
  }

  validateMusicPath(path);

  const { cache } = await getOrCreateRawUrl(env, ctx, path, path, 'Music');

  return jsonResponse(request, env, {
    code: 200,
    url: buildMusicStreamUrl(request, path),
    cache,
  });
}

async function handleStreamMusic(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.searchParams.get('path')?.trim();

  if (!path) {
    throw new HttpError(400, '缺少必需的 path 查询参数');
  }

  validateMusicPath(path);

  const cacheKey = path;
  const firstAttempt = await getOrCreateRawUrl(env, ctx, cacheKey, path, 'Music');
  let upstream = await fetchMusicStreamFromRawUrl(request, firstAttempt.rawUrl);

  if (upstream.status === 401 || upstream.status === 403) {
    deleteCachedRawUrl(env, ctx, cacheKey, 'Music');
    const freshRawUrl = await requestAListRawUrl(env, path);
    writeCachedRawUrl(env, ctx, cacheKey, freshRawUrl, 'Music');
    upstream = await fetchMusicStreamFromRawUrl(request, freshRawUrl);
  }

  if (!upstream.ok && upstream.status !== 206 && upstream.status !== 304) {
    if (upstream.status === 404) {
      throw new HttpError(404, '上游音频资源不存在');
    }
    if (upstream.status === 403) {
      throw new HttpError(403, '上游音频资源拒绝访问，通常是直链签名或 Referer 限制导致');
    }
    throw new HttpError(502, `上游音频流返回 HTTP ${upstream.status}`);
  }

  return createStreamResponse(request, env, upstream);
}

async function handleGetAsset(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.searchParams.get('path')?.trim();

  if (!path) {
    throw new HttpError(400, '缺少必需的 path 查询参数');
  }

  validateAssetPath(path);

  const cacheKey = `asset:${path}`;
  const cached = await readCachedRawUrl(env, cacheKey);
  if (cached) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: cached,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  const rawUrl = await requestAListRawUrl(env, path);
  writeCachedRawUrl(env, ctx, cacheKey, rawUrl, 'Asset');

  return new Response(null, {
    status: 302,
    headers: {
      Location: rawUrl,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: buildCorsHeaders(request, env) });
    }

    if (!['GET', 'HEAD'].includes(request.method)) {
      return jsonResponse(request, env, { code: 405, error: 'Method Not Allowed' }, 405);
    }

    try {
      if (url.pathname === '/api/music/catalog') {
        return await handleGetCatalog(request, env);
      }
      if (url.pathname === '/api/music/get-link') {
        return await handleGetMusicLink(request, env, ctx);
      }
      if (url.pathname === '/api/music/stream') {
        return await handleStreamMusic(request, env, ctx);
      }
      if (url.pathname === '/api/music/asset') {
        return await handleGetAsset(request, env, ctx);
      }

      return jsonResponse(request, env, { code: 404, error: 'Not Found' }, 404);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof Error ? error.message : 'Internal Server Error';

      if (status >= 500) {
        console.error('Worker 错误', { pathname: url.pathname, status, message, error });
      }

      return jsonResponse(request, env, { code: status, error: message }, status);
    }
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const keepaliveUrl = `${normalizeAListHost(env)}/api/public/settings?t=${Date.now()}`;
    ctx.waitUntil(
      fetch(keepaliveUrl, { headers: { 'User-Agent': 'SmaiClub-KeepAlive' } })
        .then((response) => console.log(`Wake up Render: ${response.status}`))
        .catch((error) => console.error('Keepalive failed', error))
    );
  },
};
