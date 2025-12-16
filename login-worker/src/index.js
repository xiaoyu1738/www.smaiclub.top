import htmlContent from './htmlTemplate.js';

// --- AES-GCM 加密/解密工具 ---
async function getKey(secret) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "PBKDF2" }, false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: enc.encode("salt"), iterations: 100000, hash: "SHA-256" },
        keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
    );
}

async function encryptData(data, secret) {
    const key = await getKey(secret);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, enc.encode(JSON.stringify(data)));
    const combined = new Uint8Array(iv.length + encrypted.byteLength);
    combined.set(iv); combined.set(new Uint8Array(encrypted), iv.length);
    return btoa(String.fromCharCode(...combined));
}

async function decryptData(base64Data, secret) {
    try {
        const combined = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
        const iv = combined.slice(0, 12); const data = combined.slice(12);
        const key = await getKey(secret);
        const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, data);
        return JSON.parse(new TextDecoder().decode(decrypted));
    } catch (e) { return null; }
}

export default {
    // 修改处：删除了第三个参数 ctx，因为没有用到它
    async fetch(request, env) {
        if (!env.SECRET_KEY) return new Response("Error: Missing SECRET_KEY", { status: 500 });

        const url = new URL(request.url);
        const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

        // 1. 渲染页面
        if (url.pathname === "/" || url.pathname === "/index.html") {
            return new Response(htmlContent, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
        }

        // 2. 注册
        if (url.pathname === "/api/register" && request.method === "POST") {
            const { username, password } = await request.json();
            let users = JSON.parse(await env.USER_DB.get("users_data") || "[]");

            if (users.some(u => u.username === username)) {
                return new Response(JSON.stringify({ success: false, message: "用户已存在" }), { status: 400, headers });
            }

            const encrypted = await encryptData({ password, role: 'user' }, env.SECRET_KEY);
            users.push({ username, data: encrypted });

            await env.USER_DB.put("users_data", JSON.stringify(users));
            return new Response(JSON.stringify({ success: true, message: "注册成功" }), { headers });
        }

        // 3. 登录
        if (url.pathname === "/api/login" && request.method === "POST") {
            const { username, password } = await request.json();
            const users = JSON.parse(await env.USER_DB.get("users_data") || "[]");
            const user = users.find(u => u.username === username);

            if (user) {
                const decrypted = await decryptData(user.data, env.SECRET_KEY);
                if (decrypted && decrypted.password === password) {
                    return new Response(JSON.stringify({ success: true, message: "登录成功" }), { headers });
                }
            }
            return new Response(JSON.stringify({ success: false, message: "用户名或密码错误" }), { status: 401, headers });
        }

        return new Response("Not Found", { status: 404 });
    }
};