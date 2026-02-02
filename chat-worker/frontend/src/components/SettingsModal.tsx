import React, { useState } from 'react';
import type { Room } from '../types';

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    joinedRooms: Room[];
}

interface Settings {
    enableNotifications: boolean;
    mutedRooms: (string | number)[];
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, joinedRooms }) => {
    const [settings, setSettings] = useState<Settings>(() => {
        const saved = localStorage.getItem('chat_settings');
        if (saved) {
            try {
                return JSON.parse(saved);
            } catch (e) {
                console.error("Failed to parse settings", e);
            }
        }
        return {
            enableNotifications: false,
            mutedRooms: []
        };
    });

    const saveSettings = (newSettings: Settings) => {
        setSettings(newSettings);
        localStorage.setItem('chat_settings', JSON.stringify(newSettings));
    };

    const toggleNotifications = async () => {
        const newState = !settings.enableNotifications;
        if (newState) {
            if (!('Notification' in window)) {
                alert('该浏览器不支持桌面通知');
                return;
            }
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                alert('请在浏览器设置中允许通知权限');
                return;
            }
        }
        saveSettings({ ...settings, enableNotifications: newState });
    };

    const toggleMuteRoom = (roomId: string | number) => {
        const newMuted = settings.mutedRooms.includes(roomId)
            ? settings.mutedRooms.filter(id => id !== roomId)
            : [...settings.mutedRooms, roomId];
        saveSettings({ ...settings, mutedRooms: newMuted });
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-[#1c1c1e] border border-white/10 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="p-4 border-b border-white/10 flex justify-between items-center bg-white/5">
                    <h2 className="text-lg font-bold text-white">设置</h2>
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition text-gray-400 hover:text-white">
                        <i className="fas fa-times"></i>
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto custom-scroll space-y-6">
                    {/* Notifications */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">通知</h3>
                        <div className="flex items-center justify-between bg-white/5 p-4 rounded-xl border border-white/5">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${settings.enableNotifications ? 'bg-blue-500/20 text-blue-400' : 'bg-white/10 text-gray-400'}`}>
                                    <i className="fas fa-bell"></i>
                                </div>
                                <div>
                                    <div className="text-white font-medium">浏览器通知</div>
                                    <div className="text-xs text-gray-500">收到新消息时显示系统通知</div>
                                </div>
                            </div>
                            <button 
                                onClick={toggleNotifications}
                                className={`w-12 h-6 rounded-full relative transition-colors ${settings.enableNotifications ? 'bg-blue-600' : 'bg-gray-600'}`}
                            >
                                <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${settings.enableNotifications ? 'left-7' : 'left-1'}`}></div>
                            </button>
                        </div>
                    </div>

                    {/* Muted Rooms */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">免打扰房间</h3>
                        <div className="bg-white/5 rounded-xl border border-white/5 overflow-hidden">
                            {joinedRooms.length === 0 ? (
                                <div className="p-4 text-center text-gray-500 text-sm">暂无加入的房间</div>
                            ) : (
                                joinedRooms.map(room => (
                                    <div key={room.id} className="flex items-center justify-between p-4 border-b border-white/5 last:border-0 hover:bg-white/5 transition">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-700 to-gray-600 flex items-center justify-center text-white text-xs shrink-0">
                                                {room.name.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="truncate">
                                                <div className="text-white text-sm font-medium truncate">{room.name}</div>
                                                <div className="text-xs text-gray-500">ID: {room.id}</div>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => toggleMuteRoom(room.id)}
                                            className={`p-2 rounded-lg transition ${settings.mutedRooms.includes(room.id) ? 'text-red-400 bg-red-500/10' : 'text-gray-400 hover:text-white hover:bg-white/10'}`}
                                            title={settings.mutedRooms.includes(room.id) ? "取消免打扰" : "开启免打扰"}
                                        >
                                            <i className={`fas ${settings.mutedRooms.includes(room.id) ? 'fa-bell-slash' : 'fa-bell'}`}></i>
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};