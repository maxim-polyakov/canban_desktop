import React from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import './Layout.css';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      <header className="layout-header">
        <Link to="/" className="layout-logo">Канбан</Link>
        <nav className="layout-nav">
          <Link to="/">Доски</Link>
        </nav>
        <div className="layout-user">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="" className="layout-avatar" />
          ) : (
            <span className="layout-avatar-placeholder">{user?.displayName?.charAt(0) || '?'}</span>
          )}
          <span className="layout-name">{user?.displayName}</span>
          <button type="button" className="layout-logout" onClick={handleLogout}>Выйти</button>
        </div>
      </header>
      <main className="layout-main">
        <Outlet />
      </main>
    </>
  );
}
