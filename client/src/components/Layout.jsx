import React, { useEffect, useRef, useState } from 'react';
import { Outlet, Link, useNavigate } from '../i18n/navigation.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import LanguageSelector from './LanguageSelector.jsx';
import './Layout.css';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef(null);

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (!profileMenuRef.current?.contains(event.target)) {
        setProfileMenuOpen(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setProfileMenuOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  const handleLogout = () => {
    setProfileMenuOpen(false);
    logout();
    navigate('/login');
  };

  return (
    <>
      <header className="layout-header">
        <Link to="/" className="layout-logo">Канбан</Link>
        <nav className="layout-nav">
          <Link to="/">Доски</Link>
          <Link to="/users">Участники</Link>
        </nav>
        <div className="layout-user">
          <div className="layout-profile-menu" ref={profileMenuRef}>
            <button
              type="button"
              className="layout-profile-trigger"
              aria-haspopup="true"
              aria-expanded={profileMenuOpen}
              onClick={() => setProfileMenuOpen((open) => !open)}
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} alt="" className="layout-avatar" />
              ) : (
                <span className="layout-avatar-placeholder">{user?.displayName?.charAt(0) || '?'}</span>
              )}
              <span className="layout-name">{user?.displayName}</span>
            </button>
            {profileMenuOpen && (
              <div className="layout-profile-popover">
                <Link
                  to="/profile"
                  className="layout-profile-link"
                  onClick={() => setProfileMenuOpen(false)}
                >
                  Профиль
                </Link>
                <LanguageSelector className="language-selector-profile" />
                <button type="button" className="layout-profile-logout" onClick={handleLogout}>
                  Выйти
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="layout-main">
        <Outlet />
      </main>
    </>
  );
}
