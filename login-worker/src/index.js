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

                // 处理会员等级显示
                let displayRole = user.role;
                if (displayRole === 'svip') {
                    // 如果存储的是 svip1/svip2，前端可能需要区分，这里暂时统称 svip 或者根据具体值返回
                    // 假设 DB 中存的是 'svip1', 'svip2', 'vip'
                }

                // sessionRole 是经过许可证验证后的实际权限
                const effectiveRole = user.sessionRole || user.role || 'user';

                return new Response(JSON.stringify({
                    loggedIn: true,
                    username: user.username,
                    role: user.role, // 购买的等级
                    effectiveRole: effectiveRole, // 当前生效等级（可能因为没许可证降级）
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

                const exists = await env.USER_DB.get(`user:${username}`);
                if (exists) return jsonResp({ error: "用户已存在" }, 409, responseHeaders);

                const salt = crypto.randomUUID();
                const encryptedPassword = await encryptData(password, env.SECRET_KEY, salt);

                const userData = {
                    username,
                    password: encryptedPassword,
                    salt,
                    role: 'user',
                    createdAt: Date.now()
                };

                await env.USER_DB.put(`user:${username}`, JSON.stringify(userData));
                return jsonResp({ success: true }, 200, responseHeaders);
            }

            // --- 登录 ---
            if (url.pathname === "/api/login") {
                const { username, password, licenseKey } = body;
                const userRaw = await env.USER_DB.get(`user:${username}`);
                if (!userRaw) return jsonResp({ error: "用户不存在" }, 404, responseHeaders);

                let user = JSON.parse(userRaw);

                const decryptedPassword = await decryptData(user.password, env.SECRET_KEY, user.salt);
                if (password !== decryptedPassword) return jsonResp({ error: "密码错误" }, 401, responseHeaders);

                if (!PASSWORD_REGEX.test(password)) {
                    return jsonResp({ error: "WEAK_PASSWORD", message: "您的密码过于简单，为了安全请立即修改" }, 403, responseHeaders);
                }

                let sessionRole = user.role;
                let warning = null;

                // VIP 验证逻辑
                if (['vip', 'svip1', 'svip2'].includes(user.role)) {
                    // 如果用户已设置许可证，则必须验证
                    if (user.licenseKey) {
                        if (!licenseKey) {
                            return jsonResp({ error: "LICENSE_REQUIRED", message: "请输入会员许可证以继续" }, 403, responseHeaders);
                        }
                        const decryptedLicense = await decryptData(user.licenseKey, env.SECRET_KEY, user.salt);
                        if (licenseKey !== decryptedLicense) {
                            return jsonResp({ error: "LICENSE_INVALID", message: "许可证错误" }, 403, responseHeaders);
                        }
                    } else {
                        // VIP 但未设置许可证？（理论上不应发生，除非是旧数据）
                        // 允许登录但降级，或者提示去设置
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
                const userRaw = await env.USER_DB.get(`user:${username}`);
                if (!userRaw) return jsonResp({ error: "用户不存在" }, 404, responseHeaders);
                let user = JSON.parse(userRaw);

                const decryptedOld = await decryptData(user.password, env.SECRET_KEY, user.salt);
                if (oldPassword !== decryptedOld) return jsonResp({ error: "旧密码错误" }, 401, responseHeaders);

                if (!PASSWORD_REGEX.test(newPassword)) return jsonResp({ error: "新密码强度不足" }, 400, responseHeaders);

                const newEncrypted = await encryptData(newPassword, env.SECRET_KEY, user.salt);
                user.password = newEncrypted;
                await env.USER_DB.put(`user:${username}`, JSON.stringify(user));

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

                // 防止降级逻辑
                const roleLevels = { 'user': 0, 'vip': 1, 'svip1': 2, 'svip2': 3 };
                const currentLevel = roleLevels[user.role] || 0;
                const newLevel = roleLevels[tier] || 0;

                if (newLevel <= currentLevel) {
                    return jsonResp({ error: "cannot_downgrade", message: "您当前已拥有同级或更高级别的会员权益，无需重复购买或降级。" }, 400, responseHeaders);
                }

                // 记录购买信息和升级
                user.role = tier;
                user.licensePending = true;
                user.personalInfo = personalInfo; // 存储个人信息
                user.lastPurchase = Date.now();

                await env.USER_DB.put(`user:${user.username}`, JSON.stringify(user));

                return jsonResp({ success: true, message: "购买成功" }, 200, responseHeaders);
            }

            // --- 设置许可证 ---
            if (url.pathname === "/api/set-license") {
                const user = await getUserFromCookie(request, env);
                if (!user) return jsonResp({ error: "请先登录" }, 401, responseHeaders);

                const { licenseKey } = body;
                if (!licenseKey || licenseKey.length < 4) return jsonResp({ error: "许可证太短" }, 400, responseHeaders);

                const encryptedLicense = await encryptData(licenseKey, env.SECRET_KEY, user.salt);
                user.licenseKey = encryptedLicense;
                delete user.licensePending;

                // 这里的 sessionRole 不会立即更新，用户需要重新登录才能生效，或者我们这里不更新cookie
                // 前端逻辑是设置完后让用户重登，或者刷新页面（如果不需要许可证验证）
                // 但为了安全，许可证是在登录时验证的，所以必须重登

                await env.USER_DB.put(`user:${user.username}`, JSON.stringify(user));

                // 设置完成后，自动清除当前 session 强制用户重登以应用新权限
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
        const userRaw = await env.USER_DB.get(`user:${session.username}`);
        if (!userRaw) return null;
        const user = JSON.parse(userRaw);
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
        .smai-auth-li { margin-left: auto !important; position: relative; list-style:none; }
        .smai-auth-btn {
            background: linear-gradient(135deg, #0071e3, #00c6fb);
            color: white !important;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: 500;
            text-decoration: none;
            display: flex;
            align-items: center;
            gap: 6px;
            cursor: pointer;
            transition: transform 0.2s;
            font-size: 14px;
            border: none;
            outline: none;
        }
        .smai-auth-btn:hover { transform: scale(1.05); }
        .smai-avatar-img { width: 24px; height: 24px; border-radius: 50%; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-size: 12px; }

        /* 下拉菜单 */
        .smai-auth-dropdown {
            position: absolute;
            top: 100%;
            right: 0;
            margin-top: 12px;
            background: rgba(29, 29, 31, 0.95);
            backdrop-filter: blur(20px);
            border-radius: 12px;
            width: 200px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            border: 1px solid rgba(255,255,255,0.1);
            display: none;
            flex-direction: column;
            overflow: hidden;
            z-index: 9999;
        }
        .smai-auth-dropdown.show { display: flex; animation: fadeInDown 0.2s ease; }
        @keyframes fadeInDown { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:translateY(0); } }

        .smai-drop-header { padding: 15px; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .smai-drop-user { color: white; font-weight: 600; font-size: 15px; }
        .smai-drop-role { font-size: 11px; padding: 2px 6px; border-radius: 4px; background: #333; color: #aaa; margin-top: 4px; display: inline-block; }
        .smai-role-vip { background: linear-gradient(45deg, #FFD700, #FFA500); color: black; }

        .smai-drop-item {
            padding: 12px 15px;
            color: #ddd;
            text-decoration: none;
            font-size: 14px;
            transition: background 0.2s;
            display: block;
        }
        .smai-drop-item:hover { background: rgba(255,255,255,0.1); color: white; }
        .smai-drop-danger { color: #ff453a; }
        .smai-drop-danger:hover { background: rgba(255, 69, 58, 0.1); }

        /* Fallback container for pages without navbar */
        #smai-fallback-nav {
            position: fixed; top: 20px; right: 20px; z-index: 9999;
        }
    \`;
    document.head.appendChild(style);

    async function initAuth() {
        // 1. 检查页面是否有导航栏容器
        // www & news 使用 .nav-links
        let navContainer = document.querySelector('.nav-links');

        // 如果没有导航栏，直接退出，不显示任何 UI
        if (!navContainer) return;

        // 2. 获取用户状态
        try {
            const res = await fetch('https://login.smaiclub.top/api/me', { credentials: 'include' });
            const data = await res.json();
            
            // 3. 渲染按钮
            const li = document.createElement('li');
            li.className = 'smai-auth-li';
            
            if (data.loggedIn) {
                // 已登录
                const roleMap = { 'vip': 'VIP', 'svip1': 'SVIP I', 'svip2': 'SVIP II', 'user': '普通用户' };
                const roleName = roleMap[data.role] || data.role.toUpperCase();
                const isVip = data.role.startsWith('vip') || data.role.startsWith('svip');
                const avatarChar = data.username.charAt(0).toUpperCase();

                li.innerHTML = \`
                    <div class="smai-auth-btn" onclick="toggleSmaiMenu(event)">
                        <div class="smai-avatar-img">\${avatarChar}</div>
                        <span>\${isVip ? roleName : data.username}</span>
                        <i class="fas fa-caret-down" style="font-size:10px"></i>
                    </div>
                    <div class="smai-auth-dropdown" id="smai-user-menu">
                        <div class="smai-drop-header">
                            <div class="smai-drop-user">\${data.username}</div>
                            <span class="smai-drop-role \${isVip ? 'smai-role-vip' : ''}">\${roleName}</span>
                        </div>
                        \${!isVip ? '<a href="https://www.smaiclub.top/shop/" class="smai-drop-item">💎 升级会员</a>' : ''}
                        <div class="smai-drop-item smai-drop-danger" onclick="logoutSmai()">退出登录</div>
                    </div>
                \`;
            } else {
                // 未登录
                li.innerHTML = \`
                    <a href="https://login.smaiclub.top" class="smai-auth-btn">
                        <i class="fas fa-user"></i> 登录 / 注册
                    </a>
                \`;
            }

            navContainer.appendChild(li);

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
