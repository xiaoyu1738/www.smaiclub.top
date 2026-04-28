import { requireAdminLogin } from '../../_shared/auth.ts';
import { configuredTrafficTotal, generateSecretToken, getUserByUsername, publicSubscriptionUrl } from '../../_shared/db.ts';
import { jsonResponse } from '../../_shared/http.ts';
import type { Env } from '../../_shared/types.ts';
import { setXuiClientEnabled } from '../../_shared/xui.ts';

interface RenewPayload {
  username?: string;
  addDays?: number;
  resetTraffic?: boolean;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const admin = await requireAdminLogin(request, env);
  if (admin instanceof Response) return admin;

  const payload = await request.json().catch(() => ({})) as RenewPayload;
  const username = payload.username?.trim();
  if (!username) return jsonResponse({ error: 'USERNAME_REQUIRED' }, { status: 400 });

  const user = await getUserByUsername(env.DB, username);
  if (!user) return jsonResponse({ error: 'USER_NOT_FOUND' }, { status: 404 });

  const now = Date.now();
  const addDays = Math.max(1, Math.min(366, Number(payload.addDays || 30)));
  const expiresFrom = Math.max(now, user.sub_expired_at || 0);
  const expiredAt = expiresFrom + addDays * 86_400_000;
  const subToken = user.sub_token || generateSecretToken();
  const xuiUuid = user.xui_uuid || crypto.randomUUID();
  const trafficTotal = user.traffic_total || configuredTrafficTotal(env);
  const resetTraffic = payload.resetTraffic !== false;

  await env.DB.prepare(`
    UPDATE users
    SET sub_token = ?,
        xui_uuid = ?,
        sub_status = 'active',
        sub_expired_at = ?,
        traffic_total = ?,
        traffic_used_vps = CASE WHEN ? THEN 0 ELSE traffic_used_vps END,
        traffic_updated_at = ?
    WHERE username = ?
  `).bind(subToken, xuiUuid, expiredAt, trafficTotal, resetTraffic ? 1 : 0, now, username).run();

  const xui = await setXuiClientEnabled(env, xuiUuid, true, {
    email: username,
    expiryTime: expiredAt,
    totalBytes: trafficTotal,
  });
  const url = new URL(request.url);
  return jsonResponse({
    ok: true,
    username,
    subToken,
    xuiUuid,
    expiredAt,
    trafficTotal,
    subscriptionUrl: publicSubscriptionUrl(env.SUB_PUBLIC_ORIGIN || url.origin, subToken),
    admin: admin.username,
    xui,
  });
};
