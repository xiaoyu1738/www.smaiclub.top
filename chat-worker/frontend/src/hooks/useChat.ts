import { useState, useEffect, useRef, useCallback } from 'react';
import { saveMessage, getMessages, type ChatMessage } from '../db/chatDB';
import CryptoWorker from '../workers/crypto.worker?worker';

interface UseChatProps {
    roomId: number;
    roomKey: string;
    username: string;
    role: string;
    avatarUrl: string;
}

export function useChat({ roomId, roomKey, username, role, avatarUrl }: UseChatProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
    const [derivedKey, setDerivedKey] = useState<CryptoKey | null>(null);
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
        getMessages(roomId).then(msgs => {
            setMessages(msgs);
        });
    }, [roomId]);

    const loadMoreMessages = useCallback(async (beforeTimestamp: number) => {
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
        if (!roomId || !roomKey) return;

        // Initialize Worker
        const worker = new CryptoWorker();
        workerRef.current = worker;

        let reconnectTimer: ReturnType<typeof setTimeout>;
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

            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${protocol}//${window.location.host}/api/rooms/${roomId}/websocket?since=${since}`;
            
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
                        const accessHash = await runWorkerTask('sha256', { content: `SMAICLUB_CHAT_ACCESS:${roomKey}` }) as string;
                        const legacyKeyHash = await runWorkerTask('sha256', { content: roomKey }) as string;
                        const signature = await runWorkerTask('hmacSha256', { secretHex: accessHash, content: nonce }) as string;
                        const legacySignature = await runWorkerTask('hmacSha256', { secretHex: legacyKeyHash, content: nonce }) as string;
                        setDerivedKey(key);
                        keyRef.current = key;
                        ws.send(JSON.stringify({ type: 'auth', signature, legacySignature }));
                        return;
                    }

                    if (data.type === 'auth_ok') {
                        setStatus('connected');
                        return;
                    }

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const processMessage = (msgData: any) => {
                        const maxKeyWaitRetries = 100;
                        const tryProcess = async (retryCount = 0) => {
                            const key = keyRef.current;
                            if (!key) {
                                if (retryCount >= maxKeyWaitRetries) {
                                    setStatus('error');
                                    return;
                                }
                                setTimeout(() => tryProcess(retryCount + 1), 50);
                                return;
                            }

                            const decryptedContent = await runWorkerTask('decrypt', { key, iv: msgData.iv, content: msgData.content }) as string;
                            let sender = String(msgData.sender || "unknown");
                            // Older rows may have encrypted sender values; new messages store plaintext usernames.
                            if (!/^[A-Za-z0-9_]{3,32}$/.test(sender) && msgData.sender) {
                                sender = await runWorkerTask('decrypt', { key, iv: msgData.iv, content: msgData.sender }) as string;
                            }

                            const newMessage: ChatMessage = {
                                id: msgData.timestamp || Date.now(),
                                roomId,
                                content: decryptedContent,
                                sender,
                                senderRole: msgData.senderRole,
                                senderAvatar: msgData.senderAvatar,
                                isMine: sender === username,
                                timestamp: msgData.timestamp || Date.now(),
                                tempId: msgData.tempId
                            };

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

            ws.onclose = () => {
                if (isUnmounting) return;
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
            clearTimeout(reconnectTimer);
            socketRef.current?.close();
            worker.terminate();
            workerRef.current = null;
        };
    }, [roomId, roomKey, username, role, avatarUrl, runWorkerTask]);

    const sendMessage = useCallback(async (content: string) => {
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

    return { messages, sendMessage, status, loadMoreMessages };
}
