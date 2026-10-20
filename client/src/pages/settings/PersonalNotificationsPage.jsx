import React, { useCallback, useEffect, useState } from 'react';
import { Link } from '../../i18n/navigation.jsx';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { myWork, personalSettings, quests } from '../../api.js';
import { IssueTypeIcon } from '../../components/IssueIcons.jsx';
import SettingsShell, { PERSONAL_NAV, SaveStatus, SettingsSection, Toggle } from './SettingsShell.jsx';

const ROLE_OPTIONS = [
  ['emailWhenAssignee', 'Вы исполнитель задачи', 'Письма об изменениях, комментариях и вложениях в задачах, назначенных на вас.'],
  ['emailWhenReporter', 'Вы автор задачи', 'Письма об изменениях в задачах, которые вы создали.'],
  ['emailOwnChanges', 'Вы вносите изменения', 'Получать письма и о собственных действиях.'],
];

export default function PersonalNotificationsPage() {
  const { t } = useLocalization();
  const { user } = useAuth();
  const [settings, setSettings] = useState(null);
  const [status, setStatus] = useState(null);
  const [watching, setWatching] = useState([]);
  const [loadingWatching, setLoadingWatching] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [watchError, setWatchError] = useState('');

  useEffect(() => {
    personalSettings.get().then(setSettings).catch((e) => setStatus(e.message || t('Не удалось загрузить настройки')));
  }, [t]);

  const loadWatching = useCallback(() => {
    setLoadingWatching(true);
    myWork.get('watching')
      .then((list) => setWatching(Array.isArray(list) ? list : []))
      .catch((e) => setWatchError(e.message || t('Не удалось загрузить подписки.')))
      .finally(() => setLoadingWatching(false));
  }, [t]);
  useEffect(() => { loadWatching(); }, [loadWatching]);

  const save = async (patch) => {
    const previous = settings;
    const next = { ...settings, ...patch };
    setSettings(next);
    setStatus('saving');
    try {
      setSettings(await personalSettings.save(next));
      setStatus('saved');
    } catch (e) {
      setSettings(previous);
      setStatus(e.message || t('Не удалось сохранить настройки'));
    }
  };

  const unsubscribe = async (item) => {
    setBusyId(item.questId);
    setWatchError('');
    try {
      const quest = await quests.get(item.questId);
      const assigned = (quest.assignees || []).some((a) => (a.userId ?? a.id) === user?.id) || quest.assigneeId === user?.id;
      if (assigned) {
        setWatchError(t('Исполнители задачи всегда получают уведомления. Снимите себя с задачи, чтобы отписаться.'));
        return;
      }
      await quests.setNotificationRecipients(item.questId, (quest.notificationRecipientIds || []).filter((id) => id !== user?.id));
      setWatching((list) => list.filter((x) => x.questId !== item.questId));
    } catch (e) {
      setWatchError(e.message || t('Не удалось отписаться.'));
    } finally {
      setBusyId(null);
    }
  };

  const enabled = Boolean(settings?.emailNotificationsEnabled);

  return (
    <SettingsShell
      nav={PERSONAL_NAV}
      breadcrumbs={[['Персональные настройки', '/settings/personal/general'], ['Электронные письма и уведомления']]}
      title={t('Электронные письма и уведомления')}
      description={<>{t('Письма приходят на')} <strong>{user?.email}</strong>. {t('Уведомления в приложении (колокольчик) приходят всегда, кроме ваших собственных действий.')}</>}
      actions={<SaveStatus state={status} />}
    >
      <SettingsSection title={t('Уведомления по электронной почте')}>
        <div className="settings-row">
          <label className="settings-row-text" htmlFor="email-enabled">
            <span className="settings-row-title">{t('Отправлять мне письма')}</span>
            <span className="settings-row-desc">{t('Если выключить, письма о задачах приходить не будут. Письма безопасности (вход, сброс пароля) приходят всегда.')}</span>
          </label>
          <Toggle id="email-enabled" checked={enabled} disabled={!settings} label={t('Отправлять мне письма')} onChange={(value) => save({ emailNotificationsEnabled: value })} />
        </div>
      </SettingsSection>

      <SettingsSection title={t('Присылать письма, когда')} description={t('Наблюдатели задачи получают письма обо всех изменениях независимо от этих настроек.')}>
        {ROLE_OPTIONS.map(([field, label, hint]) => (
          <label key={field} className="settings-checkbox">
            <input type="checkbox" checked={Boolean(settings?.[field])} disabled={!settings || !enabled} onChange={(e) => save({ [field]: e.target.checked })} />
            <span>{t(label)}<small>{t(hint)}</small></span>
          </label>
        ))}
      </SettingsSection>

      <SettingsSection title={t('Формат письма')}>
        <div className="settings-radio-group" role="radiogroup" aria-label={t('Формат письма')}>
          {[['html', 'HTML', 'Оформленные письма с кнопками и ссылками'], ['text', 'Текст', 'Простой текст без оформления']].map(([value, label, hint]) => (
            <label key={value} className="settings-checkbox">
              <input type="radio" name="email-format" value={value} checked={settings?.emailFormat === value} disabled={!settings || !enabled} onChange={() => save({ emailFormat: value })} />
              <span>{t(label)}<small>{t(hint)}</small></span>
            </label>
          ))}
        </div>
      </SettingsSection>

      <SettingsSection title={t('Отслеживаемые задачи')} description={t('Задачи, в которых вы наблюдатель. Отпишитесь, чтобы перестать получать уведомления.')}>
        {watchError && <p className="settings-save-status is-error" role="alert">{watchError}</p>}
        {loadingWatching ? <p className="settings-empty">{t('Загрузка...')}</p> : watching.length === 0 ? (
          <p className="settings-empty">{t('Вы не отслеживаете ни одной задачи.')}</p>
        ) : (
          <div className="settings-table-wrap">
            <table className="settings-table">
              <thead>
                <tr>
                  <th className="is-narrow">{t('Тип')}</th>
                  <th className="is-narrow">{t('Ключ')}</th>
                  <th>{t('Сводка')}</th>
                  <th className="hide-mobile">{t('Раздел')}</th>
                  <th className="hide-mobile">{t('Статус')}</th>
                  <th className="is-narrow" aria-label={t('Действия')} />
                </tr>
              </thead>
              <tbody>
                {watching.map((item) => (
                  <tr key={item.questId}>
                    <td><IssueTypeIcon issueType={item.issueType} typeId={item.issueTypeId} size={16} /></td>
                    <td className="is-narrow"><Link to={`/board/${item.boardId}/issue/${item.questId}`}>{item.issueKey}</Link></td>
                    <td><Link to={`/board/${item.boardId}/issue/${item.questId}`}>{item.title}</Link></td>
                    <td className="hide-mobile">{item.boardName}</td>
                    <td className="hide-mobile"><span className={`settings-lozenge ${item.done ? 'is-success' : ''}`}>{item.status}</span></td>
                    <td className="is-narrow">
                      <button type="button" className="app-btn" disabled={busyId === item.questId} onClick={() => unsubscribe(item)}>
                        {busyId === item.questId ? '…' : t('Отписаться')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SettingsSection>
    </SettingsShell>
  );
}
