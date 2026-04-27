import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ChevronLeft, Gem, KeyRound, LogIn, LogOut, Menu, Moon, Plus, Settings, ShieldAlert, Sun, UserRound } from 'lucide-react';
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
    const [menuLevel, setMenuLevel] = useState<'main' | 'account'>('main');

    const handleClose = useCallback(() => {
        setMenuLevel('main');
        onClose();
    }, [onClose]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (menuLevel === 'account') setMenuLevel('main');
                else handleClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleClose, isOpen, menuLevel]);

    const displayName = user?.displayName || user?.username || "欢迎回来";
    const username = user?.username || "";
    const avatarInitial = (displayName || username || "S").charAt(0).toUpperCase();
    const isVip = Boolean(user?.role && (user.role.startsWith('vip') || user.role.startsWith('svip')));

    const callCommonAuth = (name: string) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fn = (window as any)[name];
        if (typeof fn === 'function') fn();
    };

    const handleLogout = () => {
        if (showAuthControl) callCommonAuth('logoutSmai');
    };

    const handleUpgrade = () => {
        window.location.href = "https://www.smaiclub.top/shop/";
    };

    return (
        <>
            <button
                type="button"
                className="global-menu-button"
                aria-label="打开菜单"
                aria-expanded={isOpen}
                onClick={() => isOpen ? handleClose() : onOpen()}
            >
                <Menu size={20} strokeWidth={2.2} />
            </button>

            <div className={`app-menu-overlay ${isOpen ? 'is-open' : ''}`} aria-hidden={!isOpen}>
                <button type="button" className="app-menu-backdrop" aria-label="关闭菜单" onClick={handleClose} />
                <nav className="app-menu-panel" aria-label={menuLevel === 'account' ? '账号菜单' : '主菜单'}>
                    {showAuthControl && <AuthControl hidden />}

                    {menuLevel === 'main' ? (
                        <div key="main" className="app-menu-page app-menu-page-main">
                            <button type="button" className="app-menu-head app-menu-head-button" onClick={() => setMenuLevel('account')}>
                                <div className="app-menu-avatar">
                                    {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : avatarInitial}
                                </div>
                                <div>
                                    <strong>SMAI Chat</strong>
                                    <span>{displayName}</span>
                                </div>
                            </button>

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
                        </div>
                    ) : (
                        <div key="account" className="app-menu-page app-menu-page-account">
                            <div className="app-menu-subhead">
                                <button type="button" className="app-menu-back-button" onClick={() => setMenuLevel('main')} aria-label="返回主菜单">
                                    <ChevronLeft size={18} />
                                </button>
                                <div className="app-menu-avatar">
                                    {user?.avatarUrl ? <img src={user.avatarUrl} alt="" /> : avatarInitial}
                                </div>
                                <div>
                                    <strong>{displayName}</strong>
                                    <span>@{username || 'preview'}</span>
                                </div>
                            </div>

                            <div className="app-menu-actions">
                                {!showAuthControl && (
                                    <button type="button" disabled>
                                        <UserRound size={18} /> 预览账号
                                    </button>
                                )}
                                {showAuthControl && !isVip && (
                                    <button type="button" onClick={handleUpgrade}>
                                        <Gem size={18} /> 升级会员
                                    </button>
                                )}
                                {showAuthControl && isVip && (
                                    <button type="button" onClick={() => callCommonAuth('showLicenseModal')}>
                                        <KeyRound size={18} /> 修改许可证
                                    </button>
                                )}
                                {showAuthControl && (
                                    <>
                                        <button type="button" onClick={() => callCommonAuth('showDisplayNameModal')}>
                                            <UserRound size={18} /> 修改昵称
                                        </button>
                                        <button type="button" onClick={() => callCommonAuth('showChangePassModal')}>
                                            <KeyRound size={18} /> 修改密码
                                        </button>
                                        <button type="button" className="is-danger" onClick={() => callCommonAuth('deleteAccountSmai')}>
                                            <ShieldAlert size={18} /> 注销账号
                                        </button>
                                        <button type="button" onClick={handleLogout}>
                                            <LogOut size={18} /> 退出登录
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    )}
                </nav>
            </div>
        </>
    );
}
