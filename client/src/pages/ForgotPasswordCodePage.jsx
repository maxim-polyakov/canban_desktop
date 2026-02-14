import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import './AuthPages.css';

export default function ForgotPasswordCodePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const email = (location.state?.email || '').trim();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!email) {
      setError('Email не указан. Начните с шага восстановления пароля.');
      return;
    }
    const trimmedCode = code.replace(/\D/g, '').slice(0, 6);
    if (trimmedCode.length !== 6) {
      setError('Введите код из 6 цифр.');
      return;
    }
    setError('');
    navigate('/forgot-password/reset', { replace: true, state: { email, code: trimmedCode } });
  };

  if (!email) {
    return (
      <div className="auth-page">
        <div className="auth-form">
          <h1>Восстановление пароля</h1>
          <p className="auth-success-hint">Сначала укажите email на <Link to="/forgot-password">странице запроса кода</Link>.</p>
          <p className="auth-footer">
            <Link to="/login">Вернуться к входу</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-form auth-form-message">
        <h1>Код из письма</h1>
        <p className="auth-success-text">
          На <strong>{email}</strong> отправлено письмо с кодом из 6 цифр.
        </p>
        <p className="auth-success-hint">Введите код ниже. Код действителен 15 минут.</p>
        <form className="auth-confirm-form" onSubmit={handleSubmit}>
          <label>
            Код
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="auth-code-input"
              maxLength={6}
            />
          </label>
          {error && <p className="auth-error">{error}</p>}
          <button type="submit">Далее</button>
        </form>
        <p className="auth-footer">
          <Link to="/forgot-password">Указать другой email</Link> · <Link to="/login">Вход</Link>
        </p>
      </div>
    </div>
  );
}
