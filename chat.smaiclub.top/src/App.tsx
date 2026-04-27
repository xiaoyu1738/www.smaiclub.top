import { useCallback, useState, useEffect } from 'react';
import { ChatRoom } from './components/ChatRoom';
import { Landing, type LandingPanel } from './components/Landing';
import { AppMenuDrawer } from './components/AppMenuDrawer';
import { SettingsModal } from './components/SettingsModal';
import { useTheme } from './hooks/useTheme';
import type { User, Room } from './types';
import { apiUrl, IS_DEMO_MODE } from './config/api';
import { demoRooms, demoUser } from './config/demo';
import { formatRoomId, formatRoomName } from './utils/roomDisplay';
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
type RoomGroups = { owned: Room[]; joined: Room[] };

const ROOM_ORDER_STORAGE_KEY = 'chat_room_order_v1';
const PINNED_ROOMS_STORAGE_KEY = 'chat_pinned_rooms_v1';

function normalizeRoomId(value: string | number | null | undefined) {
    if (value === null || value === undefined) return '';
    const normalized = String(value).trim();
    const numeric = Number(normalized);
    return Number.isNaN(numeric) ? normalized : String(numeric);
}

function readStoredRoomOrder(): { owned: string[]; joined: string[] } {
    try {
        const raw = localStorage.getItem(ROOM_ORDER_STORAGE_KEY);
        if (!raw) return { owned: [], joined: [] };
        const parsed = JSON.parse(raw);
        return {
            owned: Array.isArray(parsed?.owned) ? parsed.owned.map((value: string | number) => normalizeRoomId(value)) : [],
            joined: Array.isArray(parsed?.joined) ? parsed.joined.map((value: string | number) => normalizeRoomId(value)) : [],
        };
    } catch {
        return { owned: [], joined: [] };
    }
}

function writeStoredRoomOrder(rooms: RoomGroups) {
    localStorage.setItem(ROOM_ORDER_STORAGE_KEY, JSON.stringify({
        owned: rooms.owned.map(room => normalizeRoomId(room.id)),
        joined: rooms.joined.map(room => normalizeRoomId(room.id)),
    }));
}

