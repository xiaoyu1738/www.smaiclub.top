import { useState } from 'react';
import type { Room } from '../types';
import { apiUrl, IS_DEMO_MODE } from '../config/api';

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
           if (IS_DEMO_MODE) {
             await new Promise(resolve => setTimeout(resolve, 250));
             const roomId = Math.floor(Math.random() * 80000) + 10000;
             onCreated({
               id: roomId,
               key: customKey.trim() || "previewroomkey99",
               name: name.trim() || `Room ${roomId}`
             });
             return;
           }

           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           const payload: any = { name, isPrivate: false };
           if (customKey.trim()) payload.customKey = customKey.trim();

           const res = await fetch(apiUrl('/api/rooms'), {
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
        <main className="form-shell">
          <div className="form-card">
            <div className="form-head">
              <button type="button" onClick={onBack} className="button button-quiet compact-button">返回</button>
              <div>
                <p className="eyebrow">New Room</p>
                <h2>创建新房间</h2>
              </div>
            </div>

            {error && <div className="alert alert-danger">{error}</div>}

            <form onSubmit={handleSubmit} className="stack-form">
            <label className="field">
              <span>房间名称 (可选)</span>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                 maxLength={40}
                 placeholder="给房间起个名字..." />
            </label>

            <label className="field">
              <span>自定义密钥 (可选)</span>
              <input type="text" value={customKey} onChange={e => setCustomKey(e.target.value)}
                 minLength={12}
                 maxLength={32}
                 pattern="[A-Za-z0-9]{12,32}"
                 placeholder="留空随机生成 (12-32位字母数字)" />
            </label>

            <button disabled={loading} type="submit" className="button button-primary button-full">
               {loading ? "正在创建..." : "立即创建"}
            </button>
          </form>
          </div>
        </main>
    );
}
