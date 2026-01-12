export function htmlTemplate() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SMAI Chat | 安全加密聊天</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://login.smaiclub.top/common-auth.js"></script>
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
    const { useState, useEffect, useRef, useLayoutEffect, useCallback } = React;

    // --- Local Storage Utils for Chat History ---
    const CHAT_STORAGE_PREFIX = 'chat_history_';
    const CHAT_STORAGE_VERSION = 1;
    const MAX_LOCAL_MESSAGES = 500; // Maximum messages to store locally per room

    function getChatStorageKey(roomId) {
        return CHAT_STORAGE_PREFIX + roomId;
    }

    function loadLocalChatHistory(roomId) {
        try {
            const key = getChatStorageKey(roomId);
            const data = localStorage.getItem(key);
            if (!data) return null;
            
            const parsed = JSON.parse(data);
            // Version check
            if (parsed.version !== CHAT_STORAGE_VERSION) {
                console.log('Chat history version mismatch, clearing...');
                localStorage.removeItem(key);
                return null;
            }
            
            return {
                messages: parsed.messages || [],
                lastTimestamp: parsed.lastTimestamp || 0,
                savedAt: parsed.savedAt || 0
            };
        } catch (e) {
            console.error('Failed to load local chat history:', e);
            return null;
        }
    }

    function saveLocalChatHistory(roomId, messages, lastTimestamp) {
        try {
            const key = getChatStorageKey(roomId);
            // Only keep the last MAX_LOCAL_MESSAGES messages
            const trimmedMessages = messages.slice(-MAX_LOCAL_MESSAGES);
            
            const data = {
                version: CHAT_STORAGE_VERSION,
                messages: trimmedMessages,
                lastTimestamp: lastTimestamp || (trimmedMessages.length > 0 ? trimmedMessages[trimmedMessages.length - 1].timestamp : 0),
                savedAt: Date.now()
            };
            
            localStorage.setItem(key, JSON.stringify(data));
            return true;
        } catch (e) {
            console.error('Failed to save local chat history:', e);
            // If storage is full, try to clear old data
            if (e.name === 'QuotaExceededError') {
                clearOldChatHistories();
            }
            return false;
        }
    }

    function clearOldChatHistories() {
        try {
            const keys = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith(CHAT_STORAGE_PREFIX)) {
                    const data = localStorage.getItem(key);
                    if (data) {
                        try {
                            const parsed = JSON.parse(data);
                            keys.push({ key, savedAt: parsed.savedAt || 0 });
                        } catch (e) {
                            keys.push({ key, savedAt: 0 });
                        }
                    }
                }
            }
            // Sort by savedAt (oldest first) and remove the oldest half
            keys.sort((a, b) => a.savedAt - b.savedAt);
            const toRemove = Math.ceil(keys.length / 2);
            for (let i = 0; i < toRemove; i++) {
                localStorage.removeItem(keys[i].key);
            }
            console.log('Cleared ' + toRemove + ' old chat histories');
        } catch (e) {
            console.error('Failed to clear old chat histories:', e);
        }
    }

    function mergeMessages(localMessages, serverMessages, username) {
        // Create a map of existing messages by timestamp to avoid duplicates
        const messageMap = new Map();
        
        // Add local messages first
        localMessages.forEach(msg => {
            if (msg.timestamp) {
                messageMap.set(msg.timestamp, msg);
            }
        });
        
        // Add/update with server messages
        serverMessages.forEach(msg => {
            if (msg.timestamp) {
                // Server message takes precedence if there's a conflict
                messageMap.set(msg.timestamp, msg);
            }
        });
        
        // Convert back to array and sort by timestamp
        const merged = Array.from(messageMap.values());
        merged.sort((a, b) => a.timestamp - b.timestamp);
        
        return merged;
    }

    // --- Crypto Utils ---
    async function importRoomKey(password) {
      try {
        const enc = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
          "raw",
          enc.encode(password),
          "PBKDF2",
          false,
          ["deriveKey"]
        );
        return await crypto.subtle.deriveKey(
          {
            name: "PBKDF2",
            salt: enc.encode("SMAICLUB_CHAT_SALT"),
            iterations: 10000,
            hash: "SHA-256"
          },
          keyMaterial,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"]
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

    const applyTheme = (theme) => {
       if (!theme) return;
       try {
         if (theme.type === 'color') {
           document.body.style.backgroundImage = 'none';
           document.body.style.backgroundColor = theme.value;
         } else if (theme.type === 'gradient') {
           document.body.style.backgroundImage = theme.value;
           document.body.style.backgroundAttachment = 'fixed';
         } else if (theme.type === 'image') {
           document.body.style.backgroundImage = \`url(\${theme.value})\`;
           document.body.style.backgroundSize = 'cover';
           document.body.style.backgroundPosition = 'center';
           document.body.style.backgroundAttachment = 'fixed';
         }
       } catch (e) { console.error("Theme Apply Error", e); }
    };

    function StyleSwitcher() {
      const [isOpen, setIsOpen] = useState(false);
      const fileInputRef = useRef(null);

      const presets = [
        { type: 'color', value: '#000000', label: '纯黑' },
        { type: 'color', value: '#1a1a1a', label: '深灰' },
        { type: 'color', value: '#111827', label: '灰蓝' },
        { type: 'color', value: '#312e81', label: '深靛' },
        { type: 'gradient', value: 'linear-gradient(135deg, #1a2980 0%, #26d0ce 100%)', label: '海洋' },
        { type: 'gradient', value: 'linear-gradient(135deg, #0F2027 0%, #203A43 50%, #2C5364 100%)', label: '深空' },
        { type: 'gradient', value: 'linear-gradient(to right, #4facfe 0%, #00f2fe 100%)', label: '极光' },
        { type: 'gradient', value: 'linear-gradient(to top, #30cfd0 0%, #330867 100%)', label: '星云' },
        { type: 'gradient', value: 'linear-gradient(120deg, #f093fb 0%, #f5576c 100%)', label: '夕阳' },
        { type: 'gradient', value: 'linear-gradient(to top, #5ee7df 0%, #b490ca 100%)', label: '梦幻' },
      ];

      const handleSelect = (theme) => {
        applyTheme(theme);
        localStorage.setItem('chat_theme', JSON.stringify(theme));
        setIsOpen(false);
      };

      const handleFile = (e) => {
        const file = e.target.files[0];
        if (file) {
           const reader = new FileReader();
           reader.onload = (ev) => {
              const result = ev.target.result;
              if (result.length > 4 * 1024 * 1024) {
                  alert("图片太大，请上传小于3MB的图片");
                  return;
              }
              const theme = { type: 'image', value: result };
              handleSelect(theme);
           };
           reader.readAsDataURL(file);
        }
      };

      return (
        <div className="relative z-50">
           <button onClick={() => setIsOpen(!isOpen)} className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-lg transition group" title="更改外观">
              <i className="fas fa-palette"></i>
           </button>
           
           {isOpen && (
             <>
               <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)}></div>
               <div className="absolute top-12 left-0 w-72 bg-[#1c1c1e]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-4 shadow-2xl z-50 animate-[fadeIn_0.2s_ease-out]">
                  <h3 className="text-white text-sm font-bold mb-3 flex items-center gap-2">
                    <i className="fas fa-paint-brush text-blue-400"></i> 外观设置
                  </h3>
                  
                  <div className="mb-4">
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-semibold">纯色 / 渐变</div>
                    <div className="grid grid-cols-5 gap-2">
                       {presets.map((p, i) => (
                          <button key={i} onClick={() => handleSelect(p)}
                            className="w-full aspect-square rounded-full border border-white/10 hover:border-white/50 hover:scale-110 transition relative overflow-hidden shadow-sm"
                            style={{ background: p.value }}
                            title={p.label}
                          >
                          </button>
                       ))}
                    </div>
                  </div>

                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-semibold">自定义</div>
                    <button onClick={() => fileInputRef.current?.click()} className="w-full py-2.5 bg-white/5 hover:bg-white/10 text-white text-xs rounded-xl transition border border-white/10 flex items-center justify-center gap-2 font-medium">
                       <i className="fas fa-image"></i> 上传背景图片
                    </button>
                    <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
                    <button onClick={() => handleSelect({ type: 'image', value: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80' })} className="w-full mt-2 py-2.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white text-xs rounded-xl transition border border-white/10 flex items-center justify-center gap-2">
                       <i className="fas fa-undo"></i> 恢复默认
                    </button>
                  </div>
               </div>
             </>
           )}
        </div>
      );
    }

    function Landing({ user, onJoin, onCreate, onEmergency, onEnterRoom }) {
      const [rooms, setRooms] = useState({ owned: [], joined: [] });
      const [loading, setLoading] = useState(true);
      const [deleteConfirm, setDeleteConfirm] = useState(null);

      const handleDelete = async (roomId, e) => {
          if (e) e.stopPropagation();
          try {
             const res = await fetch('/api/rooms/' + roomId, {
                 method: 'DELETE',
                 credentials: 'include'
             });
             const data = await res.json();
             if (data.success) {
                 setRooms(prev => ({
                     ...prev,
                     owned: prev.owned.filter(r => r.id !== parseInt(roomId))
                 }));
                 setDeleteConfirm(null);
             } else {
                 alert(data.message || "Failed to delete room");
             }
          } catch (err) {
              console.error(err);
              alert("Error deleting room");
          }
      };

      useEffect(() => {
        fetch('/api/user/rooms', { credentials: 'include' })
          .then(res => res.json())
          .then(data => {
            if (data.owned || data.joined) {
                setRooms({ owned: data.owned || [], joined: data.joined || [] });
            }
          })
          .catch(console.error)
          .finally(() => setLoading(false));
      }, []);

      const hasRooms = rooms.owned.length > 0 || rooms.joined.length > 0;

      const RoomCard = ({ room, isOwner }) => (
        <div onClick={() => onEnterRoom(room)} className="group relative bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-4 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg">
            {isOwner && (
                <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm(room.id); }}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/20 hover:bg-red-500/80 text-gray-400 hover:text-white flex items-center justify-center transition opacity-0 group-hover:opacity-100 z-10"
                    title="删除房间"
                >
                    <i className="fas fa-trash-alt text-xs"></i>
                </button>
            )}
            <div className="flex justify-between items-start mb-2">
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center text-blue-400 group-hover:text-white group-hover:from-blue-500 group-hover:to-purple-500 transition-colors">
                    <i className={\`fas \${isOwner ? 'fa-crown' : 'fa-users'}\`}></i>
                </div>
                {room.is_private === 1 && <i className="fas fa-lock text-xs text-gray-500"></i>}
            </div>
            <h3 className="font-medium text-white truncate mb-1">{room.name}</h3>
            <p className="text-xs text-gray-500 truncate">ID: {room.id}</p>
        </div>
      );

      return (
        <div className="w-full max-w-5xl p-4 animate-[fadeIn_0.5s_ease-out]">
            {/* Top Bar */}
            <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start z-50 pointer-events-none">
                {/* Left Actions */}
                <div className="flex items-center gap-4 pointer-events-auto">
                     {hasRooms && (
                        <>
                            <button onClick={onEmergency} className="w-10 h-10 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 flex items-center justify-center shadow-lg transition group relative">
                                <i className="fas fa-exclamation-triangle"></i>
                                <span className="absolute left-12 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none">紧急/工单</span>
                            </button>
                        </>
                    )}
                </div>

                {/* Right Actions & Login */}
                <div className="flex items-center gap-4 pointer-events-auto">
                    {hasRooms && (
                        <>
                            <div className="relative group">
                                <button onClick={onJoin} className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-lg transition">
                                    <i className="fas fa-sign-in-alt"></i>
                                </button>
                                <span className="absolute right-12 top-2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none">加入房间</span>
                            </div>
                            <div className="relative group">
                                <button onClick={onCreate} className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-lg transition">
                                    <i className="fas fa-plus"></i>
                                </button>
                                <span className="absolute right-12 top-2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none">创建房间</span>
                            </div>
                            <div className="relative group">
                                <StyleSwitcher />
                                <span className="absolute right-12 top-2 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none">外观设置</span>
                            </div>
                            <div className="h-8 w-px bg-white/10 mx-1"></div>
                        </>
                    )}
                    {/* Login Component */}
                    <div id="auth-container-root"></div>
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center mt-20"><i className="fas fa-circle-notch fa-spin text-2xl text-blue-500"></i></div>
            ) : !hasRooms ? (
                <div className="flex flex-col items-center justify-center min-h-[60vh]">
                     <div className="glass w-full max-w-md p-8 rounded-2xl shadow-2xl flex flex-col items-center text-center bg-black/40 backdrop-blur-md border border-white/10">
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
                    </div>
                </div>
            ) : (
                <div className="mt-20 space-y-10 w-full overflow-y-auto custom-scroll pb-20" style={{maxHeight: 'calc(100vh - 100px)'}}>
                     {(() => {
                        const anyFullRow = rooms.owned.length >= 4 || rooms.joined.length >= 4;
                        const centerOwned = !anyFullRow && rooms.owned.length > 0;
                        const centerJoined = !anyFullRow && rooms.joined.length > 0;

                        return (
                            <React.Fragment>
                                {/* Owned Rooms */}
                                {rooms.owned.length > 0 && (
                                    <div className={\`w-full \${centerOwned ? 'flex justify-center' : ''}\`}>
                                        <div className={\`\${centerOwned ? 'inline-flex flex-col' : 'w-full'}\`}>
                                            <h2 className={\`text-xl font-bold text-white mb-4 flex items-center gap-2 px-4 \${centerOwned ? 'justify-start' : ''}\`}>
                                                <i className="fas fa-crown text-yellow-500"></i> 我拥有的房间
                                            </h2>
                                            <div className={\`\${centerOwned ? 'flex flex-wrap gap-4 px-4' : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 px-4'}\`}>
                                                {rooms.owned.map(room => (
                                                    <div key={room.id} className={\`\${centerOwned ? 'w-64' : 'w-full'}\`}>
                                                        <RoomCard room={room} isOwner={true} />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Joined Rooms */}
                                {rooms.joined.length > 0 && (
                                    <div className={\`w-full \${centerJoined ? 'flex justify-center' : ''}\`}>
                                        <div className={\`\${centerJoined ? 'inline-flex flex-col' : 'w-full'}\`}>
                                            <h2 className={\`text-xl font-bold text-white mb-4 flex items-center gap-2 px-4 \${centerJoined ? 'justify-start' : ''}\`}>
                                                <i className="fas fa-history text-blue-400"></i> 我加入过的房间
                                            </h2>
                                            <div className={\`\${centerJoined ? 'flex flex-wrap gap-4 px-4' : 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 px-4'}\`}>
                                                {rooms.joined.map(room => (
                                                    <div key={room.id} className={\`\${centerJoined ? 'w-64' : 'w-full'}\`}>
                                                        <RoomCard key={room.id} room={room} isOwner={false} />
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </React.Fragment>
                        );
                     })()}
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
                    <div className="bg-[#1c1c1e] border border-white/10 p-6 rounded-2xl max-w-sm w-full mx-4 shadow-2xl transform scale-100">
                        <h3 className="text-xl font-bold text-white mb-2">确认删除房间?</h3>
                        <p className="text-gray-400 text-sm mb-6">
                            这将永久删除该房间及其所有聊天记录，此操作无法撤销。
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl transition font-medium"
                            >
                                取消
                            </button>
                            <button
                                onClick={(e) => handleDelete(deleteConfirm, e)}
                                className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl transition font-medium shadow-lg shadow-red-900/20"
                            >
                                确认删除
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
      );
    }

    function CreateRoom({ onBack, onCreated }) {
      const [name, setName] = useState("");
      const [customKey, setCustomKey] = useState("");
      const [isPrivate, setIsPrivate] = useState(true);
      const [loading, setLoading] = useState(false);
      const [error, setError] = useState(null);

      const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
           const payload = { name, isPrivate: false };
           if (customKey.trim()) payload.customKey = customKey.trim();

           const res = await fetch('/api/rooms', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             credentials: 'include',
             body: JSON.stringify(payload)
           });
           
           // 处理非 JSON 响应（如 "Unauthorized"）
           const text = await res.text();
           let data;
           try {
             data = JSON.parse(text);
           } catch (e) {
             throw new Error(text || 'Request failed');
           }
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

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">自定义密钥 (可选)</label>
              <input type="text" value={customKey} onChange={e => setCustomKey(e.target.value)}
                 className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition font-mono text-sm"
                 placeholder="留空随机生成 (8-20位字母数字)" />
              <p className="text-[10px] text-gray-500 mt-1 ml-1">支持8-20位数字和字母 (大小写)，不支持符号</p>
            </div>

            <button disabled={loading} type="submit" className="w-full py-3.5 btn-gradient rounded-xl font-medium text-white flex items-center justify-center gap-2 mt-4 disabled:opacity-50">
               {loading ? <i className="fas fa-circle-notch fa-spin"></i> : "立即创建"}
            </button>
          </form>
        </div>
      );
    }

    function JoinRoom({ onBack, onJoined, initialRoomId, initialRoomName }) {
      const [roomId, setRoomId] = useState(initialRoomId || "");
      const [roomKey, setRoomKey] = useState("");
      const [loading, setLoading] = useState(false);

      // Load key from localStorage if available for this room
      useEffect(() => {
          if (roomId) {
              const savedKey = localStorage.getItem(\`room_key_\${roomId}\`);
              if (savedKey) setRoomKey(savedKey);
          }
      }, [roomId]);

      const handleSubmit = (e) => {
        e.preventDefault();
        if(!roomId || !roomKey) return;
        
        // Save key for convenience
        localStorage.setItem(\`room_key_\${roomId}\`, roomKey);
        
        onJoined({ id: roomId, key: roomKey, name: initialRoomName || ('Room ' + roomId) });
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
       const [status, setStatus] = useState("connecting"); // connecting, connected, error, uncreated
       const [cryptoKey, setCryptoKey] = useState(null);
       const [showKey, setShowKey] = useState(false);
       const [syncStatus, setSyncStatus] = useState(""); // "", "syncing", "synced"
       const [retryCount, setRetryCount] = useState(0);
       
       const socketRef = useRef(null);
       const messagesEndRef = useRef(null);
       const isConnectedRef = useRef(false);
       const messagesRef = useRef([]); // Keep track of messages for saving
       const localHistoryRef = useRef(null); // Store local history info

       const scrollToBottom = () => {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
       };

       useEffect(() => {
          scrollToBottom();
       }, [messages]);

       // Keep messagesRef in sync with messages state
       useEffect(() => {
          messagesRef.current = messages;
       }, [messages]);

       // Save messages to local storage periodically and on unmount
       const saveMessagesToLocal = useCallback(() => {
          if (room.id && messagesRef.current.length > 0) {
              // Filter out system messages for storage
              const messagesToSave = messagesRef.current.filter(m => !m.system);
              if (messagesToSave.length > 0) {
                  const lastTimestamp = messagesToSave[messagesToSave.length - 1].timestamp;
                  saveLocalChatHistory(room.id, messagesToSave, lastTimestamp);
                  console.log('Saved ' + messagesToSave.length + ' messages to local storage');
              }
          }
       }, [room.id]);

       // Auto-save every 30 seconds
       useEffect(() => {
          const interval = setInterval(saveMessagesToLocal, 30000);
          return () => clearInterval(interval);
       }, [saveMessagesToLocal]);

       // Save on page unload
       useEffect(() => {
          const handleBeforeUnload = () => {
              saveMessagesToLocal();
          };
          window.addEventListener('beforeunload', handleBeforeUnload);
          return () => {
              window.removeEventListener('beforeunload', handleBeforeUnload);
              // Also save when component unmounts
              saveMessagesToLocal();
          };
       }, [saveMessagesToLocal]);

       useEffect(() => {
          setStatus("connecting");
          // 1. Load local history first
          const localHistory = loadLocalChatHistory(room.id);
          localHistoryRef.current = localHistory;
          
          if (localHistory && localHistory.messages.length > 0) {
              console.log('Loaded ' + localHistory.messages.length + ' messages from local storage');
              setMessages(localHistory.messages);
              setSyncStatus("syncing");
          }

          // 2. Prepare Key
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
                connectWebSocket(localHistory);
             } catch (e) {
                console.error(e);
                setStatus("error");
             }
          };

          const connectWebSocket = (localHistory) => {
             const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
             // Build WebSocket URL with optional since parameter for incremental sync
             let wsUrl = protocol + "//" + window.location.host + "/api/rooms/" + room.id + "/websocket?key=" + encodeURIComponent(room.key);
             
             // If we have local history, request only messages since last timestamp
             if (localHistory && localHistory.lastTimestamp > 0) {
                 wsUrl += "&since=" + localHistory.lastTimestamp;
                 console.log('Requesting incremental sync since: ' + new Date(localHistory.lastTimestamp).toLocaleString());
             }
             
             const ws = new WebSocket(wsUrl);

             ws.onopen = () => {
                 isConnectedRef.current = true;
                 setStatus("connected");
             };

             ws.onclose = async () => {
                 if (isConnectedRef.current) {
                     setStatus("disconnected");
                     isConnectedRef.current = false;
                     // Save messages when disconnected
                     saveMessagesToLocal();
                 } else {
                     // Handshake failed? Check if room exists
                     try {
                         const httpUrl = wsUrl.replace(/^ws/, 'http');
                         const res = await fetch(httpUrl, { credentials: 'include' });
                         if (res.status === 404) {
                             const text = await res.text();
                             if (text.includes("Room not found")) {
                                 setStatus("uncreated");
                                 return;
                             }
                         }
                     } catch (e) {}
                     setStatus("disconnected");
                 }
             };

             ws.onerror = () => {
                 // Only set error if we haven't determined it's uncreated
                 // But onerror fires before onclose.
                 // We can let onclose handle the final status.
             };

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

                   // Handle full history (no local cache or cache invalid)
                   if (data.type === 'history') {
                       if (!keyObj) return;
                       console.log('Received full history: ' + data.messages.length + ' messages');
                       const historyMessages = await Promise.all(data.messages.map(async (m) => {
                           try {
                               const content = await decryptMessage(keyObj, m.iv, m.content);
                               const sender = await decryptMessage(keyObj, m.iv, m.sender);
                               return {
                                   id: m.timestamp,
                                   content,
                                   sender,
                                   isMine: sender === user.username,
                                   timestamp: m.timestamp
                               };
                           } catch (e) {
                               return null;
                           }
                       }));
                       const validMessages = historyMessages.filter(Boolean);
                       // Replace all messages with server history (full sync)
                       setMessages(validMessages);
                       setSyncStatus("synced");
                       // Save to local storage
                       if (validMessages.length > 0) {
                           saveLocalChatHistory(room.id, validMessages, validMessages[validMessages.length - 1].timestamp);
                       }
                       return;
                   }

                   // Handle incremental history (merge with local cache)
                   if (data.type === 'history_incremental') {
                       if (!keyObj) return;
                       console.log('Received incremental history: ' + data.messages.length + ' new messages since ' + new Date(data.since).toLocaleString());
                       
                       if (data.messages.length === 0) {
                           // No new messages, local cache is up to date
                           setSyncStatus("synced");
                           return;
                       }
                       
                       const newMessages = await Promise.all(data.messages.map(async (m) => {
                           try {
                               const content = await decryptMessage(keyObj, m.iv, m.content);
                               const sender = await decryptMessage(keyObj, m.iv, m.sender);
                               return {
                                   id: m.timestamp,
                                   content,
                                   sender,
                                   isMine: sender === user.username,
                                   timestamp: m.timestamp
                               };
                           } catch (e) {
                               return null;
                           }
                       }));
                       const validNewMessages = newMessages.filter(Boolean);
                       
                       // Merge with existing messages
                       setMessages(prev => {
                           const merged = mergeMessages(prev.filter(m => !m.system), validNewMessages, user.username);
                           // Re-add system messages at the end
                           const systemMessages = prev.filter(m => m.system);
                           return [...merged, ...systemMessages];
                       });
                       setSyncStatus("synced");
                       return;
                   }

                   // Decrypt real-time message
                   if (!keyObj) return;
                   const content = await decryptMessage(keyObj, data.iv, data.content);
                   const sender = await decryptMessage(keyObj, data.iv, data.sender);
                   
                   const newMsg = {
                      id: data.timestamp || Date.now(),
                      content,
                      sender,
                      isMine: sender === user.username,
                      timestamp: data.timestamp
                   };
                   
                   setMessages(prev => {
                      // Check for duplicate (same timestamp)
                      if (prev.some(m => m.timestamp === newMsg.timestamp)) {
                          return prev;
                      }
                      return [...prev, newMsg];
                   });

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
       }, [room, user, retryCount]);

       // Custom leave handler that saves messages first
       const handleLeave = useCallback(() => {
          saveMessagesToLocal();
          onLeave();
       }, [saveMessagesToLocal, onLeave]);

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
                      <div className="text-xs text-gray-400 flex items-center gap-2">
                         <span className="flex items-center gap-1">
                            {status === 'connected' ? 'Secure Connection' :
                             status === 'connecting' ? 'Connecting...' :
                             status === 'uncreated' ? 'Uncreated' : 'Disconnected'}
                            {status === 'connected' && <i className="fas fa-lock text-[10px]"></i>}
                            {(status === 'disconnected' || status === 'error') && (
                                <button onClick={() => setRetryCount(c => c + 1)} className="ml-2 hover:text-white transition" title="Reconnect">
                                    <i className="fas fa-sync-alt"></i>
                                </button>
                            )}
                         </span>
                         {syncStatus && (
                            <span className={"flex items-center gap-1 " + (syncStatus === 'synced' ? 'text-green-400' : 'text-yellow-400')}>
                               {syncStatus === 'syncing' ? (
                                  <><i className="fas fa-sync fa-spin text-[10px]"></i> 同步中</>
                               ) : (
                                  <><i className="fas fa-check text-[10px]"></i> 已同步</>
                               )}
                            </span>
                         )}
                      </div>
                   </div>
                </div>
                <div className="flex items-center gap-3">
                   <button onClick={() => setShowKey(!showKey)} className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition text-gray-400 hover:text-white" title="Show Room Key">
                      <i className="fas fa-key"></i>
                   </button>
                   <button onClick={handleLeave} className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm rounded-lg transition border border-red-500/20">
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
       const [joinId, setJoinId] = useState(""); // Pre-filled ID for join screen
       const [joinName, setJoinName] = useState("");

       useEffect(() => {
          // Load Theme
          const savedTheme = localStorage.getItem('chat_theme');
          if (savedTheme) {
             try {
                applyTheme(JSON.parse(savedTheme));
             } catch (e) {}
          }

          // Check Login
          fetch('https://login.smaiclub.top/api/me', { credentials: 'include' })
             .then(res => res.json())
             .then(data => {
                if (data.loggedIn) {
                   setUser({ username: data.username, role: data.effectiveRole });
                   setView("landing");
                   
                   // Initialize Common Auth UI
                   if (window.CommonAuth) {
                       window.CommonAuth.init('auth-container-root');
                   }
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

       // Re-init auth UI when view changes to landing
       useEffect(() => {
           if (view === 'landing' && window.CommonAuth) {
               // Small delay to ensure DOM is ready
               setTimeout(() => window.CommonAuth.init('auth-container-root'), 100);
           }
       }, [view]);

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
                   onJoin={() => { setJoinId(""); setJoinName(""); setView('join'); }}
                   onEnterRoom={(r) => { setJoinId(r.id.toString()); setJoinName(r.name); setView('join'); }}
                   onEmergency={() => {
                       setRoom({ id: '000001', key: 'smaiclub_issues', name: 'Emergency Channel' });
                       setView('chat');
                   }}
                />
             )}
             {view === 'create' && (
                <CreateRoom
                   onBack={() => setView('landing')}
                   onCreated={(r) => {
                       // Auto save key for creator
                       localStorage.setItem(\`room_key_\${r.id}\`, r.key);
                       setRoom(r);
                       setView('chat');
                   }}
                />
             )}
             {view === 'join' && (
                <JoinRoom
                   initialRoomId={joinId}
                   initialRoomName={joinName}
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