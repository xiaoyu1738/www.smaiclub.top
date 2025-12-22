import { htmlTemplate } from './htmlTemplate.js';

// 密码强度校验正则：至少8位，包含字母和数字
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;

// 通用头部，允许跨域访问
const corsHeaders = {
    "Access-Control-Allow-Origin": "https://www.smaiclub.top",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
};

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const origin = request.headers.get("Origin");

        // 动态处理 CORS Origin
        let responseHeaders = { ...corsHeaders };
        if (origin && origin.endsWith("smaiclub.top")) {
            responseHeaders["Access-Control-Allow-Origin"] = origin;
        }

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: responseHeaders });
        }

        // 1. common-auth.js
        if (url.pathname === "/common-auth.js") {
            const script = await generateCommonScript();
            return new Response(script, {
                headers: { "Content-Type": "application/javascript", ...responseHeaders }
            });
        }

        // 2. 页面路由
        if (request.method === "GET") {
            if (url.pathname === "/" || url.pathname === "/login" || url.pathname === "/register") {
                return new Response(htmlTemplate(), { headers: { "Content-Type": "text/html" } });
            }
            // 验证当前用户状态 API
            if (url.pathname === "/api/me") {
                const user = await getUserFromCookie(request, env);
                if (!user) return new Response(JSON.stringify({ loggedIn: false }), { headers: responseHeaders });

                const effectiveRole = user.sessionRole || user.role || 'user';

                return new Response(JSON.stringify({
                    loggedIn: true,
                    username: user.username,
                    role: user.role, // 购买的等级
                    effectiveRole: effectiveRole, // 当前生效等级
                    hasLicense: !!user.licenseKey,
                    licensePending: !!user.licensePending
                }), { headers: responseHeaders });
            }
        }

        // 3. API 路由 (POST)
        if (request.method === "POST") {
            const body = await request.json().catch(() => ({}));

            // --- 注册 ---
            if (url.pathname === "/api/register") {
                const { username, password } = body;
                if (!username || !password) return jsonResp({ error: "请输入用户名和密码" }, 400, responseHeaders);

                if (!PASSWORD_REGEX.test(password)) {
                    return jsonResp({ error: "密码强度不足：必须大于8位且包含字母和数字" }, 400, responseHeaders);
                }

                // D1 检查用户是否存在
                const exists = await env.DB.prepare('SELECT 1 FROM users WHERE username = ?').bind(username).first();
                if (exists) return jsonResp({ error: "用户已存在" }, 409, responseHeaders);

                const salt = crypto.randomUUID();
                const encryptedPassword = await encryptData(password, env.SECRET_KEY, salt);
                const now = Date.now();

                // D1 插入用户
                await env.DB.prepare(
                    'INSERT INTO users (username, password, salt, role, createdAt) VALUES (?, ?, ?, ?, ?)'
                ).bind(username, encryptedPassword, salt, 'user', now).run();

                return jsonResp({ success: true }, 200, responseHeaders);
            }

            // --- 登录 ---
            if (url.pathname === "/api/login") {
                const { username, password, licenseKey } = body;

                // D1 获取用户
                const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();

                if (!user) return jsonResp({ error: "用户不存在" }, 404, responseHeaders);

                const decryptedPassword = await decryptData(user.password, env.SECRET_KEY, user.salt);
                if (password !== decryptedPassword) return jsonResp({ error: "密码错误" }, 401, responseHeaders);

                if (!PASSWORD_REGEX.test(password)) {
                    return jsonResp({ error: "WEAK_PASSWORD", message: "您的密码过于简单，为了安全请立即修改" }, 403, responseHeaders);
                }

                let sessionRole = user.role;
                let warning = null;

                // VIP 验证逻辑
                if (['vip', 'svip1', 'svip2'].includes(user.role)) {
                    if (user.licenseKey) {
                        if (!licenseKey) {
                            return jsonResp({ error: "LICENSE_REQUIRED", message: "请输入会员许可证以继续" }, 403, responseHeaders);
                        }
                        const decryptedLicense = await decryptData(user.licenseKey, env.SECRET_KEY, user.salt);
                        if (licenseKey !== decryptedLicense) {
                            return jsonResp({ error: "LICENSE_INVALID", message: "许可证错误" }, 403, responseHeaders);
                        }
                    } else {
                        warning = "LICENSE_NOT_SET";
                        sessionRole = 'user';
                    }
                }

                const sessionData = JSON.stringify({ username, role: sessionRole, loginTime: Date.now() });
                const sessionToken = await encryptData(sessionData, env.SECRET_KEY, "SESSION_SALT");
                const cookie = `auth_token=${sessionToken}; Path=/; Domain=.smaiclub.top; Secure; SameSite=None; Max-Age=86400`;

                return new Response(JSON.stringify({ success: true, redirect: "https://www.smaiclub.top", warning }), {
                    headers: {
                        "Content-Type": "application/json",
                        "Set-Cookie": cookie,
                        ...responseHeaders
                    }
                });
            }

            // --- 修改密码 ---
            if (url.pathname === "/api/change-password") {
                const { username, oldPassword, newPassword } = body;

                const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
                if (!user) return jsonResp({ error: "用户不存在" }, 404, responseHeaders);

                const decryptedOld = await decryptData(user.password, env.SECRET_KEY, user.salt);
                if (oldPassword !== decryptedOld) return jsonResp({ error: "旧密码错误" }, 401, responseHeaders);

                if (!PASSWORD_REGEX.test(newPassword)) return jsonResp({ error: "新密码强度不足" }, 400, responseHeaders);

                const newEncrypted = await encryptData(newPassword, env.SECRET_KEY, user.salt);

                await env.DB.prepare('UPDATE users SET password = ? WHERE username = ?').bind(newEncrypted, username).run();

                return jsonResp({ success: true }, 200, responseHeaders);
            }

            // --- 购买会员 ---
            if (url.pathname === "/api/buy") {
                const user = await getUserFromCookie(request, env);
                if (!user) return jsonResp({ error: "请先登录" }, 401, responseHeaders);

                const { tier, personalInfo } = body;
                if (!tier || !['vip', 'svip1', 'svip2'].includes(tier)) {
                    return jsonResp({ error: "无效的会员等级" }, 400, responseHeaders);
                }
                if (!personalInfo) {
                    return jsonResp({ error: "请提供个人信息" }, 400, responseHeaders);
                }

                const roleLevels = { 'user': 0, 'vip': 1, 'svip1': 2, 'svip2': 3 };
                const currentLevel = roleLevels[user.role] || 0;
                const newLevel = roleLevels[tier] || 0;

                if (newLevel <= currentLevel) {
                    return jsonResp({ error: "cannot_downgrade", message: "您当前已拥有同级或更高级别的会员权益，无需重复购买或降级。" }, 400, responseHeaders);
                }

                const lastPurchase = Date.now();
                const personalInfoStr = JSON.stringify(personalInfo);

                await env.DB.prepare(
                    'UPDATE users SET role = ?, licensePending = 1, personalInfo = ?, lastPurchase = ? WHERE username = ?'
                ).bind(tier, personalInfoStr, lastPurchase, user.username).run();

                return jsonResp({ success: true, message: "购买成功" }, 200, responseHeaders);
            }

            // --- 设置许可证 ---
            if (url.pathname === "/api/set-license") {
                const user = await getUserFromCookie(request, env);
                if (!user) return jsonResp({ error: "请先登录" }, 401, responseHeaders);

                const { licenseKey } = body;
                if (!licenseKey || licenseKey.length < 4) return jsonResp({ error: "许可证太短" }, 400, responseHeaders);

                const encryptedLicense = await encryptData(licenseKey, env.SECRET_KEY, user.salt);

                await env.DB.prepare(
                    'UPDATE users SET licenseKey = ?, licensePending = NULL WHERE username = ?'
                ).bind(encryptedLicense, user.username).run();

                const cookie = `auth_token=; Path=/; Domain=.smaiclub.top; Max-Age=0; Secure; SameSite=None`;
                return new Response(JSON.stringify({ success: true }), {
                     headers: { "Content-Type": "application/json", "Set-Cookie": cookie, ...responseHeaders }
                });
            }

            // --- 退出登录 ---
            if (url.pathname === "/api/logout") {
                const cookie = `auth_token=; Path=/; Domain=.smaiclub.top; Max-Age=0; Secure; SameSite=None`;
                return new Response(JSON.stringify({ success: true }), {
                    headers: { "Content-Type": "application/json", "Set-Cookie": cookie, ...responseHeaders }
                });
            }
        }

        return new Response("Not Found", { status: 404, headers: responseHeaders });
    }
};

