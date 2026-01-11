import { encryptMessage, importRoomKey, getTierLimits, getEffectiveRole } from './utils.js';

export class ChatRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Set();
    this.rateLimits = new Map(); // username -> { count, startTime, history: [] }
  }

  async fetch(request) {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      const roomKey = url.searchParams.get("key");
      const username = url.searchParams.get("username");
      const role = url.searchParams.get("role");
      const sinceParam = url.searchParams.get("since");
      const sinceTimestamp = sinceParam ? parseInt(sinceParam, 10) : 0;

      if (!roomKey) return new Response("Missing Room Key", { status: 400 });
      if (!username) return new Response("Unauthorized", { status: 401 });

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Handle Session (awaiting not strictly necessary for handshake but good for flow)
      await this.handleSession(server, username, role, roomKey, sinceTimestamp);

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

  async handleSession(webSocket, username, role, clientKey, sinceTimestamp = 0) {
    webSocket.accept();
    this.sessions.add(webSocket);

    // Verify Key Hash (Strict Mode)
    const storedHash = await this.state.storage.get("keyHash");
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

    const storedRoomId = await this.state.storage.get("roomId");
    const roomId = storedRoomId || 0;

    // --- Session Tracking: Start ---
    let sessionId = null;
    try {
        const res = await this.env.CHAT_DB.prepare(
            "INSERT INTO chat_sessions (room_id, user_id, start_time) VALUES (?, ?, ?) RETURNING id"
        ).bind(roomId, username, Date.now()).first();
        sessionId = res.id;
    } catch (e) {
        console.error("Session start failed", e);
    }

    // --- Load History ---
    try {
        let messages;
        if (sinceTimestamp > 0) {
            // Incremental sync: only fetch messages after the given timestamp
            messages = await this.env.CHAT_DB.prepare(
                `SELECT iv, content, sender, created_at as timestamp
                 FROM messages
                 WHERE room_id = ? AND created_at > ?
                 ORDER BY created_at ASC
                 LIMIT 500`
            ).bind(roomId, sinceTimestamp).all();
            
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
                `SELECT iv, content, sender, created_at as timestamp
                 FROM messages
                 WHERE room_id = ?
                 ORDER BY created_at DESC
                 LIMIT 100`
            ).bind(roomId).all();

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


    // Rate Limit Setup
    const limits = getTierLimits(role);

    // Emergency Room Override
    if (storedRoomId == 1) {
         if (['fish', 'smaiclubadmin'].includes(username)) {
             // Unlimited
         } else {
             limits.rateLimit = { count: 1, window: 3600 * 1000 }; // 1 message per hour
         }
    }

    webSocket.addEventListener("message", async (event) => {
      try {
        const msg = JSON.parse(event.data);

        // Rate Limit Check
        if (!this.checkRateLimit(username, limits.rateLimit)) {
             webSocket.send(JSON.stringify({ error: "发言频率过快" }));
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
                // Now uses PBKDF2 derivation internally in utils.js
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

    webSocket.addEventListener("close", async () => {
      this.sessions.delete(webSocket);
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

          await this.env.CHAT_DB.prepare(
              `DELETE FROM messages
               WHERE id IN (
                   SELECT id FROM messages
                   WHERE room_id = ? AND created_at < ?
                   ORDER BY created_at ASC
                   LIMIT ?
               )`
          ).bind(roomId, deleteCutoff, deleteBatch).run();

      } catch (e) {
          console.error("Alarm cleanup failed", e);
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
}
