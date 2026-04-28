export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(init.headers ?? {}),
    },
  });
}

export function textResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, {
    ...init,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      ...(init.headers ?? {}),
    },
  });
}

export function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get('Authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function requireAdmin(request: Request, adminToken?: string): Response | null {
  if (!adminToken) {
    return jsonResponse({ error: 'ADMIN_TOKEN_NOT_CONFIGURED' }, { status: 500 });
  }
  if (getBearerToken(request) !== adminToken) {
    return jsonResponse({ error: 'UNAUTHORIZED' }, { status: 401 });
  }
  return null;
}
