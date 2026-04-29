export interface AccountInfo {
  username: string;
  displayName: string;
  role: string;
  effectiveRole: string;
  isAdmin: boolean;
  status: 'active' | 'expired' | 'banned' | 'limited' | 'not_configured';
  expiredAt: number;
  remainingDays: number;
  trafficTotal: number;
  trafficUsedVps: number;
  trafficUpdatedAt: number;
  unlimitedTime?: boolean;
  unlimitedTraffic?: boolean;
  subscriptionUrl: string | null;
}

export interface RenewResult {
  ok: boolean;
  username: string;
  subToken: string;
  xuiUuid: string;
  expiredAt: number;
  trafficTotal: number;
  subscriptionUrl: string;
  xui?: {
    attempted: boolean;
    ok: boolean;
    message?: string;
  };
}
