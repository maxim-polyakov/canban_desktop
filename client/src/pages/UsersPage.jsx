import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { users } from '../api.js';
import './UsersPage.css';

export default function UsersPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    users.getAll()
      .then((data) => {
        if (!cancelled) setList(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Не удалось загрузить список.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  if (loading) return <div className="page">Загрузка...</div>;
  if (error) return <div className="page">Ошибка: {error}</div>;

  return (
    <div className="page users-page">
      <h1>Участники сайта</h1>
      <p className="users-page-sub">Все зарегистрированные пользователи</p>
      <div className="users-table-wrap">
        <table className="users-table">
          <thead>
            <tr>
              <th>Имя</th>
              <th>Почта</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id}>
                <td>
                  <Link to={`/profile/${u.id}`} className="users-table-name">
                    {u.displayName ?? u.DisplayName ?? '—'}
                  </Link>
                </td>
                <td className="users-table-email">{u.email ?? u.Email ?? '—'}</td>
                <td>
                  <Link to={`/profile/${u.id}`} className="users-table-link">Профиль</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length === 0 && <p className="users-page-empty">Нет зарегистрированных пользователей</p>}
    </div>
  );
}
