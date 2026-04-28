import { Copy, Gauge, LogIn, RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../components/Button';
import type { AccountInfo } from '../types';
import styles from '../styles/Dashboard.module.css';

const LOGIN_URL = 'https://login.smaiclub.top/login?redirect=https%3A%2F%2Fsub.smaiclub.top%2Fdashboard';

export default function Dashboard() {
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const usagePercent = useMemo(() => {
    if (!account || account.trafficTotal <= 0) return 0;
    return Math.min(100, Math.round((account.trafficUsedVps / account.trafficTotal) * 100));
  }, [account]);

  async function loadAccount() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/account/me', {
        credentials: 'include',
      });
      const payload = await response.json() as AccountInfo | { error?: string };
      if (!response.ok) {
        const errorCode = 'error' in payload ? payload.error : '';
        if (errorCode === 'LOGIN_REQUIRED') {
          throw new Error('请先登录 SmaiClub 账号');
        }
        throw new Error(errorCode || '加载失败');
      }
      setAccount(payload as AccountInfo);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setAccount(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadAccount();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function copySubscription() {
    if (!account?.subscriptionUrl) return;
    await navigator.clipboard.writeText(account.subscriptionUrl);
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <Link to="/" className={styles.logo}>SmaiClub Sub</Link>
        <a href={LOGIN_URL}>
          <Button tone="ghost" icon={<LogIn size={17} />}>登录</Button>
        </a>
      </header>

      <section className={styles.panel}>
        <div>
          <p className={styles.eyebrow}>Subscriber Console</p>
          <h1>{account?.displayName || '订阅控制台'}</h1>
          <p className={styles.muted}>查看订阅状态、剩余时间和可用流量。</p>
        </div>
        <div className={styles.tokenForm}>
          <Button type="button" onClick={() => void loadAccount()} icon={<RefreshCw size={17} />}>{loading ? '加载中' : '刷新状态'}</Button>
          {account?.isAdmin && (
            <Link className={styles.adminLink} to="/admin-secret">管理员入口</Link>
          )}
        </div>
      </section>

      {error && <div className={styles.alert}>{error}</div>}

      {account && (
        <>
          <section className={styles.metrics}>
            <article>
              <span>状态</span>
              <strong>{account.status}</strong>
            </article>
            <article>
              <span>剩余天数</span>
              <strong>{account.remainingDays}</strong>
            </article>
            <article>
              <span>到期时间</span>
              <strong>{new Date(account.expiredAt).toLocaleDateString()}</strong>
            </article>
          </section>

          <section className={styles.usage}>
            <div className={styles.usageHead}>
              <div>
                <p>已用流量</p>
                <strong>{formatBytes(account.trafficUsedVps)} / {formatBytes(account.trafficTotal)}</strong>
              </div>
              <Gauge size={28} />
            </div>
            <div className={styles.bar}>
              <span style={{ width: `${usagePercent}%` }} />
            </div>
          </section>

          {account.subscriptionUrl ? (
            <section className={styles.subscription}>
              <label>自适应订阅链接</label>
              <div>
                <input readOnly value={account.subscriptionUrl} />
                <Button onClick={copySubscription} icon={<Copy size={17} />}>复制</Button>
              </div>
            </section>
          ) : (
            <section className={styles.subscription}>
              <label>尚未开通</label>
              <p className={styles.muted}>请联系管理员按 SmaiClub 用户名发卡或续期。</p>
            </section>
          )}
        </>
      )}
    </main>
  );
}

function formatBytes(value: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = value;
  let unit = 0;
  while (current >= 1024 && unit < units.length - 1) {
    current /= 1024;
    unit += 1;
  }
  return `${current.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
