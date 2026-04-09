import { BrowserRouter, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import Dashboard from './pages/Dashboard';
import Session from './pages/Session';
import Students from './pages/Students';
import Import from './pages/Import';
import History from './pages/History';
import Courses from './pages/Courses';
import Reports from './pages/Reports';
import Users from './pages/Users';
import IDCards from './pages/IDCards';
import Settings from './pages/Settings';
import ScanPage from './pages/ScanPage';
import Login from './pages/Login';
import SessionDisplay from './pages/SessionDisplay';

const SESSION_KEY = 'active_session';

function ActiveSessionBanner() {
  const [session, setSession] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const check = () => {
      try {
        const stored = JSON.parse(localStorage.getItem(SESSION_KEY));
        if (stored && stored.active && new Date() < new Date(stored.expiresAt)) setSession(stored);
        else setSession(null);
      } catch {
        setSession(null);
      }
    };

    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!session) return null;

  return (
    <div
      onClick={() => navigate('/session')}
      style={{
        margin: '12px 12px 0',
        padding: '10px 12px',
        background: '#dcfce7',
        borderRadius: 8,
        cursor: 'pointer',
        border: '1px solid #86efac',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', display: 'inline-block', animation: 'pulse 1.5s infinite' }} />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#166534' }}>Session live</span>
      </div>
      <p style={{ fontSize: 12, color: '#166534' }}>{session.courseCode} - tap to return</p>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.4 } }`}</style>
    </div>
  );
}

function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="layout">
      <aside className="sidebar">
        <h1>Attendance Register</h1>
        <ActiveSessionBanner />
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/session">Start Session</NavLink>
          <NavLink to="/history">Session History</NavLink>
          <NavLink to="/students">Students</NavLink>
          {user?.role === 'admin' && <NavLink to="/import">Bulk Import</NavLink>}
          <NavLink to="/id-cards">ID Cards</NavLink>
          <NavLink to="/courses">Courses</NavLink>
          <NavLink to="/reports">Reports</NavLink>
          {user?.role === 'admin' && <NavLink to="/users">Users</NavLink>}
        </nav>
        <div style={{ position: 'absolute', bottom: 24, left: 0, right: 0, padding: '0 20px' }}>
          <p style={{ fontSize: 12, color: '#aaa', marginBottom: 4 }}>{user?.name}</p>
          <span style={{ fontSize: 11, background: user?.role === 'admin' ? '#dcfce7' : '#dbeafe', color: user?.role === 'admin' ? '#166534' : '#1e40af', padding: '2px 8px', borderRadius: 20, fontWeight: 500 }}>
            {user?.role}
          </span>
          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <NavLink to="/settings" style={{ fontSize: 13, color: '#888' }}>Settings</NavLink>
            <button
              onClick={logout}
              style={{ marginLeft: 'auto', padding: '4px 10px', fontSize: 12, borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', color: '#555' }}>
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/session" element={<Session />} />
          <Route path="/history" element={<History />} />
          <Route path="/students" element={<Students />} />
          <Route path="/import" element={user?.role === 'admin' ? <Import /> : <Navigate to="/" />} />
          <Route path="/id-cards" element={<IDCards />} />
          <Route path="/courses" element={<Courses />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/users" element={user?.role === 'admin' ? <Users /> : <Navigate to="/" />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40, color: '#888', fontSize: 14 }}>Loading...</div>;

  return (
    <Routes>
      <Route path="/scan/:sessionId/:sessionCode" element={<ScanPage />} />
      <Route path="/session-display" element={user ? <SessionDisplay /> : <Navigate to="/" replace />} />
      <Route path="*" element={user ? <Layout /> : <Login />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