// --- 辅助函数 ---

function jsonResp(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
}

async function getUserFromCookie(request, env) {
    const cookieHeader = request.headers.get("Cookie");
    if (!cookieHeader) return null;
    const cookies = parseCookies(cookieHeader);
    const token = cookies['auth_token'];
    if (!token) return null;

    try {
        const sessionStr = await decryptData(token, env.SECRET_KEY, "SESSION_SALT");
        const session = JSON.parse(sessionStr);
        const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(session.username).first();
        if (!user) return null;

        user.sessionRole = session.role;
        return user;
    } catch (e) {
        return null;
    }
}

function parseCookies(cookieHeader) {
    const list = {};
    cookieHeader && cookieHeader.split(';').forEach(cookie => {
        const parts = cookie.split('=');
        list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
    return list;
}

async function encryptData(text, secretKey, salt) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(secretKey), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
        keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt"]
    );
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(text));
    return btoa(String.fromCharCode(...new Uint8Array(iv))) + ":" + btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

async function decryptData(encryptedText, secretKey, salt) {
    const [ivB64, dataB64] = encryptedText.split(":");
    const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
    const data = Uint8Array.from(atob(dataB64), c => c.charCodeAt(0));
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(secretKey), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: enc.encode(salt), iterations: 100000, hash: "SHA-256" },
        keyMaterial, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
    );
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(decrypted);
}

