import { ChatRoom } from './ChatRoom.js';
import { htmlTemplate } from './htmlTemplate.js';
import { generateRoomKey, validateCustomKey, getUserFromRequest, getEffectiveRole, getTierLimits } from './utils.js';

export { ChatRoom };

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // CORS Headers
        const corsHeaders = {
            "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie, Room-Key",
            "Access-Control-Allow-Credentials": "true",
        };

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        // --- Serve Frontend ---
        if (url.pathname === "/" && request.method === "GET") {
             return new Response(htmlTemplate(), { headers: { "Content-Type": "text/html" } });
        }

        // --- 1. Create Room (POST /api/rooms) ---
        if (request.method === "POST" && url.pathname === "/api/rooms") {
            try {
                const user = await getUserFromRequest(request, env);
                if (!user) return new Response(JSON.stringify({ error: "Unauthorized", message: "请先登录" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

                const role = getEffectiveRole(user);
                const limits = getTierLimits(role);
                const body = await request.json();

                // 1. Check Global ID Limit (Fail-safe)
                const countResult = await env.CHAT_DB.prepare("SELECT COUNT(*) as count FROM rooms").first();
                if (countResult.count >= 99990) {
                     return new Response(JSON.stringify({
                         error: "EMERGENCY_MODE",
                         message: "System busy. Contact Admin."
                     }), { status: 503, headers: corsHeaders });
                }

                // 2. Check User Creation Limit (Monthly)
                const currentMonthStart = new Date();
                currentMonthStart.setDate(1);
                currentMonthStart.setHours(0,0,0,0);
                const createdCount = await env.CHAT_DB.prepare(
                    "SELECT COUNT(*) as count FROM rooms WHERE owner = ? AND created_at >= ?"
                ).bind(user.username, currentMonthStart.getTime()).first();

                if (createdCount.count >= limits.roomLimit) {
                    return new Response(JSON.stringify({ error: "Creation limit reached for this month" }), { status: 403, headers: corsHeaders });
                }

                // 3. Generate Room Data
                let roomKey;
                if (body.customKey) {
                    if (!validateCustomKey(body.customKey)) {
                        return new Response(JSON.stringify({ error: "Invalid custom key. Must be >8 and <20 chars, alphanumeric." }), { status: 400, headers: corsHeaders });
                    }
                    roomKey = body.customKey;
                } else {
                    roomKey = await generateRoomKey();
                }

                // Calculate Hash of Key for storage/verification
                const enc = new TextEncoder();
                const keyData = enc.encode(roomKey);
                const hashBuffer = await crypto.subtle.digest("SHA-256", keyData);
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const keyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

                // Find unused ID
                let roomId = null;
                for (let i = 0; i < 5; i++) {
                    const candidate = Math.floor(Math.random() * 99999) + 2;
                    const existing = await env.CHAT_DB.prepare("SELECT 1 FROM rooms WHERE id = ?").bind(candidate).first();
                    if (!existing) {
                        roomId = candidate;
                        break;
                    }
                }
                if (!roomId) return new Response(JSON.stringify({ error: "Could not allocate ID, try again" }), { status: 500, headers: corsHeaders });

                // 4. Create in D1
                try {
                    await env.CHAT_DB.prepare(
                        "INSERT INTO rooms (id, name, is_private, owner, created_at, last_accessed) VALUES (?, ?, ?, ?, ?, ?)"
                    ).bind(roomId, body.name || `Room ${roomId}`, body.isPrivate ? 1 : 0, user.username, Date.now(), Date.now()).run();
                } catch (e) {
                     return new Response(JSON.stringify({
                         error: "EMERGENCY_MODE",
                         message: "Database Error. Contact Admin."
                     }), { status: 503, headers: corsHeaders });
                }

                // 5. Initialize DO (Store KeyHash & ID)
                const id = env.CHAT_ROOM.idFromName(roomId.toString());
                const stub = env.CHAT_ROOM.get(id);

                await stub.fetch(new Request("http://internal/init", {
                    method: "POST",
                    body: JSON.stringify({ keyHash, roomId })
                }));

                return new Response(JSON.stringify({
                    success: true,
                    roomId,
                    roomKey
                }), { status: 201, headers: corsHeaders });

            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
            }
        }

        // --- 2. Join/Connect Room (WebSocket) ---
        if (url.pathname.startsWith("/api/rooms/")) {
            // Path: /api/rooms/:id/websocket
            const match = url.pathname.match(/\/api\/rooms\/(\d+)\/websocket/);
            if (match) {
                const roomId = match[1];
                const key = url.searchParams.get("key");

                // Auth Check
                const user = await getUserFromRequest(request, env);
                if (!user) return new Response(JSON.stringify({ error: "Unauthorized", message: "请先登录" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

                // Check if Room exists in D1 (or if it's Room 1)
                const room = await env.CHAT_DB.prepare("SELECT * FROM rooms WHERE id = ?").bind(roomId).first();

                // Allow Room 1 even if logic failed elsewhere, as long as it's seeded
                if (!room && roomId !== '1' && roomId !== '000001') {
                    return new Response(JSON.stringify({ error: "Room not found", message: "房间不存在" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
                }

                // Get DO
                // Use string ID for consistency
                const id = env.CHAT_ROOM.idFromName(parseInt(roomId).toString());
                const stub = env.CHAT_ROOM.get(id);

                // Update URL with user info for DO to use
                const doUrl = new URL(request.url);
                doUrl.searchParams.set("username", user.username);
                doUrl.searchParams.set("role", getEffectiveRole(user));

                return stub.fetch(new Request(doUrl.toString(), request));
            }
        }

        return new Response(JSON.stringify({ error: "Not Found", message: "页面不存在" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    },

    // --- Scheduled Cleanup (Fail-safe Protocol) ---
    async scheduled(event, env, ctx) {
        // 1. Check Triggers
        let emergency = false;
        try {
            const count = await env.CHAT_DB.prepare("SELECT COUNT(*) as count FROM rooms").first();
            if (count.count >= 99990) emergency = true;
        } catch (e) {
            emergency = true;
        }

        if (emergency) {
            console.log("Emergency Mode Cleanup Triggered");
            const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
            const cutoff = Date.now() - THIRTY_DAYS;

            const { results } = await env.CHAT_DB.prepare(
                "SELECT id FROM rooms WHERE last_accessed < ?"
            ).bind(cutoff).all();

            for (const row of results) {
                const roomId = row.id;

                try {
                    // Delete Messages
                    await env.CHAT_DB.prepare("DELETE FROM messages WHERE room_id = ?").bind(roomId).run();
                    // Delete Room
                    await env.CHAT_DB.prepare("DELETE FROM rooms WHERE id = ?").bind(roomId).run();

                    // Destroy DO
                    const id = env.CHAT_ROOM.idFromName(roomId.toString());
                    const stub = env.CHAT_ROOM.get(id);
                    ctx.waitUntil(stub.fetch("http://internal/destroy", { method: "POST" }));
                } catch(e) {
                    console.error("Cleanup failed for room", roomId, e);
                }
            }
        }
    }
};
