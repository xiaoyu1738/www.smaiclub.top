import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import type { Room } from '../types';
import { apiUrl, IS_DEMO_MODE } from '../config/api';
import { demoRooms } from '../config/demo';
import { CreateRoom } from './CreateRoom';
import { JoinRoom } from './JoinRoom';
import { RoomSidebar } from './RoomSidebar';

interface LandingProps {
    rooms: { owned: Room[]; joined: Room[] };
    panel: LandingPanel;
    onPanelChange: (panel: LandingPanel) => void;
    onEnterRoom: (room: Room) => void;
    onRoomsChange: (rooms: { owned: Room[]; joined: Room[] }) => void;
    onCreated: (room: Room) => void;
    onJoined: (room: Room) => void;
}

export type LandingPanel = 'home' | 'create' | 'join';

export function Landing({ rooms, panel, onPanelChange, onEnterRoom, onRoomsChange, onCreated, onJoined }: LandingProps) {
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
                <RoomSidebar rooms={rooms} onEnterRoom={onEnterRoom} />
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
                        <MessageCircle size={52} strokeWidth={1.2} className="empty-state-icon" />
                        <h2>选择一个聊天</h2>
                        <p>{hasRooms ? '从左侧选择会话，或从左上角菜单创建新房间。' : '左上角菜单可以创建房间、加入房间，或者进入申诉房间。'}</p>
                    </div>
                )}
            </section>
        </main>
    );
}
