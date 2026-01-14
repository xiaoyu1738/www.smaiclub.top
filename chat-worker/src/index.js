import { ChatRoom } from './ChatRoom.js';
import { htmlTemplate } from './htmlTemplate.js';
import { generateRoomKey, validateCustomKey, getUserFromRequest, getEffectiveRole, getTierLimits, encryptLogData, decryptLogData } from './utils.js';

export { ChatRoom };

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);

        // CORS Headers
        const corsHeaders = {
            "Access-Control-Allow-Origin": request.headers.get("Origin") || "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS, DELETE",
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

        // --- 0. Get User Rooms (GET /api/user/rooms) ---
        if (request.method === "GET" && url.pathname === "/api/user/rooms") {
            try {
                const user = await getUserFromRequest(request, env);
                if (!user) return new Response(JSON.stringify({ error: "Unauthorized", message: "请先登录" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

                // 1. Get Owned Rooms
                const owned = await env.CHAT_DB.prepare(
                    "SELECT id, name, is_private, created_at FROM rooms WHERE owner = ? ORDER BY created_at DESC"
                ).bind(user.username).all();

                // 2. Get Joined Rooms (excluding owned ones if any overlap, though logic separates them)
                const joined = await env.CHAT_DB.prepare(
                    `SELECT r.id, r.name, r.is_private, rm.joined_at
                     FROM rooms r
                     JOIN room_members rm ON r.id = rm.room_id
                     WHERE rm.user_id = ? AND r.owner != ?
                     ORDER BY rm.joined_at DESC`
                ).bind(user.username, user.username).all();

                return new Response(JSON.stringify({
                    owned: owned.results || [],
                    joined: joined.results || []
                }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
            }
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
                        "INSERT INTO rooms (id, name, is_private, owner, owner_role, created_at, last_accessed) VALUES (?, ?, ?, ?, ?, ?, ?)"
                    ).bind(roomId, body.name || `Room ${roomId}`, body.isPrivate ? 1 : 0, user.username, role, Date.now(), Date.now()).run();

                    // Add owner to room_members
                    await env.CHAT_DB.prepare(
                        "INSERT INTO room_members (room_id, user_id, joined_at) VALUES (?, ?, ?)"
                    ).bind(roomId, user.username, Date.now()).run();

                } catch (e) {
                     return new Response(JSON.stringify({
                         error: "EMERGENCY_MODE",
                         message: "Database Error. Contact Admin."
                     }), { status: 503, headers: corsHeaders });
                }

                // Log Room Creation
                try {
                    const logDetails = await encryptLogData({
                        action: 'create_room',
                        roomId: roomId,
                        roomName: body.name,
                        isPrivate: body.isPrivate
                    });
                    await env.CHAT_DB.prepare(
                        "INSERT INTO activity_logs (event_type, user_id, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?)"
                    ).bind('create_room', user.username, logDetails, request.headers.get('CF-Connecting-IP') || 'unknown', Date.now()).run();
                } catch (e) { console.error("Logging failed", e); }

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

                // Record membership asynchronously (fire and forget)
                ctx.waitUntil(
                    env.CHAT_DB.prepare(
                        "INSERT OR IGNORE INTO room_members (room_id, user_id, joined_at) VALUES (?, ?, ?)"
                    ).bind(roomId, user.username, Date.now()).run()
                );

                return stub.fetch(new Request(doUrl.toString(), request));
            }
        }

        // --- 3. Delete Room (DELETE /api/rooms/:id) ---
        if (request.method === "DELETE" && url.pathname.startsWith("/api/rooms/")) {
            const match = url.pathname.match(/\/api\/rooms\/(\d+)$/);
            if (match) {
                const roomId = match[1];
                try {
                    const user = await getUserFromRequest(request, env);
                    if (!user) return new Response(JSON.stringify({ error: "Unauthorized", message: "请先登录" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

                    // Check ownership
                    const room = await env.CHAT_DB.prepare("SELECT owner FROM rooms WHERE id = ?").bind(roomId).first();
                    if (!room) {
                        return new Response(JSON.stringify({ error: "Room not found" }), { status: 404, headers: corsHeaders });
                    }
                    if (room.owner !== user.username) {
                        return new Response(JSON.stringify({ error: "Forbidden", message: "你不是房主" }), { status: 403, headers: corsHeaders });
                    }

                    // Perform Deletion
                    // 1. Delete Messages
                    await env.CHAT_DB.prepare("DELETE FROM messages WHERE room_id = ?").bind(roomId).run();
                    // 2. Delete Members
                    await env.CHAT_DB.prepare("DELETE FROM room_members WHERE room_id = ?").bind(roomId).run();
                    // 3. Delete Sessions
                    await env.CHAT_DB.prepare("DELETE FROM chat_sessions WHERE room_id = ?").bind(roomId).run();
                    // 4. Delete Room
                    await env.CHAT_DB.prepare("DELETE FROM rooms WHERE id = ?").bind(roomId).run();

                    // 5. Notify DO to destroy (close connections)
                    const id = env.CHAT_ROOM.idFromName(roomId.toString());
                    const stub = env.CHAT_ROOM.get(id);
                    ctx.waitUntil(stub.fetch("http://internal/destroy", { method: "POST" }));

                    // Log Room Deletion
                    try {
                        const logDetails = await encryptLogData({
                            action: 'delete_room',
                            roomId: roomId
                        });
                        await env.CHAT_DB.prepare(
                            "INSERT INTO activity_logs (event_type, user_id, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?)"
                        ).bind('delete_room', user.username, logDetails, request.headers.get('CF-Connecting-IP') || 'unknown', Date.now()).run();
                    } catch (e) { console.error("Logging failed", e); }

                    return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

                } catch(e) {
                    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
                }
            }
        }

        // --- 4. Internal Ownership Transfer (POST /api/internal/transfer-ownership) ---
        // Called by Login Worker before user deletion
        if (request.method === "POST" && url.pathname === "/api/internal/transfer-ownership") {
            try {
                // Simple Secret Auth (In production, use a shared secret env var)
                // For this demo, we assume the request is trusted or add a check if env.INTERNAL_SECRET exists
                // const auth = request.headers.get("Authorization");
                // if (auth !== `Bearer ${env.INTERNAL_SECRET}`) return new Response("Unauthorized", { status: 401 });

                const body = await request.json();
                const oldOwner = body.username;

                if (!oldOwner) return new Response("Missing username", { status: 400 });

                // 1. Find all rooms owned by this user
                const { results: rooms } = await env.CHAT_DB.prepare(
                    "SELECT id, name FROM rooms WHERE owner = ?"
                ).bind(oldOwner).all();

                if (!rooms || rooms.length === 0) {
                    return new Response(JSON.stringify({ message: "No rooms to transfer" }), { headers: { "Content-Type": "application/json" } });
                }

                const transferLog = [];

                for (const room of rooms) {
                    // 2. Find the earliest member (excluding the old owner)
                    const nextOwner = await env.CHAT_DB.prepare(
                        `SELECT user_id FROM room_members
                         WHERE room_id = ? AND user_id != ?
                         ORDER BY joined_at ASC LIMIT 1`
                    ).bind(room.id, oldOwner).first();

                    if (nextOwner) {
                        const newOwnerName = nextOwner.user_id;
                        
                        // 3. Update Room Owner
                        // We need the new owner's role. Since we can't easily get it here without querying Login Worker,
                        // we'll default to 'user' or keep the old role? Better to set to 'user' to be safe,
                        // or try to fetch role. For now, we set 'user' and let them upgrade later if needed.
                        // Ideally, we should fetch the new owner's role.
                        
                        await env.CHAT_DB.prepare(
                            "UPDATE rooms SET owner = ?, owner_role = 'user' WHERE id = ?"
                        ).bind(newOwnerName, room.id).run();

                        transferLog.push({ roomId: room.id, from: oldOwner, to: newOwnerName });

                        // 4. Notify New Owner (via System Message in Room)
                        // We can inject a system message into the room.
                        // When the new owner connects, they will see this message.
                        const sysMsg = `System: Room ownership has been transferred to ${newOwnerName} because the previous owner left.`;
                        
                        // Encrypt system message (using a system key or just plain text if system messages are special)
                        // Our system currently expects encrypted messages.
                        // For simplicity, we might need a way to insert unencrypted system messages or use a known key.
                        // Since we don't have the room key here easily (it's not in DB, only hash is in DO),
                        // we can't encrypt it properly for clients to decrypt without the key.
                        // ALTERNATIVE: Use the DO to broadcast. The DO has the key hash but not the key itself.
                        // Actually, clients decrypt. If we send a message, we need to encrypt it with the Room Key.
                        // But we don't have the Room Key! It was returned to the creator once.
                        // So we CANNOT send an encrypted message that others can read unless we stored the key (which we didn't).
                        
                        // SOLUTION: Use a special "plaintext" system message type that the frontend handles without decryption.
                        // Current frontend:
                        // if (data.type === 'system') { setMessages(..., content: data.content) }
                        // So we can just insert a system message record or send via DO.
                        
                        // Let's send via DO to broadcast immediately if active, and also store in DB for history.
                        const id = env.CHAT_ROOM.idFromName(room.id.toString());
                        const stub = env.CHAT_ROOM.get(id);
                        
                        // We need to tell DO to broadcast this system message.
                        // And DO or we should save it to DB.
                        // Let's let DO handle it.
                        ctx.waitUntil(stub.fetch("http://internal/broadcast-system", {
                            method: "POST",
                            body: JSON.stringify({ content: sysMsg })
                        }));

                        // Also log this transfer
                        try {
                            const logDetails = await encryptLogData({
                                action: 'ownership_transfer',
                                roomId: room.id,
                                previousOwner: oldOwner,
                                newOwner: newOwnerName
                            });
                            await env.CHAT_DB.prepare(
                                "INSERT INTO activity_logs (event_type, user_id, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?)"
                            ).bind('ownership_transfer', 'system', logDetails, 'internal', Date.now()).run();
                        } catch (e) { console.error("Logging failed", e); }

                    } else {
                        // No other members, delete the room
                        await env.CHAT_DB.prepare("DELETE FROM messages WHERE room_id = ?").bind(room.id).run();
                        await env.CHAT_DB.prepare("DELETE FROM room_members WHERE room_id = ?").bind(room.id).run();
                        await env.CHAT_DB.prepare("DELETE FROM chat_sessions WHERE room_id = ?").bind(room.id).run();
                        await env.CHAT_DB.prepare("DELETE FROM rooms WHERE id = ?").bind(room.id).run();
                        
                        const id = env.CHAT_ROOM.idFromName(room.id.toString());
                        const stub = env.CHAT_ROOM.get(id);
                        ctx.waitUntil(stub.fetch("http://internal/destroy", { method: "POST" }));
                        
                        transferLog.push({ roomId: room.id, action: 'deleted', reason: 'no_members' });
                    }
                }

                return new Response(JSON.stringify({ success: true, transfers: transferLog }), { headers: { "Content-Type": "application/json" } });

            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { "Content-Type": "application/json" } });
            }
        }

        // --- 5. Admin Logs API (GET /api/admin/logs) ---
        if (request.method === "GET" && url.pathname === "/api/admin/logs") {
            try {
                const user = await getUserFromRequest(request, env);
                if (!user) return new Response(JSON.stringify({ error: "Unauthorized", message: "请先登录" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

                const role = getEffectiveRole(user);
                // Only owner and admin can access logs
                if (!['owner', 'admin'].includes(role)) {
                    return new Response(JSON.stringify({ error: "Forbidden", message: "权限不足" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
                }

                // Parse query parameters
                const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);
                const offset = parseInt(url.searchParams.get('offset') || '0');
                const eventType = url.searchParams.get('type'); // Optional filter

                let query = "SELECT * FROM activity_logs";
                let params = [];
                
                if (eventType) {
                    query += " WHERE event_type = ?";
                    params.push(eventType);
                }
                
                query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
                params.push(limit, offset);

                const { results } = await env.CHAT_DB.prepare(query).bind(...params).all();

                // Decrypt log details for admin viewing
                const decryptedLogs = await Promise.all((results || []).map(async (log) => {
                    let decryptedDetails = null;
                    try {
                        if (log.details) {
                            decryptedDetails = await decryptLogData(log.details);
                        }
                    } catch (e) {
                        decryptedDetails = { error: 'Decryption failed' };
                    }
                    return {
                        id: log.id,
                        event_type: log.event_type,
                        user_id: log.user_id,
                        details: decryptedDetails,
                        ip_address: log.ip_address,
                        created_at: log.created_at
                    };
                }));

                // Get total count for pagination
                let countQuery = "SELECT COUNT(*) as total FROM activity_logs";
                if (eventType) {
                    countQuery += " WHERE event_type = ?";
                }
                const countResult = await env.CHAT_DB.prepare(countQuery).bind(...(eventType ? [eventType] : [])).first();

                return new Response(JSON.stringify({
                    logs: decryptedLogs,
                    total: countResult?.total || 0,
                    limit,
                    offset
                }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

            } catch (e) {
                return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: corsHeaders });
            }
        }

        return new Response(JSON.stringify({ error: "Not Found", message: "页面不存在" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    },

    // --- Scheduled Cleanup ---
    async scheduled(event, env, ctx) {
        // 1. Emergency Cleanup (Fail-safe)
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
                    await env.CHAT_DB.prepare("DELETE FROM messages WHERE room_id = ?").bind(roomId).run();
                    await env.CHAT_DB.prepare("DELETE FROM rooms WHERE id = ?").bind(roomId).run();
                    const id = env.CHAT_ROOM.idFromName(roomId.toString());
                    const stub = env.CHAT_ROOM.get(id);
                    ctx.waitUntil(stub.fetch("http://internal/destroy", { method: "POST" }));
                } catch(e) { console.error("Emergency cleanup failed for room", roomId, e); }
            }
        }

        // 2. Routine Message Cleanup (Moved to Durable Object Alarms)
    }
};
