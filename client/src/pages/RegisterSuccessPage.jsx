import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { auth } from '../api.js';
import './AuthPages.css';

export default function RegisterSuccessPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setUserFromResponse } = useAuth();
  const [email, setEmail] = useState(() => (location.state?.email || '').trim());
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const emailTrimmed = email.trim();
    if (!emailTrimmed) {
      setError('Укажите email.');
      return;
    }
    const trimmedCode = code.replace(/\D/g, '').slice(0, 6);
    if (trimmedCode.length !== 6) {
      setError('Введите код из 6 цифр.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await auth.confirmEmail({ email: emailTrimmed, code: trimmedCode });
      if (res?.accessToken) {
        localStorage.setItem('token', res.accessToken);
        setUserFromResponse(res.user);
        navigate('/', { replace: true });
      }
    } catch (err) {
      setError(err?.message || 'Неверный или устаревший код.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-form auth-form-message">
        <h1>Регистрация завершена</h1>
        <p className="auth-success-text">
          На {email ? <strong>{email}</strong> : 'указанную почту'} отправлено письмо с кодом из 6 цифр.
        </p>
        <p className="auth-success-hint">Введите код из письма ниже. Код действителен 15 минут.</p>
            <form className="auth-confirm-form" onSubmit={handleSubmit}>
              <label>
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  className={location.state?.email ? 'auth-input-readonly' : ''}
                  readOnly={!!location.state?.email}
                  disabled={loading}
                />
              </label>
              <label>
                Код из письма
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="auth-code-input"
                  disabled={loading}
                  autoComplete="one-time-code"
                />
              </label>
              {error && <p className="auth-error">{error}</p>}
              <button type="submit" disabled={loading || !email.trim()}>
                {loading ? 'Проверка…' : 'Подтвердить'}
              </button>
            </form>
        <p className="auth-footer">
          <Link to="/login">Уже подтвердили? Войти</Link>
        </p>
      </div>
    </div>
  );
}
