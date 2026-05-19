import { useEffect, useState } from 'react';

const HOME_URL = 'https://www.smaiclub.top';
const API_BASE = `${window.location.origin}/api`;

function safeRedirect() {
  const params = new URLSearchParams(window.location.search);
  const redirect = params.get('redirect');
  if (!redirect) return HOME_URL;

  try {
    const url = new URL(redirect);
    const host = url.hostname.toLowerCase();
    if ((host === 'smaiclub.top' || host.endsWith('.smaiclub.top')) && ['https:', 'http:'].includes(url.protocol)) {
      return url.toString();
    }
  } catch {}

  return HOME_URL;
}

async function parseApiResponse(res) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: res.ok ? '' : '服务器返回异常，请稍后再试' };
  }
}

function Field({ id, label, type = 'text', placeholder, autoComplete, value, onChange, onKeyDown, disabled, hint, icon }) {
  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <div className="field-control">
        {icon ? <span className="field-icon">{icon}</span> : null}
        <input
          id={id}
          type={type}
          placeholder={placeholder}
          autoComplete={autoComplete}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          disabled={disabled}
        />
      </div>
      {hint ? <p className="license-hint">{hint}</p> : null}
    </div>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2Z" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M4.5 20c1.8-3.7 4.5-5.5 7.5-5.5S17.7 16.3 19.5 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5.5" y="10.5" width="13" height="9" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.75" />
      <path d="M8.2 10.5V8a3.8 3.8 0 0 1 7.6 0v2.5" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      <path d="M12 13.5v2.7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function BadgeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5.5h7.4L19 10.1V18a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7.5a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" />
      <path d="M8.5 12h7M8.5 15.5h5.2" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

function fieldIconMap(kind) {
  if (kind === 'lock') return <LockIcon />;
  if (kind === 'badge') return <BadgeIcon />;
  return <UserIcon />;
}

function Banner({ tone, children }) {
  if (!children) return null;
  return (
    <div className={tone === 'success' ? 'inline-message success-message' : 'inline-message error-message'}>
      {children}
    </div>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  return <div className={`toast ${toast.tone}`}>{toast.message}</div>;
}

function useAuthUi() {
  const initialMode = window.location.pathname === '/register' ? 'register' : 'login';
  const [mode, setMode] = useState(initialMode);
  const [redirecting, setRedirecting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [banner, setBanner] = useState('');
  const [bannerTone, setBannerTone] = useState('error');
  const [login, setLogin] = useState({ username: '', password: '', license: '' });
  const [register, setRegister] = useState({ username: '', displayName: '', password: '' });
  const [changePass, setChangePass] = useState({ user: '', token: '', newPass: '', confirmPass: '' });
  const [busy, setBusy] = useState(false);

  const showToast = (message, tone) => {
    setToast({ message, tone });
    window.clearTimeout(window.__loginToastTimer);
    window.__loginToastTimer = window.setTimeout(() => setToast(null), 2600);
  };

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const res = await fetch(`${API_BASE}/me`, { credentials: 'include' });
        const data = await parseApiResponse(res);
        if (cancelled) return;
        if (data.loggedIn) {
          setRedirecting(true);
          showToast('您已登录，正在跳转...', 'success');
          window.setTimeout(() => {
            window.location.href = safeRedirect();
          }, 1000);
        }
      } catch (error) {
        console.error('Auth check failed', error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    checkSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const showError = (message) => {
    setBanner(message);
    setBannerTone('error');
  };

  return {
    mode,
    setMode,
    redirecting,
    loading,
    toast,
    banner,
    setBanner,
    bannerTone,
    login,
    setLogin,
    register,
    setRegister,
    changePass,
    setChangePass,
    busy,
    setBusy,
    showToast,
    showError,
  };
}

function LoginPanel({ state, setState, onLogin, onSwitch, busy, banner, bannerTone }) {
  return (
    <div className="panel-form">
      <h2>欢迎回来</h2>
      <p className="form-subtitle">登录后将返回原站点。</p>
      <Banner tone={bannerTone}>{banner}</Banner>
      <Field
        id="login-user"
        label="用户名"
        placeholder="输入您的用户名"
        autoComplete="username"
        value={state.username}
        disabled={busy}
        icon={fieldIconMap('user')}
        onChange={(event) => setState((prev) => ({ ...prev, username: event.target.value }))}
        onKeyDown={(event) => event.key === 'Enter' && onLogin()}
      />
      <Field
        id="login-pass"
        label="密码"
        type="password"
        placeholder="输入您的密码"
        autoComplete="current-password"
        value={state.password}
        disabled={busy}
        icon={fieldIconMap('lock')}
        onChange={(event) => setState((prev) => ({ ...prev, password: event.target.value }))}
        onKeyDown={(event) => event.key === 'Enter' && onLogin()}
      />
      <Field
        id="login-license"
        label="会员许可证"
        type="password"
        placeholder="普通用户无需填写"
        autoComplete="off"
        value={state.license}
        disabled={busy}
        icon={fieldIconMap('badge')}
        onChange={(event) => setState((prev) => ({ ...prev, license: event.target.value }))}
        onKeyDown={(event) => event.key === 'Enter' && onLogin()}
        hint="如果您有会员许可证，请在此填写。未填写将按普通身份登录。"
      />
      <button type="button" className="primary-btn" onClick={onLogin} disabled={busy}>
        {busy ? '登录中...' : '立即登录'}
      </button>
      <button type="button" className="toggle-link" onClick={onSwitch}>
        还没有账号？立即注册
      </button>
    </div>
  );
}

function RegisterPanel({ state, setState, onRegister, onSwitch, busy, banner, bannerTone }) {
  return (
    <div className="panel-form">
      <h2>创建账号</h2>
      <p className="form-subtitle">新用户直接注册。</p>
      <Banner tone={bannerTone}>{banner}</Banner>
      <Field
        id="reg-user"
        label="用户名"
        placeholder="3-32位字母、数字或下划线"
        autoComplete="username"
        value={state.username}
        disabled={busy}
        icon={fieldIconMap('user')}
        onChange={(event) => setState((prev) => ({ ...prev, username: event.target.value }))}
        onKeyDown={(event) => event.key === 'Enter' && onRegister()}
      />
      <Field
        id="reg-display-name"
        label="昵称"
        placeholder="支持中文，1-32位"
        autoComplete="nickname"
        value={state.displayName}
        disabled={busy}
        icon={fieldIconMap('badge')}
        onChange={(event) => setState((prev) => ({ ...prev, displayName: event.target.value }))}
        onKeyDown={(event) => event.key === 'Enter' && onRegister()}
      />
      <Field
        id="reg-pass"
        label="密码"
        type="password"
        placeholder="至少8位，包含字母和数字"
        autoComplete="new-password"
        value={state.password}
        disabled={busy}
        icon={fieldIconMap('lock')}
        onChange={(event) => setState((prev) => ({ ...prev, password: event.target.value }))}
        onKeyDown={(event) => event.key === 'Enter' && onRegister()}
      />
      <button type="button" className="primary-btn" onClick={onRegister} disabled={busy}>
        {busy ? '注册中...' : '注册账号'}
      </button>
      <button type="button" className="toggle-link" onClick={onSwitch}>
        已有账号？返回登录
      </button>
    </div>
  );
}

function ChangePassPanel({ state, setState, onSubmit, busy, banner, bannerTone }) {
  return (
    <div className="panel-form">
      <h2 style={{ color: '#8b1f17' }}>安全警告</h2>
      <p className="form-subtitle">请立即修改密码。</p>
      <Banner tone={bannerTone}>{banner}</Banner>
      <Field
        id="cp-new-pass"
        label="新密码"
        type="password"
        placeholder="至少8位，包含字母和数字"
        autoComplete="new-password"
        value={state.newPass}
        disabled={busy}
        onChange={(event) => setState((prev) => ({ ...prev, newPass: event.target.value }))}
        onKeyDown={(event) => event.key === 'Enter' && onSubmit()}
      />
      <Field
        id="cp-confirm-pass"
        label="确认新密码"
        type="password"
        placeholder="再次输入新密码"
        autoComplete="new-password"
        value={state.confirmPass}
        disabled={busy}
        onChange={(event) => setState((prev) => ({ ...prev, confirmPass: event.target.value }))}
        onKeyDown={(event) => event.key === 'Enter' && onSubmit()}
      />
      <button type="button" className="primary-btn" onClick={onSubmit} disabled={busy}>
        {busy ? '提交中...' : '修改并登录'}
      </button>
    </div>
  );
}

export default function App() {
  const ui = useAuthUi();

  const validateUsername = (value) => /^[A-Za-z0-9_]{3,32}$/.test(value);
  const validateDisplayName = (value) => /^[\p{L}\p{N}_\-\s]{1,32}$/u.test(value);
  const validatePassword = (value) => /^(?=.*[A-Za-z])(?=.*\d).{8,}$/.test(value);

  const handleRegister = async () => {
    const username = ui.register.username.trim();
    const displayName = ui.register.displayName.normalize('NFKC').trim().replace(/\s+/g, ' ');
    const password = ui.register.password;

    ui.setBanner('');
    if (!validateUsername(username)) return ui.showError('用户名仅支持 3-32 位英文字母、数字和下划线');
    if (!validateDisplayName(displayName)) return ui.showError('昵称仅支持 1-32 位中文、字母、数字、空格、下划线和短横线');
    if (!validatePassword(password)) return ui.showError('密码必须大于8位且包含字母和数字');

    ui.setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, displayName, password }),
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        ui.showToast('注册成功，请登录', 'success');
        ui.setMode('login');
        ui.setBanner('');
        ui.setRegister({ username: '', displayName: '', password: '' });
      } else {
        ui.showError(data.message || data.error || '注册失败');
      }
    } catch {
      ui.showError('网络错误');
    } finally {
      ui.setBusy(false);
    }
  };

  const handleLogin = async () => {
    const username = ui.login.username.trim();
    const password = ui.login.password;
    const license = ui.login.license.trim();

    ui.setBanner('');
    ui.setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, licenseKey: license, redirect: safeRedirect() }),
      });
      const data = await parseApiResponse(res);

      if (res.status === 403 && data.error === 'WEAK_PASSWORD') {
        ui.setChangePass({ user: username, token: data.changeToken || '', newPass: '', confirmPass: '' });
        ui.setMode('change');
        ui.setBanner('');
        return;
      }

      if (res.status === 403 && (data.error === 'LICENSE_REQUIRED' || data.error === 'LICENSE_INVALID')) {
        ui.showError(data.message || '请填写许可证');
        return;
      }

      if (res.ok) {
        if (data.warning === 'LICENSE_MISSING' || data.warning === 'LICENSE_NOT_SET') {
          ui.showToast('提示：以普通身份登录', 'error');
          window.setTimeout(() => {
            window.location.href = data.redirect || HOME_URL;
          }, 1500);
        } else {
          window.location.href = data.redirect || HOME_URL;
        }
      } else {
        ui.showError(data.message || data.error || '登录失败');
      }
    } catch (error) {
      console.error(error);
      ui.showError('网络错误');
    } finally {
      ui.setBusy(false);
    }
  };

  const handleChangePass = async () => {
    const newPass = ui.changePass.newPass;
    const confirmPass = ui.changePass.confirmPass;

    ui.setBanner('');
    if (!validatePassword(newPass)) return ui.showError('新密码必须大于8位且包含字母和数字');
    if (newPass !== confirmPass) return ui.showError('两次输入的密码不一致');

    ui.setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/change-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: ui.changePass.user,
          changeToken: ui.changePass.token,
          newPassword: newPass,
        }),
      });
      const data = await parseApiResponse(res);
      if (res.ok) {
        ui.showToast('密码修改成功，请使用新密码重新登录', 'success');
        window.setTimeout(() => window.location.reload(), 1500);
      } else {
        ui.showError(data.message || data.error || '修改失败');
      }
    } catch {
      ui.showError('网络错误');
    } finally {
      ui.setBusy(false);
    }
  };

  if (ui.loading && !ui.redirecting) return <div className="redirecting">正在加载...</div>;
  if (ui.redirecting) {
    return (
      <div className="redirecting">
        <Toast toast={ui.toast} />
        您已登录，正在跳转...
      </div>
    );
  }

  return (
    <div className="page-shell">
      <Toast toast={ui.toast} />
      <div className="container">
        <section className="brand-panel" aria-hidden="true">
          <div className="brand-copy">
            <div className="brand-watermark">SMAI CLUB</div>
            <h1>SMAI CLUB</h1>
            <p>统一身份认证</p>
            <span className="brand-slogan">统一入口，连接全部站点</span>
          </div>
        </section>

        <section className="auth-panel">
          <div className="auth-stack">
            {ui.mode === 'login' ? (
              <LoginPanel
                state={ui.login}
                setState={ui.setLogin}
                onLogin={handleLogin}
                onSwitch={() => { ui.setBanner(''); ui.setMode('register'); }}
                busy={ui.busy}
                banner={ui.banner}
                bannerTone={ui.bannerTone}
              />
            ) : ui.mode === 'register' ? (
              <RegisterPanel
                state={ui.register}
                setState={ui.setRegister}
                onRegister={handleRegister}
                onSwitch={() => { ui.setBanner(''); ui.setMode('login'); }}
                busy={ui.busy}
                banner={ui.banner}
                bannerTone={ui.bannerTone}
              />
            ) : (
              <ChangePassPanel
                state={ui.changePass}
                setState={ui.setChangePass}
                onSubmit={handleChangePass}
                busy={ui.busy}
                banner={ui.banner}
                bannerTone={ui.bannerTone}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
