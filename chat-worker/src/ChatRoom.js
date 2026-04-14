import { getTierLimits, encryptLogData } from './utils.js';

const MAX_CONNECTIONS_PER_IP_PER_ROOM = 20;

export class ChatRoom {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.sessions = new Set();
        this.rateLimits = new Map(); // username -> { count, startTime, history: [] }
        this.ipConnections = new Map(); // ip -> count
    }

    async fetch(request) {
        const url = new URL(request.url);

        // WebSocket upgrade
        if (request.headers.get("Upgrade") === "websocket") {
            const username = url.searchParams.get("username");
            const role = url.searchParams.get("role");
            const avatarUrl = url.searchParams.get("avatarUrl") || '';
            const ip = url.searchParams.get("ip") || 'unknown';
            const sinceParam = url.searchParams.get("since");
            const sinceTimestamp = sinceParam ? parseInt(sinceParam, 10) : 0;

            // Get salt and iterations from query params (passed by Worker)
            const salt = url.searchParams.get("salt") || 'SMAICLUB_CHAT_SALT';
            const iterations = parseInt(url.searchParams.get("iterations") || '10000', 10);

            if (!username) return new Response("Unauthorized", { status: 401 });
            if (!this.canAcceptIp(ip)) return new Response("Too many connections", { status: 429 });

            const pair = new WebSocketPair();
            const [client, server] = Object.values(pair);

            // Handle Session (awaiting not strictly necessary for handshake but good for flow)
            await this.handleSession(server, username, role, sinceTimestamp, avatarUrl, salt, iterations, ip);

            return new Response(null, { status: 101, webSocket: client });
        }

        // Internal API to initialize room (called by Worker on creation)
        if (url.pathname === "/init") {
            if (request.method === "POST") {
                const { accessHash, keyHash, roomId, salt, iterations } = await request.json();
                // Store roomId, access verifier, salt, iterations
                if (accessHash) await this.state.storage.put("accessHash", accessHash);
                if (keyHash) await this.state.storage.put("keyHash", keyHash);
                await this.state.storage.put("roomId", roomId);
                if (salt) await this.state.storage.put("salt", salt);
                if (iterations) await this.state.storage.put("iterations", iterations);
                return new Response("OK");
            }
        }

        // Internal API to destroy room (called by Worker on cleanup)
        if (url.pathname === "/destroy") {
            if (request.method === "POST") {
                // Broadcast system message
                const shutdownMsg = JSON.stringify({
                    type: "system",
                    content: "Room has been closed.",
                    timestamp: Date.now()
                });

                this.sessions.forEach(ws => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(shutdownMsg);
                        ws.close(1000, "Room Deleted");
                    }
                });
                this.sessions.clear();

                // Clear Storage
                await this.state.storage.deleteAll();

                return new Response("OK");
            }
        }

        // Internal API to broadcast system message (called by Worker on ownership transfer)
        if (url.pathname === "/broadcast-system") {
            if (request.method === "POST") {
                const { content } = await request.json();
                const msg = JSON.stringify({
                    type: "system",
                    content: content,
                    timestamp: Date.now()
                });

                this.sessions.forEach(ws => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(msg);
                    }
                });

                // Also save to DB so new joiners see it
                // We store it as a special message with 'SYSTEM' sender and empty IV/Content that frontend handles?
                // No, the current frontend expects encrypted content unless type is 'system' (which comes from websocket).
                // But history API returns rows from 'messages' table.
                // If we want history to include system messages, we need to insert them into 'messages' table.
                // But 'messages' table has 'iv' and 'content' columns which are usually encrypted strings.
                // We can repurpose them: iv="SYSTEM", content=plaintext.
                // And update frontend to handle this.
                // Or, just don't save to history for now to keep it simple, as the modal/alert requirement
                // implies a one-time notification or we rely on the live broadcast.
                // The prompt says: "Implement a notification trigger so that when the new owner next enters... a modal/alert is displayed"
                // This implies persistent state.
                // We can't easily query "next enter" without a DB flag.
                // Let's rely on the system message in chat for now, which is simpler and effective.
                // If we want persistence, we'd need a 'notifications' table.
                // Given the constraints, a live broadcast covers active users.
                // For offline users, they won't see it unless we persist.
                // Let's persist as a special message: sender='SYSTEM', iv='SYSTEM', content=plain_text

                try {
                    const roomId = await this.state.storage.get("roomId");
                    if (roomId) {
                        await this.env.CHAT_DB.prepare(
                            "INSERT INTO messages (room_id, iv, content, sender, created_at) VALUES (?, 'SYSTEM', ?, 'SYSTEM', ?)"
                        ).bind(roomId, content, Date.now()).run();
                    }
                } catch (e) { console.error("Failed to persist system message", e); }

                return new Response("OK");
            }
        }

        return new Response("Not found", { status: 404 });
    }

    async handleSession(webSocket, username, role, sinceTimestamp = 0, avatarUrl = '', salt = 'SMAICLUB_CHAT_SALT', iterations = 10000, ip = 'unknown') {
        webSocket.accept();
        this.sessions.add(webSocket);
        this.incrementIp(ip);

        const authNonce = crypto.randomUUID();
        const storedAccessHash = await this.state.storage.get("accessHash");
        const storedHash = await this.state.storage.get("keyHash");

        // Try to get salt/iterations from storage if not passed correctly (redundancy)
        const storedSalt = await this.state.storage.get("salt");
        const storedIterations = await this.state.storage.get("iterations");

        const finalSalt = storedSalt || salt;
        const finalIterations = storedIterations || iterations;

        // Send Handshake Info (Salt & Iterations)
        webSocket.send(JSON.stringify({
            type: 'handshake',
            salt: finalSalt,
            iterations: finalIterations,
            requiresAuth: true,
            nonce: authNonce
        }));

        const storedRoomId = await this.state.storage.get("roomId");
        const roomId = storedRoomId || 0;
        let isAuthorized = false;
        let sessionId = null;

        const loadHistory = async () => {
            try {
            const historyRoomId = await this.state.storage.get("roomId") || roomId;
            let messages;
            if (sinceTimestamp > 0) {
                // Incremental sync: only fetch messages after the given timestamp
                messages = await this.env.CHAT_DB.prepare(
                    `SELECT iv, content, sender, sender_role as senderRole, sender_avatar as senderAvatar, created_at as timestamp
                 FROM messages
                 WHERE room_id = ? AND created_at > ?
                 ORDER BY created_at ASC
                 LIMIT 500`
                ).bind(historyRoomId, sinceTimestamp).all();

                if (messages.results && messages.results.length > 0) {
                    webSocket.send(JSON.stringify({
                        type: 'history_incremental',
                        messages: messages.results,
                        since: sinceTimestamp
                    }));
                } else {
                    // No new messages, send empty incremental response
                    webSocket.send(JSON.stringify({
                        type: 'history_incremental',
                        messages: [],
                        since: sinceTimestamp
                    }));
                }
            } else {
                // Full sync: fetch recent messages (last 100)
                messages = await this.env.CHAT_DB.prepare(
                    `SELECT iv, content, sender, sender_role as senderRole, sender_avatar as senderAvatar, created_at as timestamp
                 FROM messages
                 WHERE room_id = ?
                 ORDER BY created_at DESC
                 LIMIT 100`
                ).bind(historyRoomId).all();

                if (messages.results && messages.results.length > 0) {
                    // Reverse to get chronological order (oldest first)
                    const chronologicalMessages = messages.results.reverse();
                    webSocket.send(JSON.stringify({
                        type: 'history',
                        messages: chronologicalMessages
                    }));
                }
            }
            } catch (e) {
                console.error("History load failed", e);
            }
        };

        const startAuthorizedSession = async () => {
            if (sessionId) return sessionId;
            const authorizedRoomId = await this.state.storage.get("roomId") || roomId;
            try {
                const res = await this.env.CHAT_DB.prepare(
                    "INSERT INTO chat_sessions (room_id, user_id, start_time) VALUES (?, ?, ?) RETURNING id"
                ).bind(authorizedRoomId, username, Date.now()).first();
                sessionId = res.id;
            } catch (e) {
                console.error("Session start failed", e);
            }

            try {
                const logDetails = await encryptLogData({
                    action: 'login',
                    roomId: authorizedRoomId,
                    sessionId: sessionId
                });
                await this.env.CHAT_DB.prepare(
                    "INSERT INTO activity_logs (event_type, user_id, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?)"
                ).bind('login', username, logDetails, 'websocket', Date.now()).run();
            } catch (e) { console.error("Logging failed", e); }

            return sessionId;
        };


        // Rate Limit Setup
        const tierLimits = getTierLimits(role);
        const limits = {
            ...tierLimits,
            rateLimit: { ...tierLimits.rateLimit }
        };

        // Emergency Room Override
        if (storedRoomId == 1) {
            if (['admin', 'owner'].includes(role)) {
                // Unlimited for specific users and admin/owner roles
            } else {
                limits.rateLimit = { count: 1, window: 3600 * 1000 }; // 1 message per hour for others
            }
        }

        webSocket.addEventListener("message", async (event) => {
            try {
                const msg = JSON.parse(event.data);

                if (msg.type === 'auth') {
                    if (isAuthorized) return;
                    const signature = typeof msg.signature === 'string' ? msg.signature : '';
                    const legacySignature = typeof msg.legacySignature === 'string' ? msg.legacySignature : '';
                    if (await this.isAuthorizedSignature(storedAccessHash, storedHash, authNonce, signature, legacySignature)) {
                        isAuthorized = true;
                        await startAuthorizedSession();
                        const authorizedRoomId = await this.state.storage.get("roomId");
                        if (authorizedRoomId == 1 && !['admin', 'owner'].includes(role)) {
                            limits.rateLimit = { count: 1, window: 3600 * 1000 };
                        }
                        webSocket.send(JSON.stringify({ type: 'auth_ok' }));
                        await loadHistory();
                    } else {
                        webSocket.send(JSON.stringify({ error: "Invalid Room Key" }));
                        webSocket.close(1008, "Invalid Room Key");
                    }
                    return;
                }

                if (!isAuthorized) {
                    webSocket.send(JSON.stringify({ error: "AUTH_REQUIRED", message: "请先完成房间密钥验证" }));
                    return;
                }

                // Rate Limit Check
                if (!this.checkRateLimit(username, limits.rateLimit)) {
                    webSocket.send(JSON.stringify({ error: "RATE_LIMIT_EXCEEDED", message: "发言频率过快，请稍后再试" }));

                    // Log Rate Limit (without content)
                    try {
                        const intId = await this.state.storage.get("roomId") || 0;
                        const logDetails = await encryptLogData({
                            action: 'rate_limit_exceeded',
                            roomId: intId
                        });
                        await this.env.CHAT_DB.prepare(
                            "INSERT INTO activity_logs (event_type, user_id, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?)"
                        ).bind('rate_limit', username, logDetails, 'websocket', Date.now()).run();
                    } catch (e) { console.error("Logging failed", e); }

                    return;
                }

                const encrypted = normalizeEncryptedMessage(msg);
                if (!encrypted) {
                    webSocket.send(JSON.stringify({ error: "INVALID_MESSAGE", message: "消息格式无效" }));
                    return;
                }

                // Retrieve Room ID
                const intId = await this.state.storage.get("roomId") || 0;

                // --- ENFORCE STORAGE CAP (Total Count Limit) ---
                try {
                    // Check total count
                    const countRes = await this.env.CHAT_DB.prepare(
                        "SELECT COUNT(*) as count FROM messages WHERE room_id = ?"
                    ).bind(intId).first();

                    const currentCount = countRes.count;
                    const maxStorage = limits.msgStorage;

                    if (currentCount >= maxStorage) {
                        // Delete enough messages to make space for the new one (and clear any excess)
                        // We want final count to be maxStorage (after insert), so we need currentCount - maxStorage + 1 deleted.
                        const deleteCount = (currentCount - maxStorage) + 1;

                        if (deleteCount > 0) {
                            // Delete oldest 'deleteCount' messages
                            await this.env.CHAT_DB.prepare(
                                `DELETE FROM messages
                             WHERE id IN (
                                 SELECT id FROM messages
                                 WHERE room_id = ?
                                 ORDER BY created_at ASC
                                 LIMIT ?
                             )`
                            ).bind(intId, deleteCount).run();
                        }
                    }

                    // Insert New Message with sender role
                    const timestamp = Date.now();
                    const result = await this.env.CHAT_DB.prepare(
                        `INSERT INTO messages (room_id, iv, content, sender, sender_role, sender_avatar, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
                    ).bind(intId, encrypted.iv, encrypted.content, username, role, avatarUrl || null, timestamp).run();

                    if (!result.success) throw new Error("DB Write Failed");

                    // Send ACK back to sender
                    if (msg.tempId) {
                        webSocket.send(JSON.stringify({
                            type: 'ack',
                            tempId: msg.tempId,
                            serverTimestamp: timestamp,
                            success: true
                        }));
                    }

                } catch (e) {
                    // TRIGGER EMERGENCY MODE
                    webSocket.send(JSON.stringify({
                        error: "EMERGENCY_MODE",
                        message: "Operation failed. Contact Smaiclub Admin or enter Room ID 000001 (Key: smaiclub_issues)."
                    }));
                    return;
                }

                // Log Message Event (Async)
                try {
                    const logDetails = await encryptLogData({
                        action: 'message',
                        roomId: intId,
                        contentLength: encrypted.content.length,
                        encryptedContent: encrypted.content
                    });
                    await this.env.CHAT_DB.prepare(
                        "INSERT INTO activity_logs (event_type, user_id, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?)"
                    ).bind('message', username, logDetails, 'websocket', Date.now()).run();
                } catch (e) { console.error("Logging failed", e); }

                // Broadcast with role information and avatar
                const broadcastPayload = JSON.stringify({
                    iv: encrypted.iv,
                    content: encrypted.content,
                    sender: username,
                    senderRole: role, // Include sender's role for badge display
                    senderAvatar: avatarUrl || null, // Include sender's avatar URL
                    timestamp: Date.now(),
                    tempId: msg.tempId // Include tempId for deduplication on sender side
                });

                this.sessions.forEach(ws => {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(broadcastPayload);
                    }
                });

            } catch (err) {
                webSocket.send(JSON.stringify({ error: err.message }));
            }
        });

        webSocket.addEventListener("close", async () => {
            this.sessions.delete(webSocket);
            this.decrementIp(ip);
            // --- Session Tracking: End ---
            if (sessionId) {
                try {
                    await this.env.CHAT_DB.prepare(
                        "UPDATE chat_sessions SET end_time = ? WHERE id = ?"
                    ).bind(Date.now(), sessionId).run();
                } catch (e) {
                    console.error("Session end failed", e);
                }
            }
        });

        // Ensure cleanup alarm is scheduled
        this.scheduleCleanup();
    }

    async scheduleCleanup() {
        // Schedule next alarm if not already scheduled
        // We check roughly once a day for cleanup
        const currentAlarm = await this.state.storage.getAlarm();
        if (currentAlarm === null) {
            // Set alarm for 24 hours from now
            this.state.storage.setAlarm(Date.now() + 24 * 60 * 60 * 1000);
        }
    }

    async alarm() {
        // Perform Time-based Cleanup
        try {
            const roomId = await this.state.storage.get("roomId");
            if (!roomId) return;

            // 1. Get Room Owner Role & Created At
            const room = await this.env.CHAT_DB.prepare(
                "SELECT created_at, owner_role FROM rooms WHERE id = ?"
            ).bind(roomId).first();

            if (!room) return;

            const limits = getTierLimits(room.owner_role || 'user');
            const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
            const now = Date.now();

            // 2. Calculate Avg Msg/Week
            let weeksAlive = (now - room.created_at) / ONE_WEEK;
            if (weeksAlive < 1) weeksAlive = 1;

            const msgCountRes = await this.env.CHAT_DB.prepare(
                "SELECT COUNT(*) as count FROM messages WHERE room_id = ?"
            ).bind(roomId).first();

            const avgMsgPerWeek = msgCountRes.count / weeksAlive;

            // 3. Determine Delete Batch Size
            let deleteBatch = 5;
            if (avgMsgPerWeek > 1000) deleteBatch = 100;
            else if (avgMsgPerWeek > 400) deleteBatch = 50;
            else if (avgMsgPerWeek > 50) deleteBatch = 20;

            // 4. Perform Deletion (Gradual Decay of Expired Messages)
            const deleteCutoff = now - limits.autoDeleteTime;

            const result = await this.env.CHAT_DB.prepare(
                `DELETE FROM messages
               WHERE id IN (
                   SELECT id FROM messages
                   WHERE room_id = ? AND created_at < ?
                   ORDER BY created_at ASC
                   LIMIT ?
               )`
            ).bind(roomId, deleteCutoff, deleteBatch).run();

            if (result.meta.changes > 0) {
                try {
                    const logDetails = await encryptLogData({
                        action: 'cleanup_messages',
                        roomId: roomId,
                        deletedCount: result.meta.changes,
                        reason: 'auto_decay'
                    });
                    await this.env.CHAT_DB.prepare(
                        "INSERT INTO activity_logs (event_type, user_id, details, ip_address, created_at) VALUES (?, ?, ?, ?, ?)"
                    ).bind('cleanup', 'system', logDetails, 'internal', Date.now()).run();
                } catch (logErr) {
                    console.error("Cleanup logging failed", logErr);
                }
            }

        } catch (e) {
            console.error("Alarm cleanup failed", e);
        }

        // 5. Cleanup Rate Limits (Memory Management)
        try {
            // Cleanup entries older than 5 minutes
            const CUTOFF = 5 * 60 * 1000;
            for (const [username, record] of this.rateLimits.entries()) {
                // Filter out old timestamps
                record.history = record.history.filter(t => Date.now() - t < CUTOFF);
                // If empty, delete the user entry
                if (record.history.length === 0) {
                    this.rateLimits.delete(username);
                }
            }
        } catch (e) {
            console.error("Rate limit cleanup failed", e);
        }

        // Reschedule for next day
        this.state.storage.setAlarm(Date.now() + 24 * 60 * 60 * 1000);
    }

    checkRateLimit(username, limitConfig) {
        const { count, window } = limitConfig;
        if (window === 0) return true; // No limit

        const now = Date.now();
        let record = this.rateLimits.get(username);

        if (!record) {
            record = { history: [] };
            this.rateLimits.set(username, record);
        }

        // Remove timestamps outside the window
        record.history = record.history.filter(t => now - t < window);

        if (record.history.length >= count) return false;

        record.history.push(now);
        return true;
    }

    canAcceptIp(ip) {
        return (this.ipConnections.get(ip) || 0) < MAX_CONNECTIONS_PER_IP_PER_ROOM;
    }

    incrementIp(ip) {
        this.ipConnections.set(ip, (this.ipConnections.get(ip) || 0) + 1);
    }

    decrementIp(ip) {
        const next = (this.ipConnections.get(ip) || 1) - 1;
        if (next <= 0) this.ipConnections.delete(ip);
        else this.ipConnections.set(ip, next);
    }

    async isAuthorizedSignature(storedAccessHash, legacyStoredHash, nonce, suppliedSignature, legacySignature) {
        if (storedAccessHash) {
            return timingSafeEqualHex(await hmacSha256Hex(storedAccessHash, nonce), suppliedSignature);
        }

        if (legacyStoredHash) {
            return timingSafeEqualHex(await hmacSha256Hex(legacyStoredHash, nonce), legacySignature);
        }

        const emergencyAccessHash = await sha256Hex('SMAICLUB_CHAT_ACCESS:smaiclub_issues');
        if (timingSafeEqualHex(await hmacSha256Hex(emergencyAccessHash, nonce), suppliedSignature)) {
            await this.state.storage.put("roomId", 1);
            return true;
        }
        return false;
    }
}

function normalizeEncryptedMessage(msg) {
    if (!msg || typeof msg.iv !== 'string' || typeof msg.content !== 'string') return null;
    if (!isBase64(msg.iv) || !isBase64(msg.content)) return null;
    if (msg.iv.length > 256 || msg.content.length > 20000) return null;
    return { iv: msg.iv, content: msg.content };
}

function isBase64(value) {
    return /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

async function sha256Hex(value) {
    const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(secretHex, value) {
    const key = await crypto.subtle.importKey(
        "raw",
        hexToBytes(secretHex),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
    return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
    const normalized = typeof hex === 'string' ? hex : '';
    const match = normalized.match(/.{1,2}/g);
    return new Uint8Array(match ? match.map(byte => parseInt(byte, 16)) : []);
}

function timingSafeEqualHex(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    let diff = a.length ^ b.length;
    const length = Math.max(a.length, b.length);
    for (let i = 0; i < length; i++) {
        diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
    }
    return diff === 0;
}
