import { encryptMessage, importRoomKey, getTierLimits, getEffectiveRole } from './utils.js';

export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
    this.rateLimits = new Map(); // username -> { count, startTime }
  }

  async fetch(request) {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      const roomKey = url.searchParams.get("key");
      const username = url.searchParams.get("username");
      const role = url.searchParams.get("role");

      if (!roomKey) return new Response("Missing Room Key", { status: 400 });
      if (!username) return new Response("Unauthorized", { status: 401 });

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      await this.handleSession(server, username, role, roomKey);

      return new Response(null, { status: 101, webSocket: client });
    }

    // Internal API to initialize room (called by Worker on creation)
    if (url.pathname === "/init") {
        if (request.method === "POST") {
            const { keyHash, roomId } = await request.json();
            // Store roomId and keyHash
            await this.state.storage.put("keyHash", keyHash);
            await this.state.storage.put("roomId", roomId);
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

    return new Response("Not found", { status: 404 });
  }

  async handleSession(webSocket, username, role, clientKey) {
    webSocket.accept();
    this.sessions.add(webSocket);

    // Verify Key Hash (Strict Mode)
    const storedHash = await this.state.storage.get("keyHash");
    // const roomId = this.state.id.toString();

    let isAuthorized = false;

    if (storedHash) {
        // Normal verification
        const enc = new TextEncoder();
        const data = enc.encode(clientKey);
        const hashBuffer = await crypto.subtle.digest("SHA-256", data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

        if (hashHex === storedHash) {
            isAuthorized = true;
        }
    } else {
        // Fallback for Emergency Room (Room 1)
        if (clientKey === 'smaiclub_issues') {
             await this.state.storage.put("roomId", 1);
             isAuthorized = true;
        }
    }

    if (!isAuthorized) {
         webSocket.send(JSON.stringify({ error: "Invalid Room Key" }));
         webSocket.close(1008, "Invalid Room Key");
         this.sessions.delete(webSocket);
         return;
    }

    // Rate Limit Setup
    const limits = getTierLimits(role);
    const storedRoomId = await this.state.storage.get("roomId");

    // Emergency Room Override
    if (storedRoomId == 1) {
         if (['fish', 'smaiclubadmin'].includes(username)) {
             // Unlimited
         } else {
             limits.msgLimit = 2;
         }
    }

    webSocket.addEventListener("message", async (event) => {
      try {
        const msg = JSON.parse(event.data);

        // Rate Limit Check
        if (!this.checkRateLimit(username, limits.msgLimit)) {
             webSocket.send(JSON.stringify({ error: "Rate limit exceeded" }));
             return;
        }

        // Validate Key (Encryption Test)
        let cryptoKey;
        try {
            if (clientKey === 'smaiclub_issues') {
                 const enc = new TextEncoder();
                 const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(clientKey), "PBKDF2", false, ["deriveKey"]);
                 cryptoKey = await crypto.subtle.deriveKey(
                    { name: "PBKDF2", salt: enc.encode("SALT_FOR_ISSUES"), iterations: 1000, hash: "SHA-256" },
                    keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
                 );
            } else {
                cryptoKey = await importRoomKey(clientKey);
            }
        } catch (e) {
            webSocket.send(JSON.stringify({ error: "Invalid Key Format" }));
            return;
        }

        // Encrypt
        const encrypted = await encryptMessage(cryptoKey, msg.content, username);

        // Retrieve Room ID
        const intId = await this.state.storage.get("roomId") || 0;

        // --- ENFORCE STORAGE CAP (7-Day Rolling Window) ---
        // "If a room exceeds the "Msg Storage Cap" within a 7-day rolling window, oldest messages in that window should be dropped."
        try {
            const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
            const windowStart = Date.now() - SEVEN_DAYS;

            // Check current count in window
            const countRes = await this.env.CHAT_DB.prepare(
                "SELECT COUNT(*) as count FROM messages WHERE room_id = ? AND created_at > ?"
            ).bind(intId, windowStart).first();

            if (countRes.count >= limits.msgStorage) {
                // Find and delete the oldest message in this window
                // Note: Deleting just one or batch? Requirement says "oldest messages... should be dropped".
                // We delete the oldest ONE to make space for the NEW one.
                const oldest = await this.env.CHAT_DB.prepare(
                    "SELECT id FROM messages WHERE room_id = ? AND created_at > ? ORDER BY created_at ASC LIMIT 1"
                ).bind(intId, windowStart).first();

                if (oldest) {
                    await this.env.CHAT_DB.prepare("DELETE FROM messages WHERE id = ?").bind(oldest.id).run();
                }
            }

            // Insert New Message
            const result = await this.env.CHAT_DB.prepare(
                `INSERT INTO messages (room_id, iv, content, sender, created_at) VALUES (?, ?, ?, ?, ?)`
            ).bind(intId, encrypted.iv, encrypted.content, encrypted.sender, Date.now()).run();

            if (!result.success) throw new Error("DB Write Failed");

        } catch (e) {
            // TRIGGER EMERGENCY MODE
            webSocket.send(JSON.stringify({
                error: "EMERGENCY_MODE",
                message: "Operation failed. Contact Smaiclub Admin or enter Room ID 000001 (Key: smaiclub_issues)."
            }));
            return;
        }

        // Broadcast
        const broadcastPayload = JSON.stringify({
            iv: encrypted.iv,
            content: encrypted.content,
            sender: encrypted.sender,
            timestamp: Date.now()
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

    webSocket.addEventListener("close", () => {
      this.sessions.delete(webSocket);
    });
  }

  checkRateLimit(username, limitPerHour) {
      const now = Date.now();
      let record = this.rateLimits.get(username);

      if (!record) {
          record = { count: 0, startTime: now };
          this.rateLimits.set(username, record);
      }

      if (now - record.startTime > 3600000) {
          record.count = 0;
          record.startTime = now;
      }

      if (record.count >= limitPerHour) return false;

      record.count++;
      return true;
  }
}
