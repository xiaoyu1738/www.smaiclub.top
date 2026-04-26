import type { ChatMessage } from '../db/chatDB';

export interface IncomingChatPayload {
    type?: unknown;
    iv?: unknown;
    content?: unknown;
    sender?: unknown;
    senderRole?: string;
    senderAvatar?: string | null;
    timestamp?: number;
    tempId?: string;
}

interface ParseIncomingMessageOptions {
    roomId: number;
    username: string;
    decrypt: (iv: string, content: string) => Promise<string>;
}

export function isPlainSystemPayload(payload: IncomingChatPayload) {
    return payload.type === 'system' || payload.iv === 'SYSTEM' || payload.sender === 'SYSTEM';
}

export async function parseIncomingChatMessage(
    payload: IncomingChatPayload,
    { roomId, username, decrypt }: ParseIncomingMessageOptions
): Promise<ChatMessage | null> {
    const timestamp = payload.timestamp || Date.now();

    if (isPlainSystemPayload(payload)) {
        return {
            id: timestamp,
            roomId,
            content: String(payload.content || ''),
            sender: 'SYSTEM',
            isMine: false,
            timestamp,
            system: true
        };
    }

    if (typeof payload.iv !== 'string' || typeof payload.content !== 'string') {
        return null;
    }

    const decryptedContent = await decrypt(payload.iv, payload.content);
    if (!decryptedContent || decryptedContent === '[Decryption Failed]') {
        return null;
    }

    let sender = String(payload.sender || 'unknown');

    if (!/^[A-Za-z0-9_]{3,32}$/.test(sender) && typeof payload.sender === 'string') {
        sender = await decrypt(payload.iv, payload.sender);
        if (!sender || sender === '[Decryption Failed]') {
            sender = 'unknown';
        }
    }

    return {
        id: timestamp,
        roomId,
        content: decryptedContent,
        sender,
        senderRole: payload.senderRole,
        senderAvatar: payload.senderAvatar,
        isMine: sender === username,
        timestamp,
        tempId: payload.tempId
    };
}
