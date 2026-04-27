import { useEffect, useState } from 'react';
import { Pin, Search, Trash2, X, Inbox } from 'lucide-react';
import type { CSSProperties, MouseEvent, PointerEvent } from 'react';
import type { Room } from '../types';
import { formatRoomId, formatRoomName } from '../utils/roomDisplay';

interface RoomSidebarProps {
    rooms: { owned: Room[]; joined: Room[] };
    activeRoomId?: string | number | null;
    pinnedRoomIds: string[];
    onEnterRoom: (room: Room) => void;
    onTogglePinRoom: (roomId: string | number) => void;
    onDeleteRoom: (room: Room) => Promise<void>;
}

function normalizeRoomId(value: string | number | null | undefined) {
    if (value === null || value === undefined) return '';
    const normalized = String(value).trim();
    const numeric = Number(normalized);
    return Number.isNaN(numeric) ? normalized : String(numeric);
}

function roomMatchesSearch(room: Room, query: string) {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;

    const nameText = [
        room.name,
        formatRoomName(room),
    ].join(' ').toLowerCase();

    if (/^[a-z]$/.test(normalizedQuery)) {
        return nameText.includes(normalizedQuery);
    }

    const searchableText = [
        nameText,
        String(room.id),
        formatRoomId(room.id),
    ].join(' ').toLowerCase();

    return searchableText.includes(normalizedQuery);
}

function RoomTile({
    room,
    owned,
    active,
    pinned,
    onEnterRoom,
    onOpenContextMenu,
}: {
    room: Room;
    owned: boolean;
    active: boolean;
    pinned: boolean;
    onEnterRoom: (room: Room) => void;
    onOpenContextMenu: (event: MouseEvent<HTMLButtonElement>, room: Room, owned: boolean) => void;
}) {
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
            onContextMenu={event => onOpenContextMenu(event, room, owned)}
            onClick={() => onEnterRoom(room)}
        >
            {pinned && <span className="room-pin-badge" title="已置顶"><Pin size={12} /></span>}
            <span className="room-tile-mark">{first}</span>
            <span className="room-tile-body">
                <span className="room-tile-name">{displayName}</span>
                <span className="room-tile-meta">
                    {pinned ? "Pinned / " : ""}
                    ID {displayId}
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

export function RoomSidebar({ rooms, activeRoomId, pinnedRoomIds, onEnterRoom, onTogglePinRoom, onDeleteRoom }: RoomSidebarProps) {
    const [searchQuery, setSearchQuery] = useState('');
    const [contextMenu, setContextMenu] = useState<{ room: Room; owned: boolean; x: number; y: number } | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Room | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState("");
    const hasRooms = rooms.owned.length > 0 || rooms.joined.length > 0;
    const normalizedActiveRoomId = normalizeRoomId(activeRoomId);
    const filteredRooms = {
        owned: rooms.owned.filter(room => roomMatchesSearch(room, searchQuery)),
        joined: rooms.joined.filter(room => roomMatchesSearch(room, searchQuery)),
    };
    const hasSearchQuery = searchQuery.trim().length > 0;
    const hasSearchResults = filteredRooms.owned.length > 0 || filteredRooms.joined.length > 0;
    const pinnedSet = new Set(pinnedRoomIds);

    useEffect(() => {
        if (!contextMenu) return;
        const close = () => setContextMenu(null);
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') close();
        };
        window.addEventListener('click', close);
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('click', close);
            window.removeEventListener('scroll', close, true);
            window.removeEventListener('resize', close);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [contextMenu]);

    const openContextMenu = (event: MouseEvent<HTMLButtonElement>, room: Room, owned: boolean) => {
        event.preventDefault();
        event.stopPropagation();
        const menuWidth = 176;
        const menuHeight = owned ? 96 : 104;
        setContextMenu({
            room,
            owned,
            x: Math.min(event.clientX, window.innerWidth - menuWidth - 8),
            y: Math.min(event.clientY, window.innerHeight - menuHeight - 8),
        });
    };

    const handlePinRoom = () => {
        if (!contextMenu) return;
        onTogglePinRoom(contextMenu.room.id);
        setContextMenu(null);
    };

    const requestDeleteRoom = () => {
        if (!contextMenu?.owned) return;
        setDeleteTarget(contextMenu.room);
        setDeleteError("");
        setContextMenu(null);
    };

    const confirmDeleteRoom = async () => {
        if (!deleteTarget) return;
        setIsDeleting(true);
        setDeleteError("");
        try {
            await onDeleteRoom(deleteTarget);
            setDeleteTarget(null);
        } catch (error) {
            setDeleteError(error instanceof Error ? error.message : "删除失败，请稍后再试。");
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="telegram-sidebar" onContextMenu={event => event.preventDefault()}>
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
                                        pinned={pinnedSet.has(normalizeRoomId(room.id))}
                                        onEnterRoom={onEnterRoom}
                                        onOpenContextMenu={openContextMenu}
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
                                        pinned={pinnedSet.has(normalizeRoomId(room.id))}
                                        onEnterRoom={onEnterRoom}
                                        onOpenContextMenu={openContextMenu}
                                    />
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            )}

            {contextMenu && (
                <div
                    className="room-context-menu"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onClick={event => event.stopPropagation()}
                    role="menu"
                >
                    <button type="button" onClick={handlePinRoom} role="menuitem">
                        <Pin size={15} /> {pinnedSet.has(normalizeRoomId(contextMenu.room.id)) ? '取消置顶' : '置顶'}
                    </button>
                    <button
                        type="button"
                        className="is-danger"
                        disabled={!contextMenu.owned}
                        onClick={requestDeleteRoom}
                        role="menuitem"
                    >
                        <Trash2 size={15} /> {contextMenu.owned ? '删除房间' : '仅房主可删除'}
                    </button>
                </div>
            )}

            {deleteTarget && (
                <div className="modal-backdrop">
                    <div className="settings-dialog room-delete-dialog">
                        <div className="settings-head">
                            <h2>删除房间</h2>
                            <button
                                type="button"
                                className="button button-quiet compact-button"
                                onClick={() => setDeleteTarget(null)}
                                disabled={isDeleting}
                            >
                                <X size={16} /> 关闭
                            </button>
                        </div>
                        <div className="settings-body">
                            <section className="settings-section">
                                <h3>确认操作</h3>
                                <div className="setting-row room-delete-confirm">
                                    <div>
                                        <div className="setting-title">{formatRoomName(deleteTarget)}</div>
                                        <div className="setting-caption">ID {formatRoomId(deleteTarget.id)}。删除后房间、成员关系和聊天记录都会被移除。</div>
                                    </div>
                                </div>
                                {deleteError && <p className="room-delete-error">{deleteError}</p>}
                                <div className="room-delete-actions">
                                    <button
                                        type="button"
                                        className="button button-quiet button-wide"
                                        onClick={() => setDeleteTarget(null)}
                                        disabled={isDeleting}
                                    >
                                        取消
                                    </button>
                                    <button
                                        type="button"
                                        className="button button-danger button-wide"
                                        onClick={confirmDeleteRoom}
                                        disabled={isDeleting}
                                    >
                                        {isDeleting ? "正在删除..." : "确认删除"}
                                    </button>
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
