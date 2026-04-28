import { fetchXuiClientStats, setXuiClientEnabled, type Env } from './xui.ts';

interface UserRow {
  username: string;
  xui_uuid: string;
  sub_status: string;
  sub_expired_at: number;
  traffic_total: number;
  traffic_used_vps: number;
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runSubscriptionSweep(env));
  },

  async fetch(_request: Request, env: Env) {
    const summary = await runSubscriptionSweep(env);
    return Response.json(summary);
  },
};

export async function runSubscriptionSweep(env: Env, now = Date.now()) {
  const stats = await fetchXuiClientStats(env);
  for (const stat of stats) {
    await env.DB.prepare(`
      UPDATE users
      SET traffic_used_vps = ?,
          traffic_updated_at = ?
      WHERE xui_uuid = ?
    `).bind(stat.used, now, stat.uuid).run();
  }

  const { results } = await env.DB.prepare(`
    SELECT username, xui_uuid, sub_status, sub_expired_at, traffic_total, traffic_used_vps
    FROM users
    WHERE xui_uuid IS NOT NULL
      AND sub_status = 'active'
      AND (sub_expired_at <= ? OR traffic_used_vps >= traffic_total)
  `).bind(now).all<UserRow>();

  let disabled = 0;
  for (const user of results || []) {
    const nextStatus = user.traffic_used_vps >= user.traffic_total ? 'limited' : 'expired';
    await env.DB.prepare(`
      UPDATE users
      SET sub_status = ?,
          traffic_updated_at = ?
      WHERE username = ?
    `).bind(nextStatus, now, user.username).run();
    if (user.xui_uuid && await setXuiClientEnabled(env, user.xui_uuid, false)) {
      disabled += 1;
    }
  }

  return {
    syncedStats: stats.length,
    blockedUsers: results?.length || 0,
    disabledClients: disabled,
  };
}
