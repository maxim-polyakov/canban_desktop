import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import './AuthPages.css';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Пароль не короче 6 символов.');
      return;
    }
    try {
      const user = await register(email, password, displayName);
      if (user) navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'Ошибка регистрации.');
    }
  };

  return (
    <div className="auth-page">
      <form className="auth-form" onSubmit={handleSubmit}>
        <h1>Регистрация</h1>
        {error && <p className="auth-error">{error}</p>}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          Имя
          <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required placeholder="Как к вам обращаться" />
        </label>
        <label>
          Пароль
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" minLength={6} />
        </label>
        <button type="submit">Зарегистрироваться</button>
        <p className="auth-footer">
          Уже есть аккаунт? <Link to="/login">Вход</Link>
        </p>
      </form>
    </div>
  );
}
