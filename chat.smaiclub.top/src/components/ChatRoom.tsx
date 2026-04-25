import React, { useState, useRef, useEffect } from 'react';
import { useChat } from '../hooks/useChat';
import { useFaviconBadge } from '../hooks/useFaviconBadge';
import type { ChatMessage } from '../db/chatDB';
import type { Room, User } from '../types';
import { RoomSidebar } from './RoomSidebar';

interface ChatRoomProps {
    roomId: number;
    roomKey: string;
    roomName: string;
    user: User;
    rooms: { owned: Room[]; joined: Room[] };
    onEnterRoom: (room: Room) => void;
}

export const ChatRoom: React.FC<ChatRoomProps> = ({ roomId, roomKey, roomName, user, rooms, onEnterRoom }) => {
    const { messages, sendMessage, status, loadMoreMessages } = useChat({
        roomId,
        roomKey,
        username: user.username,
        role: user.role,
        avatarUrl: user.avatarUrl
    });
    const [input, setInput] = useState("");
    const messagesRef = useRef<HTMLDivElement>(null);
    const [loadingMore, setLoadingMore] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [showRoomKey, setShowRoomKey] = useState(false);
    const atBottomRef = useRef(true);
    const forceScrollToBottomRef = useRef(false);

    useFaviconBadge(unreadCount);

    // Load settings
    const [settings] = useState(() => {
        const saved = localStorage.getItem('chat_settings');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error("Failed to parse settings", e);
            }
        }
        return { enableNotifications: false, mutedRooms: [] as (string|number)[] };
    });

    // Reset unread count when window is focused
    useEffect(() => {
        const handleFocus = () => setUnreadCount(0);
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, []);

    // Increment unread count and show notification when new messages arrive
    const prevMessagesLength = useRef(messages.length);
    useEffect(() => {
        if (messages.length > prevMessagesLength.current) {
            const newMessage = messages[messages.length - 1];
            // Check if it's a new message (not just history loading)
            // We assume history loading happens in bulk or prepend, but here we check length increase
            // Ideally we check timestamp or ID
            
            // Only notify if not mine
            if (!newMessage.isMine) {
                if (document.hidden) {
                    setTimeout(() => setUnreadCount(prev => prev + 1), 0);
                }

                // Check for browser notification
                if (settings.enableNotifications && !settings.mutedRooms.includes(roomId)) {
                    if (document.hidden) {
                         if (Notification.permission === 'granted') {
                             new Notification(`New message in ${roomName}`, {
                                 body: `${newMessage.sender}: ${newMessage.content}`,
                                 icon: '/favicon.ico'
                             });
                         }
                    }
                }
            }
        }
        prevMessagesLength.current = messages.length;
    }, [messages, settings, roomId, roomName]);

    useEffect(() => {
        const container = messagesRef.current;
        if (!container) return;

        const lastMessage = messages[messages.length - 1];
        if (!lastMessage) return;

        const wasAtBottomBeforeUpdate = atBottomRef.current;
        const shouldForceOwnMessage = forceScrollToBottomRef.current && lastMessage.isMine;
        if (!wasAtBottomBeforeUpdate && !shouldForceOwnMessage) {
            forceScrollToBottomRef.current = false;
            return;
        }

        forceScrollToBottomRef.current = false;
        requestAnimationFrame(() => {
            container.scrollTo({
                top: container.scrollHeight,
                behavior: shouldForceOwnMessage ? 'auto' : 'smooth'
            });
            atBottomRef.current = true;
        });
    }, [messages]);

    const handleMessagesScroll = async (event: React.UIEvent<HTMLDivElement>) => {
        const container = event.currentTarget;
        const bottomDistance = container.scrollHeight - container.scrollTop - container.clientHeight;
        const isCurrentlyAtBottom = bottomDistance < 32;
        atBottomRef.current = isCurrentlyAtBottom;

        if (container.scrollTop > 24 || loadingMore || messages.length === 0) return;

        const previousScrollHeight = container.scrollHeight;
        setLoadingMore(true);
        const oldestMessage = messages[0];
        const count = await loadMoreMessages(oldestMessage.timestamp);
        if (count > 0) {
            requestAnimationFrame(() => {
                container.scrollTop = container.scrollHeight - previousScrollHeight;
            });
        }
        setLoadingMore(false);
    };

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim()) return;
        forceScrollToBottomRef.current = true;
        sendMessage(input);
        setInput("");
    };

    const getRoleBadge = (role?: string) => {
        if (!role || role === 'user') return null;
        const badges: Record<string, { text: string; className: string }> = {
            'owner': { text: 'OWNER', className: 'role-owner' },
            'admin': { text: 'ADMIN', className: 'role-admin' },
            'banned': { text: 'BANNED', className: 'role-banned' },
            'svip2': { text: 'SVIP II', className: 'role-svip' },
            'svip1': { text: 'SVIP', className: 'role-svip' },
            'svip': { text: 'SVIP', className: 'role-svip' },
            'vip': { text: 'VIP', className: 'role-vip' }
        };
        return badges[role] || null;
    };

    const MessageItem = ({ message }: { message: ChatMessage }) => {
        const badge = getRoleBadge(message.senderRole);
        
        if (message.system) {
            return (
                <div className="system-message">
                    <span>{message.content}</span>
                </div>
            );
        }

        return (
            <div className={`chat-message-row ${message.isMine ? 'is-mine' : 'is-other'}`}>
                {!message.isMine && (
                    <div className="avatar-wrap">
                        {message.senderAvatar ? (
                            <img src={message.senderAvatar} alt="" className="avatar" />
                        ) : (
                            <div className="avatar avatar-fallback">
                                {message.sender.charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>
                )}
                
                <div className="chat-message-stack">
                    {!message.isMine && (
                         <div className="message-meta">
                            <span>{message.sender}</span>
                            {badge && (
                                <span className={`role-badge ${badge.className}`}>
                                    {badge.text}
                                </span>
                            )}
                         </div>
                    )}
                    
                    <div className={`chat-bubble ${message.pending ? 'is-pending' : ''}`}>
                        {message.content}
                    </div>
                    
                    <div className="message-time">
                        {new Date(message.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        {message.pending && <span> / sending</span>}
                    </div>
                </div>

                {message.isMine && (
                    <div className="avatar-wrap">
                         {user.avatarUrl ? (
                            <img src={user.avatarUrl} alt="" className="avatar" />
                        ) : (
                            <div className="avatar avatar-fallback">
                                {(user.displayName || user.username).charAt(0).toUpperCase()}
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <main className="telegram-chat-layout">
            <aside className="telegram-chat-sidebar-wrap">
                <RoomSidebar user={user} rooms={rooms} activeRoomId={roomId} onEnterRoom={onEnterRoom} />
                <div className="room-key-panel">
                    <button type="button" className="room-key-toggle" onClick={() => setShowRoomKey(value => !value)}>
                        {showRoomKey ? '隐藏房间密钥' : '查看房间密钥'}
                    </button>
                    {showRoomKey && (
                        <div className="room-key-box">
                            <code>{roomKey}</code>
                            <button type="button" onClick={() => navigator.clipboard?.writeText(roomKey)}>复制</button>
                        </div>
                    )}
                </div>
            </aside>

            <section className="chat-shell">
            <header className="chat-header">
                <div className="chat-title-group">
                    <div className="status-light-wrap">
                        <div className={`status-light ${status === 'connected' ? 'is-connected' : 'is-offline'}`}></div>
                    </div>
                    <div className="chat-heading">
                        <h2 className="chat-title">{roomName}</h2>
                        <div className="chat-subtitle">
                            ID {roomId} / {status === 'connected' ? 'Secure connection' : status === 'connecting' ? 'Connecting' : 'Disconnected'}
                        </div>
                    </div>
                </div>
            </header>

            <div className="chat-messages custom-scroll" ref={messagesRef} onScroll={handleMessagesScroll}>
                {loadingMore && <div className="history-loader">Loading history...</div>}
                {messages.map(message => (
                    <MessageItem key={`${message.id}-${message.tempId || ''}`} message={message} />
                ))}
            </div>

            <div className="chat-input-wrap">
                <form onSubmit={handleSend} className="chat-input-form">
                    <input 
                        type="text" 
                        value={input} 
                        onChange={e => setInput(e.target.value)} 
                        placeholder="发送消息..." 
                        autoFocus
                    />
                    <button type="submit" disabled={!input.trim() || status !== 'connected'} className="button button-primary send-button">
                        发送
                    </button>
                </form>
            </div>
            </section>
        </main>
    );
};
