export function htmlTemplate() {
    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMAI CLUB | 聊天室</title>
    <!-- Use Auth Script for unified user button -->
    <script src="https://login.smaiclub.top/common-auth.js"></script>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=SF+Pro+Display:wght@300;400;500;600;700&display=swap">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css">
    <style>
        :root {
            --bg-color: #0f0f13;
            --sidebar-bg: #1c1c1e;
            --chat-bg: #000000;
            --message-bg: #2c2c2e;
            --message-own-bg: #0a84ff;
            --text-color: #f5f5f7;
            --text-secondary: #86868b;
            --border-color: #38383a;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }

        body {
            font-family: 'SF Pro Display', sans-serif;
            background: var(--bg-color);
            color: var(--text-color);
            height: 100vh;
            display: flex;
            overflow: hidden;
        }

        /* Layout */
        .app-container {
            display: flex;
            width: 100%;
            height: 100%;
        }

        .sidebar {
            width: 280px;
            background: var(--sidebar-bg);
            border-right: 1px solid var(--border-color);
            display: flex;
            flex-direction: column;
            padding: 20px;
        }

        .main-chat {
            flex: 1;
            display: flex;
            flex-direction: column;
            background: var(--chat-bg);
            position: relative;
        }

        /* Sidebar Elements */
        .sidebar-header {
            margin-bottom: 20px;
            font-size: 20px;
            font-weight: 700;
            color: var(--text-color);
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .room-list {
            list-style: none;
            overflow-y: auto;
        }

        .room-item {
            padding: 12px 15px;
            margin-bottom: 8px;
            background: rgba(255,255,255,0.05);
            border-radius: 10px;
            cursor: pointer;
            transition: background 0.2s;
        }

        .room-item:hover {
            background: rgba(255,255,255,0.1);
        }

        .room-item.active {
            background: var(--message-own-bg);
            color: white;
        }

        .room-name { font-weight: 600; font-size: 15px; }
        .room-desc { font-size: 12px; color: var(--text-secondary); margin-top: 4px; }
        .room-item.active .room-desc { color: rgba(255,255,255,0.8); }

        /* Chat Area */
        .chat-header {
            padding: 15px 25px;
            border-bottom: 1px solid var(--border-color);
            background: rgba(28, 28, 30, 0.8);
            backdrop-filter: blur(20px);
            display: flex;
            justify-content: space-between;
            align-items: center;
            z-index: 10;
        }

        .messages-container {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
            gap: 15px;
        }

        .message {
            display: flex;
            gap: 10px;
            max-width: 70%;
        }

        .message.own {
            align-self: flex-end;
            flex-direction: row-reverse;
        }

        .message-avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            background: #444;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            flex-shrink: 0;
        }

        .message-content {
            background: var(--message-bg);
            padding: 10px 15px;
            border-radius: 18px;
            border-top-left-radius: 2px;
            font-size: 15px;
            line-height: 1.4;
        }

        .message.own .message-content {
            background: var(--message-own-bg);
            border-top-left-radius: 18px;
            border-top-right-radius: 2px;
        }

        .message-meta {
            font-size: 11px;
            color: var(--text-secondary);
            margin-bottom: 4px;
        }
        .message.own .message-meta { text-align: right; }

        .system-message {
            align-self: center;
            background: rgba(255,255,255,0.1);
            padding: 5px 12px;
            border-radius: 10px;
            font-size: 12px;
            color: var(--text-secondary);
        }

        /* Input Area */
        .chat-input-area {
            padding: 20px;
            background: var(--sidebar-bg);
            border-top: 1px solid var(--border-color);
            display: flex;
            gap: 10px;
        }

        #message-input {
            flex: 1;
            background: #2c2c2e;
            border: 1px solid #38383a;
            border-radius: 20px;
            padding: 12px 18px;
            color: white;
            outline: none;
            font-size: 15px;
        }

        #send-btn {
            background: var(--message-own-bg);
            border: none;
            width: 44px;
            height: 44px;
            border-radius: 50%;
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
        }

        /* Auth Button Container */
        .auth-container {
            position: absolute;
            top: 15px;
            right: 20px;
        }
    </style>
</head>
<body>

<div class="app-container">
    <div class="sidebar">
        <div class="sidebar-header">
            <i class="fas fa-comments"></i> SMAI CHAT
        </div>
        <ul class="room-list" id="room-list">
            <!-- Rooms will be loaded here -->
            <li class="room-item">Loading...</li>
        </ul>
    </div>

    <div class="main-chat">
        <div class="chat-header">
            <h3 id="current-room-name">选择一个聊天室</h3>
            <div class="auth-container"></div>
        </div>

        <div class="messages-container" id="messages">
            <!-- Messages go here -->
        </div>

        <div class="chat-input-area">
            <input type="text" id="message-input" placeholder="输入消息..." disabled>
            <button id="send-btn" disabled><i class="fas fa-paper-plane"></i></button>
        </div>
    </div>
