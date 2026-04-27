import { useState, useEffect, useRef, useCallback } from 'react';
import { saveMessage, getMessages, type ChatMessage } from '../db/chatDB';
import CryptoWorker from '../workers/crypto.worker?worker';
import { IS_DEMO_MODE, websocketUrl } from '../config/api';
import { isPlainSystemPayload, parseIncomingChatMessage, type IncomingChatPayload } from './chatMessageProcessor';
import { formatRoomId } from '../utils/roomDisplay';

interface UseChatProps {
    roomId: number;
    roomKey: string;
    username: string;
    role: string;
    avatarUrl: string;
}

function createDemoMessages(roomId: number): ChatMessage[] {
    const now = Date.now();
    return [
        {
            id: now - 120000,
            roomId,
            content: '预览模式已开启，账号校验和 WebSocket 都不会连接真实后端。',
            sender: 'SYSTEM',
            isMine: false,
            timestamp: now - 120000,
            system: true
        },
        {
            id: now - 60000,
            roomId,
            content: '这里可以测试长消息换行、滚动、输入框和移动端布局。',
            sender: 'preview_friend',
            senderRole: 'vip',
            isMine: false,
            timestamp: now - 60000
        }
    ];
}

function getDemoStatus(roomKey: string) {
    return roomKey === 'wrongpreviewkey' ? 'invalid_key' : 'connected';
}

