export function htmlTemplate() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SMAI Chat | 安全加密聊天</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link href="https://fonts.googleapis.com/css2?family=SF+Pro+Display:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'SF Pro Display', sans-serif; background-color: #000; }
    .glass-effect {
      background: rgba(29, 29, 31, 0.7);
      backdrop-filter: blur(20px) saturate(180%);
      -webkit-backdrop-filter: blur(20px) saturate(180%);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }
    .btn-gradient {
      background: linear-gradient(135deg, #0071e3, #00c6fb);
      transition: all 0.3s ease;
    }
    .btn-gradient:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 15px rgba(0, 113, 227, 0.4);
    }
    .scrollbar-hide::-webkit-scrollbar {
        display: none;
    }
    .scrollbar-hide {
        -ms-overflow-style: none;
        scrollbar-width: none;
    }
    /* Custom Scrollbar for messages */
    .custom-scroll::-webkit-scrollbar {
        width: 6px;
    }
    .custom-scroll::-webkit-scrollbar-track {
        background: transparent;
    }
    .custom-scroll::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.2);
        border-radius: 3px;
    }
    .custom-scroll::-webkit-scrollbar-thumb:hover {
        background: rgba(255,255,255,0.3);
    }
    .msg-bubble {
        animation: fadeIn 0.2s ease-out;
    }
    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
    }
  </style>
