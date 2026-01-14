import { htmlTemplate } from './htmlTemplate.js';

// 密码强度校验正则：至少8位，包含字母和数字，允许特殊字符
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;

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

                // Auto-migrate special users to admin roles
                // This is a simple hook to ensure roles are correct on registration or login if they were reset
                if (username === 'smaiclubadmin') {
                    await env.DB.prepare("UPDATE users SET role = 'owner' WHERE username = ?").bind(username).run();
                } else if (username === 'fish') {
                    await env.DB.prepare("UPDATE users SET role = 'admin' WHERE username = ?").bind(username).run();
                }

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

                // Enforce Role Migration on Login
                if (username === 'smaiclubadmin' && user.role !== 'owner') {
                    await env.DB.prepare("UPDATE users SET role = 'owner' WHERE username = ?").bind(username).run();
                    sessionRole = 'owner';
                } else if (username === 'fish' && user.role !== 'admin') {
                    await env.DB.prepare("UPDATE users SET role = 'admin' WHERE username = ?").bind(username).run();
                    sessionRole = 'admin';
                }

                // VIP 验证逻辑
                if (['vip', 'svip1', 'svip2'].includes(user.role)) {
                    if (!licenseKey) {
                        return jsonResp({ error: "LICENSE_REQUIRED", message: "请输入会员许可证以继续" }, 403, responseHeaders);
                    }

                    if (!user.licenseKey) {
                        return jsonResp({ error: "ACCOUNT_ERROR", message: "账户异常：未设置许可证，请联系管理员" }, 403, responseHeaders);
                    }

                    const decryptedLicense = await decryptData(user.licenseKey, env.SECRET_KEY, user.salt);
                    if (licenseKey !== decryptedLicense) {
                        return jsonResp({ error: "LICENSE_INVALID", message: "许可证错误" }, 403, responseHeaders);
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
                let { username, oldPassword, newPassword } = body;

                let user;
                if (username) {
                    user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
                } else {
                    user = await getUserFromCookie(request, env);
                    if (user) username = user.username;
                }

                if (!user) return jsonResp({ error: "用户不存在或未登录" }, 404, responseHeaders);

                const decryptedOld = await decryptData(user.password, env.SECRET_KEY, user.salt);
                if (oldPassword !== decryptedOld) return jsonResp({ error: "旧密码错误" }, 401, responseHeaders);

                if (!PASSWORD_REGEX.test(newPassword)) return jsonResp({ error: "新密码强度不足" }, 400, responseHeaders);

                const newEncrypted = await encryptData(newPassword, env.SECRET_KEY, user.salt);

                // D1 更新密码
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

                // 防止降级逻辑
                const roleLevels = { 'user': 0, 'vip': 1, 'svip1': 2, 'svip2': 3, 'admin': 10, 'owner': 100 };
                const currentLevel = roleLevels[user.role] || 0;
                const newLevel = roleLevels[tier] || 0;

                if (newLevel <= currentLevel) {
                    return jsonResp({ error: "cannot_downgrade", message: "您当前已拥有同级或更高级别的会员权益，无需重复购买或降级。" }, 400, responseHeaders);
                }

                const lastPurchase = Date.now();
                const personalInfoStr = JSON.stringify(personalInfo);

                // D1 更新用户 (购买)
                await env.DB.prepare(
                    'UPDATE users SET role = ?, licensePending = 1, personalInfo = ?, lastPurchase = ? WHERE username = ?'
                ).bind(tier, personalInfoStr, lastPurchase, user.username).run();

                return jsonResp({ success: true, message: "购买成功" }, 200, responseHeaders);
            }

            // --- 设置许可证 (首次) ---
            if (url.pathname === "/api/set-license") {
                const user = await getUserFromCookie(request, env);
                if (!user) return jsonResp({ error: "请先登录" }, 401, responseHeaders);

                const { licenseKey } = body;
                if (!licenseKey || licenseKey.length < 4) return jsonResp({ error: "许可证太短" }, 400, responseHeaders);

                const encryptedLicense = await encryptData(licenseKey, env.SECRET_KEY, user.salt);

                // D1 更新用户 (设置许可证)
                await env.DB.prepare(
                    'UPDATE users SET licenseKey = ?, licensePending = NULL, lastLicenseUpdate = ? WHERE username = ?'
                ).bind(encryptedLicense, Date.now(), user.username).run();

                // 设置完成后，自动清除当前 session 强制用户重登以应用新权限
                const cookie = `auth_token=; Path=/; Domain=.smaiclub.top; Max-Age=0; Secure; SameSite=None`;
                return new Response(JSON.stringify({ success: true }), {
                     headers: { "Content-Type": "application/json", "Set-Cookie": cookie, ...responseHeaders }
                });
            }

            // --- 修改许可证 (180天限制) ---
            if (url.pathname === "/api/update-license") {
                const user = await getUserFromCookie(request, env);
                if (!user) return jsonResp({ error: "请先登录" }, 401, responseHeaders);

                const { licenseKey } = body;
                if (!licenseKey || licenseKey.length < 4) return jsonResp({ error: "许可证太短" }, 400, responseHeaders);

                // 检查是否是 VIP
                if (!['vip', 'svip1', 'svip2'].includes(user.role)) {
                    return jsonResp({ error: "仅会员可修改许可证" }, 403, responseHeaders);
                }

                // 检查时间限制 (180天)
                const ONE_DAY = 24 * 60 * 60 * 1000;
                const limit = 180 * ONE_DAY;
                const lastUpdate = user.lastLicenseUpdate || 0;
                const now = Date.now();

                if (now - lastUpdate < limit) {
                    const daysLeft = Math.ceil((limit - (now - lastUpdate)) / ONE_DAY);
                    return jsonResp({ error: `修改过于频繁，请在 ${daysLeft} 天后再试` }, 429, responseHeaders);
                }

                const encryptedLicense = await encryptData(licenseKey, env.SECRET_KEY, user.salt);

                // D1 更新用户
                await env.DB.prepare(
                    'UPDATE users SET licenseKey = ?, lastLicenseUpdate = ? WHERE username = ?'
                ).bind(encryptedLicense, now, user.username).run();

                // 修改成功后，强制重登
                const cookie = `auth_token=; Path=/; Domain=.smaiclub.top; Max-Age=0; Secure; SameSite=None`;
                return new Response(JSON.stringify({ success: true, message: "修改成功，请重新登录" }), {
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

            // --- 注销账号 ---
            if (url.pathname === "/api/delete-account") {
                const user = await getUserFromCookie(request, env);
                if (!user) return jsonResp({ error: "请先登录" }, 401, responseHeaders);

                // Trigger Room Ownership Transfer (via Chat Worker API)
                // We do this before deleting the user to ensure the user still exists for validation if needed,
                // although the chat worker will handle the logic based on the username.
                try {
                    await fetch('https://chat.smaiclub.top/api/internal/transfer-ownership', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${env.SECRET_KEY}` // Simple internal auth
                        },
                        body: JSON.stringify({ username: user.username })
                    });
                } catch (e) {
                    console.error("Failed to trigger ownership transfer", e);
                    // Continue with deletion even if transfer fails (fail-safe)
                }

                // D1 删除用户
                await env.DB.prepare('DELETE FROM users WHERE username = ?').bind(user.username).run();

                const cookie = `auth_token=; Path=/; Domain=.smaiclub.top; Max-Age=0; Secure; SameSite=None`;
                return new Response(JSON.stringify({ success: true, message: "账号已注销" }), {
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
        // D1 获取用户
        const user = await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(session.username).first();
        if (!user) return null;

        user.sessionRole = session.role;
        // 自动解析 JSON 字段 (虽然 SQL 返回的是 TEXT/NULL，需要手动解析吗？
        // D1 返回的 TEXT 字段是字符串，如果我们在 JS 中存储了 JSON string，这里需要解析吗？
        // 为了兼容之前的 user.personalInfo 访问，如果需要的话可以解析，但目前代码中 user.personalInfo 只是在 buy 接口存储，
        // 在 get 中并没有用到 specific fields，只是返回整个 user 给前端显示 role 等。
        // 为了安全，我们通常不返回 personalInfo 给前端，除非特定 API。
        // /api/me 接口里没有返回 personalInfo。所以这里不需要解析。

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

        /* License Modal */
        .smai-modal-overlay {
            position: fixed; top: 0; left: 0; width: 100%; height: 100%;
            background: rgba(0,0,0,0.6); backdrop-filter: blur(5px);
            z-index: 10000; display: none; align-items: center; justify-content: center;
        }
        .smai-modal-overlay.show { display: flex; animation: fadeIn 0.2s ease; }
        .smai-modal {
            background: #1d1d1f; border: 1px solid rgba(255,255,255,0.1);
            border-radius: 16px; padding: 24px; width: 90%; max-width: 400px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.4);
        }
        .smai-modal h3 { margin: 0 0 16px 0; color: white; font-size: 18px; }
        .smai-modal input {
            width: 100%; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.1);
            color: white; padding: 10px; border-radius: 8px; margin-bottom: 16px; outline: none;
        }
        .smai-modal-btns { display: flex; gap: 10px; justify-content: flex-end; }
        .smai-btn { padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 14px; border: none; }
        .smai-btn-cancel { background: rgba(255,255,255,0.1); color: white; }
        .smai-btn-confirm { background: #0071e3; color: white; }

        /* Fallback container for pages without navbar */
        #smai-fallback-nav {
            position: fixed; top: 20px; right: 20px; z-index: 9999;
        }
    \`;
    document.head.appendChild(style);

    function injectModals() {
        if (document.getElementById('smai-license-modal')) return;

        // License Modal HTML
        const modalHtml = \`
            <div id="smai-license-modal" class="smai-modal-overlay">
                <div class="smai-modal">
                    <h3>修改会员许可证</h3>
                    <p style="font-size:12px; color:#86868b; margin-bottom:12px;">注意：每180天仅允许修改一次。修改后需要重新登录。</p>
                    <input type="password" id="smai-new-license" placeholder="输入新的许可证密钥" />
                    <div class="smai-modal-btns">
                        <button class="smai-btn smai-btn-cancel" onclick="closeLicenseModal()">取消</button>
                        <button class="smai-btn smai-btn-confirm" onclick="updateLicense()">确认修改</button>
                    </div>
                </div>
            </div>
        \`;
        document.body.insertAdjacentHTML('beforeend', modalHtml);

        const changePassModalHtml = \`
            <div id="smai-changepass-modal" class="smai-modal-overlay">
                <div class="smai-modal">
                    <h3>修改密码</h3>
                    <input type="password" id="smai-old-pass" placeholder="当前密码" />
                    <input type="password" id="smai-new-pass" placeholder="新密码 (至少8位, 含字母数字)" />
                    <input type="password" id="smai-confirm-pass" placeholder="确认新密码" />
                    <div class="smai-modal-btns">
                        <button class="smai-btn smai-btn-cancel" onclick="closeChangePassModal()">取消</button>
                        <button class="smai-btn smai-btn-confirm" onclick="changePasswordSmai()">确认修改</button>
                    </div>
                </div>
            </div>
        \`;
        document.body.insertAdjacentHTML('beforeend', changePassModalHtml);
    }

    // 暴露全局对象供 SPA 调用
    window.CommonAuth = {
        init: initAuth
    };

    async function initAuth(containerId) {
        injectModals();
        // 1. 检查页面是否有导航栏容器
        let targetContainer;
        let isList = false;

        if (containerId) {
            targetContainer = document.getElementById(containerId);
        }

        if (!targetContainer) {
            // 优先寻找专门的 auth-container，否则回退到 .nav-links
            targetContainer = document.querySelector('.auth-container');
        }

        if (!targetContainer) {
            targetContainer = document.querySelector('.nav-links');
            isList = true; // 如果是插在 ul 中，需要用 li
        }

        // 如果没有导航栏，直接退出，不显示任何 UI
        if (!targetContainer) return;

        // 避免重复初始化
        if (targetContainer.querySelector('.smai-auth-wrapper')) return;

        // 2. 获取用户状态
        try {
            const res = await fetch('https://login.smaiclub.top/api/me', { credentials: 'include' });
            const data = await res.json();
            
            // 3. 渲染按钮
            // 如果容器不是 UL，则创建 div，否则创建 li
            const wrapper = document.createElement(isList ? 'li' : 'div');
            wrapper.className = 'smai-auth-wrapper';
            // 保持原有样式类名以便兼容
            if(isList) wrapper.classList.add('smai-auth-li');
            
            if (data.loggedIn) {
                // 已登录
                const roleMap = { 'vip': 'VIP', 'svip1': 'SVIP I', 'svip2': 'SVIP II', 'user': '普通用户' };
                const roleName = roleMap[data.role] || data.role.toUpperCase();
                const isVip = data.role.startsWith('vip') || data.role.startsWith('svip');
                const avatarChar = data.username.charAt(0).toUpperCase();

                wrapper.innerHTML = \`
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
                        \${isVip ? '<div class="smai-drop-item" onclick="showLicenseModal()">🔑 修改许可证</div>' : ''}
                        <div class="smai-drop-item" onclick="showChangePassModal()">🔒 修改密码</div>
                        <div class="smai-drop-item smai-drop-danger" onclick="deleteAccountSmai()">⚠️ 注销账号</div>
                        <div class="smai-drop-item" onclick="logoutSmai()">退出登录</div>
                    </div>
                \`;
            } else {
                // 未登录
                wrapper.innerHTML = \`
                    <a href="https://login.smaiclub.top" class="smai-auth-btn">
                        <i class="fas fa-user"></i> 登录 / 注册
                    </a>
                \`;
            }

            targetContainer.appendChild(wrapper);

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

    window.deleteAccountSmai = async function() {
        if (!confirm("确定要注销账号吗？此操作将永久删除您的账户且无法撤销！")) return;
        
        try {
            const res = await fetch('https://login.smaiclub.top/api/delete-account', { method: 'POST', credentials: 'include' });
            if (res.ok) {
                alert("账号已注销");
                window.location.reload();
            } else {
                alert("操作失败");
            }
        } catch(e) {
            alert("网络错误");
        }
    };

    window.showLicenseModal = function() {
        document.getElementById('smai-license-modal').classList.add('show');
        const menu = document.getElementById('smai-user-menu');
        if (menu) menu.classList.remove('show');
    };

    window.closeLicenseModal = function() {
        document.getElementById('smai-license-modal').classList.remove('show');
    };

    window.showChangePassModal = function() {
        document.getElementById('smai-changepass-modal').classList.add('show');
        const menu = document.getElementById('smai-user-menu');
        if (menu) menu.classList.remove('show');
    };

    window.closeChangePassModal = function() {
        document.getElementById('smai-changepass-modal').classList.remove('show');
        document.getElementById('smai-old-pass').value = '';
        document.getElementById('smai-new-pass').value = '';
        document.getElementById('smai-confirm-pass').value = '';
    };

    window.changePasswordSmai = async function() {
        const oldPass = document.getElementById('smai-old-pass').value;
        const newPass = document.getElementById('smai-new-pass').value;
        const confirmPass = document.getElementById('smai-confirm-pass').value;

        if (!oldPass || !newPass || !confirmPass) return alert("请填写所有字段");
        if (newPass !== confirmPass) return alert("两次输入的密码不一致");
        if (newPass.length < 8) return alert("新密码太短");

        try {
            const res = await fetch('https://login.smaiclub.top/api/change-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ oldPassword: oldPass, newPassword: newPass })
            });
            const data = await res.json();
            if (res.ok) {
                alert("密码修改成功，请重新登录");
                await fetch('https://login.smaiclub.top/api/logout', { method: 'POST', credentials: 'include' });
                window.location.reload();
            } else {
                alert(data.error || "修改失败");
            }
        } catch(e) {
            alert("网络错误");
        }
    };

    window.updateLicense = async function() {
        const input = document.getElementById('smai-new-license');
        const key = input.value;
        if (!key) return alert("请输入密钥");
        
        try {
            const res = await fetch('https://login.smaiclub.top/api/update-license', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ licenseKey: key })
            });
            const data = await res.json();
            if (res.ok) {
                alert(data.message || "修改成功");
                window.location.reload();
            } else {
                alert(data.error || "修改失败");
            }
        } catch(e) {
            alert("网络错误");
        }
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

