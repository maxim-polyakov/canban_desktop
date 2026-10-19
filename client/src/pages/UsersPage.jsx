import React, { useState, useEffect, useMemo } from 'react';
import { Link } from '../i18n/navigation.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { users } from '../api.js';
import NavIcon from '../components/NavIcons.jsx';
import './settings/Settings.css';

export default function UsersPage({ embedded = false }) {
  const { t } = useLocalization();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    users.getAll()
      .then((data) => { if (!cancelled) setList(Array.isArray(data) ? data : []); })
      .catch((err) => { if (!cancelled) setError(err?.message || t('Не удалось загрузить список.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [t]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return list
      .map((u) => ({ id: u.id ?? u.Id, name: u.displayName ?? u.DisplayName ?? '—', email: u.email ?? u.Email ?? '', avatarUrl: u.avatarUrl ?? u.AvatarUrl }))
      .filter((u) => !needle || u.name.toLowerCase().includes(needle) || (embedded && u.email.toLowerCase().includes(needle)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [list, query, embedded]);
  const searchLabel = embedded ? t('Поиск по имени или почте') : t('Поиск по имени');

  const content = (
    <>
      <div className="settings-toolbar">
        <label className="settings-search">
          <NavIcon name="search" size={14} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={searchLabel} aria-label={searchLabel} />
        </label>
        <span className="settings-save-status">{t('Всего')}: {list.length}</span>
      </div>
      {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
      <div className="settings-table-wrap">
        <table className="settings-table">
          <thead>
            <tr>
              <th>{t('Имя')}</th>
              {embedded && <th>{t('Почта')}</th>}
              <th className="is-narrow" aria-label={t('Действия')} />
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>
                  <Link to={`/profile/${u.id}`} className="settings-table-person">
                    {u.avatarUrl ? <img src={u.avatarUrl} alt="" className="app-avatar" /> : <span className="app-avatar app-avatar-placeholder">{u.name.charAt(0)}</span>}
                    {u.name}
                  </Link>
                </td>
                {embedded && <td style={{ wordBreak: 'break-all' }}>{u.email || '—'}</td>}
                <td className="is-narrow"><Link to={`/profile/${u.id}`} className="app-btn">{t('Профиль')}</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <p className="settings-empty">{t('Загрузка...')}</p>}
        {!loading && rows.length === 0 && <p className="settings-empty">{list.length ? t('Нет пользователей, соответствующих фильтру.') : t('Нет зарегистрированных пользователей')}</p>}
      </div>
    </>
  );

  if (embedded) return content;
  return (
    <div className="settings-shell">
      <section className="settings-content is-wide">
        <div className="settings-title-row"><h1 className="settings-title">{t('Участники сайта')}</h1></div>
        <p className="settings-description">{t('Все зарегистрированные пользователи')}</p>
        {content}
      </section>
    </div>
  );
}
