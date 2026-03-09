interface Env {
  ALIST_HOST: string;
  ALIST_TOKEN: string;
  PRODUCTION_ORIGIN: string;
  MUSIC_CACHE: KVNamespace;
}

// --- 类型定义 ---
interface AListFsGetResponse {
  code: number;
  message?: string;
  data?: { raw_url?: string };
}

// --- 常量配置 ---
const CACHE_TTL_SECONDS = 7_200;
const REQUEST_TIMEOUT_MS = 30_000;
const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

/**
 * 路径安全：允许的音频文件后缀白名单
 */
const ALLOWED_AUDIO_EXTENSIONS = new Set([
  '.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.opus', '.ape',
]);

/**
 * 路径安全：允许的资源文件后缀（图片 + 音频 + JSON）
 * 用于 /api/music/asset 代理端点
 */
const ALLOWED_ASSET_EXTENSIONS = new Set([
  // 图片
  '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif', '.bmp',
  // 音频（asset 端点也可以用于预览）
  '.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.wma', '.opus', '.ape',
]);

/**
 * 路径安全：音频文件必须落在此前缀下
 * 防止任意路径遍历 AList 上的非音乐资源
 */
const MUSIC_PATH_PREFIX = '/aliyun/music/';

// --- 自定义错误，携带 HTTP 状态码 ---
class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

// --- 工具函数 ---
function buildCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get('Origin');
  const allowedOrigin =
    origin === env.PRODUCTION_ORIGIN || LOCAL_ORIGIN_PATTERN.test(origin || '')
      ? origin!
      : env.PRODUCTION_ORIGIN;

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
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

/**
 * 路径校验：拒绝路径遍历、空段、重复斜杠、非法字符
 * 不做前缀和后缀检查，由调用方视场景决定
 */
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

/**
 * 音频路径专用校验：前缀 + 音频后缀白名单
 */
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

/**
 * 资源路径校验：前缀 + 资源后缀白名单（图片 + 音频）
 */
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

/**
 * 核心：带 Admin Token 请求 AList /api/fs/get
 * 区分 HTTP 层失败、JSON 解析失败、业务层拒绝三种情况
 */