export function useChat({ roomId, roomKey, username, role, avatarUrl }: UseChatProps) {
    const [messages, setMessages] = useState<ChatMessage[]>(() => IS_DEMO_MODE ? createDemoMessages(roomId) : []);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'invalid_key' | 'error'>(IS_DEMO_MODE ? getDemoStatus(roomKey) : 'connecting');
    const [derivedKey, setDerivedKey] = useState<CryptoKey | null>(null);
    const [reconnectNonce, setReconnectNonce] = useState(0);
    const keyRef = useRef<CryptoKey | null>(null);
    const socketRef = useRef<WebSocket | null>(null);
    const workerRef = useRef<Worker | null>(null);

    const runWorkerTask = useCallback((type: string, payload: unknown) => {
        const worker = workerRef.current;
        if (!worker) return Promise.reject(new Error("Crypto worker is not ready"));

        const id = `${type}_${Date.now()}_${Math.random()}`;
        return new Promise((resolve, reject) => {
            const handleMessage = (e: MessageEvent) => {
                if (e.data.id !== id) return;
                worker.removeEventListener('message', handleMessage);
                if (e.data.success) resolve(e.data.result);
                else reject(new Error(e.data.error || "Crypto worker failed"));
            };
            worker.addEventListener('message', handleMessage);
            worker.postMessage({ id, type, payload });
        });
    }, []);

    // Load initial messages from DB
    useEffect(() => {
        if (IS_DEMO_MODE) return;

        getMessages(roomId).then(msgs => {
            setMessages(msgs);
        });
    }, [roomId]);

    const loadMoreMessages = useCallback(async (beforeTimestamp: number) => {
        if (IS_DEMO_MODE) return 0;
        const olderMessages = await getMessages(roomId, 50, beforeTimestamp);
        if (olderMessages.length > 0) {
            setMessages(prev => {
                // Filter out any duplicates just in case
                const newIds = new Set(olderMessages.map(m => m.id));
                const filteredPrev = prev.filter(m => !newIds.has(m.id));
                return [...olderMessages, ...filteredPrev];
            });
        }
        return olderMessages.length;
    }, [roomId]);

    // Connect and Handshake
    useEffect(() => {
        if (IS_DEMO_MODE) return;
        if (!roomId || !roomKey) return;

        // Initialize Worker
        const worker = new CryptoWorker();
        workerRef.current = worker;

        let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
        let isUnmounting = false;

        const connect = async () => {
            let since = 0;
            try {
                const latestMsgs = await getMessages(roomId, 1);
                if (latestMsgs.length > 0) {
                    since = latestMsgs[latestMsgs.length - 1].timestamp;
                }
            } catch (e) {
                console.error("Failed to get latest timestamp", e);
            }

            const wsUrl = websocketUrl(`/api/rooms/${roomId}/websocket?since=${since}`);
            
            const ws = new WebSocket(wsUrl);
            socketRef.current = ws;

            ws.onopen = () => {
                setStatus('connecting'); // Wait for handshake
            };

            ws.onmessage = async (event) => {
                try {
                    const data = JSON.parse(event.data);

                    if (data.type === 'handshake') {
                        const { salt, iterations, nonce } = data;
                        const key = await runWorkerTask('deriveKey', { password: roomKey, salt, iterations }) as CryptoKey;
                        const verifierInput = `SMAICLUB_CHAT_ACCESS:${roomKey}`;
                        const accessHash = await runWorkerTask('pbkdf2Hex', { password: verifierInput, salt, iterations }) as string;
                        const legacyAccessHash = await runWorkerTask('sha256', { content: verifierInput }) as string;
                        const legacyKeyHash = await runWorkerTask('sha256', { content: roomKey }) as string;
                        const signature = await runWorkerTask('hmacSha256', { secretHex: accessHash, content: nonce }) as string;
                        const legacyAccessSignature = await runWorkerTask('hmacSha256', { secretHex: legacyAccessHash, content: nonce }) as string;
                        const legacySignature = await runWorkerTask('hmacSha256', { secretHex: legacyKeyHash, content: nonce }) as string;
                        setDerivedKey(key);
                        keyRef.current = key;
                        ws.send(JSON.stringify({ type: 'auth', signature, legacyAccessSignature, legacySignature }));
                        return;
                    }

                    if (data.type === 'auth_ok') {
                        setStatus('connected');
                        return;
                    }

                    if (data.error === 'Invalid Room Key') {
                        localStorage.removeItem(`room_key_${formatRoomId(roomId)}`);
                        localStorage.removeItem(`room_key_${roomId}`);
                        setDerivedKey(null);
                        keyRef.current = null;
                        setStatus('invalid_key');
                        return;
                    }

                    if (data.type === 'system') {
                        const systemMessage = await parseIncomingChatMessage(data, {
                            roomId,
                            username,
                            decrypt: async () => {
                                throw new Error('System messages must not be decrypted');
                            }
                        });
                        if (!systemMessage) return;
                        setMessages(prev => {
                            if (prev.some(m => m.id === systemMessage.id)) return prev;
                            return [...prev, systemMessage].sort((a, b) => a.timestamp - b.timestamp);
                        });
                        saveMessage(systemMessage);
                        return;
                    }

                    const processMessage = (msgData: IncomingChatPayload) => {
                        const maxKeyWaitRetries = 100;
                        const tryProcess = async (retryCount = 0) => {
                            if (isPlainSystemPayload(msgData)) {
                                const systemMessage = await parseIncomingChatMessage(msgData, {
                                    roomId,
                                    username,
                                    decrypt: async () => {
                                        throw new Error('System messages must not be decrypted');
                                    }
                                });
                                if (!systemMessage) return;
                                setMessages(prev => {
                                    if (prev.some(m => m.id === systemMessage.id)) return prev;
                                    return [...prev, systemMessage].sort((a, b) => a.timestamp - b.timestamp);
                                });
                                saveMessage(systemMessage);
                                return;
                            }

                            const key = keyRef.current;
                            if (!key) {
                                if (retryCount >= maxKeyWaitRetries) {
                                    setStatus('error');
                                    return;
                                }
                                setTimeout(() => tryProcess(retryCount + 1), 50);
                                return;
                            }

                            const newMessage = await parseIncomingChatMessage(msgData, {
                                roomId,
                                username,
                                decrypt: (iv, content) => runWorkerTask('decrypt', { key, iv, content }) as Promise<string>
                            });
                            if (!newMessage) return;

                            setMessages(prev => {
                                if (msgData.tempId) {
                                    const existingIndex = prev.findIndex(m => m.tempId === msgData.tempId);
                                    if (existingIndex !== -1) {
                                        const newMessages = [...prev];
                                        newMessages[existingIndex] = { ...newMessage, pending: false };
                                        return newMessages.sort((a, b) => a.timestamp - b.timestamp);
                                    }
                                }

                                if (prev.some(m => m.id === newMessage.id)) return prev;
                                return [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp);
                            });
                            saveMessage(newMessage);
                        };
                        tryProcess().catch(console.error);
                    };

                    if (data.type === 'history' || data.type === 'history_incremental') {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        data.messages.forEach((msg: any) => processMessage(msg));
                        return;
                    }

                    if (data.type === 'ack') {
                        if (data.success && data.tempId) {
                            setMessages(prev => prev.map(m => 
                                m.tempId === data.tempId ? { ...m, pending: false, id: data.serverTimestamp, timestamp: data.serverTimestamp } : m
                            ));
                            // Also update in DB
                            // Note: This is tricky because ID changed. 
                            // We might need to delete old temp record and add new one, or update if ID is not key.
                            // In our DB schema, ID is key. So delete and add.
                            // For now, we just rely on sync or refetch, or update in memory.
                        }
                        return;
                    }

                    if (data.iv && data.content) {
                        processMessage(data);
                    }

                } catch (e) {
                    console.error("WS Error", e);
                }
            };

            ws.onclose = (event) => {
                if (isUnmounting) return;
                if (event.code === 1008 || event.reason === 'Invalid Room Key') {
                    localStorage.removeItem(`room_key_${formatRoomId(roomId)}`);
                    localStorage.removeItem(`room_key_${roomId}`);
                    setDerivedKey(null);
                    keyRef.current = null;
                    setStatus('invalid_key');
                    return;
                }
                setStatus('disconnected');
                reconnectTimer = setTimeout(connect, 3000);
            };

            ws.onerror = (err) => {
                console.error("WebSocket Error", err);
                // Close will trigger reconnect
            };
        };

        connect();

        return () => {
            isUnmounting = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            socketRef.current?.close();
            worker.terminate();
            workerRef.current = null;
        };
    }, [roomId, roomKey, username, role, avatarUrl, reconnectNonce, runWorkerTask]);

    const reconnect = useCallback(() => {
        if (IS_DEMO_MODE) return;
        setStatus('connecting');
        setDerivedKey(null);
        keyRef.current = null;
        setReconnectNonce(value => value + 1);
    }, []);

    const sendMessage = useCallback(async (content: string) => {
        if (IS_DEMO_MODE) {
            const timestamp = Date.now();
            const message: ChatMessage = {
                id: timestamp,
                roomId,
                content,
                sender: username,
                isMine: true,
                timestamp
            };
            setMessages(prev => [...prev, message]);

            window.setTimeout(() => {
                const replyTime = Date.now();
                setMessages(prev => [...prev, {
                    id: replyTime,
                    roomId,
                    content: '预览回声：' + content,
                    sender: 'preview_friend',
                    senderRole: 'vip',
                    isMine: false,
                    timestamp: replyTime
                }]);
            }, 450);
            return;
        }

        if (!socketRef.current || status !== 'connected' || !derivedKey) return;

        const tempId = `temp_${Date.now()}`;
        const message: ChatMessage = {
            id: Date.now(), // Temp ID
            roomId,
            content,
            sender: username,
            isMine: true,
            timestamp: Date.now(),
            pending: true,
            tempId
        };

        setMessages(prev => [...prev, message]);

        const encrypted = await runWorkerTask('encrypt', { key: derivedKey, content }) as { iv: string; content: string };
        socketRef.current?.send(JSON.stringify({
            iv: encrypted.iv,
            content: encrypted.content,
            tempId: tempId
        }));

    }, [status, derivedKey, roomId, username, runWorkerTask]);

    return { messages, sendMessage, status: IS_DEMO_MODE ? getDemoStatus(roomKey) : status, loadMoreMessages, reconnect };
}
