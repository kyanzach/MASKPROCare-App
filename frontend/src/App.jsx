import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Vehicles from './pages/Vehicles';
import Bookings from './pages/Bookings';
import Profile from './pages/Profile';
import Aftercare from './pages/Aftercare';
import AdminPanel from './pages/AdminPanel';
import './index.css';

function ProtectedRoute({ children }) {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;
  return isAuthenticated ? children : <Navigate to="/login" />;
}

function AppRoutes() {
  const { isAuthenticated, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner" /></div>;

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <Login />} />
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="vehicles" element={<Vehicles />} />
        <Route path="bookings" element={<Bookings />} />
        <Route path="loyalty" element={<Navigate to="/profile" />} />
        <Route path="profile" element={<Profile />} />
        <Route path="aftercare/:slug" element={<Aftercare />} />
        <Route path="admin" element={<AdminPanel />} />
      </Route>
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
