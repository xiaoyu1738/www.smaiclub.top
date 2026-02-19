import { useState, useEffect } from 'react';
import { ChatRoom } from './components/ChatRoom';
import { Landing } from './components/Landing';
import { CreateRoom } from './components/CreateRoom';
import { JoinRoom } from './components/JoinRoom';
import { AuthControl } from './components/AuthControl';
import type { User, Room } from './types';
import './App.css';

function BannedModal({ user, onEmergency }: { user: User, onEmergency: () => void }) {
    if (!user.isBanned) return null;
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-zinc-900 border border-red-500/30 p-8 rounded-2xl max-w-md w-full text-center shadow-2xl">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-ban text-3xl text-red-500"></i>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">账号已被封禁</h2>
                <p className="text-gray-400 mb-6">
                    您的账号因违反社区规定已被封禁。<br />
                    解封时间: {user.bannedUntil ? new Date(user.bannedUntil).toLocaleString() : '永久'}
                </p>
                <button
                    onClick={onEmergency}
                    className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-medium transition flex items-center justify-center gap-2"
                >
                    <i className="fas fa-life-ring"></i>
                    前往申诉 (Emergency Room)
                </button>
            </div>
        </div>
    );
}

type ViewState = 'loading' | 'landing' | 'create' | 'join' | 'chat' | 'banned' | 'error';

function App() {
    const [view, setView] = useState<ViewState>("loading");
    const [user, setUser] = useState<User | null>(null);
    const [room, setRoom] = useState<Room | null>(null);
    const [joinId, setJoinId] = useState("");
    const [joinName, setJoinName] = useState("");
    const [errorMsg, setErrorMsg] = useState("");

    useEffect(() => {
        fetch('/api/me', { credentials: 'include' })
            .then(res => {
                if (res.ok) return res.json();
                throw new Error("Network response was not ok");
            })
            .then(data => {
                if (data.loggedIn) {
                    const userData: User = {
                        username: data.username,
                        role: data.role,
                        isBanned: data.isBanned,
                        bannedUntil: data.bannedUntil,
                        avatarUrl: data.avatarUrl || null
                    };
                    setUser(userData);

                    if (data.isBanned) {
                        setView("banned");
                    } else {
                        setView("landing");
                    }
                } else {
                    // Redirect to login if not logged in (standard flow)
                    const returnUrl = window.location.href;
                    window.location.href = "https://login.smaiclub.top?redirect=" + encodeURIComponent(returnUrl);
                }
            })
            .catch((err) => {
                console.error("Auth check failed:", err);
                setErrorMsg("无法连接到认证服务器。请检查您的网络连接或稍后再试。");
                setView("error");
            });
    }, []);

    return (
        <div className="relative h-screen flex flex-col items-center justify-center p-4">
            <div className="absolute top-6 right-6 z-50">
                <AuthControl />
            </div>

            {view === 'loading' && (
                <div className="flex flex-col items-center gap-4 text-white">
                    <i className="fas fa-spinner fa-spin text-3xl text-blue-500"></i>
                    <div className="text-sm text-gray-500">正在验证身份...</div>
                </div>
            )}

            {view === 'error' && (
                <div className="text-center p-8 bg-zinc-900 border border-red-500/30 rounded-2xl max-w-md shadow-2xl">
                    <i className="fas fa-exclamation-triangle text-4xl text-red-500 mb-4"></i>
                    <h2 className="text-xl font-bold text-white mb-2">连接错误</h2>
                    <p className="text-gray-400 mb-6">{errorMsg}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition"
                    >
                        重试
                    </button>
                </div>
            )}

            {view === 'banned' && user && (
                <BannedModal
                    user={user}
                    onEmergency={() => {
                        setRoom({ id: '000001', key: 'smaiclub_issues', name: 'Emergency Channel' });
                        setView('chat');
                    }}
                />
            )}

            {view === 'landing' && user && (
                <Landing
                    user={user}
                    onCreate={() => setView('create')}
                    onJoin={() => { setJoinId(""); setJoinName(""); setView('join'); }}
                    onEnterRoom={(r: Room) => { setJoinId(r.id.toString()); setJoinName(r.name); setView('join'); }}
                    onEmergency={() => {
                        setRoom({ id: '000001', key: 'smaiclub_issues', name: 'Emergency Channel' });
                        setView('chat');
                    }}
                />
            )}

            {view === 'create' && (
                <CreateRoom
                    onBack={() => setView('landing')}
                    onCreated={(r: Room) => {
                        localStorage.setItem(`room_key_${r.id}`, r.key);
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
                    onJoined={(r: Room) => { setRoom(r); setView('chat'); }}
                />
            )}

            {view === 'chat' && room && user && (
                <ChatRoom
                    roomId={parseInt(room.id.toString())}
                    roomKey={room.key}
                    roomName={room.name}
                    user={user}
                    onLeave={() => {
                        setRoom(null);
                        // Redirect banned users back to banned view, others to landing
                        if (user.isBanned) {
                            setView('banned');
                        } else {
                            setView('landing');
                        }
                    }}
                />
            )}
        </div>
    );
}

export default App;
