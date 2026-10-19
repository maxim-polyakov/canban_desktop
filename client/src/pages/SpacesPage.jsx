import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from '../i18n/navigation.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { boards as boardsApi, spaces as spacesApi } from '../api.js';
import NavIcon from '../components/NavIcons.jsx';
import SpaceAvatar from '../components/SpaceAvatar.jsx';
import { openCreateSpace, SPACES_CHANGED_EVENT } from '../components/AppSidebar.jsx';
import { useSpaceTemplates } from '../utils/spaceFeatures.js';
import { isBoardStarred, toggleStarredBoard, useNavHistory } from '../utils/navHistory.js';
import { timeAgo } from '../utils/timeAgo.js';
import './settings/Settings.css';

function RowMenu({ space, onDelete }) {
  const { t } = useLocalization();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  return (
    <div className="settings-row-menu" ref={ref}>
      <button type="button" className="app-icon-btn" aria-label={`${t('Действия')}: ${space.name}`} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <NavIcon name="more" />
      </button>
      {open && (
        <div className="app-menu" role="menu">
          <Link to={`/board/${space.id}/settings`} className="app-menu-item" role="menuitem"><NavIcon name="settings" />{t('Настройки раздела')}</Link>
          <Link to={`/board/${space.id}/backlog`} className="app-menu-item" role="menuitem"><NavIcon name="backlog" />{t('Перейти в Backlog')}</Link>
          <Link to={`/issues?jql=${encodeURIComponent(`project = ${space.key}`)}`} className="app-menu-item" role="menuitem"><NavIcon name="filters" />{t('Все задачи раздела')}</Link>
          <div className="app-menu-divider" />
          <button type="button" className="app-menu-item is-danger" role="menuitem" onClick={() => { setOpen(false); onDelete(space); }}><NavIcon name="archive" />{t('Удалить раздел')}</button>
        </div>
      )}
    </div>
  );
}

export function DeleteSpaceDialog({ space, onCancel, onConfirm, busy, error }) {
  const { t } = useLocalization();
  const [typed, setTyped] = useState('');
  return (
    <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="app-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-space-title">
        <div className="app-modal-header"><h2 id="delete-space-title">{t('Удалить раздел')} «{space.name}»?</h2></div>
        <div className="app-modal-body">
          <p>{t('Раздел, его колонки, задачи, спринты и история будут удалены без возможности восстановления.')}</p>
          <label className="app-field">
            <span>{t('Введите ключ раздела для подтверждения')}: <strong>{space.key}</strong></span>
            <input value={typed} onChange={(e) => setTyped(e.target.value.toUpperCase())} autoFocus />
          </label>
          {error && <p className="app-modal-error" role="alert">{error}</p>}
        </div>
        <div className="app-modal-footer">
          <button type="button" className="app-btn app-btn-subtle" onClick={onCancel}>{t('Отмена')}</button>
          <button type="button" className="app-btn app-btn-danger" disabled={busy || typed !== space.key} onClick={onConfirm}>{busy ? '…' : t('Удалить')}</button>
        </div>
      </div>
    </div>
  );
}

const SORTERS = {
  name: (a, b) => a.name.localeCompare(b.name),
  key: (a, b) => a.key.localeCompare(b.key),
  lead: (a, b) => (a.leadName || '').localeCompare(b.leadName || ''),
  updated: (a, b) => new Date(a.lastIssueUpdate || 0) - new Date(b.lastIssueUpdate || 0),
};

