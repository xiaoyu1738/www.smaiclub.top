import type { Room, User } from '../types';

interface RoomSidebarProps {
    user?: User | null;
    rooms: { owned: Room[]; joined: Room[] };
    activeRoomId?: string | number | null;
    onEnterRoom: (room: Room) => void;
}

function RoomTile({ room, owned, active, onEnterRoom }: { room: Room; owned: boolean; active: boolean; onEnterRoom: (room: Room) => void }) {
    const first = (room.name || String(room.id)).trim().charAt(0).toUpperCase() || "#";
    return (
        <button type="button" className={`room-tile ${active ? 'is-active-room' : ''}`} onClick={() => onEnterRoom(room)}>
            <span className="room-tile-mark">{first}</span>
            <span className="room-tile-body">
                <span className="room-tile-name">{room.name}</span>
                <span className="room-tile-meta">
                    ID {room.id}
                    {room.is_private === 1 ? " / Private" : ""}
                    {owned ? " / Owner" : ""}
                </span>
            </span>
        </button>
    );
}

export function RoomSidebar({ user, rooms, activeRoomId, onEnterRoom }: RoomSidebarProps) {
    const hasRooms = rooms.owned.length > 0 || rooms.joined.length > 0;

    return (
        <div className="telegram-sidebar">
            <div className="telegram-sidebar-top">
                <span className="telegram-menu-spacer" aria-hidden="true" />
                <div className="telegram-search">Search</div>
            </div>

            <div className="telegram-profile-row">
                <div className="room-tile-mark">SC</div>
                <div>
                    <strong>SMAI Chat</strong>
                    <span>{user?.displayName || user?.username || "欢迎回来"}</span>
                </div>
            </div>

            {!hasRooms ? (
                <div className="telegram-sidebar-empty">
                    <strong>还没有房间</strong>
                    <span>左上角菜单可以创建房间、加入房间，或者进入申诉房间。</span>
                </div>
            ) : (
                <div className="room-sections custom-scroll">
                    {rooms.owned.length > 0 && (
                        <section className="room-section">
                            <h2>我拥有的房间</h2>
                            <div className="room-grid">
                                {rooms.owned.map(room => (
                                    <RoomTile
                                        key={room.id}
                                        room={room}
                                        owned
                                        active={String(activeRoomId) === String(room.id)}
                                        onEnterRoom={onEnterRoom}
                                    />
                                ))}
                            </div>
                        </section>
                    )}
                    {rooms.joined.length > 0 && (
                        <section className="room-section">
                            <h2>我加入过的房间</h2>
                            <div className="room-grid">
                                {rooms.joined.map(room => (
                                    <RoomTile
                                        key={room.id}
                                        room={room}
                                        owned={false}
                                        active={String(activeRoomId) === String(room.id)}
                                        onEnterRoom={onEnterRoom}
                                    />
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            )}
        </div>
    );
}
