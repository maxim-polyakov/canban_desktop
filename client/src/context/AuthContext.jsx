import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth as authApi } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const u = localStorage.getItem('user');
      return u ? JSON.parse(u) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('auth-logout', onLogout);
    setLoading(false);
    return () => window.removeEventListener('auth-logout', onLogout);
  }, []);

  const login = async (email, password) => {
    const res = await authApi.login({ email, password });
    if (!res) return null;
    localStorage.setItem('token', res.accessToken);
    localStorage.setItem('user', JSON.stringify(res.user));
    setUser(res.user);
    return res.user;
  };

  const register = async (email, password, displayName) => {
    const res = await authApi.register({ email, password, displayName });
    localStorage.setItem('token', res.accessToken);
    localStorage.setItem('user', JSON.stringify(res.user));
    setUser(res.user);
    return res.user;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  const updateProfile = async (data) => {
    const updated = await authApi.updateProfile(data);
    if (updated) {
      localStorage.setItem('user', JSON.stringify(updated));
      setUser(updated);
    }
    return updated;
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth used outside AuthProvider');
  return ctx;
}
