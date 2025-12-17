import { ChatRoom } from './chatRoom.js';
import { htmlTemplate } from './htmlTemplate.js'; // We will put frontend code here or serve it

export { ChatRoom };

const corsHeaders = {
    "Access-Control-Allow-Origin": "https://www.smaiclub.top", // Allow main site? Or self?
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
};

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // Handle CORS
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        // Serve Frontend
        if (url.pathname === "/" || url.pathname === "/index.html") {
            return new Response(htmlTemplate(), { headers: { "Content-Type": "text/html" } });
        }

        // API: List Rooms
        if (url.pathname === "/api/rooms") {
            const rooms = await env.DB.prepare("SELECT * FROM rooms").all();
            return new Response(JSON.stringify(rooms.results), {
                headers: { "Content-Type": "application/json", ...corsHeaders }
            });
        }

        // API: Chat Room (WebSocket & History)
        // /api/room/:roomId/websocket
        // /api/room/:roomId/history
        if (url.pathname.startsWith("/api/room/")) {
            const pathParts = url.pathname.split('/');
            const roomId = pathParts[3];
            const action = pathParts[4];

            // 1. Auth Check (Simplistic: Call Login Worker or Verify Token)
            // Since we don't have direct access to shared secret here effectively without env,
            // we will assume the browser sends cookies.
            // But we need to verify them.
            // For this task, I'll simulate auth verification by checking if a header or param exists,
            // OR ideally, we assume the user has a valid 'auth_token' cookie and we verify it.
            // To properly verify, we need the SAME SECRET as login-worker.
            // I will assume `env.SECRET_KEY` is set.

            let user = await getUserFromCookie(request, env);
            if (!user) {
                return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
            }

            // Check Access Level
            // Get room info
            const room = await env.DB.prepare("SELECT * FROM rooms WHERE id = ?").bind(roomId).first();
            if (!room) return new Response("Room not found", { status: 404 });

            const roleLevels = { 'user': 0, 'vip': 1, 'svip1': 2, 'svip2': 3 };
            const userLevel = roleLevels[user.role] || 0;
            if (userLevel < room.min_role_level) {
                return new Response(JSON.stringify({ error: "Insufficient permissions" }), { status: 403, headers: corsHeaders });
            }

            // 2. Forward to Durable Object
            const id = env.CHAT_ROOM.idFromName(roomId);
            const obj = env.CHAT_ROOM.get(id);

            // Append user info to URL for DO to use
            const doUrl = new URL(request.url);
            doUrl.searchParams.set("username", user.username);
            doUrl.searchParams.set("role", user.role);

            // Re-create request with new URL
            const newRequest = new Request(doUrl.toString(), request);
            return obj.fetch(newRequest);
        }

        return new Response("Not Found", { status: 404 });
    }
};

// --- Auth Helper (Duplicated from login-worker, ideally shared package) ---
async function getUserFromCookie(request, env) {
    const cookieHeader = request.headers.get("Cookie");
    if (!cookieHeader) return null;

    // Parse cookies
    const cookies = {};
    cookieHeader.split(';').forEach(c => {
        const [k, v] = c.split('=');
        if(k && v) cookies[k.trim()] = decodeURI(v.trim());
    });

    const token = cookies['auth_token'];
    if (!token) return null;

    try {
        // Decrypt
        // Note: This requires env.SECRET_KEY to match login-worker's key
        const sessionStr = await decryptData(token, env.SECRET_KEY, "SESSION_SALT");
        const session = JSON.parse(sessionStr);
        return session; // { username, role, ... }
    } catch (e) {
        return null;
    }
}

async function decryptData(encryptedText, secretKey, salt) {
    if (!secretKey) return null; // If key missing in env, fail safe
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
