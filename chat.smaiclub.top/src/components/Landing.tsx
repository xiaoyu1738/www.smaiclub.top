import { useState, useEffect } from 'react';
import type { User, Room } from '../types';
import { apiUrl, IS_DEMO_MODE } from '../config/api';
import { demoRooms } from '../config/demo';
import { CreateRoom } from './CreateRoom';
import { JoinRoom } from './JoinRoom';
import { RoomSidebar } from './RoomSidebar';

interface LandingProps {
    user: User | null;
    panel: LandingPanel;
    onPanelChange: (panel: LandingPanel) => void;
    onEnterRoom: (room: Room) => void;
    onRoomsChange: (rooms: { owned: Room[]; joined: Room[] }) => void;
    onCreated: (room: Room) => void;
    onJoined: (room: Room) => void;
}

export type LandingPanel = 'home' | 'create' | 'join';

export function Landing({ user, panel, onPanelChange, onEnterRoom, onRoomsChange, onCreated, onJoined }: LandingProps) {
    const [rooms, setRooms] = useState<{ owned: Room[], joined: Room[] }>(IS_DEMO_MODE ? demoRooms : { owned: [], joined: [] });
    const [loading, setLoading] = useState(!IS_DEMO_MODE);

    useEffect(() => {
        if (IS_DEMO_MODE) {
            onRoomsChange(demoRooms);
            return;
        }

        fetch(apiUrl('/api/user/rooms'), { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                if (data.owned || data.joined) {
                    const loadedRooms = { owned: data.owned || [], joined: data.joined || [] };
                    setRooms(loadedRooms);
                    onRoomsChange(loadedRooms);
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [onRoomsChange]);

    const hasRooms = rooms.owned.length > 0 || rooms.joined.length > 0;

    return (
        <main className={`telegram-layout ${panel !== 'home' ? 'has-active-panel' : ''}`}>
            {loading ? (
                <aside className="telegram-sidebar">
                    <div className="state-panel inline-state">
                        <div className="loader-ring" />
                        <div className="state-kicker">正在读取房间...</div>
                    </div>
                </aside>
            ) : (
                <RoomSidebar user={user} rooms={rooms} onEnterRoom={onEnterRoom} />
            )}

            <section className="telegram-empty-chat">
                <header className="telegram-chat-header">
                    <div>
                        <h1>SMAI Chat</h1>
                        <p>选择一个房间，或者新建一条加密会话。</p>
                    </div>
                </header>
                {panel === 'create' && (
                    <CreateRoom onBack={() => onPanelChange('home')} onCreated={onCreated} />
                )}
                {panel === 'join' && (
                    <JoinRoom initialRoomId="" initialRoomName="" onBack={() => onPanelChange('home')} onJoined={onJoined} />
                )}
                {panel === 'home' && (
                    <div className="telegram-empty-state">
                        <div className="empty-sigil">SC</div>
                        <h2>SMAI Chat</h2>
                        <p>{hasRooms ? '左侧选择会话，或从左上角菜单创建一个新房间。' : '左上角菜单可以创建房间、加入房间，或者进入申诉房间。'}</p>
                    </div>
                )}
            </section>
        </main>
    );
}
