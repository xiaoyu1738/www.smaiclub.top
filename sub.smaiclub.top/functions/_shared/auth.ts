import type { Env } from './types.ts';

export interface LoginUser {
  username: string;
  displayName: string;
  role: string;
  effectiveRole: string;
}

export async function getLoginUser(request: Request, env: Env): Promise<LoginUser | null> {
  const cookie = request.headers.get('Cookie');
  if (!cookie) return null;

  const loginMeUrl = env.LOGIN_ME_URL || 'https://login.smaiclub.top/api/me';
  try {
    const response = await fetch(loginMeUrl, {
      headers: { Cookie: cookie },
    });
    if (!response.ok) return null;
    const payload = await response.json() as Partial<LoginUser> & { loggedIn?: boolean };
    if (!payload.loggedIn || !payload.username) return null;
    return {
      username: payload.username,
      displayName: payload.displayName || payload.username,
      role: payload.role || 'user',
      effectiveRole: payload.effectiveRole || payload.role || 'user',
    };
  } catch (error) {
    console.warn('Failed to verify login session', error);
    return null;
  }
}

export async function requireLogin(request: Request, env: Env): Promise<LoginUser | Response> {
  const user = await getLoginUser(request, env);
  if (!user) {
    return Response.json({ error: 'LOGIN_REQUIRED' }, { status: 401 });
  }
  return user;
}

export async function requireAdminLogin(request: Request, env: Env): Promise<LoginUser | Response> {
  const user = await getLoginUser(request, env);
  if (!user) {
    return Response.json({ error: 'LOGIN_REQUIRED' }, { status: 401 });
  }
  if (!['admin', 'owner'].includes(user.role)) {
    return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
  }
  return user;
}
