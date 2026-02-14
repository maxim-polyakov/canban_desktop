import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { auth } from '../api.js';
import './AuthPages.css';

export default function ForgotPasswordResetPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { email, code } = location.state || {};
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !code) {
      setError('Сессия сброса истекла. Запросите код заново.');
      return;
    }
    if (password.length < 6) {
      setError('Пароль должен быть не короче 6 символов.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Пароли не совпадают.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await auth.resetPassword({ email, code, newPassword: password });
      navigate('/login', { replace: true, state: { message: 'Пароль изменён. Войдите с новым паролем.' } });
    } catch (err) {
      setError(err?.message || 'Не удалось сменить пароль. Код мог истечь — запросите новый.');
    } finally {
      setLoading(false);
    }
  };

  if (!email || !code) {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <h1>Сброс пароля</h1>
          <p className="auth-success-hint">Сначала введите код из письма на <Link to="/forgot-password/code">странице ввода кода</Link>.</p>
          <p className="auth-footer">
            <Link to="/login">Вернуться к входу</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Новый пароль</h1>
        <p className="auth-success-hint">Введите новый пароль для входа в аккаунт.</p>
        {error && <p className="auth-error">{error}</p>}
        <label>
          Новый пароль
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Не короче 6 символов"
            required
            minLength={6}
            autoComplete="new-password"
          />
        </label>
        <label>
          Повторите пароль
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Повторите новый пароль"
            required
            minLength={6}
            autoComplete="new-password"
          />
        </label>
        <button type="submit" disabled={loading}>{loading ? 'Сохранение…' : 'Сбросить пароль'}</button>
        <p className="auth-footer">
          <Link to="/login">Вернуться к входу</Link>
        </p>
      </form>
    </div>
  );
}
