import React, { useState, useEffect, createContext, useContext } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { api } from './utils/api';
import Layout from './components/layout/Layout';
import LoginPage from './components/auth/LoginPage';
import SetupPage from './components/auth/SetupPage';
import Dashboard from './components/dashboard/Dashboard';
import MemberList from './components/members/MemberList';
import MemberDetail from './components/members/MemberDetail';
import EventList from './components/events/EventList';
import EventDetail from './components/events/EventDetail';
import Settings from './components/settings/Settings';
import HelpPage from './components/help/HelpPage';

// Context
export const AppContext = createContext();
export const useApp = () => useContext(AppContext);

export default function App() {
  const [user, setUser] = useState(null);
  const [unitName, setUnitName] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toasts, setToasts] = useState([]);

  let toastIdRef = 0;
  const toast = {
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error'),
    warning: (msg) => addToast(msg, 'warning'),
  };
  function addToast(message, type = 'info') {
    const id = ++toastIdRef;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500);
  }

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    try {
      const data = await api.getMe();
      setUser(data.user);
      setUnitName(data.unitName);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" />
      </div>
    );
  }

  // 未ログイン
  if (!user) {
    return <LoginPage />;
  }

  // 初回セットアップ（単会名未設定）
  if (!unitName) {
    return <SetupPage user={user} onComplete={(name) => setUnitName(name)} />;
  }

  return (
    <AppContext.Provider value={{ user, unitName, setUnitName, toast }}>
      {/* Toast */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.type}`}>{t.message}</div>
        ))}
      </div>

      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/members" element={<MemberList />} />
          <Route path="/members/:id" element={<MemberDetail />} />
          <Route path="/events" element={<EventList />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Layout>
    </AppContext.Provider>
  );
}
