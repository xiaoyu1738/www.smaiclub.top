import React, { useState, useRef, useEffect } from 'react';
import { Virtuoso, type VirtuosoHandle } from 'react-virtuoso';
import { useChat } from '../hooks/useChat';
import { useFaviconBadge } from '../hooks/useFaviconBadge';
import type { ChatMessage } from '../db/chatDB';

interface ChatRoomProps {
    roomId: number;
    roomKey: string;
    roomName: string;
    user: {
        username: string;
        role: string;
        avatarUrl: string;
    };
    onLeave: () => void;
}

export const ChatRoom: React.FC<ChatRoomProps> = ({ roomId, roomKey, roomName, user, onLeave }) => {
    const { messages, sendMessage, status, loadMoreMessages } = useChat({
        roomId,
        roomKey,
        username: user.username,
        role: user.role,
        avatarUrl: user.avatarUrl
    });
    const [input, setInput] = useState("");
    const virtuosoRef = useRef<VirtuosoHandle>(null);
    const [atBottom, setAtBottom] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    useFaviconBadge(unreadCount);

    // Reset unread count when window is focused
    useEffect(() => {
        const handleFocus = () => setUnreadCount(0);
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, []);

    // Increment unread count when new messages arrive and window is hidden
    const prevMessagesLength = useRef(messages.length);
    useEffect(() => {
        if (messages.length > prevMessagesLength.current) {
            if (document.hidden) {
                setTimeout(() => setUnreadCount(prev => prev + 1), 0);
            }
        }
        prevMessagesLength.current = messages.length;
    }, [messages]);

    const handleStartReached = async () => {
        if (loadingMore || messages.length === 0) return;
        setLoadingMore(true);
        const oldestMessage = messages[0];
        // Load messages before the oldest one
        const count = await loadMoreMessages(oldestMessage.timestamp);
        if (count > 0) {
            // Maintain scroll position after loading older messages
            // Virtuoso handles this automatically if we use startReached correctly,
            // but sometimes we might need to adjust.
            // For now, let's rely on Virtuoso's default behavior for prepend.
        }
        setLoadingMore(false);
    };

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;
        sendMessage(input);
        setInput("");
    };

    const getRoleBadge = (role?: string) => {
        if (!role || role === 'user') return null;
        const badges: Record<string, { text: string; bg: string; border: string; textColor: string }> = {
            'owner': { text: 'OWNER', bg: 'bg-black', border: 'border-white/30', textColor: 'text-white' },
            'admin': { text: 'ADMIN', bg: 'bg-red-600', border: 'border-red-400', textColor: 'text-white' },
            'banned': { text: 'BANNED', bg: 'bg-red-900', border: 'border-red-700', textColor: 'text-white' },
            'svip2': { text: 'SVIP II', bg: 'bg-gradient-to-r from-amber-500 to-yellow-400', border: 'border-amber-300', textColor: 'text-black' },
            'svip1': { text: 'SVIP', bg: 'bg-gradient-to-r from-amber-600 to-amber-400', border: 'border-amber-400', textColor: 'text-black' },
            'svip': { text: 'SVIP', bg: 'bg-gradient-to-r from-amber-600 to-amber-400', border: 'border-amber-400', textColor: 'text-black' },
            'vip': { text: 'VIP', bg: 'bg-gradient-to-r from-blue-500 to-cyan-400', border: 'border-blue-300', textColor: 'text-white' }
        };
        return badges[role] || null;
    };

    const MessageItem = ({ message }: { message: ChatMessage }) => {
        const badge = getRoleBadge(message.senderRole);
        
        if (message.system) {
            return (
                <div className="flex justify-center my-4">
                    <span className="bg-white/10 text-gray-400 text-xs px-3 py-1 rounded-full">{message.content}</span>
                </div>
            );
        }

        return (
            <div className={`flex ${message.isMine ? 'justify-end' : 'justify-start'} mb-4 gap-2 px-4`}>
                {!message.isMine && (
                    <div className="flex-shrink-0 mt-5">
                        {message.senderAvatar ? (
                            <img src={message.senderAvatar} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                                {message.sender.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>
                )}
                
                <div className={`max-w-[70%] flex flex-col ${message.isMine ? 'items-end' : 'items-start'}`}>
                    {!message.isMine && (
                         <div className="flex items-center gap-1.5 mb-1 ml-1">
                            <span className="text-[10px] text-gray-500">{message.sender}</span>
                            {badge && (
                                <span className={`text-[8px] px-1.5 py-0.5 rounded font-bold border ${badge.bg} ${badge.border} ${badge.textColor} shadow-sm`}>
                                    {badge.text}
                                </span>
                            )}
                         </div>
                    )}
                    
                    <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed break-words shadow-sm ${
                        message.isMine 
                        ? 'bg-blue-600 text-white rounded-br-none' 
                        : 'bg-[#2a2a2c] text-gray-100 rounded-bl-none border border-white/5'
                    } ${message.pending ? 'opacity-70' : ''}`}>
                        {message.content}
                    </div>
                    
                    <div className="flex items-center gap-1.5 mt-1 mx-1">
                        <span className="text-[9px] text-gray-600">
                            {new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </span>
                        {message.pending && <i className="fas fa-clock text-[8px] text-gray-500"></i>}
                    </div>
                </div>

                {message.isMine && (
                    <div className="flex-shrink-0 mt-5">
                         {user.avatarUrl ? (
                            <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover" />
                        ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-400 to-purple-500 flex items-center justify-center text-white text-xs font-bold">
                                {user.username.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="glass w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden bg-black/40 backdrop-blur-md border border-white/10">
            {/* Header */}
            <div className="h-16 bg-white/5 border-b border-white/10 flex items-center justify-between px-6 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="relative">
                        <div className={`w-3 h-3 rounded-full ${status === 'connected' ? 'bg-green-500 shadow-[0_0_10px_#22c55e]' : 'bg-red-500'}`}></div>
                    </div>
                    <div>
                        <h2 className="font-bold text-lg leading-tight text-white">{roomName} <span className="text-xs font-normal text-gray-500 ml-2">ID: {roomId}</span></h2>
                        <div className="text-xs text-gray-400">
                            {status === 'connected' ? 'Secure Connection' : status === 'connecting' ? 'Connecting...' : 'Disconnected'}
                        </div>
                    </div>
                </div>
                <button onClick={onLeave} className="px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm rounded-lg transition border border-red-500/20">
                    离开
                </button>
            </div>

            {/* Messages Area with Virtual Scroll */}
            <div className="flex-1 bg-black/20">
                <Virtuoso
                    ref={virtuosoRef}
                    data={messages}
                    itemContent={(_, message) => <MessageItem message={message} />}
                    atBottomStateChange={setAtBottom}
                    initialTopMostItemIndex={messages.length - 1}
                    followOutput={atBottom}
                    startReached={handleStartReached}
                    className="custom-scroll"
                    components={{
                        Header: () => loadingMore ? <div className="text-center text-gray-500 text-xs py-2">Loading history...</div> : null
                    }}
                />
            </div>

            {/* Input Area */}
            <div className="p-4 bg-white/5 border-t border-white/10 shrink-0">
                <form onSubmit={handleSend} className="flex gap-3">
                    <input 
                        type="text" 
                        value={input} 
                        onChange={e => setInput(e.target.value)} 
                        placeholder="发送消息..." 
                        className="flex-1 bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 focus:bg-black/60 transition"
                        autoFocus
                    />
                    <button type="submit" disabled={!input.trim() || status !== 'connected'} className="w-12 h-12 flex items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20">
                        <i className="fas fa-paper-plane"></i>
                    </button>
                </form>
            </div>
        </div>
    );
};