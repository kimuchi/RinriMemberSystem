import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../../App';
import Icon from '../Icon';
import './Layout.css';

export default function Layout({ children }) {
  const { user, unitName } = useApp();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    { to: '/', icon: 'dashboard', label: 'ダッシュボード' },
    { to: '/members', icon: 'people', label: '会員名簿' },
    { to: '/events', icon: 'event', label: 'イベント' },
    { to: '/settings', icon: 'settings', label: '設定' },
    { to: '/help', icon: 'help_outline', label: '利用マニュアル' },
  ];

  // 設定ページはオーナーのみ表示（ただしURLで直接アクセスは可能）
  const visibleNav = navItems.filter(item => {
    if (item.to === '/settings' && user.role !== 'owner') return false;
    return true;
  });

  return (
    <div className="layout">
      {/* Mobile Header */}
      <header className="mobile-header">
        <button className="menu-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
          <Icon name={sidebarOpen ? 'close' : 'menu'} size={24} />
        </button>
        <h1 className="mobile-title">{unitName}</h1>
        <div className="header-avatar">
          {user.picture ? (
            <img src={user.picture} alt="" />
          ) : (
            <Icon name="account_circle" size={32} />
          )}
        </div>
      </header>

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <Icon name="groups" size={28} />
            <div>
              <div className="sidebar-unit-name">{unitName}</div>
              <div className="sidebar-subtitle">会員管理システム</div>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {visibleNav.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <Icon name={item.icon} size={20} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-user">
            {user.picture ? (
              <img src={user.picture} alt="" className="user-avatar" />
            ) : (
              <Icon name="account_circle" size={36} />
            )}
            <div className="user-info">
              <div className="user-name">{user.name}</div>
              <div className="user-role">{user.role === 'owner' ? 'オーナー' : 'メンバー'}</div>
            </div>
          </div>
          <a href="/auth/logout" className="logout-btn">
            <Icon name="logout" size={18} />
            <span>ログアウト</span>
          </a>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Main content */}
      <main className="main-content">
        {children}
      </main>
    </div>
  );
}
