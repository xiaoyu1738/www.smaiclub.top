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
  const [result, setResult] = useState<RenewResult | null>(null);
  const [message, setMessage] = useState('');

  async function loadAccount() {
    setAuthLoading(true);
    try {
      const response = await fetch('/api/account/me', { credentials: 'include' });
      const payload = await response.json() as AccountInfo | { error?: string };
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
    const response = await fetch('/api/admin/renew', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ username, addDays: 30, resetTraffic }),
    });
    const payload = await response.json() as RenewResult | { error?: string };
    if (!response.ok) {
      setMessage(formatAdminError('error' in payload ? payload.error : undefined, '续期失败'));
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
    const payload = await response.json() as { error?: string };
    setMessage(response.ok ? '已封禁' : formatAdminError(payload.error, '封禁失败'));
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
        </section>
      )}
    </main>
  );
}

function formatAdminError(error: string | undefined, fallback: string): string {
  if (error === 'LOGIN_REQUIRED') return '请先登录 SmaiClub 账号';
  if (error === 'FORBIDDEN') return '当前账号没有管理员权限';
  return error || fallback;
}
