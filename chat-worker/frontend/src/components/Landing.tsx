import { useState, useEffect } from 'react';
import type { User, Room } from '../types';

interface LandingProps {
    user: User | null;
    onJoin: () => void;
    onCreate: () => void;
    onEmergency: () => void;
    onEnterRoom: (room: Room) => void;
}

export function Landing({ onJoin, onCreate, onEmergency, onEnterRoom }: LandingProps) {
    const [rooms, setRooms] = useState<{ owned: Room[], joined: Room[] }>({ owned: [], joined: [] });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/user/rooms', { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                if (data.owned || data.joined) {
                    setRooms({ owned: data.owned || [], joined: data.joined || [] });
                }
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const hasRooms = rooms.owned.length > 0 || rooms.joined.length > 0;

    return (
        <div className="w-full max-w-5xl p-4 animate-[fadeIn_0.5s_ease-out]">
             {/* Top Bar */}
             <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start z-50 pointer-events-none">
                 <div className="flex items-center gap-4 pointer-events-auto">
                    {hasRooms && (
                        <button onClick={onEmergency} className="w-10 h-10 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 flex items-center justify-center shadow-lg transition">
                            <i className="fas fa-exclamation-triangle"></i>
                        </button>
                    )}
                 </div>
                 <div className="flex items-center gap-4 pointer-events-auto">
                    {hasRooms && (
                        <>
                            <button onClick={onJoin} className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-lg transition">
                                <i className="fas fa-sign-in-alt"></i>
                            </button>
                            <button onClick={onCreate} className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-lg transition">
                                <i className="fas fa-plus"></i>
                            </button>
                        </>
                    )}
                    <div id="auth-container-root"></div>
                 </div>
             </div>

             {loading ? (
                <div className="flex justify-center mt-20"><i className="fas fa-circle-notch fa-spin text-2xl text-blue-500"></i></div>
            ) : !hasRooms ? (
                <div className="flex flex-col items-center justify-center min-h-[60vh]">
                     <div className="glass w-full max-w-md p-8 rounded-2xl shadow-2xl flex flex-col items-center text-center bg-black/40 backdrop-blur-md border border-white/10">
                        <div className="w-20 h-20 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-full flex items-center justify-center mb-6 shadow-lg">
                            <i className="fas fa-comments text-3xl text-white"></i>
                        </div>
                        <h1 className="text-3xl font-bold mb-2 bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">SMAI Chat</h1>
                        <p className="text-gray-400 mb-8">安全、加密、即时的通讯体验</p>
                        
                        <div className="w-full space-y-4">
                            <button onClick={onCreate} className="w-full py-3.5 btn-gradient rounded-xl font-medium text-white flex items-center justify-center gap-2">
                                <i className="fas fa-plus"></i> 创建房间
                            </button>
                            <button onClick={onJoin} className="w-full py-3.5 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl font-medium text-white transition flex items-center justify-center gap-2">
                                <i className="fas fa-sign-in-alt"></i> 加入房间
                            </button>
                        </div>
                        <button onClick={onEmergency} className="mt-6 text-xs text-red-400 hover:text-red-300 transition flex items-center gap-1 opacity-70 hover:opacity-100">
                            <i className="fas fa-exclamation-triangle"></i> 紧急/工单模式
                        </button>
                    </div>
                </div>
            ) : (
                <div className="mt-20 space-y-10 w-full overflow-y-auto custom-scroll pb-20" style={{maxHeight: 'calc(100vh - 100px)'}}>
                    {rooms.owned.length > 0 && (
                        <div>
                            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2 px-4">
                                <i className="fas fa-crown text-yellow-500"></i> 我拥有的房间
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 px-4">
                                {rooms.owned.map(room => (
                                    <div key={room.id} onClick={() => onEnterRoom(room)} className="group relative bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-4 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center text-blue-400 group-hover:text-white group-hover:from-blue-500 group-hover:to-purple-500 transition-colors">
                                                <i className="fas fa-crown"></i>
                                            </div>
                                            {room.is_private === 1 && <i className="fas fa-lock text-xs text-gray-500"></i>}
                                        </div>
                                        <h3 className="font-medium text-white truncate mb-1">{room.name}</h3>
                                        <p className="text-xs text-gray-500 truncate">ID: {room.id}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {rooms.joined.length > 0 && (
                        <div>
                            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2 px-4">
                                <i className="fas fa-history text-blue-400"></i> 我加入过的房间
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 px-4">
                                {rooms.joined.map(room => (
                                    <div key={room.id} onClick={() => onEnterRoom(room)} className="group relative bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl p-4 cursor-pointer transition-all hover:-translate-y-1 hover:shadow-lg">
                                        <div className="flex justify-between items-start mb-2">
                                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center text-blue-400 group-hover:text-white group-hover:from-blue-500 group-hover:to-purple-500 transition-colors">
                                                <i className="fas fa-users"></i>
                                            </div>
                                            {room.is_private === 1 && <i className="fas fa-lock text-xs text-gray-500"></i>}
                                        </div>
                                        <h3 className="font-medium text-white truncate mb-1">{room.name}</h3>
                                        <p className="text-xs text-gray-500 truncate">ID: {room.id}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}