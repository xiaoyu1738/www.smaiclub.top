import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Compass, Disc3, House, Menu, Search, Users, X, ListMusic } from 'lucide-react';

type NavBarProps = {
  searchMode: 'artists' | 'songs' | null;
  searchText: string;
  onSearchTextChange: (value: string) => void;
};

export function NavBar({ searchMode, searchText, onSearchTextChange }: NavBarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const showSearch = Boolean(searchMode);

  // 路由变化时关闭移动菜单
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!showSearch) {
      setSearchOpen(false);
      onSearchTextChange('');
    }
  }, [showSearch, onSearchTextChange]);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }
    inputRef.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    const initAuth = () => {
      window.CommonAuth?.init();
    };

    if (window.CommonAuth?.init) {
      initAuth();
      return;
    }

    const authScript = document.querySelector<HTMLScriptElement>(
      'script[src="https://login.smaiclub.top/common-auth.js"]'
    );
    authScript?.addEventListener('load', initAuth);

    const timer = window.setTimeout(initAuth, 500);
    return () => {
      authScript?.removeEventListener('load', initAuth);
      window.clearTimeout(timer);
    };
  }, []);

  // 防止移动菜单打开时 body 滚动
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);

  const searchButtonLabel = useMemo(
    () => (searchOpen ? '收起搜索框' : '展开搜索框'),
    [searchOpen]
  );

  const searchPlaceholder = useMemo(() => {
    if (searchMode === 'songs') {
      return '搜索艺人 / 专辑 / 歌名 / 流派 / 地区';
    }

    return '搜索乐队 / 曲风 / 城市';
  }, [searchMode]);

  const searchEyebrow = useMemo(() => {
    if (searchMode === 'songs') {
      return 'SONG INDEX';
    }

    return 'ARTIST INDEX';
  }, [searchMode]);

  return (
    <>
      <header className="smai-navbar" role="banner">
        <a className="smai-logo" href="https://www.smaiclub.top">
          <Disc3 className="smai-logo-icon" aria-hidden="true" />
          <span>SMAICLUB</span>
          <span className="smai-logo-subtitle">音乐展览馆</span>
        </a>

        {/* 桌面端导航链接 */}
        <nav className={`smai-nav-links ${searchOpen ? 'is-covered' : ''}`} aria-label="主导航">
          <a className="smai-link" href="https://www.smaiclub.top">
            <House size={14} aria-hidden="true" />
            首页
          </a>
          <Link className="smai-link" to="/discover">
            <Compass size={14} aria-hidden="true" />
            发现
          </Link>
          <Link className="smai-link" to="/artists">
            <Users size={14} aria-hidden="true" />
            艺人
          </Link>
          <Link className="smai-link" to="/songs">
            <ListMusic size={14} aria-hidden="true" />
            全部歌曲
          </Link>
        </nav>

        {showSearch ? (
          <div
            className={`smai-search-layer ${searchOpen ? 'is-open' : ''} ${
              searchFocused ? 'is-focused' : ''
            }`}
            aria-hidden={!searchOpen}
          >
            <Search aria-hidden="true" className="smai-search-icon" />
            <div className="smai-search-field">
              <div className="smai-search-meta">
                <span className="smai-search-eyebrow">{searchEyebrow}</span>
                <span className="smai-search-hint">
                  {searchMode === 'songs' ? '艺人 / 专辑 / 歌名 / 流派 / 地区' : '艺人 / 曲风 / 地区'}
                </span>
              </div>
              <input
                ref={inputRef}
                type="search"
                value={searchText}
                onChange={(event) => onSearchTextChange(event.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="smai-search-input"
                placeholder={searchPlaceholder}
                aria-label="目录搜索"
                tabIndex={searchOpen ? 0 : -1}
              />
            </div>
          </div>
        ) : null}

        <div className="smai-right-zone">
          {showSearch ? (
            <button
              type="button"
              className="smai-search-toggle"
              onClick={() => setSearchOpen((value) => !value)}
              aria-expanded={searchOpen}
              aria-label={searchButtonLabel}
            >
              <Search size={17} strokeWidth={2.25} aria-hidden="true" />
            </button>
          ) : null}

          {/* 移动端汉堡菜单按钮，仅 ≤920px 显示 */}
          <button
            type="button"
            className="smai-mobile-menu-toggle"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? '关闭菜单' : '打开菜单'}
          >
            {mobileMenuOpen ? (
              <X size={20} strokeWidth={2.2} aria-hidden="true" />
            ) : (
              <Menu size={20} strokeWidth={2.2} aria-hidden="true" />
            )}
          </button>

          <div className="auth-container" />
        </div>
      </header>

      {/* 移动端下拉菜单抽屉 */}
      {mobileMenuOpen ? (
        <>
          <div
            className="smai-mobile-backdrop"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <nav
            className={`smai-mobile-drawer ${mobileMenuOpen ? 'is-open' : ''}`}
            aria-label="移动端导航"
          >
            <a className="smai-mobile-link" href="https://www.smaiclub.top" onClick={() => setMobileMenuOpen(false)}>
              <House size={18} aria-hidden="true" />
              首页
            </a>
            <Link className="smai-mobile-link" to="/discover" onClick={() => setMobileMenuOpen(false)}>
              <Compass size={18} aria-hidden="true" />
              发现
            </Link>
            <Link className="smai-mobile-link" to="/artists" onClick={() => setMobileMenuOpen(false)}>
              <Users size={18} aria-hidden="true" />
              艺人
            </Link>
            <Link className="smai-mobile-link" to="/songs" onClick={() => setMobileMenuOpen(false)}>
              <ListMusic size={18} aria-hidden="true" />
              全部歌曲
            </Link>
          </nav>
        </>
      ) : null}
    </>
  );
}