</head>
<body class="text-gray-100 h-screen overflow-hidden bg-[url('https://images.unsplash.com/photo-1550684848-fac1c5b4e853?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80')] bg-cover bg-center">
  <div class="absolute inset-0 bg-black/60"></div>
  <div id="root" class="relative h-full flex flex-col items-center justify-center p-4"></div>

  <script type="text/babel">
    const { useState, useEffect, useRef, useLayoutEffect } = React;

    // --- Crypto Utils ---
    async function importRoomKey(keyBase64) {
      try {
        const raw = Uint8Array.from(atob(keyBase64), c => c.charCodeAt(0));
        return await crypto.subtle.importKey(
          "raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]
        );
      } catch (e) {
        console.error("Key Import Failed", e);
        throw new Error("Invalid Key");
      }
    }

    async function decryptMessage(key, ivB64, contentB64) {
      try {
        const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0));
        const data = Uint8Array.from(atob(contentB64), c => c.charCodeAt(0));
        const decrypted = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv }, key, data
        );
        return new TextDecoder().decode(decrypted);
      } catch (e) {
        return "[Decryption Failed]";
      }
    }

    // --- Components ---

    function Landing({ user, onJoin, onCreate, onEmergency }) {
      return (
        <div className="glass w-full max-w-md p-8 rounded-2xl shadow-2xl flex flex-col items-center text-center animate-[fadeIn_0.5s_ease-out] bg-black/40 backdrop-blur-md border border-white/10">
          <div className="w-20 h-20 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-6 shadow-lg">
            <i className="fas fa-comments text-3xl text-white"></i>
          </div>
          <h1 className="text-3xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">SMAI Chat</h1>
          <p className="text-gray-400 mb-8">安全、加密、即时的通讯体验</p>
          
          <div className="w-full space-y-4">
             <button onClick={onCreate} className="w-full py-3.5 btn-gradient rounded-xl font-medium text-white flex items-center justify-center gap-2">
                <i className="fas fa-plus"></i> 创建房间
             </button>
             <button onClick={onJoin} className="w-full py-3.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl font-medium text-white transition flex items-center justify-center gap-2">
                <i className="fas fa-sign-in-alt"></i> 加入房间
             </button>
          </div>

          <button onClick={onEmergency} className="mt-6 text-xs text-red-400 hover:text-red-300 transition flex items-center gap-1 opacity-70 hover:opacity-100">
             <i className="fas fa-exclamation-triangle"></i> 紧急/工单模式
          </button>
          
          <div className="mt-8 text-xs text-gray-500">
            Logged in as <span className="text-gray-300 font-medium">{user.username}</span>
          </div>
        </div>
      );
    }

    function CreateRoom({ onBack, onCreated }) {
      const [name, setName] = useState("");
      const [isPrivate, setIsPrivate] = useState(true);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState(null);

      const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
           const res = await fetch('/api/rooms', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ name, isPrivate })
           });
           const data = await res.json();
           if (!res.ok) throw new Error(data.message || data.error || "Failed to create");
           
           onCreated({ id: data.roomId, key: data.roomKey, name: name || ('Room ' + data.roomId) });
        } catch (err) {
           setError(err.message);
        } finally {
           setLoading(false);
        }
      };

      return (
        <div className="glass w-full max-w-md p-8 rounded-2xl shadow-2xl animate-[fadeIn_0.5s_ease-out] bg-black/40 backdrop-blur-md border border-white/10">
          <div className="flex items-center mb-6">
            <button onClick={onBack} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition mr-4">
                <i className="fas fa-arrow-left text-sm"></i>
            </button>
            <h2 className="text-xl font-bold">创建新房间</h2>
          </div>

          {error && <div className="bg-red-500/20 text-red-300 p-3 rounded-lg text-sm mb-4 border border-red-500/30">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">房间名称 (可选)</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} 
                 className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition"
                 placeholder="给房间起个名字..." />
            </div>

            <div className="flex items-center justify-between bg-white/5 p-4 rounded-xl border border-white/10">
               <div>
                  <div className="font-medium text-sm">私密房间</div>
                  <div className="text-xs text-gray-400 mt-0.5">仅拥有密钥的人可访问</div>
               </div>
               <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" checked={isPrivate} onChange={e => setIsPrivate(e.target.checked)} className="sr-only peer" />
                  <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
               </label>
            </div>

            <button disabled={loading} type="submit" className="w-full py-3.5 btn-gradient rounded-xl font-medium text-white flex items-center justify-center gap-2 mt-4 disabled:opacity-50">
               {loading ? <i className="fas fa-circle-notch fa-spin"></i> : "立即创建"}
            </button>
          </form>
        </div>
      );
    }

    function JoinRoom({ onBack, onJoined }) {
      const [roomId, setRoomId] = useState("");
      const [roomKey, setRoomKey] = useState("");
      const [loading, setLoading] = useState(false);

      const handleSubmit = (e) => {
        e.preventDefault();
        if(!roomId || !roomKey) return;
        onJoined({ id: roomId, key: roomKey, name: 'Room ' + roomId });
      };

      return (
        <div className="glass w-full max-w-md p-8 rounded-2xl shadow-2xl animate-[fadeIn_0.5s_ease-out] bg-black/40 backdrop-blur-md border border-white/10">
           <div className="flex items-center mb-6">
            <button onClick={onBack} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition mr-4">
                <i className="fas fa-arrow-left text-sm"></i>
            </button>
            <h2 className="text-xl font-bold">加入房间</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
             <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">房间 ID</label>
              <input type="number" value={roomId} onChange={e => setRoomId(e.target.value)} required
                 className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition font-mono"
                 placeholder="12345" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">房间密钥 (Key)</label>
              <input type="password" value={roomKey} onChange={e => setRoomKey(e.target.value)} required
                 className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition font-mono text-sm"
                 placeholder="粘贴密钥..." />
            </div>
             <button type="submit" className="w-full py-3.5 btn-gradient rounded-xl font-medium text-white flex items-center justify-center gap-2 mt-4">
               进入聊天
            </button>
          </form>
        </div>
      )
    }

    function ChatRoom({ room, user, onLeave }) {
       const [messages, setMessages] = useState([]);
       const [input, setInput] = useState("");
       const [status, setStatus] = useState("connecting"); // connecting, connected, error
       const [cryptoKey, setCryptoKey] = useState(null);
       const [showKey, setShowKey] = useState(false);
       
       const socketRef = useRef(null);
       const messagesEndRef = useRef(null);

       const scrollToBottom = () => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
       };

       useEffect(() => {
          scrollToBottom();
       }, [messages]);

       useEffect(() => {
          // 1. Prepare Key
          let keyObj = null;
          const init = async () => {
             try {
                if (room.key === 'smaiclub_issues') {
                    // Emergency Room Derivation
                    const enc = new TextEncoder();
                    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode("smaiclub_issues"), "PBKDF2", false, ["deriveKey"]);
                    keyObj = await crypto.subtle.deriveKey(
                        { name: "PBKDF2", salt: enc.encode("SALT_FOR_ISSUES"), iterations: 1000, hash: "SHA-256" },
                        keyMaterial, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
                    );
                } else {
                    keyObj = await importRoomKey(room.key);
                }
                setCryptoKey(keyObj);
                connectWebSocket();
             } catch (e) {
                console.error(e);
                setStatus("error");
             }
          };

          const connectWebSocket = () => {
             const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
             // 关键修复：使用字符串拼接代替模板字符串，防止Worker尝试在服务器端解析它
             const wsUrl = protocol + "//" + window.location.host + "/api/rooms/" + room.id + "/websocket?key=" + encodeURIComponent(room.key);
             const ws = new WebSocket(wsUrl);

             ws.onopen = () => setStatus("connected");
             ws.onclose = () => setStatus("disconnected");
             ws.onerror = () => setStatus("error");

             ws.onmessage = async (event) => {
                try {
                   const data = JSON.parse(event.data);
                   if (data.error) {
                      if (data.error === 'EMERGENCY_MODE') {
                          setMessages(prev => [...prev, { id: Date.now(), system: true, content: "⚠️ SYSTEM EMERGENCY. Please switch to Issues Channel." }]);
                      } else {
                          setMessages(prev => [...prev, { id: Date.now(), system: true, content: "Error: " + data.error }]);
                      }
                      return;
                   }
                   if (data.type === 'system') {
                       setMessages(prev => [...prev, { id: Date.now(), system: true, content: data.content }]);
                       return;
                   }

                   // Decrypt
                   if (!keyObj) return; 
                   const content = await decryptMessage(keyObj, data.iv, data.content);
                   const sender = await decryptMessage(keyObj, data.iv, data.sender);
                   
                   setMessages(prev => [...prev, {
                      id: data.timestamp || Date.now(),
                      content,
                      sender,
                      isMine: sender === user.username,
                      timestamp: data.timestamp
                   }]);

                } catch (e) {
                   console.error("Msg Error", e);
                }
             };
             socketRef.current = ws;
          };

          init();

          return () => {
             if (socketRef.current) socketRef.current.close();
          };
       }, [room, user]);

       const sendMessage = (e) => {
          e.preventDefault();
          if (!input.trim() || status !== 'connected') return;
          
          // Send PLAINTEXT to server (server encrypts)
          socketRef.current.send(JSON.stringify({ content: input }));
          setInput("");
       };

       return (
          <div className="glass w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-[fadeIn_0.5s_ease-out] bg-black/40 backdrop-blur-md border border-white/10">
             {/* Header */}
             <div className="h-16 bg-white/5 border-b border-white/10 flex items-center justify-between px-6 shrink-0">
                <div className="flex items-center gap-4">
                   <div className="relative">
                      <div className={"w-3 h-3 rounded-full " + (status === 'connected' ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-red-500')}></div>
                   </div>
                   <div>
                      <h2 className="font-bold text-lg leading-tight">{room.name} <span className="text-xs font-normal text-gray-500 ml-2">ID: {room.id}</span></h2>
                      <div className="text-xs text-gray-400 flex items-center gap-1">
                         {status === 'connected' ? 'Secure Connection' : 'Disconnected'}
                         {status === 'connected' && <i className="fas fa-lock text-[10px]"></i>}
                      </div>
                   </div>
                </div>
                <div className="flex items-center gap-3">
                   <button onClick={() => setShowKey(!showKey)} className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition text-gray-400 hover:text-white" title="Show Room Key">
                      <i className="fas fa-key"></i>
                   </button>
                   <button onClick={onLeave} className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm rounded-lg transition border border-red-500/20">
                      离开
                   </button>
                </div>
             </div>
             
             {/* Key Reveal */}
             {showKey && (
                <div className="bg-yellow-500/10 border-b border-yellow-500/20 p-3 text-center text-xs text-yellow-200 select-all font-mono break-all">
                   <span className="text-yellow-500 font-bold mr-2">ROOM KEY:</span> {room.key}
                </div>
             )}

             {/* Messages */}
             <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scroll bg-black/20">
                {messages.length === 0 && (
                   <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-4 opacity-50">
                      <i className="fas fa-comment-slash text-4xl"></i>
                      <p>暂无消息，开始聊天吧</p>
                   </div>
                )}
                {messages.map((msg, idx) => (
                   msg.system ? (
                      <div key={idx} className="flex justify-center my-4">
                         <span className="bg-white/10 text-gray-400 text-xs px-3 py-1 rounded-full">{msg.content}</span>
                      </div>
                   ) : (
                      <div key={idx} className={"flex " + (msg.isMine ? 'justify-end' : 'justify-start') + " msg-bubble"}>
                         <div className={"max-w-[70%] " + (msg.isMine ? 'items-end' : 'items-start') + " flex flex-col"}>
                            {!msg.isMine && <span className="text-[10px] text-gray-500 mb-1 ml-1">{msg.sender}</span>}
                            <div className={"px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words shadow-sm " + 
                               (msg.isMine 
                               ? 'bg-blue-600 text-white rounded-br-none' 
                               : 'bg-[#2a2a2c] text-gray-100 rounded-bl-none border border-white/5')
                            }>
                               {msg.content}
                            </div>
                            <span className="text-[9px] text-gray-600 mt-1 mx-1">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                         </div>
                      </div>
                   )
                ))}
                <div ref={messagesEndRef} />
             </div>

             {/* Input */}
             <div className="p-4 bg-white/5 border-t border-white/10 shrink-0">
                <form onSubmit={sendMessage} className="flex gap-3">
                   <input 
                      type="text" 
                      value={input} 
                      onChange={e => setInput(e.target.value)} 
                      placeholder="发送消息..." 
                      className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:bg-black/60 transition"
                      autoFocus
                   />
                   <button type="submit" disabled={!input.trim()} className="w-12 h-12 flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20">
                      <i className="fas fa-paper-plane"></i>
                   </button>
                </form>
             </div>
          </div>
       );
    }

    function App() {
       const [view, setView] = useState("loading"); // loading, landing, create, join, chat
       const [user, setUser] = useState(null);
       const [room, setRoom] = useState(null);

       useEffect(() => {
          // Check Login
          fetch('https://login.smaiclub.top/api/me', { credentials: 'include' })
             .then(res => res.json())
             .then(data => {
                if (data.loggedIn) {
                   setUser({ username: data.username, role: data.effectiveRole });
                   setView("landing");
                } else {
                   window.location.href = "https://login.smaiclub.top?redirect=" + encodeURIComponent(window.location.href);
                }
             })
             .catch(() => {
                 // Error handling
                 alert("Failed to verify identity. Please login.");
                 window.location.href = "https://login.smaiclub.top";
             });
       }, []);

       if (view === 'loading') return (
          <div className="flex flex-col items-center gap-4">
             <i className="fas fa-spinner fa-spin text-3xl text-blue-500"></i>
             <div className="text-sm text-gray-500">Authenticating...</div>
          </div>
       );

       return (
          <React.Fragment>
             {view === 'landing' && (
                <Landing 
                   user={user} 
                   onCreate={() => setView('create')}
                   onJoin={() => setView('join')}
                   onEmergency={() => {
                       setRoom({ id: '000001', key: 'smaiclub_issues', name: 'Emergency Channel' });
                       setView('chat');
                   }}
                />
             )}
             {view === 'create' && (
                <CreateRoom 
                   onBack={() => setView('landing')}
                   onCreated={(r) => { setRoom(r); setView('chat'); }}
                />
             )}
             {view === 'join' && (
                <JoinRoom 
                   onBack={() => setView('landing')}
                   onJoined={(r) => { setRoom(r); setView('chat'); }}
                />
             )}
             {view === 'chat' && room && (
                <ChatRoom 
                   room={room}
                   user={user}
                   onLeave={() => { setRoom(null); setView('landing'); }}
                />
             )}
          </React.Fragment>
       );
    }

    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(<App />);
  </script>
</body>
</html>`
}