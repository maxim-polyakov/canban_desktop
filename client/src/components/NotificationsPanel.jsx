import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from '../i18n/navigation.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { notifications as notificationsApi } from '../api.js';
import NavIcon from './NavIcons.jsx';
import { IssueTypeIcon } from './IssueIcons.jsx';
import { groupByDay, timeAgo } from '../utils/timeAgo.js';

const THIRTY_DAYS = 30 * 24 * 3600 * 1000;

function EmptyIllustration() {
  return (
    <svg className="app-panel-illustration" viewBox="0 0 120 120" aria-hidden="true">
      <rect x="36" y="18" width="5" height="92" rx="2.5" fill="#FFC400" />
      <circle cx="38.5" cy="16" r="5" fill="#FF8B00" />
      <path d="M41 24h48a6 6 0 0 1 6 6v30a6 6 0 0 1-6 6H41z" fill="#1D7AFC" />
      <path d="M52 66h43a6 6 0 0 0 6-6V40l10 10v26a6 6 0 0 1-6 6H58z" fill="#0055CC" />
      <path d="M58 52l8-16 8 16z" fill="#CCE0FF" />
    </svg>
  );
}

export default function NotificationsPanel({ open, onClose, onUnreadChange }) {
  const { t, language } = useLocalization();
  const navigate = useNavigate();
  const [tab, setTab] = useState('direct');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await notificationsApi.get();
      setItems(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e.message || t('Не удалось загрузить уведомления.'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { if (open) load(); }, [open, load]);
  useEffect(() => {
    onUnreadChange?.(items.filter((x) => !x.read).length);
  }, [items, onUnreadChange]);

  if (!open) return null;

  const recent = items.filter((x) => Date.now() - new Date(x.createdAt).getTime() <= THIRTY_DAYS);
  const visible = recent
    .filter((x) => (tab === 'direct' ? x.direct : !x.direct))
    .filter((x) => !unreadOnly || !x.read);
  const groups = groupByDay(visible, (x) => x.createdAt);

  const openItem = async (item) => {
    if (!item.read) {
      setItems((list) => list.map((x) => (x.id === item.id ? { ...x, read: true } : x)));
      notificationsApi.markRead(item.id).catch(() => {});
    }
    if (item.boardId && item.questId) {
      onClose();
      navigate(`/board/${item.boardId}/issue/${item.questId}`);
    } else if (item.type === 'kudos') {
      onClose();
      navigate('/kudos');
    }
  };

  const markAll = async () => {
    setMenuOpen(false);
    setItems((list) => list.map((x) => ({ ...x, read: true })));
    try { await notificationsApi.markAllRead(); } catch { load(); }
  };

  return (
    <aside className="app-panel app-notifications" role="dialog" aria-label={t('Уведомления')}>
      <div className="app-panel-header">
        <h2>{t('Уведомления')}</h2>
        <label className="app-switch-label">
          <span>{t('Показать только непрочитанные')}</span>
          <input type="checkbox" className="app-switch" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
        </label>
        <div className="app-panel-more">
          <button type="button" className="app-icon-btn" aria-label={t('Ещё')} aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}>
            <NavIcon name="more" />
          </button>
          {menuOpen && (
            <div className="app-menu app-menu-right" role="menu">
              <button type="button" role="menuitem" className="app-menu-item" onClick={markAll}>{t('Отметить все как прочитанные')}</button>
            </div>
          )}
        </div>
        <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={onClose}><NavIcon name="close" /></button>
      </div>
      <div className="app-tabs" role="tablist">
        {[['direct', 'Прямые'], ['watching', 'Отслеживаемые']].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={`app-tab ${tab === key ? 'is-active' : ''}`} onClick={() => setTab(key)}>
            {t(label)}
          </button>
        ))}
      </div>
      <div className="app-panel-body">
        {error && <p className="app-panel-error" role="alert">{error}</p>}
        {loading && items.length === 0 ? (
          <p className="app-panel-muted">{t('Загрузка...')}</p>
        ) : groups.length === 0 ? (
          <div className="app-panel-empty">
            <EmptyIllustration />
            <p>{t('Нет уведомлений за последние 30 дней.')}</p>
          </div>
        ) : groups.map((group) => (
          <section key={group.label} className="app-notification-group">
            <h3>{t(group.label)}</h3>
            {group.items.map((item) => (
              <button key={item.id} type="button" className={`app-notification ${item.read ? '' : 'is-unread'}`} onClick={() => openItem(item)}>
                <span className="app-notification-icon">
                  {item.issueType != null ? <IssueTypeIcon issueType={item.issueType} typeId={item.issueTypeId} size={20} /> : <NavIcon name="bell" size={18} />}
                </span>
                <span className="app-notification-main">
                  <span className="app-notification-title">{t(item.title)}</span>
                  {item.questTitle && (
                    <span className="app-notification-issue">{item.issueKey ? `${item.issueKey} · ` : ''}{item.questTitle}</span>
                  )}
                  {item.body && <span className="app-notification-body">{item.body}</span>}
                  <span className="app-notification-meta">{[item.boardName, timeAgo(item.createdAt, language)].filter(Boolean).join(' • ')}</span>
                </span>
                {!item.read && <span className="app-notification-dot" aria-label={t('Не прочитано')} />}
              </button>
            ))}
          </section>
        ))}
        <div className="app-panel-hint">
          {t('Нажмите на уведомление, чтобы открыть задачу.')}
        </div>
      </div>
    </aside>
  );
}
