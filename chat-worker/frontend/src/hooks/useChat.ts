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
            const wsUrl = `${protocol}//${window.location.host}/api/rooms/${roomId}/websocket?key=${encodeURIComponent(roomKey)}&username=${encodeURIComponent(username)}&role=${encodeURIComponent(role)}&avatarUrl=${encodeURIComponent(avatarUrl)}&since=${since}`;
            
            const ws = new WebSocket(wsUrl);
            socketRef.current = ws;

            ws.onopen = () => {
                console.log('WebSocket Connected');
                setStatus('connecting'); // Wait for handshake
            };

            ws.onmessage = async (event) => {
                try {
                    const data = JSON.parse(event.data);

                    if (data.type === 'handshake') {
                        const { salt, iterations } = data;
                        worker.postMessage({
                            id: 'deriveKey',
                            type: 'deriveKey',
                            payload: { password: roomKey, salt, iterations }
                        });
                        
                        const handleKey = (e: MessageEvent) => {
                            if (e.data.id === 'deriveKey' && e.data.success) {
                                const key = e.data.result;
                                setDerivedKey(key);
                                keyRef.current = key;
                                setStatus('connected');
                                worker.removeEventListener('message', handleKey);
                            }
                        };
                        worker.addEventListener('message', handleKey);
                        return;
                    }

                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const processMessage = (msgData: any) => {
                        const tryProcess = () => {
                            const key = keyRef.current;
                            if (!key) {
                                setTimeout(tryProcess, 50);
                                return;
                            }

                            const decryptionId = `decrypt_${Date.now()}_${Math.random()}`;
                            worker.postMessage({
                                id: decryptionId,
                                type: 'decrypt',
                                payload: { key, iv: msgData.iv, content: msgData.content }
                            });

                            const handleDecryption = (e: MessageEvent) => {
                                if (e.data.id === decryptionId) {
                                    if (e.data.success) {
                                        const decryptedContent = e.data.result;
                                        
                                        const senderDecryptionId = `decrypt_sender_${Date.now()}_${Math.random()}`;
                                        worker.postMessage({
                                            id: senderDecryptionId,
                                            type: 'decrypt',
                                            payload: { key, iv: msgData.iv, content: msgData.sender }
                                        });

                                        const handleSender = (ev: MessageEvent) => {
                                            if (ev.data.id === senderDecryptionId && ev.data.success) {
                                                const decryptedSender = ev.data.result;
                                                
                                                const newMessage: ChatMessage = {
                                                    id: msgData.timestamp || Date.now(),
                                                    roomId,
                                                    content: decryptedContent,
                                                    sender: decryptedSender,
                                                    senderRole: msgData.senderRole,
                                                    senderAvatar: msgData.senderAvatar,
                                                    isMine: decryptedSender === username,
                                                    timestamp: msgData.timestamp || Date.now(),
                                                    tempId: msgData.tempId // Pass tempId if available
                                                };

                                                setMessages(prev => {
                                                    // Deduplication logic using tempId
                                                    if (msgData.tempId) {
                                                        const existingIndex = prev.findIndex(m => m.tempId === msgData.tempId);
                                                        if (existingIndex !== -1) {
                                                            // Replace the temporary message with the confirmed one
                                                            const newMessages = [...prev];
                                                            newMessages[existingIndex] = { ...newMessage, pending: false };
                                                            return newMessages.sort((a, b) => a.timestamp - b.timestamp);
                                                        }
                                                    }
                                                    
                                                    if (prev.some(m => m.id === newMessage.id)) return prev;
                                                    return [...prev, newMessage].sort((a, b) => a.timestamp - b.timestamp);
                                                });
                                                saveMessage(newMessage);
                                                worker.removeEventListener('message', handleSender);
                                            }
                                        };
                                        worker.addEventListener('message', handleSender);
                                    }
                                    worker.removeEventListener('message', handleDecryption);
                                }
                            };
                            worker.addEventListener('message', handleDecryption);
                        };
                        tryProcess();
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
                console.log('WebSocket Disconnected, retrying in 3s...');
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
    }, [roomId, roomKey, username, role, avatarUrl]);

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

        // Just send plaintext
         socketRef.current?.send(JSON.stringify({
            content: content,
            tempId: tempId
        }));

    }, [status, derivedKey, roomId, username]);

    return { messages, sendMessage, status, loadMoreMessages };
}