export default function SpacesPage() {
  const { t, locale } = useLocalization();
  const navigate = useNavigate();
  const { search } = useLocation();
  useNavHistory();
  const params = new URLSearchParams(search);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState('all');
  const [sort, setSort] = useState({ by: 'name', dir: 1 });
  const [deleting, setDeleting] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const { templates } = useSpaceTemplates();
  const templateTitles = useMemo(() => new Map(templates.map((x) => [x.id, x.title])), [templates]);

  const load = useCallback(() => {
    spacesApi.getMine()
      .then((data) => { setList(Array.isArray(data) ? data : []); setError(''); })
      .catch((e) => setError(e.message || t('Не удалось загрузить разделы')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    window.addEventListener(SPACES_CHANGED_EVENT, load);
    return () => window.removeEventListener(SPACES_CHANGED_EVENT, load);
  }, [load]);
  useEffect(() => {
    if (params.get('create') === '1' || params.get('templates') === '1') navigate('/spaces/templates', { replace: true });
  }, [search]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return list
      .filter((s) => !needle || s.name.toLowerCase().includes(needle) || s.key.toLowerCase().includes(needle) || (s.teamName || '').toLowerCase().includes(needle))
      .filter((s) => type === 'all' || (type === 'scrum') === Boolean(s.hasSprints))
      .sort((a, b) => SORTERS[sort.by](a, b) * sort.dir);
  }, [list, query, type, sort]);

  const sortHeader = (by, label) => (
    <button type="button" onClick={() => setSort((s) => ({ by, dir: s.by === by ? -s.dir : 1 }))} aria-sort={sort.by === by ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none'}>
      {t(label)}
      {sort.by === by && <NavIcon name="chevronDown" size={12} className={sort.dir > 0 ? '' : 'is-flipped'} />}
    </button>
  );

  const confirmDelete = async () => {
    setDeleteBusy(true);
    setDeleteError('');
    const result = await boardsApi.delete(deleting.id).catch(() => ({ ok: false }));
    setDeleteBusy(false);
    if (result === true) {
      setDeleting(null);
      window.dispatchEvent(new CustomEvent(SPACES_CHANGED_EVENT));
    } else {
      setDeleteError(result?.status === 403 ? t('Удалять раздел может только владелец команды или создатель раздела.') : t('Не удалось удалить раздел'));
    }
  };

  return (
    <div className="settings-shell">
      <section className="settings-content is-wide">
        <div className="settings-title-row">
          <h1 className="settings-title">{t('Разделы')}</h1>
          <div className="settings-actions">
            <button type="button" className="app-btn" onClick={() => navigate('/spaces/templates')}>
              <NavIcon name="template" size={14} />{t('Шаблоны')}
            </button>
            <button type="button" className="app-btn app-btn-primary" onClick={() => openCreateSpace()}>{t('Создать раздел')}</button>
          </div>
        </div>

        <div className="settings-toolbar">
          <label className="settings-search">
            <NavIcon name="search" size={14} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Поиск по разделам')} aria-label={t('Поиск по разделам')} />
          </label>
          <select className="app-select" value={type} onChange={(e) => setType(e.target.value)} aria-label={t('Тип раздела')}>
            <option value="all">{t('Все типы')}</option>
            <option value="kanban">Kanban</option>
            <option value="scrum">Scrum</option>
          </select>
        </div>

        {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead>
              <tr>
                <th className="is-narrow" aria-label={t('Отмеченные')}><NavIcon name="star" size={14} /></th>
                <th>{sortHeader('name', 'Имя')}</th>
                <th>{sortHeader('key', 'Ключ')}</th>
                <th className="hide-mobile">{t('Тип')}</th>
                <th className="hide-mobile">{sortHeader('lead', 'Руководитель')}</th>
                <th className="hide-mobile">{sortHeader('updated', 'Последнее обновление задачи')}</th>
                <th className="is-narrow" aria-label={t('Действия')} />
              </tr>
            </thead>
            <tbody>
              {rows.map((space) => {
                const starred = isBoardStarred(space.id);
                return (
                  <tr key={space.id}>
                    <td className="is-narrow">
                      <button
                        type="button"
                        className={`app-nav-star is-visible ${starred ? 'is-starred' : ''}`}
                        aria-label={starred ? t('Убрать из отмеченных') : t('Отметить')}
                        onClick={() => toggleStarredBoard({ id: space.id, name: space.name, teamName: space.teamName })}
                      >
                        <NavIcon name="star" size={14} filled={starred} />
                      </button>
                    </td>
                    <td>
                      <Link to={`/board/${space.id}`} className="settings-table-name">
                        <SpaceAvatar id={space.id} name={space.name} size={24} />
                        <span>{space.name}</span>
                      </Link>
                    </td>
                    <td>{space.key}</td>
                    <td className="hide-mobile">
                      {t(templateTitles.get(space.template) || 'Канбан')}, {t(space.managementType === 'company' ? 'управляется компанией' : 'управляется командой')}
                      {space.isMember === false && <span className="settings-lozenge" style={{ marginLeft: 8 }}>{t(space.access === 'open' ? 'Открытый' : 'Ограниченный')}</span>}
                    </td>
                    <td className="hide-mobile">
                      {space.leadName ? (
                        <Link to={`/profile/${space.leadId}`} className="settings-table-person">
                          {space.leadAvatarUrl ? <img src={space.leadAvatarUrl} alt="" className="app-avatar" /> : <span className="app-avatar app-avatar-placeholder">{space.leadName.charAt(0)}</span>}
                          {space.leadName}
                        </Link>
                      ) : '—'}
                    </td>
                    <td className="hide-mobile" title={space.lastIssueUpdate ? new Date(space.lastIssueUpdate).toLocaleString(locale) : ''}>
                      {space.lastIssueUpdate ? timeAgo(space.lastIssueUpdate, locale) : t('Нет задач')}
                    </td>
                    <td className="is-narrow"><RowMenu space={space} onDelete={(s) => { setDeleteError(''); setDeleting(s); }} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!loading && rows.length === 0 && (
            <div className="settings-empty">
              {list.length === 0 ? t('У вас пока нет разделов.') : t('Нет разделов, соответствующих фильтру.')}
              {list.length === 0 && <div style={{ marginTop: 12 }}><button type="button" className="app-btn app-btn-primary" onClick={() => openCreateSpace()}>{t('Создать раздел')}</button></div>}
            </div>
          )}
          {loading && <p className="settings-empty">{t('Загрузка...')}</p>}
        </div>
        {deleting && <DeleteSpaceDialog space={deleting} busy={deleteBusy} error={deleteError} onCancel={() => setDeleting(null)} onConfirm={confirmDelete} />}
      </section>
    </div>
  );
}
