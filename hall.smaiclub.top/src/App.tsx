import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { NavBar } from './components/NavBar';
import { MiniPlayerDock } from './components/MiniPlayerDock';
import { CatalogProvider } from './hooks/useCatalog';
import { DiscoveryPage } from './pages/DiscoveryPage';
import { HomePage } from './pages/HomePage';
import { ArtistsPage } from './pages/ArtistsPage';
import { ArtistDetailPage } from './pages/ArtistDetailPage';

type AppLocationState = {
  fromPath?: string;
  showMiniPlayer?: boolean;
};

function AppShell() {
  const [searchText, setSearchText] = useState('');
  const [miniPlayerVisible, setMiniPlayerVisible] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const showArtistSearch = location.pathname === '/artists';

  useEffect(() => {
    if (location.pathname === '/player') {
      setMiniPlayerVisible(false);
      return;
    }

    const state = location.state as AppLocationState | null;
    if (!state?.showMiniPlayer) {
      return;
    }

    setMiniPlayerVisible(true);
    navigate(`${location.pathname}${location.search}`, { replace: true });
  }, [location.pathname, location.search, location.state, navigate]);

  return (
    <div className="app-shell">
      <NavBar
        showArtistSearch={showArtistSearch}
        searchText={searchText}
        onSearchTextChange={setSearchText}
      />
      <main className="page-body">
        <Routes>
          <Route path="/" element={<Navigate to="/discover" replace />} />
          <Route path="/discover" element={<DiscoveryPage searchText={searchText} />} />
          <Route path="/artists" element={<ArtistsPage searchText={searchText} />} />
          <Route path="/player" element={<HomePage />} />
          <Route path="/artist/:slug" element={<ArtistDetailPage />} />
          <Route path="*" element={<Navigate to="/discover" replace />} />
        </Routes>
      </main>
      <MiniPlayerDock
        visible={miniPlayerVisible && location.pathname !== '/player'}
        onExpand={() => {
          setMiniPlayerVisible(false);
          navigate('/player', { state: { fromPath: `${location.pathname}${location.search}` } });
        }}
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
