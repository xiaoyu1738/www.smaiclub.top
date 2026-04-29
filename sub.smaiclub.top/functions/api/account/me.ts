import { requireLogin } from '../../_shared/auth.ts';
import {
  generateSecretToken,
  getUserByUsername,
  isBlocked,
  isPrivilegedRole,
  isUnlimitedTime,
  isUnlimitedTraffic,
  publicSubscriptionUrl,
  UNLIMITED_EXPIRED_AT,
  UNLIMITED_TRAFFIC_TOTAL_BYTES,
} from '../../_shared/db.ts';
import { jsonResponse } from '../../_shared/http.ts';
import type { Env, UserSubscriptionRow } from '../../_shared/types.ts';
import { setXuiClientEnabled } from '../../_shared/xui.ts';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const loginUser = await requireLogin(request, env);
  if (loginUser instanceof Response) return loginUser;

  const isAdmin = isPrivilegedRole(loginUser.role);
  const foundUser = await getUserByUsername(env.DB, loginUser.username);
  const user = foundUser && isAdmin ? await ensurePrivilegedSubscription(env, foundUser) : foundUser;
  if (!user) {
    return jsonResponse({
      username: loginUser.username,
      displayName: loginUser.displayName,
      role: loginUser.role,
      effectiveRole: loginUser.effectiveRole,
      isAdmin,
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
  const unlimitedTime = isUnlimitedTime(user);
  const unlimitedTraffic = isUnlimitedTraffic(user);
  return jsonResponse({
    username: user.username,
    displayName: user.display_name || user.username,
    role: loginUser.role,
    effectiveRole: loginUser.effectiveRole,
    isAdmin,
    status: isBlocked(user, now) || user.sub_status,
    expiredAt: user.sub_expired_at,
    remainingDays: unlimitedTime ? -1 : Math.max(0, Math.floor((user.sub_expired_at - now) / 86_400_000)),
    trafficTotal: user.traffic_total,
    trafficUsedVps: user.traffic_used_vps,
    trafficUpdatedAt: user.traffic_updated_at,
    unlimitedTime,
    unlimitedTraffic,
    subscriptionUrl,
  });
};

async function ensurePrivilegedSubscription(env: Env, user: UserSubscriptionRow): Promise<UserSubscriptionRow> {
  const now = Date.now();
  const subToken = user.sub_token || generateSecretToken();
  const xuiUuid = user.xui_uuid || crypto.randomUUID();
  const nextUser: UserSubscriptionRow = {
    ...user,
    sub_token: subToken,
    xui_uuid: xuiUuid,
    sub_status: 'active',
    sub_expired_at: UNLIMITED_EXPIRED_AT,
    traffic_total: UNLIMITED_TRAFFIC_TOTAL_BYTES,
    traffic_updated_at: now,
  };

  if (
    user.sub_token === subToken &&
    user.xui_uuid === xuiUuid &&
    user.sub_status === 'active' &&
    user.sub_expired_at === UNLIMITED_EXPIRED_AT &&
    user.traffic_total === UNLIMITED_TRAFFIC_TOTAL_BYTES
  ) {
    return nextUser;
  }

  await env.DB.prepare(`
    UPDATE users
    SET sub_token = ?,
        xui_uuid = ?,
        sub_status = 'active',
        sub_expired_at = ?,
        traffic_total = ?,
        traffic_updated_at = ?
    WHERE username = ?
  `).bind(subToken, xuiUuid, UNLIMITED_EXPIRED_AT, UNLIMITED_TRAFFIC_TOTAL_BYTES, now, user.username).run();

  const xui = await setXuiClientEnabled(env, xuiUuid, true, { email: user.username });
  if (!xui.ok) {
    console.warn('PRIVILEGED_XUI_SYNC_FAILED', {
      username: user.username,
      attempted: xui.attempted,
      status: xui.status,
      message: xui.message,
    });
  }

  return nextUser;
}
