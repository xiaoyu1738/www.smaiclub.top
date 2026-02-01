import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface ChatMessage {
    id: number; // Timestamp or Server ID
    roomId: number;
    content: string; // Decrypted content
    sender: string;
    senderRole?: string;
    senderAvatar?: string | null;
    isMine: boolean;
    timestamp: number;
    pending?: boolean; // If true, not yet acked by server
    tempId?: string; // For pending messages
    system?: boolean;
}

interface ChatDB extends DBSchema {
    messages: {
        key: number; // id
        value: ChatMessage;
        indexes: { 'by-room': number };
    };
    meta: {
        key: string;
        value: unknown;
    };
}

const DB_NAME = 'smaiclub-chat-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<ChatDB>>;

export function initDB() {
    if (!dbPromise) {
        dbPromise = openDB<ChatDB>(DB_NAME, DB_VERSION, {
            upgrade(db) {
                if (!db.objectStoreNames.contains('messages')) {
                    const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
                    msgStore.createIndex('by-room', 'roomId', { unique: false });
                }
                if (!db.objectStoreNames.contains('meta')) {
                    db.createObjectStore('meta');
                }
            },
        });
    }
    return dbPromise;
}

export async function saveMessage(message: ChatMessage) {
    const db = await initDB();
    await db.put('messages', message);
}

export async function saveMessages(messages: ChatMessage[]) {
    const db = await initDB();
    const tx = db.transaction('messages', 'readwrite');
    await Promise.all(messages.map(msg => tx.store.put(msg)));
    await tx.done;
}

export async function getMessages(roomId: number, limit = 100, beforeTimestamp?: number): Promise<ChatMessage[]> {
    const db = await initDB();
    const tx = db.transaction('messages', 'readonly');
    const index = tx.store.index('by-room');
    
    const messages: ChatMessage[] = [];
    let cursor = await index.openCursor(IDBKeyRange.only(roomId), 'prev');
    
    while (cursor && messages.length < limit) {
        const msg = cursor.value;
        if (beforeTimestamp && msg.timestamp >= beforeTimestamp) {
             cursor = await cursor.continue();
             continue;
        }
        messages.push(msg);
        cursor = await cursor.continue();
    }
    
    return messages.reverse();
}

export async function deleteMessage(id: number) {
    const db = await initDB();
    await db.delete('messages', id);
}

export async function clearRoomMessages(roomId: number) {
    const db = await initDB();
    const tx = db.transaction('messages', 'readwrite');
    const index = tx.store.index('by-room');
    let cursor = await index.openCursor(IDBKeyRange.only(roomId));
    
    while (cursor) {
        await cursor.delete();
        cursor = await cursor.continue();
    }
    await tx.done;
}

export async function getRoomKey(roomId: number): Promise<string | undefined> {
    const db = await initDB();
    return (await db.get('meta', `room_key_${roomId}`)) as string | undefined;
}

export async function saveRoomKey(roomId: number, key: string) {
    const db = await initDB();
    await db.put('meta', key, `room_key_${roomId}`);
}