// --- 生成 common-auth.js ---
async function generateCommonScript() {
    return `
(function() {
    // 动态注入 CSS
    const style = document.createElement('style');
    style.innerHTML = \`
        #smai-global-auth {
            position: fixed;
            top: 20px;
            left: 20px;
            z-index: 2147483647; /* 保证最上层 */
            font-family: system-ui, -apple-system, sans-serif;
        }

        .smai-auth-btn {
            background: rgba(29, 29, 31, 0.7);
            backdrop-filter: blur(20px);
            color: white !important;
            padding: 6px 14px;
            border-radius: 30px;
            font-weight: 500;
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size: 14px;
            border: 1px solid rgba(255, 255, 255, 0.2);
            box-shadow: 0 4px 12px rgba(0,0,0,0.1);
        }

        .smai-auth-btn:hover {
            background: rgba(29, 29, 31, 0.9);
            transform: scale(1.02);
            border-color: rgba(255, 255, 255, 0.4);
        }

        .smai-avatar-img {
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background: linear-gradient(135deg, #0071e3, #00c6fb);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            font-weight: 600;
            color: white;
            text-shadow: 0 1px 2px rgba(0,0,0,0.2);
        }

        .smai-username {
            max-width: 100px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        /* 下拉菜单 */
        .smai-auth-dropdown {
            position: absolute;
            top: 100%;
            left: 0;
            margin-top: 10px;
            background: rgba(29, 29, 31, 0.8);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 12px;
            width: 220px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.1);
            display: none;
            flex-direction: column;
            overflow: hidden;
            transform-origin: top left;
        }

        .smai-auth-dropdown.show {
            display: flex;
            animation: smaiFadeIn 0.2s ease forwards;
        }

        @keyframes smaiFadeIn {
            from { opacity:0; transform:translateY(-10px) scale(0.95); }
            to { opacity:1; transform:translateY(0) scale(1); }
        }

        .smai-drop-header { padding: 16px; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .smai-drop-user { color: white; font-weight: 600; font-size: 15px; margin-bottom: 4px; }
        .smai-drop-role {
            font-size: 11px;
            padding: 2px 8px;
            border-radius: 4px;
            background: rgba(255,255,255,0.1);
            color: #ccc;
            display: inline-block;
        }
        .smai-role-vip { background: linear-gradient(45deg, #FFD700, #FFA500); color: black; font-weight: bold; }

        .smai-drop-item {
            padding: 12px 16px;
            color: #eee;
            text-decoration: none;
            font-size: 14px;
            transition: background 0.2s;
            display: flex;
            align-items: center;
            gap: 8px;
            border: none;
            background: transparent;
            width: 100%;
            text-align: left;
            cursor: pointer;
        }
        .smai-drop-item:hover { background: rgba(255,255,255,0.1); color: white; }
        .smai-drop-danger { color: #ff453a; }
        .smai-drop-danger:hover { background: rgba(255, 69, 58, 0.15); color: #ff453a; }

        /* Font Awesome stub if not present */
        .smai-caret {
            display: inline-block;
            width: 0;
            height: 0;
            border-left: 4px solid transparent;
            border-right: 4px solid transparent;
            border-top: 4px solid white;
            opacity: 0.7;
        }
    \`;
    document.head.appendChild(style);

    async function initAuth() {
        // 创建固定容器
        let container = document.getElementById('smai-global-auth');
        if (!container) {
            container = document.createElement('div');
            container.id = 'smai-global-auth';
            document.body.appendChild(container);
        }

        // 2. 获取用户状态
        try {
            const res = await fetch('https://login.smaiclub.top/api/me', { credentials: 'include' });
            const data = await res.json();
            
            if (data.loggedIn) {
                // 已登录
                const roleMap = { 'vip': 'VIP', 'svip1': 'SVIP I', 'svip2': 'SVIP II', 'user': 'User' };
                const roleName = roleMap[data.role] || data.role.toUpperCase();
                const isVip = data.role.startsWith('vip') || data.role.startsWith('svip');
                const avatarChar = data.username.charAt(0).toUpperCase();

                container.innerHTML = \`
                    <div class="smai-auth-btn" onclick="window.toggleSmaiMenu(event)">
                        <div class="smai-avatar-img">\${avatarChar}</div>
                        <span class="smai-username">\${data.username}</span>
                        <span class="smai-caret"></span>
                    </div>
                    <div class="smai-auth-dropdown" id="smai-user-menu">
                        <div class="smai-drop-header">
                            <div class="smai-drop-user">\${data.username}</div>
                            <span class="smai-drop-role \${isVip ? 'smai-role-vip' : ''}">\${roleName}</span>
                        </div>
                        \${!isVip ? '<a href="https://www.smaiclub.top/shop/" class="smai-drop-item">💎 购买会员</a>' : ''}
                        <button class="smai-drop-item smai-drop-danger" onclick="window.logoutSmai()">
                             🚪 退出登录
                        </button>
                    </div>
                \`;
            } else {
                // 未登录 - 显示简洁登录按钮
                container.innerHTML = \`
                    <a href="https://login.smaiclub.top" class="smai-auth-btn">
                        <div class="smai-avatar-img" style="background:#555">?</div>
                        <span>登录</span>
                    </a>
                \`;
            }

        } catch (e) {
            console.error("Auth init error:", e);
        }
    }

    // 全局函数
    window.toggleSmaiMenu = function(e) {
        e.stopPropagation();
        const menu = document.getElementById('smai-user-menu');
        if (menu) menu.classList.toggle('show');
    };

    window.logoutSmai = async function() {
        await fetch('https://login.smaiclub.top/api/logout', { method: 'POST', credentials: 'include' });
        window.location.reload();
    };

    // 点击其他地方关闭菜单
    document.addEventListener('click', () => {
        const menu = document.getElementById('smai-user-menu');
        if (menu) menu.classList.remove('show');
    });

    // 启动
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAuth);
    } else {
        initAuth();
    }
})();
    `;
}
