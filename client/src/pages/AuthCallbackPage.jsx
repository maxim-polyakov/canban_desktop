import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { auth } from '../api.js';

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { setUserFromResponse } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    const hash = window.location.hash;
    const match = hash?.match(/[#&]token=([^&]+)/);
    const token = match?.[1];
    if (!token) {
      setError('Токен не получен. Повторите вход.');
      return;
    }
    localStorage.setItem('token', token);
    auth.getMe()
      .then((user) => {
        if (user) {
          setUserFromResponse(user);
          navigate('/', { replace: true });
        } else {
          setError('Не удалось загрузить профиль.');
        }
      })
      .catch(() => {
        setError('Ошибка при загрузке профиля.');
      });
  }, [navigate, setUserFromResponse]);

  if (error) {
    return (
      <div className="auth-page">
        <p className="auth-error">{error}</p>
        <a href="/login">Вернуться ко входу</a>
      </div>
    );
  }
  return <div className="auth-page">Вход через Google...</div>;
}
