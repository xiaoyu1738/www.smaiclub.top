import React, { useState, useRef, useEffect, useCallback } from 'react';
import { SendHorizonal, Copy, Eye, EyeOff, ChevronDown, Check, WifiOff, RefreshCw } from 'lucide-react';
import { useChat } from '../hooks/useChat';
import { useFaviconBadge } from '../hooks/useFaviconBadge';
import type { ChatMessage } from '../db/chatDB';
import type { Room, User } from '../types';
import { RoomSidebar } from './RoomSidebar';
import { formatRoomId } from '../utils/roomDisplay';

/** 纯函数，无状态依赖，放在模块顶层避免每次 render 重建 */
function getRoleBadge(role?: string) {
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
}

/**
 * 独立组件——不再定义在 ChatRoom 内部，
 * React 能保持稳定的组件引用，避免输入框 setState 触发全量重挂载。
 */
const MessageItem = React.memo(({ message, currentUser }: { message: ChatMessage; currentUser: User }) => {
    const badge = getRoleBadge(message.senderRole);
    const sentAt = new Date(message.timestamp).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });

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
                    {sentAt}
                    {message.pending && <span> / sending</span>}
                </div>
            </div>

            {message.isMine && (
                <div className="avatar-wrap">
                    {currentUser.avatarUrl ? (
                        <img src={currentUser.avatarUrl} alt="" className="avatar" />
                    ) : (
                        <div className="avatar avatar-fallback">
                            {(currentUser.displayName || currentUser.username).charAt(0).toUpperCase()}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});

interface ChatRoomProps {
    roomId: number;
    roomKey: string;
    roomName: string;
    user: User;
    rooms: { owned: Room[]; joined: Room[] };
    onEnterRoom: (room: Room) => void;
    onRoomActivity: (roomId: number) => void;
    pinnedRoomIds: string[];
    onTogglePinRoom: (roomId: string | number) => void;
    onDeleteRoom: (room: Room) => Promise<void>;
    onRoomDeleted: (roomId: string | number, roomName: string) => void;
}

export const ChatRoom: React.FC<ChatRoomProps> = ({ roomId, roomKey, roomName, user, rooms, onEnterRoom, onRoomActivity, pinnedRoomIds, onTogglePinRoom, onDeleteRoom, onRoomDeleted }) => {
    const { messages, sendMessage, status, loadMoreMessages, reconnect } = useChat({
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
    const [retryRoomKey, setRetryRoomKey] = useState("");
    const atBottomRef = useRef(true);
    const forceScrollToBottomRef = useRef(false);

    useFaviconBadge(unreadCount);

    useEffect(() => {
        if (status !== 'room_deleted') return;
        onRoomDeleted(roomId, roomName);
    }, [onRoomDeleted, roomId, roomName, status]);

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
                if (!newMessage.system) {
                    onRoomActivity(roomId);
                }

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
    }, [messages, onRoomActivity, settings, roomId, roomName]);

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
        setShowScrollFab(!isCurrentlyAtBottom);

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

    const handleRetryKeySubmit = (event: React.FormEvent) => {
        event.preventDefault();
        const nextKey = retryRoomKey.trim();
        if (!nextKey) return;
        onEnterRoom({ id: roomId, name: roomName, key: nextKey });
        setRetryRoomKey("");
    };

    const [showScrollFab, setShowScrollFab] = useState(false);
    const [copyToast, setCopyToast] = useState(false);

    const scrollToBottom = useCallback(() => {
        const container = messagesRef.current;
        if (!container) return;
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }, []);

    const handleCopyKey = useCallback(() => {
        navigator.clipboard?.writeText(roomKey).then(() => {
            setCopyToast(true);
            setTimeout(() => setCopyToast(false), 1800);
        });
    }, [roomKey]);


    return (
        <main className="telegram-chat-layout">
            <aside className="telegram-chat-sidebar-wrap">
                <RoomSidebar
                    rooms={rooms}
                    activeRoomId={roomId}
                    pinnedRoomIds={pinnedRoomIds}
                    onEnterRoom={onEnterRoom}
                    onTogglePinRoom={onTogglePinRoom}
                    onDeleteRoom={onDeleteRoom}
                />
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
                            <span>ID {formatRoomId(roomId)} / {status === 'connected' ? 'Secure connection' : status === 'connecting' ? 'Connecting' : status === 'invalid_key' ? '房间密钥错误' : status === 'room_deleted' ? '房间已删除' : 'Disconnected'}</span>
                            <button
                                type="button"
                                className="reconnect-button"
                                onClick={reconnect}
                                disabled={status === 'connecting'}
                                aria-label="手动重连"
                                title="手动重连"
                            >
                                <RefreshCw size={12} strokeWidth={2.2} />
                            </button>
                        </div>
                    </div>
                </div>
                <div className="chat-header-actions">
                    <div className="room-key-popover-wrap">
                        <button
                            type="button"
                            className="room-key-toggle"
                            aria-expanded={showRoomKey}
                            onClick={() => setShowRoomKey(value => !value)}
                        >
                            {showRoomKey ? <><EyeOff size={15} /> 隐藏密钥</> : <><Eye size={15} /> 查看密钥</>}
                        </button>
                        {showRoomKey && (
                            <div className="room-key-box">
                                <code>{roomKey}</code>
                                <button type="button" onClick={handleCopyKey}><Copy size={14} /> 复制</button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {(status === 'disconnected' || status === 'error') && (
                <div className="disconnect-banner">
                    <WifiOff size={14} />
                    连接已断开，正在尝试重连...
                </div>
            )}

            <div className="chat-messages custom-scroll" ref={messagesRef} onScroll={handleMessagesScroll}>
                {loadingMore && <div className="history-loader">Loading history...</div>}
                {status === 'invalid_key' ? (
                    <div className="chat-auth-panel">
                        <form onSubmit={handleRetryKeySubmit} className="chat-auth-card">
                            <div>
                                <p className="eyebrow">Room Key</p>
                                <h2>重新输入房间密钥</h2>
                                <p>当前密钥不正确，输入正确密钥后会重新连接这个房间。</p>
                            </div>
                            <label className="field">
                                <span>房间密钥 (Key)</span>
                                <input
                                    type="password"
                                    value={retryRoomKey}
                                    onChange={event => setRetryRoomKey(event.target.value)}
                                    placeholder="粘贴密钥..."
                                    required
                                    autoFocus
                                />
                            </label>
                            <button type="submit" disabled={!retryRoomKey.trim()} className="button button-primary button-full">
                                重新连接
                            </button>
                        </form>
                    </div>
                ) : (
                    messages.map(message => (
                        <MessageItem key={message.tempId || message.id} message={message} currentUser={user} />
                    ))
                )}
            </div>

            {showScrollFab && (
                <button type="button" className="scroll-fab" onClick={scrollToBottom} aria-label="滚动到底部">
                    <ChevronDown size={20} />
                </button>
            )}

            {status !== 'invalid_key' && (
                <div className={`chat-input-wrap ${status !== 'connected' ? 'is-disabled' : ''}`}>
                    <form onSubmit={handleSend} className="chat-input-form">
                        <input
                            type="text"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="发送消息..."
                            autoFocus
                        />
                        <button type="submit" disabled={!input.trim() || status !== 'connected'} className="button button-primary send-button">
                            <SendHorizonal size={18} />
                        </button>
                    </form>
                </div>
            )}
            </section>
            {copyToast && <div className="copy-toast"><Check size={14} /> 已复制到剪贴板</div>}
        </main>
    );
};
