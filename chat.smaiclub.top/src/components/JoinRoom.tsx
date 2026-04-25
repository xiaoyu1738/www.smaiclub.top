import { useState, useEffect } from 'react';
import type { Room } from '../types';

interface JoinRoomProps {
    onBack: () => void;
    onJoined: (room: Room) => void;
    initialRoomId: string;
    initialRoomName: string;
}

export function JoinRoom({ onBack, onJoined, initialRoomId, initialRoomName }: JoinRoomProps) {
    const [roomId, setRoomId] = useState(initialRoomId || "");
    const [roomKey, setRoomKey] = useState("");

    // Load saved key when mounting or when roomId changes, but only if key is empty (to avoid overwriting user input if they type)
    useEffect(() => {
        if (roomId && !roomKey) {
            const savedKey = localStorage.getItem(`room_key_${roomId}`);
            if (savedKey) setRoomKey(savedKey);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [roomId]); // Explicitly excluding roomKey to prevent loop, though logic handles it.

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const normalizedRoomId = roomId.trim();
        const normalizedRoomKey = roomKey.trim();
        if(!normalizedRoomId || !normalizedRoomKey) return;
        localStorage.setItem(`room_key_${normalizedRoomId}`, normalizedRoomKey);
        onJoined({ id: normalizedRoomId, key: normalizedRoomKey, name: initialRoomName || ('Room ' + normalizedRoomId) });
    };

    return (
        <main className="form-shell">
          <div className="form-card">
           <div className="form-head">
            <button type="button" onClick={onBack} className="button button-quiet compact-button">返回</button>
            <div>
              <p className="eyebrow">Join Room</p>
              <h2>加入房间</h2>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="stack-form">
             <label className="field">
              <span>房间 ID</span>
              <input type="number" value={roomId} onChange={e => setRoomId(e.target.value)} required
                 placeholder="12345" />
            </label>
            <label className="field">
              <span>房间密钥 (Key)</span>
              <input type="password" value={roomKey} onChange={e => setRoomKey(e.target.value)} required
                 placeholder="粘贴密钥..." />
            </label>
             <button type="submit" className="button button-primary button-full">
               进入聊天
            </button>
          </form>
          </div>
        </main>
    )
}
