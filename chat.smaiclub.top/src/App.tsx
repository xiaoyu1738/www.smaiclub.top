import { useCallback, useState, useEffect } from 'react';
import { ChatRoom } from './components/ChatRoom';
import { Landing, type LandingPanel } from './components/Landing';
import { AppMenuDrawer } from './components/AppMenuDrawer';
import { SettingsModal } from './components/SettingsModal';
import type { User, Room } from './types';
import { apiUrl, IS_DEMO_MODE } from './config/api';
import { demoRooms, demoUser } from './config/demo';
import './App.css';

function BannedModal({ user, onEmergency }: { user: User, onEmergency: () => void }) {
    if (!user.isBanned) return null;
    return (
        <div className="modal-backdrop">
            <div className="dialog danger-dialog">
                <div className="dialog-mark">!</div>
                <h2>账号已被封禁</h2>
                <p>
                    您的账号因违反社区规定已被封禁。<br />
                    解封时间: {user.bannedUntil ? new Date(user.bannedUntil).toLocaleString() : '永久'}
                </p>
                <button
                    onClick={onEmergency}
                    className="button button-danger button-full"
                >
                    前往申诉 (Emergency Room)
                </button>
            </div>
        </div>
    );
}

type ViewState = 'loading' | 'landing' | 'chat' | 'banned' | 'error';

function mergeRoomList(rooms: { owned: Room[]; joined: Room[] }, room: Room, bucket?: 'owned' | 'joined') {
    const existingOwnedIndex = rooms.owned.findIndex(item => String(item.id) === String(room.id));
    if (existingOwnedIndex !== -1) {
        return {
            ...rooms,
            owned: rooms.owned.map((item, index) => index === existingOwnedIndex ? { ...item, ...room } : item),
        };
    }

    const existingJoinedIndex = rooms.joined.findIndex(item => String(item.id) === String(room.id));
    if (existingJoinedIndex !== -1) {
        return {
            ...rooms,
            joined: rooms.joined.map((item, index) => index === existingJoinedIndex ? { ...item, ...room } : item),
        };
    }

    const targetBucket = bucket || 'joined';
    return {
        ...rooms,
        [targetBucket]: [room, ...rooms[targetBucket]],
    };
}

function App() {
    const [view, setView] = useState<ViewState>(IS_DEMO_MODE ? "landing" : "loading");
    const [user, setUser] = useState<User | null>(IS_DEMO_MODE ? demoUser : null);
    const [room, setRoom] = useState<Room | null>(null);
    const [knownRooms, setKnownRooms] = useState<{ owned: Room[]; joined: Room[] }>(IS_DEMO_MODE ? demoRooms : { owned: [], joined: [] });
    const [errorMsg, setErrorMsg] = useState("");
    const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [landingPanel, setLandingPanel] = useState<LandingPanel>('home');

    const enterRoom = useCallback((targetRoom: Room) => {
        const savedKey = localStorage.getItem(`room_key_${targetRoom.id}`);
        const roomKey = targetRoom.key || savedKey;
        if (!roomKey) {
            setRoom(null);
            setView('landing');
            return;
        }
        const roomWithKey = { ...targetRoom, key: roomKey };
        localStorage.setItem(`room_key_${roomWithKey.id}`, roomWithKey.key);
        setRoom(roomWithKey);
        setKnownRooms(prev => mergeRoomList(prev, roomWithKey));
        setView('chat');
    }, []);

    const handleCreatedRoom = useCallback((createdRoom: Room) => {
        localStorage.setItem(`room_key_${createdRoom.id}`, createdRoom.key);
        setKnownRooms(prev => mergeRoomList(prev, createdRoom, 'owned'));
        setRoom(createdRoom);
        setView('chat');
    }, []);

    const handleJoinedRoom = useCallback((joinedRoom: Room) => {
        localStorage.setItem(`room_key_${joinedRoom.id}`, joinedRoom.key);
        setKnownRooms(prev => mergeRoomList(prev, joinedRoom, 'joined'));
        setRoom(joinedRoom);
        setView('chat');
    }, []);

    const openLandingPanel = useCallback((panel: LandingPanel) => {
        setLandingPanel(panel);
        setRoom(null);
        setView('landing');
        setIsAppMenuOpen(false);
    }, []);

    const enterEmergencyRoom = useCallback(() => {
        setIsAppMenuOpen(false);
        enterRoom({ id: '000001', key: 'smaiclub_issues', name: 'Emergency Channel' });
    }, [enterRoom]);

    const openSettings = useCallback(() => {
        setIsAppMenuOpen(false);
        setShowSettings(true);
    }, []);

    useEffect(() => {
        if (IS_DEMO_MODE) return;

        fetch(apiUrl('/api/me'), { credentials: 'include' })
            .then(res => {
                if (res.ok) return res.json();
                throw new Error("Network response was not ok");
            })
            .then(data => {
                if (data.loggedIn) {
                    const userData: User = {
                        username: data.username,
                        displayName: data.displayName || data.username,
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
        <div className={`app-shell app-view-${view}`}>
            <div className="ambient-grid" aria-hidden="true" />
            {user && view !== 'loading' && view !== 'error' && view !== 'banned' && (
                <AppMenuDrawer
                    isOpen={isAppMenuOpen}
                    user={user}
                    showAuthControl={!IS_DEMO_MODE}
                    onOpen={() => setIsAppMenuOpen(true)}
                    onClose={() => setIsAppMenuOpen(false)}
                    onCreateRoom={() => openLandingPanel('create')}
                    onJoinRoom={() => openLandingPanel('join')}
                    onOpenSettings={openSettings}
                    onEmergency={enterEmergencyRoom}
                />
            )}

            {view === 'loading' && (
                <div className="state-panel">
                    <div className="loader-ring" />
                    <div className="state-kicker">正在验证身份...</div>
                </div>
            )}

            {view === 'error' && (
                <div className="dialog danger-dialog">
                    <div className="dialog-mark">!</div>
                    <h2>连接错误</h2>
                    <p>{errorMsg}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="button button-primary"
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
                    panel={landingPanel}
                    onPanelChange={setLandingPanel}
                    onEnterRoom={enterRoom}
                    onRoomsChange={setKnownRooms}
                    onCreated={handleCreatedRoom}
                    onJoined={handleJoinedRoom}
                />
            )}

            {view === 'chat' && room && user && (
                <ChatRoom
                    key={room.id}
                    roomId={parseInt(room.id.toString())}
                    roomKey={room.key}
                    roomName={room.name}
                    user={user}
                    rooms={knownRooms}
                    onEnterRoom={enterRoom}
                />
            )}
            {showSettings && (
                <SettingsModal
                    isOpen={showSettings}
                    onClose={() => setShowSettings(false)}
                    joinedRooms={[...knownRooms.owned, ...knownRooms.joined]}
                />
            )}
        </div>
    );
}

export default App;
