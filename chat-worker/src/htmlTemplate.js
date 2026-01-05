export default `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SmaiClub Chat</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; background: #f0f2f5; }
        .container { background: white; padding: 2rem; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        h1 { color: #333; text-align: center; }
        button { background: #0070f3; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 16px; transition: background 0.2s; }
        button:hover { background: #0051a2; }
        button:disabled { background: #ccc; cursor: not-allowed; }
        #error-msg { color: red; margin-top: 10px; text-align: center; display: none; }
        
        .chat-ui { display: none; margin-top: 20px; }
        #messages { height: 300px; border: 1px solid #ddd; overflow-y: scroll; padding: 10px; margin-bottom: 10px; border-radius: 4px; background: #fafafa; }
        .message { margin-bottom: 8px; padding: 5px; border-radius: 4px; }
        .system { color: #666; font-style: italic; font-size: 0.9em; text-align: center; }
        .user { background: #e6f7ff; }
        #input-area { display: flex; gap: 10px; }
        #msg-input { flex-grow: 1; padding: 10px; border: 1px solid #ddd; border-radius: 4px; }
    </style>
</head>
<body>
    <div class="container">
        <h1>SmaiClub 聊天室</h1>
        
        <div id="join-screen" style="text-align: center;">
            <p>创建一个新房间或加入现有房间。</p>
            <button id="create-btn" onclick="createRoom()">创建新房间</button>
            <p id="error-msg"></p>
        </div>

        <div id="chat-screen" class="chat-ui">
            <div id="room-info" style="margin-bottom: 10px; font-weight: bold; color: #555;"></div>
            <div id="messages"></div>
            <div id="input-area">
                <input type="text" id="msg-input" placeholder="输入消息..." onkeypress="if(event.key==='Enter') sendMessage()">
                <button onclick="sendMessage()">发送</button>
            </div>
        </div>
    </div>

    <script>
        let currentWebSocket = null;
        let currentRoomId = null;

        // 检查 URL 是否已有房间 ID
        const urlParams = new URLSearchParams(window.location.search);
        const roomIdFromUrl = urlParams.get('room');
        if (roomIdFromUrl) {
            joinRoom(roomIdFromUrl);
        }

        async function createRoom() {
            const btn = document.getElementById('create-btn');
            const errorDiv = document.getElementById('error-msg');
            
            btn.disabled = true;
            errorDiv.style.display = 'none';
            errorDiv.innerText = '';

            try {
                const res = await fetch('/api/room', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });

                // 处理非 JSON 响应 (关键修复)
                const contentType = res.headers.get("content-type");
                let data;
                if (contentType && contentType.indexOf("application/json") !== -1) {
                    data = await res.json();
                } else {
                    // 如果服务器返回了纯文本 (例如 "Unauthorized")
                    const text = await res.text();
                    throw new Error(text || "Server returned non-JSON response: " + res.status);
                }

                if (!res.ok) {
                    throw new Error(data.error || "Failed to create room: " + res.status);
                }

                // 成功创建，加入房间
                joinRoom(data.id);
                
                // 更新 URL 不刷新页面
                const newUrl = window.location.pathname + '?room=' + data.id;
                window.history.pushState({path: newUrl}, '', newUrl);

            } catch (e) {
                console.error("Create room error:", e);
                errorDiv.innerText = "错误: " + e.message;
                errorDiv.style.display = 'block';
            } finally {
                btn.disabled = false;
            }
        }

        function joinRoom(roomId) {
            currentRoomId = roomId;
            document.getElementById('join-screen').style.display = 'none';
            document.getElementById('chat-screen').style.display = 'block';
            document.getElementById('room-info').innerText = '房间 ID: ' + roomId;

            // 根据当前协议选择 ws:// 或 wss://
            const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            const host = window.location.host;
            const wsUrl = \`\${protocol}//\${host}/api/room/\${roomId}/websocket\`;

            const ws = new WebSocket(wsUrl);
            currentWebSocket = ws;

            ws.onopen = () => {
                addMessage("系统", "已连接到聊天室", "system");
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.error) {
                        addMessage("错误", data.error, "system");
                    } else {
                        // 假设消息格式 { sender: "name", message: "text", timestamp: ... }
                        // 或者简单的 { message: "text" }
                        const sender = data.sender || "匿名";
                        const msg = data.message || JSON.stringify(data);
                        addMessage(sender, msg, sender === "系统" ? "system" : "user");
                    }
                } catch (e) {
                    addMessage("系统", "收到未知消息: " + event.data, "system");
                }
            };

            ws.onclose = () => {
                addMessage("系统", "连接已断开", "system");
                // 可选：尝试重连
            };
            
            ws.onerror = (e) => {
                console.error(e);
                addMessage("系统", "连接发生错误", "system");
            };
        }

        function sendMessage() {
            const input = document.getElementById('msg-input');
            const message = input.value.trim();
            if (!message || !currentWebSocket) return;

            // 发送 JSON 格式消息
            currentWebSocket.send(JSON.stringify({ message: message }));
            input.value = '';
        }

        function addMessage(sender, text, type) {
            const messagesDiv = document.getElementById('messages');
            const msgDiv = document.createElement('div');
            msgDiv.className = 'message ' + type;
            
            const time = new Date().toLocaleTimeString();
            
            if (type === 'system') {
                msgDiv.innerText = \`[\${time}] \${text}\`;
            } else {
                msgDiv.innerHTML = \`<strong>\${sender}</strong> [\${time}]: \${text}\`;
            }
            
            messagesDiv.appendChild(msgDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
    </script>
</body>
</html>
`;