async function requestAListRawUrl(env: Env, path: string): Promise<string> {
  const upstreamUrl = `${env.ALIST_HOST.replace(/\/+$/, '')}/api/fs/get`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: env.ALIST_TOKEN,
        Accept: 'application/json',
      },
      body: JSON.stringify({ path, password: '' }),
      signal: controller.signal,
    });
  } catch (error) {
    // 网络层 / 超时
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new HttpError(504, 'AList 请求超时（30s）');
    }
    throw new HttpError(
      502,
      `无法连接 AList 上游: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    clearTimeout(timeoutId);
  }

  // HTTP 层检查：先看状态码，再看 Content-Type
  if (!response.ok) {
    throw new HttpError(502, `AList 上游返回 HTTP ${response.status}`);
  }

  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) {
    // AList 返回了 HTML 错页或其他非 JSON 响应
    throw new HttpError(502, `AList 返回了非 JSON 响应 (Content-Type: ${contentType})`);
  }

  // JSON 解析
  let payload: AListFsGetResponse;
  try {
    payload = (await response.json()) as AListFsGetResponse;
  } catch {
    throw new HttpError(502, 'AList 响应 JSON 解析失败');
  }

  // 业务层检查：AList 自身的错误码
  if (payload.code !== 200) {
    const msg = payload.message?.trim() || 'AList 业务层拒绝请求';
    // 将 AList 的常见错误码映射到恰当的 HTTP 状态
    const status =
      payload.code === 401 || payload.code === 403 ? 403 :
        payload.code === 404 || msg.includes('not found') ? 404 :
          502;
    throw new HttpError(status, msg);
  }

  const rawUrl = payload.data?.raw_url?.trim();
  if (!rawUrl) {
    throw new HttpError(404, 'AList 未返回 raw_url，文件可能不存在');
  }

  return rawUrl;
}

// --- 路由处理器 ---

/**
 * 路由 1: 获取音乐库索引 database.json
 * 通过 Worker 代理，解决前端直连 AList 的 CORS + 401 问题
 */
async function handleGetCatalog(request: Request, env: Env): Promise<Response> {
  const dbPath = '/aliyun/music/database.json';
  const rawUrl = await requestAListRawUrl(env, dbPath);

  const response = await fetch(rawUrl);

  // 1. 只看状态码，200 说明文件拿到了
  if (!response.ok) {
    throw new HttpError(502, `无法读取 database.json: HTTP ${response.status}`);
  }

  // 2. Content-Type 仅用于诊断，不做拦截（对象存储可能返回 octet-stream）
  const contentType = response.headers.get('Content-Type') || '';

  try {
    // 3. 直接尝试解析，只要内容是 JSON 字符串就能成功
    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        ...buildCorsHeaders(request, env),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    // 4. 解析失败才报错，带上实际 Content-Type 辅助排查
    throw new HttpError(
      502,
      `文件内容解析 JSON 失败 (实际类型: ${contentType})，请确认 AList 里的文件内容是否损坏`
    );
  }
}

/**
 * 路由 2: 获取音频直链 (含 KV 缓存)
 * ctx 用于 best-effort KV 回写，不阻塞响应
 */
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

  // 路径安全校验：前缀 + 后缀 + 遍历检查
  validateMusicPath(path);

  // 1. 查 KV 缓存 (L2)
  const cached = await env.MUSIC_CACHE.get(path);
  if (cached) {
    return jsonResponse(request, env, { code: 200, url: cached, cache: 'kv' });
  }

  // 2. 查 AList 源站 (L3)
  const rawUrl = await requestAListRawUrl(env, path);

  // 3. 非阻塞回写 KV —— 不 await，用 ctx.waitUntil 确保写入完成
  ctx.waitUntil(
    env.MUSIC_CACHE.put(path, rawUrl, { expirationTtl: CACHE_TTL_SECONDS }).catch((err) => {
      console.error('KV 缓存写入失败', { path, error: err instanceof Error ? err.message : String(err) });
    })
  );

  return jsonResponse(request, env, { code: 200, url: rawUrl, cache: 'origin' });
}

/**
 * 路由 3: 资源代理（图片/封面等）
 * 通过 AList API 拿到 raw_url 后 302 重定向到云存储直链
 * 浏览器 <img> 跟随 302 自动加载，不耗 Worker 带宽
 * 同时利用 KV 缓存 raw_url，减少 AList API 调用
 */
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

  // KV 缓存 key 加前缀区分音频直链和资源直链
  const cacheKey = `asset:${path}`;

  // 1. 查 KV 缓存
  const cached = await env.MUSIC_CACHE.get(cacheKey);
  if (cached) {
    return new Response(null, {
      status: 302,
      headers: {
        Location: cached,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  // 2. 查 AList 源站
  const rawUrl = await requestAListRawUrl(env, path);

  // 3. 非阻塞回写 KV
  ctx.waitUntil(
    env.MUSIC_CACHE.put(cacheKey, rawUrl, { expirationTtl: CACHE_TTL_SECONDS }).catch((err) => {
      console.error('Asset KV 缓存写入失败', { path, error: err instanceof Error ? err.message : String(err) });
    })
  );

  // 302 重定向到云存储直链
  return new Response(null, {
    status: 302,
    headers: {
      Location: rawUrl,
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

// --- 导出 Worker 逻辑 ---
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: buildCorsHeaders(request, env) });
    }

    if (request.method !== 'GET') {
      return jsonResponse(request, env, { code: 405, error: 'Method Not Allowed' }, 405);
    }

    try {
      if (url.pathname === '/api/music/catalog') {
        return await handleGetCatalog(request, env);
      }
      if (url.pathname === '/api/music/get-link') {
        return await handleGetMusicLink(request, env, ctx);
      }
      if (url.pathname === '/api/music/asset') {
        return await handleGetAsset(request, env, ctx);
      }

      return jsonResponse(request, env, { code: 404, error: 'Not Found' }, 404);
    } catch (e) {
      // HttpError 携带了准确的状态码，直接映射
      const status = e instanceof HttpError ? e.status : 500;
      const message = e instanceof Error ? e.message : 'Internal Server Error';

      if (status >= 500) {
        console.error('Worker 错误', { pathname: url.pathname, status, message, error: e });
      }

      return jsonResponse(request, env, { code: status, error: message }, status);
    }
  },

  /**
   * 自动保活任务 (每 10 分钟执行一次)
   */
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    const keepaliveUrl = `${env.ALIST_HOST}/api/public/settings?t=${Date.now()}`;
    ctx.waitUntil(
      fetch(keepaliveUrl, { headers: { 'User-Agent': 'SmaiClub-KeepAlive' } })
        .then((res) => console.log(`Wake up Render: ${res.status}`))
        .catch((err) => console.error('Keepalive failed', err))
    );
  },
};