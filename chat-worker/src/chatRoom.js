export class ChatRoom {
    constructor(state, env) {
        this.state = state;
        this.env = env;
        this.sessions = [];
        this.roomId = null; // Will be set on first request
    }

    async fetch(request) {
        const url = new URL(request.url);
        // Extract room ID from path if needed, or assume this DO instance IS the room
        // request.url structure: https://.../api/room/:roomId/...
        const pathParts = url.pathname.split('/');
        this.roomId = pathParts[3]; // /api/room/LOBBY/...

        if (url.pathname.endsWith("/websocket")) {
            // Handle WebSocket upgrade
            if (request.headers.get("Upgrade") !== "websocket") {
                return new Response("Expected Upgrade: websocket", { status: 426 });
            }

            const { 0: client, 1: server } = new WebSocketPair();
            await this.handleSession(server, request);

            return new Response(null, { status: 101, webSocket: client });
        }

        // Handle regular API calls (e.g. get history)
        // Although Worker can do this directly from D1, doing it here ensures consistency if we cache in memory
        if (request.method === "GET") {
             const messages = await this.env.DB.prepare(
                "SELECT * FROM messages WHERE room_id = ? ORDER BY created_at DESC LIMIT 50"
             ).bind(this.roomId).all();
             return new Response(JSON.stringify(messages.results), { headers: { "Content-Type": "application/json" }});
        }

        return new Response("Not found", { status: 404 });
    }

    async handleSession(webSocket, request) {
        webSocket.accept();

        // Retrieve user info passed from Worker (e.g. via headers or query param)
        // Ideally the Worker verified the cookie and passed the username/role
        const url = new URL(request.url);
        const username = url.searchParams.get("username") || "Anonymous";
        const role = url.searchParams.get("role") || "user";

        const session = { webSocket, username, role };
        this.sessions.push(session);

        // Broadcast join message
        this.broadcast({ type: "system", content: \`\${username} 加入了聊天室\` });

        webSocket.addEventListener("message", async (event) => {
            try {
                const data = JSON.parse(event.data);

                // Construct message object
                const msg = {
                    type: "chat",
                    username: username,
                    role: role,
                    content: data.content,
                    created_at: Date.now(),
                    id: crypto.randomUUID() // Temporary ID
                };

                // Save to D1
                try {
                    await this.env.DB.prepare(
                        "INSERT INTO messages (room_id, username, role, content, created_at) VALUES (?, ?, ?, ?, ?)"
                    ).bind(this.roomId, username, role, data.content, msg.created_at).run();
                } catch (e) {
                    console.error("D1 Insert Error:", e);
                }

                // Broadcast
                this.broadcast(msg);

            } catch (err) {
                console.error("WebSocket message error:", err);
            }
        });

        webSocket.addEventListener("close", () => {
            this.sessions = this.sessions.filter(s => s !== session);
            this.broadcast({ type: "system", content: \`\${username} 离开了聊天室\` });
        });
    }

    broadcast(message) {
        const msgString = JSON.stringify(message);
        this.sessions = this.sessions.filter(session => {
            try {
                session.webSocket.send(msgString);
                return true;
            } catch (err) {
                return false;
            }
        });
    }
}
