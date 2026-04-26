import { useEffect } from 'react';
import { Menu, Plus, LogIn, Settings, Moon, Sun, AlertTriangle } from 'lucide-react';
import type { User } from '../types';
import type { Theme } from '../hooks/useTheme';
import { AuthControl } from './AuthControl';

interface AppMenuDrawerProps {
    isOpen: boolean;
    user: User | null;
    showAuthControl: boolean;
    theme: Theme;
    onToggleTheme: () => void;
    onOpen: () => void;
    onClose: () => void;
    onCreateRoom: () => void;
    onJoinRoom: () => void;
    onOpenSettings: () => void;
    onEmergency: () => void;
}

export function AppMenuDrawer({
    isOpen,
    user,
    showAuthControl,
    theme,
    onToggleTheme,
    onOpen,
    onClose,
    onCreateRoom,
    onJoinRoom,
    onOpenSettings,
    onEmergency
}: AppMenuDrawerProps) {
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    return (
        <>
            <button
                type="button"
                className="global-menu-button"
                aria-label="打开菜单"
                aria-expanded={isOpen}
                onClick={() => isOpen ? onClose() : onOpen()}
            >
                <Menu size={20} strokeWidth={2.2} />
            </button>

            <div className={`app-menu-overlay ${isOpen ? 'is-open' : ''}`} aria-hidden={!isOpen}>
                <button type="button" className="app-menu-backdrop" aria-label="关闭菜单" onClick={onClose} />
                <nav className="app-menu-panel" aria-label="主菜单">
                    <div className="app-menu-head">
                        <div className="app-menu-avatar">
                            {(user?.displayName || user?.username || "S").charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <strong>SMAI Chat</strong>
                            <span>{user?.displayName || user?.username || "欢迎回来"}</span>
                        </div>
                        {showAuthControl && (
                            <div className="app-menu-auth">
                                <AuthControl />
                            </div>
                        )}
                    </div>

                    <div className="app-menu-actions">
                        <button type="button" onClick={onCreateRoom}>
                            <Plus size={18} /> 创建房间
                        </button>
                        <button type="button" onClick={onJoinRoom}>
                            <LogIn size={18} /> 加入房间
                        </button>
                        <button type="button" onClick={onOpenSettings}>
                            <Settings size={18} /> 设置
                        </button>
                        <button type="button" onClick={onToggleTheme}>
                            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                            {theme === 'light' ? '深色模式' : '浅色模式'}
                        </button>
                        <button type="button" className="is-danger" onClick={onEmergency}>
                            <AlertTriangle size={18} /> 申诉房间
                        </button>
                    </div>
                </nav>
            </div>
        </>
    );
}
