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
        if(!roomId || !roomKey) return;
        localStorage.setItem(`room_key_${roomId}`, roomKey);
        onJoined({ id: roomId, key: roomKey, name: initialRoomName || ('Room ' + roomId) });
    };

    return (
        <div className="glass w-full max-w-md p-8 rounded-2xl shadow-2xl animate-[fadeIn_0.5s_ease-out] bg-black/40 backdrop-blur-md border border-white/10">
           <div className="flex items-center mb-6">
            <button onClick={onBack} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition mr-4">
                <i className="fas fa-arrow-left text-sm"></i>
            </button>
            <h2 className="text-xl font-bold text-white">加入房间</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
             <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">房间 ID</label>
              <input type="number" value={roomId} onChange={e => setRoomId(e.target.value)} required
                 className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition font-mono"
                 placeholder="12345" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">房间密钥 (Key)</label>
              <input type="password" value={roomKey} onChange={e => setRoomKey(e.target.value)} required
                 className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition font-mono text-sm"
                 placeholder="粘贴密钥..." />
            </div>
             <button type="submit" className="w-full py-3.5 btn-gradient rounded-xl font-medium text-white flex items-center justify-center gap-2 mt-4">
               进入聊天
            </button>
          </form>
        </div>
    )
}