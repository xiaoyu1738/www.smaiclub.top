import { requireAdminLogin } from '../../_shared/auth.ts';
import {
  configuredTrafficTotal,
  generateSecretToken,
  getUserByUsername,
  publicSubscriptionUrl,
  UNLIMITED_TRAFFIC_TOTAL_BYTES,
} from '../../_shared/db.ts';
import { jsonResponse } from '../../_shared/http.ts';
import type { Env } from '../../_shared/types.ts';
import { setXuiClientEnabled } from '../../_shared/xui.ts';

interface RenewPayload {
  username?: string;
  addDays?: number;
  resetTraffic?: boolean;
  trafficTotalBytes?: number | null;
  trafficTotalGb?: number | null;
  unlimitedTraffic?: boolean;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
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
    const trafficTotal = parseRequestedTrafficTotal(payload, user.traffic_total, configuredTrafficTotal(env));
    if (trafficTotal === null) return jsonResponse({ error: 'INVALID_TRAFFIC_TOTAL' }, { status: 400 });
    const resetTraffic = payload.resetTraffic !== false;

    const xui = await setXuiClientEnabled(env, xuiUuid, true, {
      email: username,
    });
    if (!xui.ok) {
      console.warn('XUI_SYNC_FAILED', {
        username,
        attempted: xui.attempted,
        status: xui.status,
        message: xui.message,
        body: xui.body,
        config: xui.config,
      });
      return jsonResponse({
        error: 'XUI_SYNC_FAILED',
        message: xui.message || '3x-ui client sync failed',
        xui,
      }, { status: 502 });
    }

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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('ADMIN_RENEW_UNHANDLED', message);
    return jsonResponse({
      error: 'ADMIN_RENEW_UNHANDLED',
      message,
    }, { status: 500 });
  }
};

function parseRequestedTrafficTotal(payload: RenewPayload, currentTotal: number, defaultTotal: number): number | null {
  if (payload.unlimitedTraffic === true || payload.trafficTotalBytes === null || payload.trafficTotalGb === null) {
    return UNLIMITED_TRAFFIC_TOTAL_BYTES;
  }
  if (typeof payload.trafficTotalBytes === 'number') {
    if (!Number.isFinite(payload.trafficTotalBytes) || payload.trafficTotalBytes < 1) {
      return null;
    }
    return Math.floor(payload.trafficTotalBytes);
  }
  if (typeof payload.trafficTotalGb === 'number') {
    if (!Number.isFinite(payload.trafficTotalGb) || payload.trafficTotalGb < 1 || payload.trafficTotalGb > 102400) {
      return null;
    }
    return Math.floor(payload.trafficTotalGb * 1024 * 1024 * 1024);
  }
  return currentTotal || defaultTotal;
}
