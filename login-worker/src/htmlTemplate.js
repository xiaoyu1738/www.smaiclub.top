export default `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMAICLUB 2025 - 登录</title>
    <style>
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%);
            color: #333;
            animation: fadeIn 1s ease-in-out;
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        .container {
            background-color: rgba(255, 255, 255, 0.95);
            padding: 40px;
            border-radius: 15px;
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.15);
            width: 100%;
            max-width: 480px;
            text-align: center;
            box-sizing: border-box;
            transition: transform 0.5s ease-out, box-shadow 0.3s ease;
            max-height: 90vh;
            overflow-y: auto;
        }

        .container:hover {
            transform: translateY(-5px);
            box-shadow: 0 15px 35px rgba(0, 0, 0, 0.2);
        }

        h1 {
            margin-bottom: 30px;
            color: #2c3e50;
            font-size: 2.2em;
            letter-spacing: 1.5px;
        }

        .form-group {
            margin-bottom: 25px;
            text-align: left;
        }

        label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
            color: #555;
            font-size: 1.1em;
        }

        input[type="text"],
        input[type="password"] {
            width: 100%;
            padding: 12px;
            border: 1px solid #c2d4e0;
            border-radius: 6px;
            font-size: 1.1em;
            box-sizing: border-box;
            transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }

        input[type="text"]:focus,
        input[type="password"]:focus {
            border-color: #007bff;
            box-shadow: 0 0 8px rgba(0, 123, 255, 0.25);
            outline: none;
        }

        button {
            background-color: #007bff;
            color: white;
            padding: 15px 30px;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1.3em;
            font-weight: bold;
            margin-top: 25px;
            width: 100%;
            transition: all 0.3s ease;
        }

        button:hover {
            background-color: #0056b3;
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0, 123, 255, 0.3);
        }

        button:active {
            transform: translateY(0);
        }

        .secondary-button {
            background-color: #6c757d;
            margin-top: 15px;
            font-size: 1em;
            padding: 12px;
        }

        .secondary-button:hover {
            background-color: #5a6268;
            box-shadow: 0 5px 15px rgba(108, 117, 125, 0.3);
        }

        #message, #regMessage {
            margin-top: 25px;
            font-size: 1.1em;
            font-weight: bold;
            min-height: 1.5em;
        }

        .error-message { color: #dc3545; }
        .success-message { color: #28a745; }

        @keyframes shake {
            0% { transform: translateX(0); }
            25% { transform: translateX(-5px); }
            50% { transform: translateX(5px); }
            75% { transform: translateX(-5px); }
            100% { transform: translateX(0); }
        }
        .shaking {
            animation: shake 0.4s ease-in-out;
        }

        #registerContainer {
            display: none;
        }
    </style>
</head>
<body>

    <!-- 登录界面 -->
    <div class="container" id="loginContainer">
        <h1>SMAICLUB 2025<br>用户登录</h1>
        <form id="loginForm">
            <div class="form-group">
                <label for="username">用户名</label>
                <input type="text" id="username" name="username" required placeholder="请输入用户名">
            </div>
            <div class="form-group">
                <label for="password">密码</label>
                <input type="password" id="password" name="password" required placeholder="请输入密码">
            </div>
            <button type="submit">立即登录</button>
            <button type="button" id="toRegisterBtn" class="secondary-button">注册新账户</button>
        </form>
        <p id="message"></p>
    </div>

    <!-- 注册界面 -->
    <div class="container" id="registerContainer">
        <h1>创建账户</h1>
        <form id="registerForm">
            <div class="form-group">
                <label for="regUsername">设置用户名</label>
                <input type="text" id="regUsername" name="username" required placeholder="请设置用户名">
            </div>
            <div class="form-group">
                <label for="regPassword">设置密码</label>
                <input type="password" id="regPassword" name="password" required placeholder="请设置密码">
            </div>
            <button type="submit">注册并加密保存</button>
            <button type="button" id="backToLoginBtn" class="secondary-button">返回登录</button>
        </form>
        <p id="regMessage"></p>
    </div>

    <script>
        document.addEventListener('DOMContentLoaded', () => {
            const loginContainer = document.getElementById('loginContainer');
            const registerContainer = document.getElementById('registerContainer');
            
            const loginForm = document.getElementById('loginForm');
            const registerForm = document.getElementById('registerForm');
            
            const messageP = document.getElementById('message');
            const regMessageP = document.getElementById('regMessage');

            // 切换到注册页
            document.getElementById('toRegisterBtn').addEventListener('click', () => {
                loginContainer.style.display = 'none';
                registerContainer.style.display = 'block';
                messageP.textContent = '';
                regMessageP.textContent = '';
                registerForm.reset();
            });

            // 切换回登录页
            document.getElementById('backToLoginBtn').addEventListener('click', () => {
                registerContainer.style.display = 'none';
                loginContainer.style.display = 'block';
                messageP.textContent = '';
                regMessageP.textContent = '';
                loginForm.reset();
            });

            // --- 注册逻辑 ---
            registerForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = document.getElementById('regUsername').value.trim();
                const password = document.getElementById('regPassword').value.trim();

                if(!username || !password) return;
                
                regMessageP.textContent = '正在加密处理...';
                regMessageP.className = '';

                try {
                    const res = await fetch('/api/register', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password })
                    });
                    const data = await res.json();
                    
                    if (data.success) {
                        regMessageP.textContent = '注册成功！请返回登录。';
                        regMessageP.className = 'success-message';
                        setTimeout(() => {
                            registerContainer.style.display = 'none';
                            loginContainer.style.display = 'block';
                            document.getElementById('username').value = username; 
                        }, 2000);
                    } else {
                        regMessageP.textContent = '注册失败: ' + data.message;
                        regMessageP.className = 'error-message';
                    }
                } catch (err) {
                    console.error(err);
                    regMessageP.textContent = '网络请求失败，请稍后重试';
                    regMessageP.className = 'error-message';
                }
            });

            // --- 登录逻辑 ---
            loginForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const username = document.getElementById('username').value.trim();
                const password = document.getElementById('password').value.trim();

                if(!username || !password) return;

                messageP.textContent = '正在验证身份...';
                messageP.className = '';

                try {
                    const res = await fetch('/api/login', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ username, password })
                    });
                    const data = await res.json();

                    if (data.success) {
                        messageP.textContent = '登录成功！正在跳转...';
                        messageP.className = 'success-message';
                        setTimeout(() => {
                            // 登录成功后的跳转地址
                            window.location.href = 'https://www.bilibili.com/video/BV1UT42167xb/?spm_id_from=333.337.search-card.all.click&vd_source=af3106607c487ec01ae9a5b81fa0d672';
                        }, 1000);
                    } else {
                        messageP.textContent = '登录失败: ' + data.message;
                        messageP.className = 'error-message';
                        loginContainer.classList.add('shaking');
                        setTimeout(() => loginContainer.classList.remove('shaking'), 500);
                    }
                } catch (err) {
                    console.error(err);
                    messageP.textContent = '网络请求失败';
                    messageP.className = 'error-message';
                }
            });
        });
    </script>
</body>
</html>
`;