import { htmlTemplate } from './htmlTemplate.js';

// 密码强度校验正则：至少8位，包含字母和数字
const PASSWORD_REGEX = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,}$/;

// 通用头部，允许跨域访问（为了让 www.smaiclub.top 等子域名能调用 API）
const corsHeaders = {
    "Access-Control-Allow-Origin": "https://www.smaiclub.top", // 或者根据请求动态设置
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
};

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const origin = request.headers.get("Origin");

        // 动态处理 CORS Origin，允许所有 .smaiclub.top 子域名
        let responseHeaders = { ...corsHeaders };
        if (origin && origin.endsWith("smaiclub.top")) {
            responseHeaders["Access-Control-Allow-Origin"] = origin;
        }

        // 处理预检请求 (OPTIONS)
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: responseHeaders });
        }

        // 1. 托管通用导航脚本 (common-auth.js)
        // 这样你只需要在其他网站引用 https://login.smaiclub.top/common-auth.js 即可
        if (url.pathname === "/common-auth.js") {
            const script = await generateCommonScript(env);
            return new Response(script, {
                headers: { "Content-Type": "application/javascript", ...responseHeaders }
            });
        }

        // 2. 页面路由
        if (request.method === "GET") {
            if (url.pathname === "/" || url.pathname === "/login" || url.pathname === "/register") {
                return new Response(htmlTemplate(), { headers: { "Content-Type": "text/html" } });
            }
            // 验证当前用户状态 API (供 common-auth.js 使用)
            if (url.pathname === "/api/me") {
                const user = await getUserFromCookie(request, env);
                if (!user) return new Response(JSON.stringify({ loggedIn: false }), { headers: responseHeaders });

                // 过滤敏感信息
                return new Response(JSON.stringify({
                    loggedIn: true,
                    username: user.username,
                    role: user.sessionRole || user.role || 'user', // sessionRole 是经过许可证验证后的角色
                    hasLicense: !!user.licenseKey, // 是否设置过许可证
                    licensePending: !!user.licensePending // 是否刚买会员还没设许可证
                }), { headers: responseHeaders });
            }
        }

        // 3. API 路由 (POST)
        if (request.method === "POST") {
            const body = await request.json();

            // --- 注册 ---
            if (url.pathname === "/api/register") {
                const { username, password } = body;
                if (!username || !password) return jsonResp({ error: "请输入用户名和密码" }, 400, responseHeaders);

                // 密码强度检查
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

                // 验证密码
                const decryptedPassword = await decryptData(user.password, env.SECRET_KEY, user.salt);
                if (password !== decryptedPassword) return jsonResp({ error: "密码错误" }, 401, responseHeaders);

                // 检查密码合规性 (针对老用户)
                if (!PASSWORD_REGEX.test(password)) {
                    // 标记需要修改密码
                    return jsonResp({ error: "WEAK_PASSWORD", message: "您的密码过于简单，为了安全请立即修改" }, 403, responseHeaders);
                }

                // 处理会员许可证逻辑
                let sessionRole = user.role;
                let warning = null;

                if (user.role === 'vip' || user.role === 'svip') {
                    if (!user.licenseKey) {
                        // 有VIP身份但没设置许可证 (可能是刚买还没设，或者数据错误)
                        warning = "LICENSE_MISSING";
                        sessionRole = 'user'; // 降级
                    } else {
                        // 验证许可证
                        if (!licenseKey) {
                            sessionRole = 'user'; // 未提供许可证，降级
                        } else {
                            const decryptedLicense = await decryptData(user.licenseKey, env.SECRET_KEY, user.salt);
                            if (licenseKey !== decryptedLicense) {
                                sessionRole = 'user'; // 许可证错误，降级
                            }
                            // 许可证正确，保持 VIP
                        }
                    }
                }

                // 设置 Cookie
                const sessionData = JSON.stringify({ username, role: sessionRole, loginTime: Date.now() });
                // 加密 session 以防篡改
                const sessionToken = await encryptData(sessionData, env.SECRET_KEY, "SESSION_SALT");

                // 构造 Cookie 字符串 (设置为根域名 .smaiclub.top 共享)
                const cookie = `auth_token=${sessionToken}; Path=/; Domain=.smaiclub.top; Secure; SameSite=None; Max-Age=86400`; // 1天过期

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
                // 这里简化逻辑，实际应该通过 session 验证，但为了处理“登录时强制修改”，我们允许传参验证
                // 为了安全，这里最好结合 Cookie 验证，但考虑到强制修改的场景，我们再次验证旧密码

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

            // --- 购买会员 (模拟) ---
            if (url.pathname === "/api/buy") {
                const user = await getUserFromCookie(request, env);
                if (!user) return jsonResp({ error: "请先登录" }, 401, responseHeaders);

                // 升级逻辑
                user.role = 'vip';
                user.licensePending = true; // 标记等待设置许可证
                await env.USER_DB.put(`user:${user.username}`, JSON.stringify(user));

                return jsonResp({ success: true, message: "购买成功，请设置许可证" }, 200, responseHeaders);
            }

            // --- 设置许可证 ---
            if (url.pathname === "/api/set-license") {
                const user = await getUserFromCookie(request, env);
                if (!user) return jsonResp({ error: "请先登录" }, 401, responseHeaders);

                const { licenseKey } = body;
                if (!licenseKey || licenseKey.length < 4) return jsonResp({ error: "许可证太短" }, 400, responseHeaders);

                const encryptedLicense = await encryptData(licenseKey, env.SECRET_KEY, user.salt);
                user.licenseKey = encryptedLicense;
                delete user.licensePending; // 移除待定标记

                await env.USER_DB.put(`user:${user.username}`, JSON.stringify(user));
                return jsonResp({ success: true }, 200, responseHeaders);
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

// 解析 Cookie 获取用户
async function getUserFromCookie(request, env) {
    const cookieHeader = request.headers.get("Cookie");
    if (!cookieHeader) return null;
    const cookies = parseCookies(cookieHeader);
    const token = cookies['auth_token'];
    if (!token) return null;

    try {
        const sessionStr = await decryptData(token, env.SECRET_KEY, "SESSION_SALT");
        const session = JSON.parse(sessionStr);
        // 从 DB 获取最新数据
        const userRaw = await env.USER_DB.get(`user:${session.username}`);
        if (!userRaw) return null;
        const user = JSON.parse(userRaw);
        // 注入 session 中的临时角色 (比如降级后的角色)
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

// AES-GCM 加密/解密 (与之前逻辑保持一致，稍作封装)
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

// 生成 common-auth.js 的内容
async function generateCommonScript(env) {
    return `
(function() {
    function initAuthWidget() {
        if (document.getElementById('smai-auth-widget')) return;

        // 1. 创建 UI 样式
        const style = document.createElement('style');
        style.innerHTML = \`
            /* 容器：左上角悬浮 */
            #smai-auth-widget {
                position: fixed;
                top: 15px;
                left: 15px;
                z-index: 2147483647;
                font-family: 'Segoe UI', system-ui, sans-serif;
            }

            /* 头像/按钮 */
            .smai-avatar-btn {
                display: flex;
                align-items: center;
                gap: 8px;
                background: rgba(255, 255, 255, 0.95);
                color: #333;
                padding: 6px 14px;
                border-radius: 30px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.15);
                cursor: pointer;
                border: 1px solid rgba(0,0,0,0.05);
                transition: all 0.3s ease;
                backdrop-filter: blur(8px);
                user-select: none;
            }

            .smai-avatar-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 6px 20px rgba(0,0,0,0.2);
                background: white;
            }

            .smai-avatar-icon {
                width: 28px;
                height: 28px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border-radius: 50%;
                color: white;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 14px;
            }

            .smai-user-name {
                font-size: 14px;
                font-weight: 600;
                max-width: 100px;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .smai-arrow {
                font-size: 10px;
                color: #777;
                transition: transform 0.3s;
            }

            /* 下拉菜单 */
            .smai-dropdown {
                position: absolute;
                top: 100%;
                left: 0;
                margin-top: 10px;
                background: white;
                border-radius: 12px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.15);
                width: 200px;
                overflow: hidden;
                transform-origin: top left;
                transform: scale(0.95);
                opacity: 0;
                pointer-events: none;
                transition: all 0.2s cubic-bezier(0.165, 0.84, 0.44, 1);
                border: 1px solid #f0f0f0;
            }

            .smai-dropdown.show {
                transform: scale(1);
                opacity: 1;
                pointer-events: auto;
            }

            .smai-dropdown-header {
                padding: 15px;
                background: #f8f9fa;
                border-bottom: 1px solid #eee;
            }

            .smai-role-badge {
                display: inline-block;
                padding: 2px 8px;
                background: #eee;
                color: #555;
                border-radius: 4px;
                font-size: 11px;
                margin-top: 4px;
                font-weight: bold;
            }

            .smai-role-vip {
                background: linear-gradient(45deg, #FFD700, #FFA500);
                color: white;
                text-shadow: 0 1px 2px rgba(0,0,0,0.1);
            }

            .smai-menu-item {
                display: block;
                padding: 12px 15px;
                color: #333;
                text-decoration: none;
                font-size: 14px;
                cursor: pointer;
                transition: background 0.2s;
                border-bottom: 1px solid #f9f9f9;
            }

            .smai-menu-item:last-child {
                border-bottom: none;
            }

            .smai-menu-item:hover {
                background: #f0f7ff;
                color: #0066cc;
            }

            .smai-menu-danger {
                color: #ff4d4f;
            }
            .smai-menu-danger:hover {
                background: #fff1f0;
                color: #ff4d4f;
            }

            /* 模态框 (购买会员/设置许可证用) */
            #smai-auth-modal {
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: white; color: black; padding: 25px; border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0,0,0,0.4); z-index: 2147483648; display: none;
                flex-direction: column; gap: 15px; width: 320px;
            }
            #smai-auth-modal h3 { margin: 0 0 5px 0; color: #333; }
            #smai-auth-modal input { padding: 10px; border: 1px solid #ddd; border-radius: 6px; outline: none; }
            #smai-auth-modal input:focus { border-color: #2196F3; }
            #smai-auth-modal button { padding: 10px; background: #2196F3; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; }
            #smai-auth-modal button:hover { background: #1976D2; }
            #smai-auth-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.6); z-index: 2147483647; display: none; backdrop-filter: blur(2px);
            }
        \`;
        document.head.appendChild(style);

        // 2. 创建 DOM 结构
        const wrapper = document.createElement('div');
        wrapper.id = 'smai-auth-widget';
        document.body.appendChild(wrapper);

        // 模态框元素
        const overlay = document.createElement('div'); overlay.id = 'smai-auth-overlay';
        const modal = document.createElement('div'); modal.id = 'smai-auth-modal';
        document.body.appendChild(overlay);
        document.body.appendChild(modal);

        // 点击遮罩关闭
        overlay.onclick = function() { 
            modal.style.display = 'none';
            this.style.display = 'none'; 
        };

        // 3. 核心逻辑
        window.logout = async function() {
            await fetch('https://login.smaiclub.top/api/logout', { method: 'POST', credentials: 'include' });
            location.reload();
        };

        window.buyMembership = async function() {
            const res = await fetch('https://login.smaiclub.top/api/me', { credentials: 'include' });
            const data = await res.json();
            
            if (!data.loggedIn) {
                window.location.href = "https://login.smaiclub.top";
                return;
            }

            if (confirm("确定要购买(假的)会员吗？购买后需要设置许可证。")) {
                const buyRes = await fetch('https://login.smaiclub.top/api/buy', { 
                    method: 'POST', 
                    credentials: 'include' 
                });
                if (buyRes.ok) {
                    alert("购买成功！请立即设置您的许可证。警告：许可证丢失无法找回！");
                    window.showSetLicenseModal();
                }
            }
        };

        window.showSetLicenseModal = function() {
            overlay.style.display = 'block';
            modal.style.display = 'flex';
            modal.innerHTML = \`
                <h3>设置会员许可证</h3>
                <p style="color:#666;font-size:13px;line-height:1.4">请牢记此密钥，登录时需要输入。<br><span style="color:#d32f2f">丢失无法找回！</span></p>
                <input type="text" id="new-license-key" placeholder="输入您的专属密钥">
                <button onclick="submitLicense()">保存并激活</button>
            \`;
        };

        window.submitLicense = async function() {
            const key = document.getElementById('new-license-key').value;
            if(!key) return alert("密钥不能为空");
            
            const res = await fetch('https://login.smaiclub.top/api/set-license', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ licenseKey: key }),
                credentials: 'include'
            });
            
            if (res.ok) {
                alert("许可证设置成功！请重新登录以启用会员权限。");
                await window.logout(); 
            } else {
                alert("设置失败");
            }
        };

        // 切换下拉菜单
        window.toggleSmaiDropdown = function(e) {
            e.stopPropagation();
            const dropdown = document.querySelector('.smai-dropdown');
            const arrow = document.querySelector('.smai-arrow');
            if (dropdown) {
                dropdown.classList.toggle('show');
                if(arrow) arrow.style.transform = dropdown.classList.contains('show') ? 'rotate(180deg)' : 'rotate(0deg)';
            }
        };

        // 点击页面其他地方关闭菜单
        document.addEventListener('click', () => {
            const dropdown = document.querySelector('.smai-dropdown');
            const arrow = document.querySelector('.smai-arrow');
            if (dropdown && dropdown.classList.contains('show')) {
                dropdown.classList.remove('show');
                if(arrow) arrow.style.transform = 'rotate(0deg)';
            }
        });

        // 检查登录状态并渲染
        async function checkAuth() {
            try {
                const res = await fetch('https://login.smaiclub.top/api/me', { credentials: 'include' });
                const data = await res.json();
                
                if (data.loggedIn) {
                    renderLoggedIn(data);
                    // 如果是VIP但没有许可证，强制弹出设置
                    if ((data.role === 'vip' || data.role === 'svip') && !data.hasLicense) {
                        window.showSetLicenseModal(); 
                    }
                } else {
                    renderGuest();
                }
            } catch (e) {
                console.error("Auth check failed", e);
                renderGuest(); // 出错时显示为未登录
            }
        }

        function renderGuest() {
            const wrapper = document.getElementById('smai-auth-widget');
            wrapper.innerHTML = \`
                <div class="smai-avatar-btn" onclick="window.location.href='https://login.smaiclub.top'">
                    <div class="smai-avatar-icon" style="background:#888">G</div>
                    <span class="smai-user-name">登录</span>
                </div>
            \`;
        }

        function renderLoggedIn(user) {
            const wrapper = document.getElementById('smai-auth-widget');
            const firstLetter = user.username.charAt(0).toUpperCase();
            
            let roleLabel = '普通用户';
            let roleClass = '';
            let buyItem = \`<div class="smai-menu-item" onclick="window.buyMembership()">💎 购买会员</div>\`;

            if (user.role === 'vip' || user.role === 'svip') {
                roleLabel = user.role.toUpperCase();
                roleClass = 'smai-role-vip';
                buyItem = ''; // 已是会员不显示购买
            }

            wrapper.innerHTML = \`
                <div class="smai-avatar-btn" onclick="window.toggleSmaiDropdown(event)">
                    <div class="smai-avatar-icon">\${firstLetter}</div>
                    <span class="smai-user-name">\${user.username}</span>
                    <span class="smai-arrow">▼</span>
                </div>

                <div class="smai-dropdown">
                    <div class="smai-dropdown-header">
                        <div style="font-weight:bold">\${user.username}</div>
                        <span class="smai-role-badge \${roleClass}">\${roleLabel}</span>
                    </div>
                    \${buyItem}
                    <div class="smai-menu-item smai-menu-danger" onclick="window.logout()">🚪 退出登录</div>
                </div>
            \`;
        }

        checkAuth();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAuthWidget);
    } else {
        initAuthWidget();
    }
})();
    `;
}