</div>

<script>
    let currentSocket = null;
    let currentRoomId = null;
    let userProfile = null;

    // Initialize
    document.addEventListener('DOMContentLoaded', async () => {
        // 1. Check Login
        try {
            const authRes = await fetch('https://login.smaiclub.top/api/me', { credentials: 'include' });
            const authData = await authRes.json();
            if (!authData.loggedIn) {
                alert("请先登录");
                window.location.href = "https://login.smaiclub.top";
                return;
            }
            userProfile = authData;
        } catch (e) {
            console.error("Auth check error", e);
            return;
        }

        // 2. Load Rooms
        loadRooms();
    });

    async function loadRooms() {
        try {
            const res = await fetch('/api/rooms');
            const rooms = await res.json();
            const list = document.getElementById('room-list');
            list.innerHTML = '';

            const roleLevels = { 'user': 0, 'vip': 1, 'svip1': 2, 'svip2': 3 };
            const myLevel = roleLevels[userProfile.role] || 0;

            rooms.forEach(room => {
                const li = document.createElement('li');
                li.className = 'room-item';
                if (myLevel < room.min_role_level) {
                    li.style.opacity = '0.5';
                    li.style.cursor = 'not-allowed';
                    li.title = '权限不足';
                } else {
                    li.onclick = () => joinRoom(room);
                }

                li.innerHTML = \`
                    <div class="room-name">\${room.name} \${room.min_role_level > 0 ? '<i class="fas fa-crown" style="color:gold;font-size:12px"></i>' : ''}</div>
                    <div class="room-desc">\${room.description || ''}</div>
                \`;
                list.appendChild(li);
            });
        } catch (e) {
            console.error("Load rooms failed", e);
        }
    }

    async function joinRoom(room) {
        if (currentRoomId === room.id) return;
        currentRoomId = room.id;

        // UI Update
        document.getElementById('current-room-name').textContent = room.name;
        document.querySelectorAll('.room-item').forEach(el => el.classList.remove('active'));
        // Highlight logic (simplified)

        // Connect WebSocket
        if (currentSocket) currentSocket.close();

        // Load History First
        loadHistory(room.id);

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = \`\${protocol}//\${window.location.host}/api/room/\${room.id}/websocket\`;

        currentSocket = new WebSocket(wsUrl);

        currentSocket.onopen = () => {
            enableInput(true);
            appendSystemMessage("已连接到聊天室");
        };

        currentSocket.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'system') {
                appendSystemMessage(msg.content);
            } else {
                appendMessage(msg);
            }
        };

        currentSocket.onclose = () => {
            enableInput(false);
            appendSystemMessage("连接已断开");
        };
    }

    async function loadHistory(roomId) {
        const container = document.getElementById('messages');
        container.innerHTML = ''; // Clear
        try {
            const res = await fetch(\`/api/room/\${roomId}/history\`); // Need to implement this in Worker if DO doesn't handle it
            // Actually DO handles GET /api/room/... so we might need to adjust fetch URL or Worker routing
            // My Worker routes /api/room/:id to DO. DO fetch handles GET.
            // So fetching /api/room/:id should return history if DO implements it.
            // DO code: if (request.method === "GET") returns history.
            // URL used in fetch: /api/room/lobby (without /websocket suffix).

            const historyRes = await fetch(\`/api/room/\${roomId}\`);
            const history = await historyRes.json();
            // Reverse order because SQL returns DESC
            history.reverse().forEach(msg => appendMessage(msg));
        } catch (e) {
            console.error("Load history error", e);
        }
    }

    function sendMessage() {
        const input = document.getElementById('message-input');
        const content = input.value.trim();
        if (!content || !currentSocket) return;

        currentSocket.send(JSON.stringify({ content }));
        input.value = '';
    }

    // UI Helpers
    function enableInput(enabled) {
        document.getElementById('message-input').disabled = !enabled;
        document.getElementById('send-btn').disabled = !enabled;
    }

    function appendMessage(msg) {
        const container = document.getElementById('messages');
        const div = document.createElement('div');
        const isOwn = msg.username === userProfile.username;
        div.className = \`message \${isOwn ? 'own' : ''}\`;

        const avatarChar = msg.username[0].toUpperCase();

        div.innerHTML = \`
            <div class="message-avatar">\${avatarChar}</div>
            <div>
                <div class="message-meta">\${msg.username}</div>
                <div class="message-content">\${escapeHtml(msg.content)}</div>
            </div>
        \`;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    function appendSystemMessage(text) {
        const container = document.getElementById('messages');
        const div = document.createElement('div');
        div.className = 'system-message';
        div.textContent = text;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // Event Listeners
    document.getElementById('send-btn').addEventListener('click', sendMessage);
    document.getElementById('message-input').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

</script>
</body>
</html>
    `;
}
