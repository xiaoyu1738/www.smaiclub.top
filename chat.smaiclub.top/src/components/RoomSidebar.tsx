import { useState } from 'react';
import { Search, Inbox, X } from 'lucide-react';
import type { CSSProperties, PointerEvent } from 'react';
import type { Room } from '../types';
import { formatRoomId, formatRoomName } from '../utils/roomDisplay';

interface RoomSidebarProps {
    rooms: { owned: Room[]; joined: Room[] };
    activeRoomId?: string | number | null;
    onEnterRoom: (room: Room) => void;
}

function normalizeRoomId(value: string | number | null | undefined) {
    if (value === null || value === undefined) return '';
    const normalized = String(value).trim();
    const numeric = Number(normalized);
    return Number.isNaN(numeric) ? normalized : String(numeric);
}

function roomMatchesSearch(room: Room, owned: boolean, query: string) {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;

    const searchableText = [
        room.name,
        formatRoomName(room),
        String(room.id),
        formatRoomId(room.id),
        `id ${room.id}`,
        `id ${formatRoomId(room.id)}`,
        owned ? 'owner owned 我拥有的房间' : 'joined joined-room 我加入过的房间',
        room.is_private === 1 ? 'private 私密' : 'public 公开',
    ].join(' ').toLowerCase();

    return searchableText.includes(normalizedQuery);
}

function RoomTile({ room, owned, active, onEnterRoom }: { room: Room; owned: boolean; active: boolean; onEnterRoom: (room: Room) => void }) {
    const displayName = formatRoomName(room);
    const displayId = formatRoomId(room.id);
    const first = (displayName || displayId).trim().charAt(0).toUpperCase() || "#";
    const [pressRipple, setPressRipple] = useState<{ id: number; x: number; y: number; releasing: boolean } | null>(null);

    const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
        const rect = event.currentTarget.getBoundingClientRect();
        const id = performance.now();
        setPressRipple({
            id,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            releasing: false,
        });
    };

    const releasePressRipple = () => {
        setPressRipple(current => {
            if (!current || current.releasing) return current;
            const releaseId = current.id;
            window.setTimeout(() => {
                setPressRipple(latest => latest?.id === releaseId ? null : latest);
            }, 260);
            return { ...current, releasing: true };
        });
    };

    return (
        <button
            type="button"
            className={`room-tile ${active ? 'is-active-room' : ''}`}
            onPointerDown={handlePointerDown}
            onPointerUp={releasePressRipple}
            onPointerCancel={releasePressRipple}
            onPointerLeave={releasePressRipple}
            onClick={() => onEnterRoom(room)}
        >
            <span className="room-tile-mark">{first}</span>
            <span className="room-tile-body">
                <span className="room-tile-name">{displayName}</span>
                <span className="room-tile-meta">
                    ID {displayId}
                    {room.is_private === 1 ? " / Private" : ""}
                    {owned ? " / Owner" : ""}
                </span>
            </span>
            {pressRipple && (
                <span
                    key={pressRipple.id}
                    className={`room-tile-press-shadow ${pressRipple.releasing ? 'is-releasing' : ''}`}
                    aria-hidden="true"
                    style={{
                        '--press-x': `${pressRipple.x}px`,
                        '--press-y': `${pressRipple.y}px`,
                    } as CSSProperties}
                />
            )}
        </button>
    );
}

export function RoomSidebar({ rooms, activeRoomId, onEnterRoom }: RoomSidebarProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const hasRooms = rooms.owned.length > 0 || rooms.joined.length > 0;
    const normalizedActiveRoomId = normalizeRoomId(activeRoomId);
    const filteredRooms = {
        owned: rooms.owned.filter(room => roomMatchesSearch(room, true, searchQuery)),
        joined: rooms.joined.filter(room => roomMatchesSearch(room, false, searchQuery)),
    };
    const hasSearchQuery = searchQuery.trim().length > 0;
    const hasSearchResults = filteredRooms.owned.length > 0 || filteredRooms.joined.length > 0;

    return (
        <div className="telegram-sidebar">
            <div className="telegram-sidebar-top">
                <span className="telegram-menu-spacer" aria-hidden="true" />
                <label className="telegram-search">
                    <Search size={16} strokeWidth={2} />
                    <input
                        type="search"
                        value={searchQuery}
                        placeholder="Search"
                        aria-label="搜索房间"
                        onChange={event => setSearchQuery(event.target.value)}
                    />
                    {hasSearchQuery && (
                        <button type="button" className="telegram-search-clear" aria-label="清除搜索" onClick={() => setSearchQuery('')}>
                            <X size={14} strokeWidth={2.2} />
                        </button>
                    )}
                </label>
            </div>

            {!hasRooms ? (
                <div className="telegram-sidebar-empty">
                    <div className="sidebar-empty-icon"><Inbox size={26} strokeWidth={1.5} /></div>
                    <strong>还没有房间</strong>
                    <p>左上角菜单可以创建房间、加入房间，或者进入申诉房间。</p>
                </div>
            ) : hasSearchQuery && !hasSearchResults ? (
                <div className="telegram-sidebar-empty">
                    <div className="sidebar-empty-icon"><Search size={26} strokeWidth={1.5} /></div>
                    <strong>没有匹配的房间</strong>
                    <p>换个房间名、ID 或标签试试。</p>
                </div>
            ) : (
                <div className="room-sections custom-scroll">
                    {filteredRooms.owned.length > 0 && (
                        <section className="room-section">
                            <h2>我拥有的房间</h2>
                            <div className="room-grid">
                                {filteredRooms.owned.map(room => (
                                    <RoomTile
                                        key={room.id}
                                        room={room}
                                        owned
                                        active={normalizedActiveRoomId === normalizeRoomId(room.id)}
                                        onEnterRoom={onEnterRoom}
                                    />
                                ))}
                            </div>
                        </section>
                    )}
                    {filteredRooms.joined.length > 0 && (
                        <section className="room-section">
                            <h2>我加入过的房间</h2>
                            <div className="room-grid">
                                {filteredRooms.joined.map(room => (
                                    <RoomTile
                                        key={room.id}
                                        room={room}
                                        owned={false}
                                        active={normalizedActiveRoomId === normalizeRoomId(room.id)}
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
