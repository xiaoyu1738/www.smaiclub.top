interface Env {
  ALIST_HOST: string;
  MUSIC_CACHE: KVNamespace;
}

interface ApiSuccessResponse {
  code: 200;
  url: string;
  cache: 'kv' | 'origin';
}

interface ApiErrorResponse {
  code: number;
  error: string;
}

interface AListFsGetRequest {
  path: string;
  password: string;
}

interface AListFsGetResponse {
  code: number;
  message?: string;
  data?: {
    raw_url?: string;
  };
}

const CACHE_TTL_SECONDS = 7_200;
const REQUEST_TIMEOUT_MS = 30_000;
const PRODUCTION_ORIGIN = 'https://hall.smaiclub.top';
const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/;

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function isAllowedOrigin(origin: string | null): origin is string {
  if (!origin) {
    return false;
  }

  return origin === PRODUCTION_ORIGIN || LOCAL_ORIGIN_PATTERN.test(origin);
}

function buildCorsHeaders(request: Request): Record<string, string> {
  const requestOrigin = request.headers.get('Origin');

  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(requestOrigin) ? requestOrigin : PRODUCTION_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function jsonResponse<T extends ApiSuccessResponse | ApiErrorResponse>(
  request: Request,
  body: T,
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...buildCorsHeaders(request)
    }
  });
}

function errorResponse(request: Request, status: number, message: string): Response {
  return jsonResponse(
    request,
    {
      code: status,
      error: message
    },
    status
  );
}

function normalizePath(rawPath: string | null): string {
  const path = rawPath?.trim();
  if (!path) {
    throw new HttpError(400, 'Missing required query parameter: path');
  }

  if (!path.startsWith('/')) {
    throw new HttpError(400, 'Invalid path: path must start with "/"');
  }

  if (path.includes('..') || path.includes('\0')) {
    throw new HttpError(400, 'Invalid path: path contains unsafe segments');
  }

  return path;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new HttpError(504, 'AList request timed out after 30 seconds');
    }

    throw new HttpError(
      502,
      `Failed to reach AList upstream: ${error instanceof Error ? error.message : String(error)}`
    );
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestAListRawUrl(env: Env, path: string): Promise<string> {
  const upstreamUrl = `${env.ALIST_HOST.replace(/\/+$/, '')}/api/fs/get`;
  const requestBody: AListFsGetRequest = {
    path,
    password: ''
  };

  const response = await fetchWithTimeout(
    upstreamUrl,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify(requestBody)
    },
    REQUEST_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new HttpError(502, `AList upstream returned HTTP ${response.status}`);
  }

  let payload: AListFsGetResponse;
  try {
    payload = (await response.json()) as AListFsGetResponse;
  } catch {
    throw new HttpError(502, 'Failed to parse AList response as JSON');
  }

  if (payload.code !== 200) {
    throw new HttpError(502, payload.message?.trim() || 'AList upstream rejected the request');
  }

  const rawUrl = payload.data?.raw_url?.trim();
  if (!rawUrl) {
    throw new HttpError(502, 'AList response did not include data.raw_url');
  }

  return rawUrl;
}

async function handleGetMusicLink(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const path = normalizePath(url.searchParams.get('path'));

  const cachedUrl = await env.MUSIC_CACHE.get(path);
  if (cachedUrl) {
    return jsonResponse(request, {
      code: 200,
      url: cachedUrl,
      cache: 'kv'
    });
  }

  const rawUrl = await requestAListRawUrl(env, path);

  try {
    await env.MUSIC_CACHE.put(path, rawUrl, {
      expirationTtl: CACHE_TTL_SECONDS
    });
  } catch (error) {
    console.error('Failed to write MUSIC_CACHE entry', {
      path,
      error: error instanceof Error ? error.message : String(error)
    });
  }

  return jsonResponse(request, {
    code: 200,
    url: rawUrl,
    cache: 'origin'
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: buildCorsHeaders(request)
      });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/api/music/get-link') {
      return errorResponse(request, 404, 'Not Found');
    }

    if (request.method !== 'GET') {
      return errorResponse(request, 405, 'Method Not Allowed');
    }

    try {
      return await handleGetMusicLink(request, env);
    } catch (error) {
      if (error instanceof HttpError) {
        return errorResponse(request, error.status, error.message);
      }

      console.error('Unexpected worker error', error);
      return errorResponse(request, 500, 'Internal Server Error');
    }
  }
};
