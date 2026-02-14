import React, { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import './AuthPages.css';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const successMessage = location.state?.message;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const user = await login(email, password);
      if (user) navigate('/', { replace: true });
      else setError('Неверный email или пароль.');
    } catch (err) {
      if (err?.status === 403) {
        navigate('/register/success', { replace: true, state: { email: email.trim() } });
        return;
      }
      let msg = err?.message || (err?.response?.data && String(err.response.data)) || '';
      if (typeof msg !== 'string' || msg.length > 500 || msg.trim().startsWith('<')) {
        msg = 'Неверный email или пароль.';
      }
      setError(msg.trim() || 'Неверный email или пароль.');
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Вход</h1>
        {successMessage && <p className="auth-success-hint" style={{ color: 'var(--success, #16a34a)' }}>{successMessage}</p>}
        {error && <p className="auth-error">{error}</p>}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Пароль
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </label>
        <button type="submit">Войти</button>
        <p className="auth-footer">
          <Link to="/forgot-password">Забыли пароль?</Link>
        </p>
        <p className="auth-footer">
          Нет аккаунта? <Link to="/register">Регистрация</Link>
        </p>
      </form>
    </div>
  );
}
