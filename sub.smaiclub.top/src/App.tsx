import { Navigate, Route, Routes } from 'react-router-dom';
import Guest from './pages/Guest';
import Dashboard from './pages/Dashboard';
import Admin from './pages/Admin';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Guest />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/admin-secret" element={<Admin />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
