import { Ban, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import Button from '../components/Button';
import type { AccountInfo, RenewResult } from '../types';
import styles from '../styles/Admin.module.css';

const ADMIN_LOGIN_URL = 'https://login.smaiclub.top/login?redirect=https%3A%2F%2Fsub.smaiclub.top%2Fadmin-secret';

export default function Admin() {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [username, setUsername] = useState('');
  const [trafficMode, setTrafficMode] = useState<'limited' | 'unlimited'>('limited');
  const [trafficGb, setTrafficGb] = useState('500');
  const [result, setResult] = useState<RenewResult | null>(null);
  const [message, setMessage] = useState('');

  async function loadAccount() {
    setAuthLoading(true);
    try {
      const response = await fetch('/api/account/me', { credentials: 'include' });
      const payload = await readApiResponse<AccountInfo | { error?: string }>(response);
      setAccount(response.ok ? payload as AccountInfo : null);
    } finally {
      setAuthLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAccount();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function renew(resetTraffic: boolean) {
    setMessage('');
    const requestedTrafficGb = Number(trafficGb);
    if (trafficMode === 'limited' && (!Number.isFinite(requestedTrafficGb) || requestedTrafficGb < 1)) {
      setMessage('流量额度必须大于 0 GB');
      return;
    }
    const response = await fetch('/api/admin/renew', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        username,
        addDays: 30,
        resetTraffic,
        unlimitedTraffic: trafficMode === 'unlimited',
        trafficTotalGb: trafficMode === 'limited' ? requestedTrafficGb : null,
      }),
    });
    const payload = await readApiResponse<RenewResult | { error?: string; message?: string; xui?: RenewResult['xui'] & { body?: string; status?: number } }>(response);
    if (!response.ok) {
      setMessage(formatAdminError(getErrorCode(payload), '续期失败', payload));
      return;
    }
    setResult(payload as RenewResult);
    setMessage('续期完成');
  }

  async function ban() {
    setMessage('');
    const response = await fetch('/api/admin/ban', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ username }),
    });
    const payload = await readApiResponse<{ error?: string; message?: string }>(response);
    setMessage(response.ok ? '已封禁' : formatAdminError(getErrorCode(payload), '封禁失败', payload));
  }

  return (
    <main className={styles.shell}>
      <section className={styles.panel}>
        <p className={styles.eyebrow}>Administrator</p>
        <h1>发卡与续期</h1>
        <p className={styles.hint}>使用 SmaiClub 统一登录，只有 admin / owner 可以操作。</p>

        {authLoading && <p className={styles.message}>正在校验登录状态...</p>}

        {!authLoading && !account && (
          <div className={styles.actions}>
            <a href={ADMIN_LOGIN_URL}>
              <Button type="button" tone="ghost">登录 SmaiClub</Button>
            </a>
          </div>
        )}

        {!authLoading && account && !account.isAdmin && (
          <p className={styles.denied}>当前账号 {account.displayName} 没有管理员权限。</p>
        )}

        {account?.isAdmin && (
          <>
            <div className={styles.grid}>
              <label>
                用户名
                <input value={username} onChange={event => setUsername(event.target.value)} placeholder="xiaozhong" />
              </label>
              <label>
                流量额度
                <input
                  disabled={trafficMode === 'unlimited'}
                  inputMode="decimal"
                  min="1"
                  type="number"
                  value={trafficGb}
                  onChange={event => setTrafficGb(event.target.value)}
                  placeholder="500"
                />
              </label>
              <label>
                额度模式
                <select value={trafficMode} onChange={event => setTrafficMode(event.target.value as 'limited' | 'unlimited')}>
                  <option value="limited">按 GB 限额</option>
                  <option value="unlimited">无限流量</option>
                </select>
              </label>
            </div>
            <div className={styles.actions}>
              <Button onClick={() => void renew(true)} icon={<RotateCw size={17} />}>续期30天并重置流量</Button>
              <Button tone="ghost" onClick={() => void renew(false)} icon={<RotateCw size={17} />}>续期保留流量</Button>
              <Button tone="danger" onClick={() => void ban()} icon={<Ban size={17} />}>封禁</Button>
            </div>
          </>
        )}
        {message && <p className={styles.message}>{message}</p>}
      </section>

      {result && (
        <section className={styles.result}>
          <span>订阅链接</span>
          <input readOnly value={result.subscriptionUrl} />
          <span>UUID</span>
          <input readOnly value={result.xuiUuid} />
          <span>流量额度</span>
          <input readOnly value={result.trafficTotal < 0 ? '不限' : formatBytes(result.trafficTotal)} />
        </section>
      )}
    </main>
  );
}

function formatBytes(value: number): string {
  if (value < 0) return '不限';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = value;
  let unit = 0;
  while (current >= 1024 && unit < units.length - 1) {
    current /= 1024;
    unit += 1;
  }
  return `${current.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

async function readApiResponse<T>(response: Response): Promise<T & { rawText?: string }> {
  const text = await response.text();
  if (!text) return {} as T & { rawText?: string };
  try {
    return JSON.parse(text) as T & { rawText?: string };
  } catch {
    return { rawText: text } as T & { rawText?: string };
  }
}

function getErrorCode(payload: unknown): string | undefined {
  return payload && typeof payload === 'object' && 'error' in payload
    ? String((payload as { error?: unknown }).error || '')
    : undefined;
}

function formatAdminError(
  error: string | undefined,
  fallback: string,
  payload?: { message?: string; rawText?: string; xui?: { message?: string; body?: string; status?: number } },
): string {
  if (error === 'LOGIN_REQUIRED') return '请先登录 SmaiClub 账号';
  if (error === 'FORBIDDEN') return '当前账号没有管理员权限';
  if (error === 'XUI_SYNC_FAILED') {
    const status = payload?.xui?.status ? `HTTP ${payload.xui.status}: ` : '';
    const config = formatXuiConfig(payload?.xui);
    return `3x-ui 同步失败：${status}${payload?.xui?.message || payload?.message || payload?.xui?.body || fallback}${config}`;
  }
  if (payload?.message) return payload.message;
  if (payload?.rawText) return `${fallback}：${payload.rawText.replace(/\s+/g, ' ').trim().slice(0, 160)}`;
  return error || fallback;
}

function formatXuiConfig(xui: unknown): string {
  if (!xui || typeof xui !== 'object' || !('config' in xui)) return '';
  const config = (xui as { config?: Record<string, boolean> }).config;
  if (!config) return '';
  return `（配置：base=${Boolean(config.hasBaseUrl)}, inbound=${Boolean(config.hasInboundId)}, user=${Boolean(config.hasUsername)}, pass=${Boolean(config.hasPassword)}, cookie=${Boolean(config.hasCookie)}）`;
}
