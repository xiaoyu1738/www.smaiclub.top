import { useState } from 'react';
import type { Room } from '../types';

interface CreateRoomProps {
    onBack: () => void;
    onCreated: (room: Room) => void;
}

export function CreateRoom({ onBack, onCreated }: CreateRoomProps) {
    const [name, setName] = useState("");
    const [customKey, setCustomKey] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           const payload: any = { name, isPrivate: false };
           if (customKey.trim()) payload.customKey = customKey.trim();

           const res = await fetch('/api/rooms', {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             credentials: 'include',
             body: JSON.stringify(payload)
           });
           
           const data = await res.json();
           if (!res.ok) throw new Error(data.message || data.error || "Failed to create");
           
           onCreated({ id: data.roomId, key: data.roomKey, name: name || ('Room ' + data.roomId) });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
           setError(err.message);
        } finally {
           setLoading(false);
        }
    };

    return (
        <div className="glass w-full max-w-md p-8 rounded-2xl shadow-2xl animate-[fadeIn_0.5s_ease-out] bg-black/40 backdrop-blur-md border border-white/10">
          <div className="flex items-center mb-6">
            <button onClick={onBack} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition mr-4">
                <i className="fas fa-arrow-left text-sm"></i>
            </button>
            <h2 className="text-xl font-bold text-white">创建新房间</h2>
          </div>

          {error && <div className="bg-red-500/20 text-red-300 p-3 rounded-lg text-sm mb-4 border border-red-500/30">{error}</div>}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">房间名称 (可选)</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                 className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition"
                 placeholder="给房间起个名字..." />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5 uppercase tracking-wide">自定义密钥 (可选)</label>
              <input type="text" value={customKey} onChange={e => setCustomKey(e.target.value)}
                 className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition font-mono text-sm"
                 placeholder="留空随机生成 (12-32位字母数字)" />
            </div>

            <button disabled={loading} type="submit" className="w-full py-3.5 btn-gradient rounded-xl font-medium text-white flex items-center justify-center gap-2 mt-4 disabled:opacity-50">
               {loading ? <i className="fas fa-circle-notch fa-spin"></i> : "立即创建"}
            </button>
          </form>
        </div>
    );
}
