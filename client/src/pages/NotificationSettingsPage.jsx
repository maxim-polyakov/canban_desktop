import React, { useCallback, useEffect, useState } from 'react';
import { Link } from '../i18n/navigation.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { myWork, quests } from '../api.js';
import { IssueTypeIcon } from '../components/IssueIcons.jsx';
import './ForYouPage.css';

export default function NotificationSettingsPage() {
  const { t } = useLocalization();
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    myWork.get('watching')
      .then((list) => setItems(Array.isArray(list) ? list : []))
      .catch((e) => setError(e.message || t('Не удалось загрузить подписки.')))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const unsubscribe = async (item) => {
    setBusyId(item.questId);
    setError('');
    try {
      const quest = await quests.get(item.questId);
      const assigned = (quest.assignees || []).some((a) => (a.userId ?? a.id) === user?.id) || quest.assigneeId === user?.id;
      if (assigned) {
        setError(t('Исполнители задачи всегда получают уведомления. Снимите себя с задачи, чтобы отписаться.'));
        return;
      }
      await quests.setNotificationRecipients(item.questId, (quest.notificationRecipientIds || []).filter((id) => id !== user?.id));
      setItems((list) => list.filter((x) => x.questId !== item.questId));
    } catch (e) {
      setError(e.message || t('Не удалось отписаться.'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="page foryou-page">
      <section className="foryou-section">
        <div className="foryou-section-header"><h2>{t('Настройки уведомлений')}</h2></div>
        <p className="foryou-row-meta">
          {t('Письма приходят на')} <strong>{user?.email}</strong>. {t('Вы получаете уведомления о задачах, где вы исполнитель или наблюдатель: изменения полей, статуса, комментарии и вложения. О своих действиях письма тоже приходят.')}
        </p>
      </section>
      <section className="foryou-section">
        <div className="foryou-section-header"><h2>{t('Отслеживаемые задачи')}</h2></div>
        {error && <p className="foryou-error" role="alert">{error}</p>}
        {loading ? <p className="foryou-empty">{t('Загрузка...')}</p> : items.length === 0 ? (
          <p className="foryou-empty">{t('Вы не отслеживаете ни одной задачи.')}</p>
        ) : (
          <div className="foryou-list">
            {items.map((item) => (
              <div key={item.questId} className="foryou-row">
                <IssueTypeIcon issueType={item.issueType} size={16} />
                <Link to={`/board/${item.boardId}/issue/${item.questId}`} className="foryou-row-main">
                  <span className={`foryou-row-title ${item.done ? 'is-done' : ''}`}>{item.title}</span>
                  <span className="foryou-row-meta">{[item.issueKey, item.boardName].filter(Boolean).join(' • ')}</span>
                </Link>
                <span className="foryou-row-status">{item.status}</span>
                <button type="button" className="jira-button" disabled={busyId === item.questId} onClick={() => unsubscribe(item)}>
                  {busyId === item.questId ? '…' : t('Отписаться')}
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