function readPinnedRooms() {
    try {
        const raw = localStorage.getItem(PINNED_ROOMS_STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map((value: string | number) => normalizeRoomId(value)).filter(Boolean) : [];
    } catch {
        return [];
    }
}

function writePinnedRooms(roomIds: string[]) {
    localStorage.setItem(PINNED_ROOMS_STORAGE_KEY, JSON.stringify(roomIds));
}

function applyPinnedRoomOrder(rooms: RoomGroups, pinnedRoomIds: string[]): RoomGroups {
    const pinnedSet = new Set(pinnedRoomIds);
    const sortBucket = (bucket: Room[]) => {
        const pinned: Room[] = [];
        const rest: Room[] = [];
        for (const room of bucket) {
            if (pinnedSet.has(normalizeRoomId(room.id))) pinned.push(room);
            else rest.push(room);
        }
        return [...pinned, ...rest];
    };

    return {
        owned: sortBucket(rooms.owned),
        joined: sortBucket(rooms.joined),
    };
}

function mergeRoomBucket(current: Room[], incoming: Room[], storedOrder: string[]) {
    const merged = new Map<string, Room>();

    for (const room of current) {
        merged.set(normalizeRoomId(room.id), room);
    }

    for (const room of incoming) {
        const key = normalizeRoomId(room.id);
        merged.set(key, { ...merged.get(key), ...room });
    }

    const orderedIds: string[] = [];
    const seen = new Set<string>();

    for (const key of [...storedOrder, ...current.map(room => normalizeRoomId(room.id)), ...incoming.map(room => normalizeRoomId(room.id))]) {
        if (!key || seen.has(key) || !merged.has(key)) continue;
        seen.add(key);
        orderedIds.push(key);
    }

    return orderedIds.map(key => merged.get(key)!).filter(Boolean);
}

function mergeRoomGroups(current: RoomGroups, incoming: RoomGroups): RoomGroups {
    const storedOrder = readStoredRoomOrder();
    return applyPinnedRoomOrder({
        owned: mergeRoomBucket(current.owned, incoming.owned, storedOrder.owned),
        joined: mergeRoomBucket(current.joined, incoming.joined, storedOrder.joined),
    }, readPinnedRooms());
}

function mergeRoomList(rooms: RoomGroups, room: Room, bucket?: 'owned' | 'joined') {
    const normalizedRoomId = normalizeRoomId(room.id);
    const existingOwnedIndex = rooms.owned.findIndex(item => normalizeRoomId(item.id) === normalizedRoomId);
    if (existingOwnedIndex !== -1) {
        return {
            ...rooms,
            owned: rooms.owned.map((item, index) => index === existingOwnedIndex ? { ...item, ...room } : item),
        };
    }

    const existingJoinedIndex = rooms.joined.findIndex(item => normalizeRoomId(item.id) === normalizedRoomId);
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

function bumpRoomToFront(rooms: RoomGroups, roomId: string | number) {
    const normalizedTarget = normalizeRoomId(roomId);

    const moveToFront = (bucket: Room[]) => {
        const index = bucket.findIndex(room => normalizeRoomId(room.id) === normalizedTarget);
        if (index === -1) return bucket;
        const next = [...bucket];
        const [room] = next.splice(index, 1);
        next.unshift(room);
        return next;
    };

    return {
        owned: moveToFront(rooms.owned),
        joined: moveToFront(rooms.joined),
    };
}

function bumpRoomAfterActivity(rooms: RoomGroups, roomId: string | number, pinnedRoomIds: string[]) {
    if (pinnedRoomIds.includes(normalizeRoomId(roomId))) return applyPinnedRoomOrder(rooms, pinnedRoomIds);
    return applyPinnedRoomOrder(bumpRoomToFront(rooms, roomId), pinnedRoomIds);
}

function removeRoomFromGroups(rooms: RoomGroups, roomId: string | number) {
    const normalizedTarget = normalizeRoomId(roomId);
    return {
        owned: rooms.owned.filter(room => normalizeRoomId(room.id) !== normalizedTarget),
        joined: rooms.joined.filter(room => normalizeRoomId(room.id) !== normalizedTarget),
    };
}

function getRoomKeyStorageKey(roomId: string | number) {
    return `room_key_${formatRoomId(roomId)}`;
}

function readSavedRoomKey(roomId: string | number) {
    return localStorage.getItem(getRoomKeyStorageKey(roomId)) || localStorage.getItem(`room_key_${roomId}`);
}

function App() {
    const { theme, toggle: toggleTheme } = useTheme();
    const [view, setView] = useState<ViewState>(IS_DEMO_MODE ? "landing" : "loading");
    const [user, setUser] = useState<User | null>(IS_DEMO_MODE ? demoUser : null);
    const [room, setRoom] = useState<Room | null>(null);
    const [knownRooms, setKnownRooms] = useState<RoomGroups>(IS_DEMO_MODE ? mergeRoomGroups({ owned: [], joined: [] }, demoRooms) : { owned: [], joined: [] });
    const [errorMsg, setErrorMsg] = useState("");
    const [isAppMenuOpen, setIsAppMenuOpen] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [landingPanel, setLandingPanel] = useState<LandingPanel>('home');
    const [joinRoomDraft, setJoinRoomDraft] = useState<Pick<Room, 'id' | 'name'> | null>(null);
    const [pinnedRoomIds, setPinnedRoomIds] = useState<string[]>(readPinnedRooms);

    const enterRoom = useCallback((targetRoom: Room) => {
        const savedKey = readSavedRoomKey(targetRoom.id);
        const roomKey = targetRoom.key || savedKey;
        if (!roomKey) {
            setJoinRoomDraft({ id: targetRoom.id, name: formatRoomName(targetRoom) });
            setRoom(null);
            setLandingPanel('join');
            setView('landing');
            return;
        }
        const roomWithKey = { ...targetRoom, key: roomKey };
        localStorage.setItem(getRoomKeyStorageKey(roomWithKey.id), roomWithKey.key);
        setJoinRoomDraft(null);
        setRoom(roomWithKey);
        setKnownRooms(prev => applyPinnedRoomOrder(mergeRoomList(prev, roomWithKey), pinnedRoomIds));
        setView('chat');
    }, [pinnedRoomIds]);

    const handleCreatedRoom = useCallback((createdRoom: Room) => {
        localStorage.setItem(getRoomKeyStorageKey(createdRoom.id), createdRoom.key);
        setJoinRoomDraft(null);
        setKnownRooms(prev => applyPinnedRoomOrder(mergeRoomList(prev, createdRoom, 'owned'), pinnedRoomIds));
        setRoom(createdRoom);
        setView('chat');
    }, [pinnedRoomIds]);

    const handleJoinedRoom = useCallback((joinedRoom: Room) => {
        localStorage.setItem(getRoomKeyStorageKey(joinedRoom.id), joinedRoom.key);
        setJoinRoomDraft(null);
        setKnownRooms(prev => applyPinnedRoomOrder(mergeRoomList(prev, joinedRoom, 'joined'), pinnedRoomIds));
        setRoom(joinedRoom);
        setView('chat');
    }, [pinnedRoomIds]);

    const openLandingPanel = useCallback((panel: LandingPanel) => {
        setJoinRoomDraft(null);
        setLandingPanel(panel);
        setRoom(null);
        setView('landing');
        setIsAppMenuOpen(false);
    }, []);

    const enterEmergencyRoom = useCallback(() => {
        setIsAppMenuOpen(false);
        enterRoom({ id: '000001', key: 'smaiclub_issues', name: 'Emergency Room' });
    }, [enterRoom]);

    const openSettings = useCallback(() => {
        setIsAppMenuOpen(false);
        setShowSettings(true);
    }, []);

    const handleRoomsChange = useCallback((incomingRooms: RoomGroups) => {
        setKnownRooms(prev => applyPinnedRoomOrder(mergeRoomGroups(prev, incomingRooms), pinnedRoomIds));
    }, [pinnedRoomIds]);

    const handleRoomActivity = useCallback((activeRoomId: number) => {
        setKnownRooms(prev => bumpRoomAfterActivity(prev, activeRoomId, pinnedRoomIds));
    }, [pinnedRoomIds]);

    const handleTogglePinRoom = useCallback((targetRoomId: string | number) => {
        const normalizedTarget = normalizeRoomId(targetRoomId);
        setPinnedRoomIds(prev => {
            const next = prev.includes(normalizedTarget)
                ? prev.filter(roomId => roomId !== normalizedTarget)
                : [normalizedTarget, ...prev];
            writePinnedRooms(next);
            setKnownRooms(current => applyPinnedRoomOrder(current, next));
            return next;
        });
    }, []);

    const handleDeleteRoom = useCallback(async (targetRoom: Room) => {
        if (!IS_DEMO_MODE) {
            const response = await fetch(apiUrl(`/api/rooms/${formatRoomId(targetRoom.id)}`), {
                method: 'DELETE',
                credentials: 'include',
            });
            if (!response.ok) {
                let message = "删除失败，请稍后再试。";
                try {
                    const data = await response.json();
                    message = data.message || data.error || message;
                } catch {
                    // Keep fallback message.
                }
                throw new Error(message);
            }
        }

        localStorage.removeItem(getRoomKeyStorageKey(targetRoom.id));
        localStorage.removeItem(`room_key_${targetRoom.id}`);
        setPinnedRoomIds(prev => {
            const next = prev.filter(roomId => roomId !== normalizeRoomId(targetRoom.id));
            writePinnedRooms(next);
            return next;
        });
        setKnownRooms(prev => removeRoomFromGroups(prev, targetRoom.id));
        if (room && normalizeRoomId(room.id) === normalizeRoomId(targetRoom.id)) {
            setRoom(null);
            setLandingPanel('home');
            setView('landing');
        }
    }, [room]);

    useEffect(() => {
        writeStoredRoomOrder(knownRooms);
    }, [knownRooms]);

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
            {user && view !== 'loading' && view !== 'error' && view !== 'banned' && (
                <AppMenuDrawer
                    isOpen={isAppMenuOpen}
                    user={user}
                    showAuthControl={!IS_DEMO_MODE}
                    theme={theme}
                    onToggleTheme={toggleTheme}
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
                <section className="error-state-shell">
                    <div className="error-state-card">
                        <div className="error-state-header">
                            <div className="dialog-mark">!</div>
                            <div className="error-state-heading">
                                <p className="eyebrow">Auth Gateway</p>
                                <h2>现在连不上登录服务</h2>
                            </div>
                        </div>

                        <p className="error-state-copy">{errorMsg}</p>

                        <div className="error-state-list">
                            <div>
                                <strong>检查步骤</strong>
                                <span>网络、代理、或者是否拦截了 login.smaiclub.top。</span>
                            </div>
                            <div>
                                <strong>仍然出现问题</strong>
                                <span>稍后重试，或者先打开登录中心确认账号服务是否正常。</span>
                            </div>
                        </div>

                        <div className="error-state-actions">
                            <button
                                onClick={() => window.location.reload()}
                                className="button button-primary button-wide"
                            >
                                重新连接
                            </button>
                            <button
                                onClick={() => window.location.href = "https://login.smaiclub.top"}
                                className="button button-quiet button-wide"
                            >
                                打开登录中心
                            </button>
                        </div>
                    </div>
                </section>
            )}

            {view === 'banned' && user && (
                <BannedModal
                    user={user}
                    onEmergency={enterEmergencyRoom}
                />
            )}

            {view === 'landing' && user && (
                <Landing
                    rooms={knownRooms}
                    joinRoomDraft={joinRoomDraft}
                    panel={landingPanel}
                    onPanelChange={setLandingPanel}
                    onEnterRoom={enterRoom}
                    onRoomsChange={handleRoomsChange}
                    onCreated={handleCreatedRoom}
                    onJoined={handleJoinedRoom}
                    pinnedRoomIds={pinnedRoomIds}
                    onTogglePinRoom={handleTogglePinRoom}
                    onDeleteRoom={handleDeleteRoom}
                />
            )}

            {view === 'chat' && room && user && (
                <ChatRoom
                    key={room.id}
                    roomId={parseInt(room.id.toString())}
                    roomKey={room.key}
                    roomName={formatRoomName(room)}
                    user={user}
                    rooms={knownRooms}
                    onEnterRoom={enterRoom}
                    onRoomActivity={handleRoomActivity}
                    pinnedRoomIds={pinnedRoomIds}
                    onTogglePinRoom={handleTogglePinRoom}
                    onDeleteRoom={handleDeleteRoom}
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
