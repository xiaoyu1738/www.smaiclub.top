import type { Env, SubscriptionStatus, UserSubscriptionRow } from './types.ts';

export const DEFAULT_TRAFFIC_TOTAL_BYTES = 500 * 1024 * 1024 * 1024;

export function configuredTrafficTotal(env: Env): number {
  const parsed = Number(env.SUB_TRAFFIC_TOTAL_BYTES);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : DEFAULT_TRAFFIC_TOTAL_BYTES;
}

export function normalizeStatus(status: unknown): SubscriptionStatus {
  return status === 'active' || status === 'banned' || status === 'limited' || status === 'expired'
    ? status
    : 'expired';
}

export async function getUserByToken(db: D1Database, token: string): Promise<UserSubscriptionRow | null> {
  const row = await db.prepare(`
    SELECT username, display_name, sub_token, xui_uuid, sub_status, sub_expired_at,
           traffic_total, traffic_used_vps, traffic_updated_at
    FROM users
    WHERE sub_token = ?
  `).bind(token).first<UserSubscriptionRow>();
  return row ? normalizeUserRow(row) : null;
}

export async function getUserByUsername(db: D1Database, username: string): Promise<UserSubscriptionRow | null> {
  const row = await db.prepare(`
    SELECT username, display_name, sub_token, xui_uuid, sub_status, sub_expired_at,
           traffic_total, traffic_used_vps, traffic_updated_at
    FROM users
    WHERE username = ?
  `).bind(username).first<UserSubscriptionRow>();
  return row ? normalizeUserRow(row) : null;
}

export function normalizeUserRow(row: UserSubscriptionRow): UserSubscriptionRow {
  return {
    ...row,
    sub_status: normalizeStatus(row.sub_status),
    sub_expired_at: Number(row.sub_expired_at || 0),
    traffic_total: Number(row.traffic_total || DEFAULT_TRAFFIC_TOTAL_BYTES),
    traffic_used_vps: Number(row.traffic_used_vps || 0),
    traffic_updated_at: Number(row.traffic_updated_at || 0),
  };
}

export function isBlocked(user: UserSubscriptionRow, now = Date.now()): SubscriptionStatus | null {
  if (user.sub_status === 'banned') return 'banned';
  if (user.sub_status === 'limited') return 'limited';
  if (user.sub_status !== 'active') return 'expired';
  if (user.sub_expired_at <= now) return 'expired';
  if (user.traffic_used_vps >= user.traffic_total) return 'limited';
  return null;
}

export function publicSubscriptionUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/api/sub/${encodeURIComponent(token)}`;
}

export function generateSecretToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, '0')).join('');
}
