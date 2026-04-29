export type SubscriptionStatus = 'active' | 'expired' | 'banned' | 'limited';

export interface Env {
  DB: D1Database;
  ADMIN_TOKEN?: string;
  LOGIN_ME_URL?: string;
  SUB_PUBLIC_ORIGIN?: string;
  SUB_TRAFFIC_TOTAL_BYTES?: string;
  EDGETUNNEL_SUB_URL?: string;
  EDGETUNNEL_MAX_NODES?: string;
  EDGETUNNEL_MAX_PER_REGION?: string;
  EDGETUNNEL_REWRITE_UUID?: string;
  EDGETUNNEL_GEO_API_URL?: string;
  GEO_API_BASE_URL?: string;
  XUI_BASE_URL?: string;
  XUI_USERNAME?: string;
  XUI_PASSWORD?: string;
  XUI_COOKIE?: string;
  XUI_INBOUND_ID?: string;
  XUI_ACCESS_CLIENT_ID?: string;
  XUI_ACCESS_CLIENT_SECRET?: string;
  XUI_ACCESS_AUTH_HEADER?: string;
  REALITY_HOST?: string;
  REALITY_PORT?: string;
  REALITY_PUBLIC_KEY?: string;
  REALITY_SNI?: string;
  REALITY_SHORT_ID?: string;
  REALITY_SHORT_IDS?: string;
  REALITY_SPIDER_X?: string;
  REALITY_FLOW?: string;
  REALITY_FINGERPRINT?: string;
  REALITY_NODE_NAME?: string;
}

export interface UserSubscriptionRow {
  username: string;
  display_name?: string | null;
  sub_token?: string | null;
  xui_uuid?: string | null;
  sub_status: SubscriptionStatus;
  sub_expired_at: number;
  traffic_total: number;
  traffic_used_vps: number;
  traffic_updated_at: number;
}

export interface ProxyNode {
  id: string;
  name: string;
  uri: string;
  kind: 'vps' | 'edge';
}

export interface ClientFormat {
  kind: 'clash' | 'sing-box' | 'raw';
  contentType: string;
}
