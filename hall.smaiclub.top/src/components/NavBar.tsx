import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Compass, Disc3, Guitar, House, Menu, Search, Users, X } from 'lucide-react';

type NavBarProps = {
  showArtistSearch: boolean;
  searchText: string;
  onSearchTextChange: (value: string) => void;
};

export function NavBar({ showArtistSearch, searchText, onSearchTextChange }: NavBarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const location = useLocation();
  const showSearchLayer = showArtistSearch && searchOpen;

  // 路由变化时关闭移动菜单
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!showArtistSearch) {
      setSearchOpen(false);
      onSearchTextChange('');
    }
  }, [showArtistSearch, onSearchTextChange]);

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

  return (
    <>
      <header className="smai-navbar" role="banner">
        <a className="smai-logo" href="https://www.smaiclub.top">
          <Guitar className="smai-logo-icon" aria-hidden="true" />
          <Disc3 className="smai-logo-badge" aria-hidden="true" />
          <span>SMAICLUB</span>
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
        </nav>

        {showSearchLayer ? (
          <div
            className={`smai-search-layer ${searchOpen ? 'is-open' : ''} ${
              searchFocused ? 'is-focused' : ''
            }`}
          >
            <Search aria-hidden="true" className="smai-search-icon" />
            <div className="smai-search-field">
              <input
                ref={inputRef}
                type="search"
                value={searchText}
                onChange={(event) => onSearchTextChange(event.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                className="smai-search-input"
                placeholder="搜索乐队 / 曲风 / 城市"
                aria-label="搜索乐队"
              />
              <span aria-hidden="true" className="smai-search-line" />
            </div>
          </div>
        ) : null}

        <div className="smai-right-zone">
          {showArtistSearch ? (
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
          </nav>
        </>
      ) : null}
    </>
  );
}
