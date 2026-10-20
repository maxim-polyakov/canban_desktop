import React, { useCallback, useEffect, useState } from 'react';
import { filterSubscriptions, savedFilters } from '../api.js';
import FilterSubscriptionsDialog from '../components/FilterSubscriptionsDialog.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Link } from '../i18n/navigation.jsx';
import NavIcon from '../components/NavIcons.jsx';
import { toggleStarredFilter, useNavHistory } from '../utils/navHistory.js';
import './IssueNavigator.css';

export default function FiltersPage() {
  const { t } = useLocalization();
  const { user } = useAuth();
  const { starredFilters } = useNavHistory();
  const [filters, setFilters] = useState(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [subscriptions, setSubscriptions] = useState([]);
  const [subscribing, setSubscribing] = useState(null);
  const starredIds = new Set(starredFilters.map((f) => f.id));

  useEffect(() => {
    savedFilters.getAll().then((v) => setFilters(Array.isArray(v) ? v : v?.items || [])).catch((e) => { setFilters([]); setError(e.message); });
    filterSubscriptions.list().then((v) => setSubscriptions(Array.isArray(v) ? v : [])).catch(() => setSubscriptions([]));
  }, []);

  const subscriptionsChanged = useCallback((filterId, list) => {
    setSubscriptions((all) => [...all.filter((s) => s.filterId !== filterId), ...list]);
  }, []);
  const subscriptionCount = (f) => subscriptions.filter((s) => s.filterId === f.id).length;

  const mine = (f) => f.ownerUserId === user?.id;
  const rename = async (f) => {
    const name = window.prompt(t('Название фильтра'), f.name);
    if (!name?.trim() || name.trim() === f.name) return;
    try {
      const updated = await savedFilters.update(f.id, { name: name.trim(), jql: f.jql, boardId: f.boardId, shared: f.shared });
      setFilters((list) => list.map((x) => (x.id === f.id ? updated : x)));
    } catch (e) { setError(e.message); }
  };
  const toggleShared = async (f) => {
    try {
      const updated = await savedFilters.update(f.id, { name: f.name, jql: f.jql, boardId: f.boardId, shared: !f.shared });
      setFilters((list) => list.map((x) => (x.id === f.id ? updated : x)));
    } catch (e) { setError(e.message); }
  };
  const remove = async (f) => {
    if (!window.confirm(t('Удалить фильтр «${name}»?', { name: f.name }))) return;
    try {
      await savedFilters.delete(f.id);
      setFilters((list) => list.filter((x) => x.id !== f.id));
      if (starredIds.has(f.id)) toggleStarredFilter({ id: f.id });
    } catch (e) { setError(e.message); }
  };

  const needle = query.trim().toLowerCase();
  const visible = (filters || []).filter((f) => !needle || f.name.toLowerCase().includes(needle));

  return (
    <div className="page inav-page filters-page">
      <div className="inav-header">
        <div className="inav-title"><h1>{t('Фильтры')}</h1></div>
        <div className="inav-actions">
          <Link className="inav-btn inav-btn-primary" to="/issues?filter=-4">{t('Просмотреть все задачи')}</Link>
        </div>
      </div>
      {error && <p className="inav-error" role="alert">{error}</p>}
      {filters === null ? <div className="inav-state">{t('Загрузка...')}</div> : filters.length === 0 ? (
        <div className="inav-empty">
          <div className="inav-empty-art" aria-hidden="true" />
          <h2>{t('Нет фильтров')}</h2>
          <p>{t('Фильтр можно создать с помощью поиска. Выберите «Просмотреть все задачи» в верхней панели фильтров и введите критерии поиска. Затем нажмите «Сохранить фильтр», чтобы создать фильтр.')}</p>
        </div>
      ) : (
        <>
          <div className="inav-toolbar">
            <label className="inav-search">
              <NavIcon name="search" size={14} />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Поиск фильтров')} aria-label={t('Поиск фильтров')} />
            </label>
          </div>
          <div className="inav-table-card">
            <div className="inav-table-scroll">
              <table className="inav-table filters-table" style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    <th style={{ width: 36 }} aria-label={t('Отмеченные')}><NavIcon name="star" size={14} /></th>
                    <th>{t('Название')}</th>
                    <th>{t('Владелец')}</th>
                    <th>{t('Доступ')}</th>
                    <th>{t('Подписки')}</th>
                    <th style={{ width: 200 }}>{t('Действия')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <button type="button" className={`inav-star ${starredIds.has(f.id) ? 'is-starred' : ''}`}
                          aria-label={starredIds.has(f.id) ? t('Убрать из отмеченных') : t('Отметить')}
                          onClick={() => toggleStarredFilter({ id: f.id, name: f.name })}>
                          <NavIcon name="star" size={14} filled={starredIds.has(f.id)} />
                        </button>
                      </td>
                      <td><Link to={`/issues?filter=${f.id}`}>{f.name}</Link></td>
                      <td>{mine(f) ? t('Вы') : t('Другой пользователь')}</td>
                      <td>{f.shared ? t('Моя организация') : <span className="inav-person"><NavIcon name="lock" size={12} />{t('Закрытый')}</span>}</td>
                      <td>
                        <button type="button" className="inav-link" onClick={() => setSubscribing(f)}>
                          {subscriptionCount(f) ? t('Подписок: ${n}', { n: subscriptionCount(f) }) : t('Подписаться')}
                        </button>
                      </td>
                      <td>
                        {mine(f) && (
                          <span className="inav-actions">
                            <button type="button" className="inav-link" onClick={() => rename(f)}>{t('Переименовать')}</button>
                            <button type="button" className="inav-link" onClick={() => toggleShared(f)}>{f.shared ? t('Закрыть') : t('Открыть доступ')}</button>
                            <button type="button" className="inav-icon-btn" aria-label={t('Удалить')} title={t('Удалить')} onClick={() => remove(f)}><NavIcon name="trash" size={14} /></button>
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {visible.length === 0 && <div className="inav-state">{t('Фильтры не найдены')}</div>}
            </div>
          </div>
        </>
      )}
      {subscribing && (
        <FilterSubscriptionsDialog filter={subscribing} currentUserId={user?.id} onChanged={subscriptionsChanged} onClose={() => setSubscribing(null)} />
      )}
    </div>
  );
}
