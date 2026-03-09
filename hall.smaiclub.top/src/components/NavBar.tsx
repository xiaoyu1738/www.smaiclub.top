import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Disc3, Guitar, House, Search, Users } from 'lucide-react';

type NavBarProps = {
  showArtistSearch: boolean;
  searchText: string;
  onSearchTextChange: (value: string) => void;
};

export function NavBar({ showArtistSearch, searchText, onSearchTextChange }: NavBarProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

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

  const searchButtonLabel = useMemo(
    () => (searchOpen ? '收起搜索框' : '展开搜索框'),
    [searchOpen]
  );

  return (
    <header className="smai-navbar" role="banner">
      <a className="smai-logo" href="https://www.smaiclub.top">
        <Guitar className="smai-logo-icon" aria-hidden="true" />
        <Disc3 className="smai-logo-badge" aria-hidden="true" />
        <span>SMAICLUB</span>
      </a>

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

      {showArtistSearch ? (
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
        <div className="auth-container" />
      </div>
    </header>
  );
}
