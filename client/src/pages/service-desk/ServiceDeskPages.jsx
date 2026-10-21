import React, { useEffect, useState } from 'react';
import { Link, useParams } from '../../i18n/navigation.jsx';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { boards as boardsApi, serviceDesk, teams as teamsApi } from '../../api.js';
import NavIcon from '../../components/NavIcons.jsx';
import { SlaBadges } from './PortalPages.jsx';
import './ServiceDesk.css';

const EMPTY_FIELD = { id: 'summary', label: 'Тема', type: 'summary', required: true };

export function ServiceDeskSettingsPage() {
  const { boardId } = useParams();
  const { t } = useLocalization();
  const [settings, setSettings] = useState(null);
  const [types, setTypes] = useState([]);
  const [queues, setQueues] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [tab, setTab] = useState('general');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draftType, setDraftType] = useState({ name: '', description: '', fields: [EMPTY_FIELD] });

  const reload = async () => {
    const [nextSettings, nextTypes, nextQueues, nextPolicies] = await Promise.all([
      serviceDesk.getSettings(boardId),
      serviceDesk.listRequestTypes(boardId),
      serviceDesk.listQueues(boardId, false).catch(() => []),
      serviceDesk.listPolicies(boardId).catch(() => []),
    ]);
    setSettings(nextSettings);
    setTypes(nextTypes);
    setQueues(nextQueues);
    setPolicies(nextPolicies);
  };

  useEffect(() => {
    reload().catch((e) => setError(e.message));
  }, [boardId]);

  const saveSettings = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    try {
      const saved = await serviceDesk.updateSettings(boardId, settings);
      setSettings(saved);
      setNotice(t('Сохранено'));
      await reload();
    } catch (e) {
      setError(e.message);
    }
  };

  const createType = async (event) => {
    event.preventDefault();
    setError('');
    try {
      await serviceDesk.createRequestType(boardId, {
        ...draftType,
        queueId: draftType.queueId || queues[0]?.id || null,
        slaPolicyId: draftType.slaPolicyId || policies[0]?.id || null,
      });
      setDraftType({ name: '', description: '', fields: [EMPTY_FIELD] });
      await reload();
    } catch (e) {
      setError(e.message);
    }
  };

  const createPolicy = async () => {
    setError('');
    try {
      await serviceDesk.createPolicy(boardId, {
        name: t('Новый SLA'),
        firstResponseMinutes: 240,
        resolutionMinutes: 1440,
        pauseStatusTitles: ['Ожидает пользователя'],
      });
      await reload();
    } catch (e) {
      setError(e.message);
    }
  };

  const createQueue = async () => {
    setError('');
    try {
      await serviceDesk.createQueue(boardId, {
        name: t('Новая очередь'),
        jql: 'statusCategory != Done ORDER BY created ASC',
      });
      await reload();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!settings && !error) return <div className="sd-page"><p className="settings-empty">{t('Загрузка...')}</p></div>;

  return (
    <div className="sd-page">
      <div className="sd-head">
        <div>
          <h1>{t('Service Desk')}</h1>
          <p className="sd-muted">{t('Портал клиентов, типы запросов, очереди и SLA для этого раздела.')}</p>
        </div>
        <div className="sd-actions">
          {settings?.enabled && settings.portalSlug && (
            <Link className="app-btn app-btn-primary" to={`/portal/${settings.portalSlug}`}>{t('Открыть портал')}</Link>
          )}
          <Link className="app-btn app-btn-subtle" to={`/board/${boardId}/service-desk/queues`}>{t('Очереди агента')}</Link>
        </div>
      </div>
      {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
      {notice && <p className="settings-save-status">{notice}</p>}
      <div className="sd-tabs" role="tablist">
        {[['general', 'Общее'], ['types', 'Типы запросов'], ['queues', 'Очереди'], ['sla', 'SLA']].map(([id, label]) => (
          <button key={id} type="button" className={`sd-tab ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)}>{t(label)}</button>
        ))}
      </div>

      {tab === 'general' && settings && (
        <form className="sd-form" onSubmit={saveSettings}>
          <label className="sd-check">
            <input type="checkbox" checked={settings.enabled} onChange={(e) => setSettings({ ...settings, enabled: e.target.checked })} />
            {t('Включить Service Desk и клиентский портал')}
          </label>
          <label>
            {t('Адрес портала')}
            <input value={settings.portalSlug || ''} onChange={(e) => setSettings({ ...settings, portalSlug: e.target.value })} placeholder="it-support" />
          </label>
          <label>
            {t('Заголовок')}
            <input value={settings.welcomeTitle || ''} onChange={(e) => setSettings({ ...settings, welcomeTitle: e.target.value })} />
          </label>
          <label>
            {t('Описание')}
            <textarea rows={4} value={settings.welcomeText || ''} onChange={(e) => setSettings({ ...settings, welcomeText: e.target.value })} />
          </label>
          <button type="submit" className="app-btn app-btn-primary">{t('Сохранить')}</button>
        </form>
      )}

      {tab === 'types' && (
        <>
          <table className="sd-table">
            <thead><tr><th>{t('Название')}</th><th>{t('Очередь')}</th><th>SLA</th><th /></tr></thead>
            <tbody>
              {types.map((type) => (
                <tr key={type.id}>
                  <td><strong>{type.name}</strong><div className="sd-muted">{type.description}</div></td>
                  <td>{queues.find((q) => q.id === type.queueId)?.name || '—'}</td>
                  <td>{policies.find((p) => p.id === type.slaPolicyId)?.name || '—'}</td>
                  <td>
                    <button type="button" className="app-btn app-btn-subtle" onClick={() => serviceDesk.deleteRequestType(boardId, type.id).then(reload).catch((e) => setError(e.message))}>{t('Удалить')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <form className="sd-form" style={{ marginTop: 20 }} onSubmit={createType}>
            <h2>{t('Новый тип запроса')}</h2>
            <label>{t('Название')}<input value={draftType.name} onChange={(e) => setDraftType({ ...draftType, name: e.target.value })} required /></label>
            <label>{t('Описание')}<textarea rows={3} value={draftType.description} onChange={(e) => setDraftType({ ...draftType, description: e.target.value })} /></label>
            <label>
              {t('Очередь')}
              <select value={draftType.queueId || ''} onChange={(e) => setDraftType({ ...draftType, queueId: e.target.value || null })}>
                <option value="">{t('Не выбрана')}</option>
                {queues.map((queue) => <option key={queue.id} value={queue.id}>{queue.name}</option>)}
              </select>
            </label>
            <label>
              SLA
              <select value={draftType.slaPolicyId || ''} onChange={(e) => setDraftType({ ...draftType, slaPolicyId: e.target.value || null })}>
                <option value="">{t('Без SLA')}</option>
                {policies.map((policy) => <option key={policy.id} value={policy.id}>{policy.name}</option>)}
              </select>
            </label>
            <button type="submit" className="app-btn app-btn-primary">{t('Добавить')}</button>
          </form>
        </>
      )}

      {tab === 'queues' && (
        <>
          <div className="sd-actions" style={{ marginBottom: 12 }}>
            <button type="button" className="app-btn app-btn-primary" onClick={createQueue}><NavIcon name="plus" size={14} />{t('Добавить очередь')}</button>
          </div>
          <table className="sd-table">
            <thead><tr><th>{t('Название')}</th><th>JQL</th><th /></tr></thead>
            <tbody>
              {queues.map((queue) => (
                <tr key={queue.id}>
                  <td>{queue.name}<div className="sd-muted">{queue.description}</div></td>
                  <td><code>{queue.jql}</code></td>
                  <td>
                    <button type="button" className="app-btn app-btn-subtle" onClick={() => serviceDesk.deleteQueue(boardId, queue.id).then(reload).catch((e) => setError(e.message))}>{t('Удалить')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {tab === 'sla' && (
        <>
          <div className="sd-actions" style={{ marginBottom: 12 }}>
            <button type="button" className="app-btn app-btn-primary" onClick={createPolicy}><NavIcon name="plus" size={14} />{t('Добавить политику')}</button>
          </div>
          <table className="sd-table">
            <thead><tr><th>{t('Название')}</th><th>{t('Первый ответ')}</th><th>{t('Решение')}</th><th>{t('Пауза')}</th><th /></tr></thead>
            <tbody>
              {policies.map((policy) => (
                <tr key={policy.id}>
                  <td>{policy.name}</td>
                  <td>{policy.firstResponseMinutes} {t('мин.')}</td>
                  <td>{policy.resolutionMinutes} {t('мин.')}</td>
                  <td>{(policy.pauseStatusTitles || []).join(', ') || '—'}</td>
                  <td>
                    <button type="button" className="app-btn app-btn-subtle" onClick={() => serviceDesk.deletePolicy(boardId, policy.id).then(reload).catch((e) => setError(e.message))}>{t('Удалить')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export function ServiceDeskQueuesPage() {
  const { boardId } = useParams();
  const { t } = useLocalization();
  const [queues, setQueues] = useState(null);
  const [queueId, setQueueId] = useState(null);
  const [issues, setIssues] = useState(null);
  const [selected, setSelected] = useState([]);
  const [members, setMembers] = useState([]);
  const [assigneeId, setAssigneeId] = useState('');
  const [approvalQuestId, setApprovalQuestId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    serviceDesk.listQueues(boardId, true).then((list) => {
      setQueues(list);
      setQueueId(list[0]?.id || null);
    }).catch((e) => setError(e.message));
    boardsApi.getById(boardId).then(async (board) => {
      if (!board?.teamId) return;
      const users = await teamsApi.getMembers(board.teamId);
      setMembers(Array.isArray(users) ? users.map((m) => m.user || m) : []);
    }).catch(() => setMembers([]));
  }, [boardId]);

  useEffect(() => {
    if (!queueId) { setIssues(null); return undefined; }
    let alive = true;
    serviceDesk.queueIssues(boardId, queueId).then((data) => {
      if (!alive) return;
      setIssues(data);
      setSelected([]);
    }).catch((e) => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [boardId, queueId]);

  const assign = async () => {
    if (!queueId || selected.length === 0) return;
    setError('');
    try {
      await serviceDesk.assignQueue(boardId, queueId, { questIds: selected, assigneeId: assigneeId || null });
      const data = await serviceDesk.queueIssues(boardId, queueId);
      setIssues(data);
      setSelected([]);
    } catch (e) {
      setError(e.message);
    }
  };

  const requestApproval = async () => {
    if (!approvalQuestId) return;
    setError('');
    try {
      await serviceDesk.createApproval(boardId, approvalQuestId, {
        title: t('Согласование заявки'),
        requiredApprovals: 1,
        approverUserIds: assigneeId ? [assigneeId] : [],
        blockedTransitionKey: null,
      });
      setApprovalQuestId('');
    } catch (e) {
      setError(e.message);
    }
  };

  const rows = issues?.issues || [];

  return (
    <div className="sd-page">
      <div className="sd-head">
        <div>
          <h1>{t('Очереди Service Desk')}</h1>
          <p className="sd-muted">{t('Заявки по сохранённым фильтрам с SLA и массовым назначением.')}</p>
        </div>
        <div className="sd-actions">
          <Link className="app-btn app-btn-subtle" to={`/board/${boardId}/service-desk`}>{t('Настройки')}</Link>
        </div>
      </div>
      {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
      {!queues && <p className="settings-empty">{t('Загрузка...')}</p>}
      {queues && (
        <div className="sd-queue-layout">
          <nav className="sd-queue-nav" aria-label={t('Очереди')}>
            {queues.map((queue) => (
              <button key={queue.id} type="button" className={queueId === queue.id ? 'is-active' : ''} onClick={() => setQueueId(queue.id)}>
                {queue.name}
                <span className="sd-queue-count">{queue.issueCount ?? '—'}</span>
              </button>
            ))}
          </nav>
          <div>
            <div className="sd-actions" style={{ marginBottom: 12 }}>
              <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">{t('Исполнитель…')}</option>
                {members.map((member) => (
                  <option key={member.id || member.userId} value={member.id || member.userId}>
                    {member.displayName || member.name || member.email}
                  </option>
                ))}
              </select>
              <button type="button" className="app-btn app-btn-primary" disabled={!selected.length} onClick={assign}>{t('Назначить')}</button>
              <input placeholder={t('ID заявки для согласования')} value={approvalQuestId} onChange={(e) => setApprovalQuestId(e.target.value)} />
              <button type="button" className="app-btn app-btn-subtle" disabled={!approvalQuestId || !assigneeId} onClick={requestApproval}>{t('Запросить согласование')}</button>
            </div>
            {!issues && <p className="settings-empty">{t('Загрузка...')}</p>}
            {issues && rows.length === 0 && <div className="sd-empty">{t('В очереди нет заявок.')}</div>}
            {issues && rows.length > 0 && (
              <table className="sd-table">
                <thead>
                  <tr>
                    <th />
                    <th>{t('Ключ')}</th>
                    <th>{t('Тема')}</th>
                    <th>{t('Статус')}</th>
                    <th>{t('Исполнитель')}</th>
                    <th>SLA</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((issue) => (
                    <tr key={issue.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.includes(issue.id)}
                          onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, issue.id] : prev.filter((id) => id !== issue.id))}
                        />
                      </td>
                      <td><Link to={`/board/${boardId}/issue/${issue.id}`}>{issue.issueKey}</Link></td>
                      <td>{issue.title}</td>
                      <td>{issue.statusTitle}</td>
                      <td>{issue.assigneeName || t('Не назначен')}</td>
                      <td><SlaBadges clocks={issue.sla} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
