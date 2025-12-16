export function htmlTemplate() {
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SmaiClub 统一登录</title>
    <style>
        body { font-family: 'Segoe UI', sans-serif; background: #f0f2f5; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .container { background: white; padding: 2rem; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 100%; max-width: 400px; }
        h2 { text-align: center; color: #333; margin-bottom: 1.5rem; }
        .form-group { margin-bottom: 1rem; }
        label { display: block; margin-bottom: 0.5rem; color: #666; }
        input { width: 100%; padding: 0.8rem; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
        button { width: 100%; padding: 0.8rem; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 1rem; margin-top: 1rem; }
        button:hover { background: #0056b3; }
        .toggle-link { text-align: center; margin-top: 1rem; display: block; color: #007bff; text-decoration: none; cursor: pointer; }
        .error { color: red; text-align: center; margin-bottom: 1rem; display: none; }
        .hidden { display: none; }
        /* 许可证输入框样式 */
        #license-group { border-top: 1px dashed #ccc; padding-top: 10px; margin-top: 10px; }
        .license-hint { font-size: 12px; color: #888; }
    </style>
</head>
<body>
    <div class="container" id="auth-box">
        <!-- 登录表单 -->
        <div id="login-form">
            <h2>登录 SmaiClub</h2>
            <div class="error" id="login-error"></div>
            <div class="form-group">
                <label>用户名</label>
                <input type="text" id="login-user" required>
            </div>
            <div class="form-group">
                <label>密码</label>
                <input type="password" id="login-pass" required>
            </div>
            
            <div class="form-group" id="license-group">
                <label>会员许可证 (选填)</label>
                <input type="password" id="login-license" placeholder="普通用户无需填写">
                <p class="license-hint">如果您是VIP会员，请输入许可证以激活会员权限，否则将以降级模式登录。</p>
            </div>

            <button onclick="handleLogin()">登录</button>
            <a class="toggle-link" onclick="toggleForm('register')">没有账号？去注册</a>
        </div>

        <!-- 注册表单 -->
        <div id="register-form" class="hidden">
            <h2>注册账号</h2>
            <div class="error" id="register-error"></div>
            <div class="form-group">
                <label>用户名</label>
                <input type="text" id="reg-user" required>
            </div>
            <div class="form-group">
                <label>密码 (至少8位，含字母数字)</label>
                <input type="password" id="reg-pass" required>
            </div>
            <button onclick="handleRegister()">注册</button>
            <a class="toggle-link" onclick="toggleForm('login')">已有账号？去登录</a>
        </div>

        <!-- 修改密码表单 (强制) -->
        <div id="change-pass-form" class="hidden">
            <h2 style="color:#d9534f">安全警告</h2>
            <p style="text-align:center; color:#666">您的密码过于简单，不符合新的安全规范。请立即修改密码。</p>
            <div class="error" id="change-pass-error"></div>
            <input type="hidden" id="cp-user">
            <input type="hidden" id="cp-old-pass">
            <div class="form-group">
                <label>新密码 (至少8位，含字母数字)</label>
                <input type="password" id="cp-new-pass" required>
            </div>
            <div class="form-group">
                <label>确认新密码</label>
                <input type="password" id="cp-confirm-pass" required>
            </div>
            <button onclick="handleChangePass()">确认修改并登录</button>
        </div>
    </div>

    <script>
        const API_BASE = window.location.origin + '/api';

        function toggleForm(type) {
            document.getElementById('login-form').classList.toggle('hidden', type !== 'login');
            document.getElementById('register-form').classList.toggle('hidden', type !== 'register');
            document.getElementById('change-pass-form').classList.add('hidden');
        }

        async function handleRegister() {
            const user = document.getElementById('reg-user').value;
            const pass = document.getElementById('reg-pass').value;
            const errorDiv = document.getElementById('register-error');

            // 客户端预检
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
                    alert('注册成功，请登录');
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

            try {
                const res = await fetch(API_BASE + '/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: user, password: pass, licenseKey: license })
                });
                const data = await res.json();

                if (res.status === 403 && data.error === 'WEAK_PASSWORD') {
                    // 触发强制改密流程
                    document.getElementById('login-form').classList.add('hidden');
                    document.getElementById('change-pass-form').classList.remove('hidden');
                    document.getElementById('cp-user').value = user;
                    document.getElementById('cp-old-pass').value = pass;
                    return;
                }

                if (res.ok) {
                    if (data.warning === 'LICENSE_MISSING') {
                        alert("警告：您的账户是会员，但您未提供许可证或许可证错误，您将以普通用户身份登录。");
                    }
                    window.location.href = data.redirect;
                } else {
                    errorDiv.textContent = data.error || "登录失败";
                    errorDiv.style.display = 'block';
                }
            } catch (e) {
                console.error(e);
                errorDiv.textContent = "网络错误";
                errorDiv.style.display = 'block';
            }
        }

        async function handleChangePass() {
            const user = document.getElementById('cp-user').value;
            const oldPass = document.getElementById('cp-old-pass').value;
            const newPass = document.getElementById('cp-new-pass').value;
            const confirmPass = document.getElementById('cp-confirm-pass').value;
            const errorDiv = document.getElementById('change-pass-error');

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
                    alert("密码修改成功，请使用新密码重新登录");
                    location.reload();
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