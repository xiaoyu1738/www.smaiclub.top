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
        <div className="modal-backdrop">
            <div className="settings-dialog">
                <div className="settings-head">
                    <h2>设置</h2>
                    <button onClick={onClose} className="button button-quiet compact-button">关闭</button>
                </div>
                
                <div className="settings-body custom-scroll">
                    <section className="settings-section">
                        <h3>通知</h3>
                        <div className="setting-row">
                            <div>
                                <div className="setting-title">浏览器通知</div>
                                <div className="setting-caption">收到新消息时显示系统通知</div>
                            </div>
                            <button 
                                onClick={toggleNotifications}
                                className={`switch ${settings.enableNotifications ? 'is-on' : ''}`}
                                aria-pressed={settings.enableNotifications}
                            >
                                <span />
                            </button>
                        </div>
                    </section>

                    <section className="settings-section">
                        <h3>免打扰房间</h3>
                        <div className="settings-list">
                            {joinedRooms.length === 0 ? (
                                <div className="muted-empty">暂无加入的房间</div>
                            ) : (
                                joinedRooms.map(room => (
                                    <div key={room.id} className="muted-room-row">
                                        <div className="room-mini-mark">{room.name.charAt(0).toUpperCase()}</div>
                                        <div className="muted-room-copy">
                                            <div>{room.name}</div>
                                            <span>ID: {room.id}</span>
                                        </div>
                                        <button 
                                            onClick={() => toggleMuteRoom(room.id)}
                                            className={`button compact-button ${settings.mutedRooms.includes(room.id) ? 'button-danger' : 'button-quiet'}`}
                                            title={settings.mutedRooms.includes(room.id) ? "取消免打扰" : "开启免打扰"}
                                        >
                                            {settings.mutedRooms.includes(room.id) ? '已静音' : '静音'}
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};
