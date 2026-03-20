import { useCallback, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { NavBar } from './components/NavBar';
import { MiniPlayerDock } from './components/MiniPlayerDock';
import { CatalogProvider } from './hooks/useCatalog';
import { DiscoveryPage } from './pages/DiscoveryPage';
import { HomePage } from './pages/HomePage';
import { ArtistsPage } from './pages/ArtistsPage';
import { ArtistDetailPage } from './pages/ArtistDetailPage';
import { AllSongsPage } from './pages/AllSongsPage';
import { PLAYER_RETURN_PATH_KEY } from './playerState';

function AppShell() {
  const [searchText, setSearchText] = useState('');
  const [playerOpen, setPlayerOpen] = useState(false);
  const [playerAnimClass, setPlayerAnimClass] = useState('');
  const [miniPlayerVisible, setMiniPlayerVisible] = useState(false);
  const [miniPlayerExpanding, setMiniPlayerExpanding] = useState(false);
  const returnPathRef = useRef(
    sessionStorage.getItem(PLAYER_RETURN_PATH_KEY) || '/discover'
  );
  const animTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const playerKeyRef = useRef(0);
  const location = useLocation();
  const navigate = useNavigate();
  const searchMode =
    location.pathname === '/artists'
      ? 'artists'
      : location.pathname === '/songs'
        ? 'songs'
        : null;

  // Track return path (last non-/player URL)
  useEffect(() => {
    if (location.pathname !== '/player') {
      const path = `${location.pathname}${location.search}`;
      returnPathRef.current = path;
      sessionStorage.setItem(PLAYER_RETURN_PATH_KEY, path);
    }
  }, [location.pathname, location.search]);

  // Start overlay enter animation after browser has painted the initial mount
  const scheduleEnterAnimation = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (animTimerRef.current !== null) window.clearTimeout(animTimerRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        setPlayerAnimClass('is-entering');
        animTimerRef.current = window.setTimeout(() => {
          setPlayerAnimClass('');
        }, 380);
      });
    });
  }, []);

  // Sync player overlay with URL
  useEffect(() => {
    if (location.pathname === '/player') {
      if (!playerOpen) {
        playerKeyRef.current += 1;
        setPlayerOpen(true);
        setMiniPlayerVisible(false);
        setMiniPlayerExpanding(false);
        setPlayerAnimClass('is-pre-enter');
        scheduleEnterAnimation();
      }
    } else {
      // URL moved away from /player (browser back, nav click, etc.)
      if (playerOpen && playerAnimClass !== 'is-leaving') {
        setPlayerOpen(false);
        setPlayerAnimClass('');
      }
    }
  }, [location.pathname]);

  // Cleanup timers and rAF
  useEffect(() => {
    return () => {
      if (animTimerRef.current !== null) window.clearTimeout(animTimerRef.current);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  function handleMinimizePlayer() {
    if (playerAnimClass) return;
    if (animTimerRef.current !== null) window.clearTimeout(animTimerRef.current);

    setPlayerAnimClass('is-leaving');
    animTimerRef.current = window.setTimeout(() => {
      setPlayerOpen(false);
      setPlayerAnimClass('');
      setMiniPlayerVisible(true);
      navigate(returnPathRef.current, { replace: true });
    }, 300);
  }

  function handleExpandMiniPlayer() {
    if (playerAnimClass) return;

    setMiniPlayerExpanding(true);
    playerKeyRef.current += 1;
    setPlayerOpen(true);
    setPlayerAnimClass('is-pre-enter');
    navigate('/player', { replace: true });

    // Wait for browser to paint the mounted overlay, then animate
    scheduleEnterAnimation();

    // Hide mini player after animation completes
    if (animTimerRef.current !== null) window.clearTimeout(animTimerRef.current);
    animTimerRef.current = window.setTimeout(() => {
      setMiniPlayerExpanding(false);
      setMiniPlayerVisible(false);
    }, 400);
  }

  return (
    <div className="app-shell">
      <NavBar
        searchMode={searchMode}
        searchText={searchText}
        onSearchTextChange={setSearchText}
      />
      <main className="page-body">
        <Routes>
          <Route path="/" element={<Navigate to="/discover" replace />} />
          <Route path="/discover" element={<DiscoveryPage searchText={searchText} />} />
          <Route path="/artists" element={<ArtistsPage searchText={searchText} />} />
          <Route path="/songs" element={<AllSongsPage searchText={searchText} />} />
          <Route path="/player" element={<div />} />
          <Route path="/artist/:slug" element={<ArtistDetailPage />} />
          <Route path="*" element={<Navigate to="/discover" replace />} />
        </Routes>
      </main>
      {playerOpen && (
        <div className={`player-overlay ${playerAnimClass}`}>
          <HomePage key={playerKeyRef.current} onMinimize={handleMinimizePlayer} />
        </div>
      )}
      <MiniPlayerDock
        visible={miniPlayerVisible && !playerOpen}
        isExpanding={miniPlayerExpanding}
        onExpand={handleExpandMiniPlayer}
      />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <CatalogProvider>
        <AppShell />
      </CatalogProvider>
    </BrowserRouter>
  );
}
