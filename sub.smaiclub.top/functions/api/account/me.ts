import { requireLogin } from '../../_shared/auth.ts';
import { getUserByUsername, isBlocked, publicSubscriptionUrl } from '../../_shared/db.ts';
import { jsonResponse } from '../../_shared/http.ts';
import type { Env } from '../../_shared/types.ts';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const loginUser = await requireLogin(request, env);
  if (loginUser instanceof Response) return loginUser;

  const user = await getUserByUsername(env.DB, loginUser.username);
  if (!user) {
    return jsonResponse({
      username: loginUser.username,
      displayName: loginUser.displayName,
      role: loginUser.role,
      effectiveRole: loginUser.effectiveRole,
      isAdmin: ['admin', 'owner'].includes(loginUser.role),
      status: 'not_configured',
      expiredAt: 0,
      remainingDays: 0,
      trafficTotal: 0,
      trafficUsedVps: 0,
      trafficUpdatedAt: 0,
      subscriptionUrl: null,
    });
  }

  const url = new URL(request.url);
  const origin = env.SUB_PUBLIC_ORIGIN || url.origin;
  const now = Date.now();
  const subscriptionUrl = user.sub_token ? publicSubscriptionUrl(origin, user.sub_token) : null;
  return jsonResponse({
    username: user.username,
    displayName: user.display_name || user.username,
    role: loginUser.role,
    effectiveRole: loginUser.effectiveRole,
    isAdmin: ['admin', 'owner'].includes(loginUser.role),
    status: isBlocked(user, now) || user.sub_status,
    expiredAt: user.sub_expired_at,
    remainingDays: Math.max(0, Math.floor((user.sub_expired_at - now) / 86_400_000)),
    trafficTotal: user.traffic_total,
    trafficUsedVps: user.traffic_used_vps,
    trafficUpdatedAt: user.traffic_updated_at,
    subscriptionUrl,
  });
};
