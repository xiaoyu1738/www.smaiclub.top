import type { Room } from '../types';

export function formatRoomId(value: string | number | null | undefined) {
    if (value === null || value === undefined) return '';
    const raw = String(value).trim();
    if (!raw) return '';
    return /^\d+$/.test(raw) ? String(Number(raw)) : raw;
}

export function hasLeadingZeroRoomId(value: string | number | null | undefined) {
    if (value === null || value === undefined) return false;
    const raw = String(value).trim();
    return /^\d+$/.test(raw) && raw.length > 1 && raw !== formatRoomId(raw);
}

export function formatRoomName(room: Pick<Room, 'id' | 'name'>) {
    const displayId = formatRoomId(room.id);
    const name = room.name?.trim();
    if (hasLeadingZeroRoomId(room.id) || !name || /^room\s+0*\d+$/i.test(name)) {
        return displayId ? `room ${displayId}` : 'room';
    }
    return name;
}
