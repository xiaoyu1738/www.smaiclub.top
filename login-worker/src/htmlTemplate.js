export function htmlTemplate() {
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMAI CLUB | 统一身份认证</title>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=SF+Pro+Display:wght@300;400;500;600;700&display=swap">
    <style>
        :root {
            --primary-color: #000000;
            --secondary-color: #1d1d1f;
            --accent-color: #0071e3;
            --text-light: #f5f5f7;
            --text-dark: #1d1d1f;
            --text-gray: #86868b;
            --input-bg: rgba(255, 255, 255, 0.1);
            --gradient-1: linear-gradient(45deg, #ff4d4d 0%, #f9cb28 100%);
            --gradient-2: linear-gradient(45deg, #f72585 0%, #7209b7 50%, #3a0ca3 100%);
            --gradient-3: linear-gradient(45deg, #00b4d8 0%, #0096c7 50%, #0077b6 100%);
        }

        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        body {
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif;
            background-color: #000;
            color: var(--text-light);
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            overflow: hidden;
            background: linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), url('https://images.unsplash.com/photo-1550684848-fac1c5b4e853?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80') no-repeat center center/cover;
        }

        .container {
            width: 100%;
            max-width: 420px;
            padding: 40px;
            background: rgba(29, 29, 31, 0.7);
            backdrop-filter: blur(20px) saturate(180%);
            -webkit-backdrop-filter: blur(20px) saturate(180%);
            border-radius: 20px;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
            border: 1px solid rgba(255, 255, 255, 0.1);
            animation: fadeIn 0.5s ease-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }

        h2 {
            font-size: 32px;
            font-weight: 700;
            text-align: center;
            margin-bottom: 30px;
            background: var(--gradient-3);
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            color: transparent;
        }

        .form-group {
            margin-bottom: 20px;
        }

        label {
            display: block;
            margin-bottom: 8px;
            color: var(--text-gray);
            font-size: 14px;
            font-weight: 500;
        }

        input {
            width: 100%;
            padding: 12px 16px;
            background: var(--input-bg);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 12px;
            color: var(--text-light);
            font-size: 16px;
            transition: all 0.3s ease;
            outline: none;
        }

        input:focus {
            background: rgba(255, 255, 255, 0.15);
            border-color: var(--accent-color);
            box-shadow: 0 0 0 2px rgba(0, 113, 227, 0.3);
        }

        button {
            width: 100%;
            padding: 14px;
            background: var(--accent-color);
            color: white;
            border: none;
            border-radius: 12px;
            font-size: 16px;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            margin-top: 10px;
        }

        button:hover {
            background: #0077ed;
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 113, 227, 0.3);
        }

        .toggle-link {
            display: block;
            text-align: center;
            margin-top: 20px;
            color: var(--text-gray);
            font-size: 14px;
            text-decoration: none;
            cursor: pointer;
            transition: color 0.3s;
        }

        .toggle-link:hover {
            color: var(--text-light);
            text-decoration: underline;
        }

        .error {
            background: rgba(255, 59, 48, 0.1);
            color: #ff453a;
            padding: 12px;
            border-radius: 8px;
            font-size: 14px;
            text-align: center;
            margin-bottom: 20px;
            display: none;
            border: 1px solid rgba(255, 59, 48, 0.2);
        }

        .hidden {
            display: none;
        }

        .license-hint {
            font-size: 12px;
            color: var(--text-gray);
            margin-top: 6px;
            line-height: 1.4;
        }

        .divider {
            height: 1px;
            background: rgba(255, 255, 255, 0.1);
            margin: 25px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- 登录表单 -->
        <div id="login-form">
            <h2>欢迎回来</h2>
            <div class="error" id="login-error"></div>

            <div class="form-group">
                <label>用户名</label>
                <input type="text" id="login-user" placeholder="输入您的用户名" required>
            </div>
            <div class="form-group">
                <label>密码</label>
                <input type="password" id="login-pass" placeholder="输入您的密码" required>
            </div>
            
            <div class="divider"></div>

            <div class="form-group">
                <label>会员许可证 (VIP专用)</label>
                <input type="password" id="login-license" placeholder="普通用户无需填写">
                <p class="license-hint">如果您是VIP会员，请输入许可证以激活权益。未填写将以普通身份登录。</p>
            </div>

            <button onclick="handleLogin()">立即登录</button>
            <a class="toggle-link" onclick="toggleForm('register')">还没有账号？立即注册</a>
        </div>

        <!-- 注册表单 -->
        <div id="register-form" class="hidden">
            <h2>创建账号</h2>
            <div class="error" id="register-error"></div>

            <div class="form-group">
                <label>用户名</label>
                <input type="text" id="reg-user" placeholder="设置用户名" required>
            </div>
            <div class="form-group">
                <label>密码</label>
                <input type="password" id="reg-pass" placeholder="至少8位，包含字母和数字" required>
            </div>

            <button onclick="handleRegister()">注册账号</button>
            <a class="toggle-link" onclick="toggleForm('login')">已有账号？返回登录</a>
        </div>

        <!-- 修改密码表单 (强制) -->
        <div id="change-pass-form" class="hidden">
            <h2 style="-webkit-text-fill-color: #ff453a;">安全警告</h2>
            <p style="text-align:center; color:var(--text-gray); margin-bottom: 20px;">您的密码过于简单，为了您的账户安全，请立即修改。</p>

            <div class="error" id="change-pass-error"></div>
            <input type="hidden" id="cp-user">
            <input type="hidden" id="cp-old-pass">

            <div class="form-group">
                <label>新密码</label>
                <input type="password" id="cp-new-pass" placeholder="至少8位，包含字母和数字" required>
            </div>
            <div class="form-group">
                <label>确认新密码</label>
                <input type="password" id="cp-confirm-pass" placeholder="再次输入新密码" required>
            </div>

            <button onclick="handleChangePass()">修改并登录</button>
        </div>
    </div>

    <script>
        const API_BASE = window.location.origin + '/api';

        // 页面加载时检查登录状态
        document.addEventListener('DOMContentLoaded', async () => {
            try {
                const res = await fetch(API_BASE + '/me', { credentials: 'include' });
                const data = await res.json();
                if (data.loggedIn) {
                    showNotification("您已登录，正在跳转...", "success");
                    setTimeout(() => window.location.href = "https://www.smaiclub.top", 1000);
                    // 隐藏表单以防闪烁
                    document.querySelector('.container').style.display = 'none';
                }
            } catch (e) {
                console.error("Auth check failed", e);
            }
        });

        function toggleForm(type) {
            const loginForm = document.getElementById('login-form');
            const regForm = document.getElementById('register-form');
            const changeForm = document.getElementById('change-pass-form');

            // Simple transition effect
            loginForm.style.display = 'none';
            regForm.style.display = 'none';
            changeForm.style.display = 'none';

            if (type === 'login') {
                loginForm.style.display = 'block';
                loginForm.style.animation = 'fadeIn 0.5s ease-out';
            } else if (type === 'register') {
                regForm.style.display = 'block';
                regForm.style.animation = 'fadeIn 0.5s ease-out';
            }
        }

        // 工具：显示通知 banner (替代 alert)
        function showNotification(msg, type='error') {
            const el = document.createElement('div');
            el.style.position = 'fixed';
            el.style.top = '20px';
            el.style.left = '50%';
            el.style.transform = 'translateX(-50%)';
            el.style.background = type === 'error' ? 'rgba(255, 59, 48, 0.9)' : 'rgba(52, 199, 89, 0.9)';
            el.style.color = 'white';
            el.style.padding = '12px 24px';
            el.style.borderRadius = '30px';
            el.style.zIndex = '9999';
            el.style.backdropFilter = 'blur(10px)';
            el.style.boxShadow = '0 10px 30px rgba(0,0,0,0.3)';
            el.style.fontWeight = '500';
            el.style.animation = 'fadeIn 0.3s ease-out';
            el.textContent = msg;
            document.body.appendChild(el);
            setTimeout(() => {
                el.style.opacity = '0';
                setTimeout(() => el.remove(), 300);
            }, 3000);
        }

        async function handleRegister() {
            const user = document.getElementById('reg-user').value;
            const pass = document.getElementById('reg-pass').value;
            const errorDiv = document.getElementById('register-error');

            if (pass.length < 8 || !/[A-Za-z]/.test(pass) || !/\\d/.test(pass)) {
                errorDiv.textContent = "密码必须大于8位且包含字母和数字";
                errorDiv.style.display = 'block';
                return;
            }

            try {
                const res = await fetch(API_BASE + '/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: user, password: pass })
                });
                const data = await res.json();
                if (res.ok) {
                    showNotification('注册成功，请登录', 'success');
                    toggleForm('login');
                } else {
                    errorDiv.textContent = data.error;
                    errorDiv.style.display = 'block';
                }
            } catch (e) {
                errorDiv.textContent = "网络错误";
                errorDiv.style.display = 'block';
            }
        }

        async function handleLogin() {
            const user = document.getElementById('login-user').value;
            const pass = document.getElementById('login-pass').value;
            const license = document.getElementById('login-license').value;
            const errorDiv = document.getElementById('login-error');
            const btn = document.querySelector('#login-form button');

            btn.disabled = true;
            btn.textContent = "登录中...";
            errorDiv.style.display = 'none';

            try {
                const res = await fetch(API_BASE + '/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: user, password: pass, licenseKey: license })
                });
                const data = await res.json();

                if (res.status === 403 && data.error === 'WEAK_PASSWORD') {
                    document.getElementById('login-form').style.display = 'none';
                    const cpForm = document.getElementById('change-pass-form');
                    cpForm.style.display = 'block';
                    cpForm.style.animation = 'fadeIn 0.5s ease-out';

                    document.getElementById('cp-user').value = user;
                    document.getElementById('cp-old-pass').value = pass;
                    return;
                }

                // 处理 VIP 许可证强制要求 (LICENSE_REQUIRED)
                if (res.status === 403 && (data.error === 'LICENSE_REQUIRED' || data.error === 'LICENSE_INVALID')) {
                     errorDiv.innerHTML = data.message + '<br><small style="opacity:0.8">请在下方输入框填写许可证</small>';
                     errorDiv.style.display = 'block';

                     // 高亮显示许可证输入框
                     const licenseInput = document.getElementById('login-license');
                     licenseInput.focus();
                     licenseInput.style.borderColor = '#ff453a';
                     licenseInput.style.boxShadow = '0 0 0 2px rgba(255, 69, 58, 0.3)';

                     btn.disabled = false;
                     btn.textContent = "立即登录";
                     return;
                }

                if (res.ok) {
                    // 对于 LICENSE_NOT_SET 这种 warning，我们只是显示通知，但允许登录 (或者根据新策略，这里可能不会发生)
                    if (data.warning === 'LICENSE_MISSING' || data.warning === 'LICENSE_NOT_SET') {
                        // 这里使用通知而不是 alert
                        // 但实际上，我们已阻止了 redirect 如果是 LICENSE_REQUIRED
                        // 这里的 warning 仅用于降级登录的情况 (如果服务器端逻辑允许的话)
                         showNotification("提示：以普通身份登录 (未验证会员许可证)", "error");
                         setTimeout(() => {
                             window.location.href = data.redirect || 'https://www.smaiclub.top';
                         }, 1500);
                    } else {
                        window.location.href = data.redirect || 'https://www.smaiclub.top';
                    }
                } else {
                    errorDiv.textContent = data.error || "登录失败";
                    errorDiv.style.display = 'block';
                    btn.disabled = false;
                    btn.textContent = "立即登录";
                }
            } catch (e) {
                console.error(e);
                errorDiv.textContent = "网络错误";
                errorDiv.style.display = 'block';
                btn.disabled = false;
                btn.textContent = "立即登录";
            }
        }

        async function handleChangePass() {
            const user = document.getElementById('cp-user').value;
            const oldPass = document.getElementById('cp-old-pass').value;
            const newPass = document.getElementById('cp-new-pass').value;
            const confirmPass = document.getElementById('cp-confirm-pass').value;
            const errorDiv = document.getElementById('change-pass-error');

            if (newPass.length < 8 || !/[A-Za-z]/.test(newPass) || !/\\d/.test(newPass)) {
                errorDiv.textContent = "新密码必须大于8位且包含字母和数字";
                errorDiv.style.display = 'block';
                return;
            }

            if (newPass !== confirmPass) {
                errorDiv.textContent = "两次输入的密码不一致";
                errorDiv.style.display = 'block';
                return;
            }

            try {
                const res = await fetch(API_BASE + '/change-password', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: user, oldPassword: oldPass, newPassword: newPass })
                });
                const data = await res.json();
                if (res.ok) {
                    showNotification("密码修改成功，请使用新密码重新登录", "success");
                    setTimeout(() => location.reload(), 1500);
                } else {
                    errorDiv.textContent = data.error;
                    errorDiv.style.display = 'block';
                }
            } catch (e) {
                errorDiv.textContent = "网络错误";
                errorDiv.style.display = 'block';
            }
        }
    </script>
</body>
</html>
    `;
}
