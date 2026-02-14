import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { auth } from '../api.js';
import './AuthPages.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    const emailTrimmed = email.trim();
    if (!emailTrimmed) {
      setError('Укажите email.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await auth.forgotPassword({ email: emailTrimmed });
      navigate('/forgot-password/code', { replace: true, state: { email: emailTrimmed } });
    } catch (err) {
      setError(err?.message || 'Не удалось отправить письмо. Попробуйте позже.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Восстановление пароля</h1>
        <p className="auth-success-hint">Введите email вашего аккаунта. Мы отправим на него код из 6 цифр.</p>
        {error && <p className="auth-error">{error}</p>}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="email@example.com"
            required
            autoComplete="email"
          />
        </label>
        <button type="submit" disabled={loading}>
          {loading ? 'Отправка…' : 'Отправить код'}
        </button>
        <p className="auth-footer">
          <Link to="/login">Вернуться к входу</Link>
        </p>
      </form>
    </div>
  );
}
