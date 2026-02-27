import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import LibraryPage from '../pages/LibraryPage';

const PlayerPage = lazy(() => import('../pages/PlayerPage'));

export default function DevEntry() {
  return (
    <Routes>
      <Route path="/" element={<LibraryPage variant="dev" />} />
      <Route
        path="/player/:id?"
        element={
          <Suspense fallback={<div className="page">正在加载播放器...</div>}>
            <PlayerPage variant="dev" />
          </Suspense>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
