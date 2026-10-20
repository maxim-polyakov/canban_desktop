import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from '../i18n/navigation.jsx';
import {
  automations, components, integrations, permissions, releases,
} from '../api.js';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import WorkflowEditor from './workflow/WorkflowEditor.jsx';
import './JiraPages.css';

export const AUTOMATION_TRIGGERS = ['IssueCreated', 'IssueUpdated', 'IssueMoved', 'WorkLogged', 'SprintChanged', 'WebhookReceived'];
export const WEBHOOK_EVENTS = ['IssueCreated', 'IssueUpdated', 'IssueMoved', 'WorkLogged', 'WebhookReceived'];
const PERMISSION_LABELS = ['Просмотр', 'Работа', 'Управление', 'Администрирование'];
const RELEASE_STATUS_LABELS = ['Запланирован', 'Выпущен', 'В архиве'];
const DEFAULT_SECRET_KEY = 'GitHub:WebhookSecret';

export function parseRepository(value) {
  const cleaned = String(value || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  const [owner, name, ...rest] = cleaned.split('/');
  if (!owner || !name || rest.length) return null;
  return { repositoryOwner: owner, repositoryName: name };
}

const CONFIG = {
  components: {
    title: 'Компоненты',
    fields: [{ name: 'name', required: true }, { name: 'description' }],
    load: (boardId) => components.getByBoard(boardId),
    create: (boardId, form) => components.create(boardId, { name: form.name, description: form.description || null }),
    remove: (boardId, item) => components.delete(item.id),
  },
  releases: {
    title: 'Релизы',
    fields: [{ name: 'name', required: true }, { name: 'description' }, { name: 'releaseDate', type: 'date' }],
    load: (boardId) => releases.getByBoard(boardId),
    create: (boardId, form) => releases.create(boardId, {
      name: form.name, description: form.description || null, releaseDate: form.releaseDate ? new Date(form.releaseDate).toISOString() : null,
    }),
    remove: (boardId, item) => releases.delete(item.id),
  },
};

function ListSettings({ mode, boardId }) {
  const { t } = useLocalization();
  const config = CONFIG[mode];
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const result = await config.load(boardId);
      setItems(Array.isArray(result) ? result : []);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [boardId, config]);
  useEffect(() => { load(); }, [load]);
  const act = async (action) => {
    setError('');
    try { await action(); await load(); } catch (e) { setError(e.message); }
  };
  return (
    <>
      <div className="jira-header"><h1>{t(config.title)}</h1></div>
      <form className="jira-toolbar" onSubmit={(e) => { e.preventDefault(); act(async () => { await config.create(boardId, form); setForm({}); }); }}>
        {config.fields.map((field) => <input key={field.name} required={field.required} type={field.type || 'text'} value={form[field.name] || ''} onChange={(e) => setForm({ ...form, [field.name]: e.target.value })} placeholder={t(field.name)} aria-label={t(field.name)} />)}
        <button className="jira-button jira-button-primary" type="submit">{t('Создать')}</button>
      </form>
      {error && <p className="jira-error">{error}</p>}
      {loading ? <div className="jira-state">{t('Загрузка...')}</div> : items.length === 0 ? <div className="jira-state">{t('Данных пока нет.')}</div> : (
        <div className="jira-grid">{items.map((item) => <article className="jira-card" key={item.id}>
          <div className="jira-card-header"><h2>{item.name}</h2>
            <button className="jira-button jira-button-danger" type="button" onClick={() => { if (window.confirm(t('Удалить?'))) act(() => config.remove(boardId, item)); }}>{t('Удалить')}</button>
          </div>
          <p>{item.description || t('Без описания')}</p>
          {mode === 'releases' && <div className="jira-actions">
            <span>{t('Дата релиза')}: {item.releaseDate ? new Date(item.releaseDate).toLocaleDateString() : '—'} · {t(RELEASE_STATUS_LABELS[item.status] || 'Запланирован')}</span>
            {item.status === 0 && <button className="jira-button" type="button" onClick={() => act(() => releases.release(item.id))}>{t('Выпустить')}</button>}
          </div>}
        </article>)}</div>
      )}
    </>
  );
}

function AutomationSettings({ boardId }) {
  const { t } = useLocalization();
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ name: '', trigger: 0, actionsJson: '[{"type":"addLabel","value":"auto"}]' });
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const load = useCallback(() => automations.getByBoard(boardId).then((list) => setItems(Array.isArray(list) ? list : [])).catch((e) => setError(e.message)), [boardId]);
  useEffect(() => { load(); }, [load]);
  const act = async (action) => {
    setError(''); setStatus('');
    try { await action(); await load(); } catch (e) { setError(e.message); }
  };
  const submit = (e) => {
    e.preventDefault();
    act(async () => {
      JSON.parse(form.actionsJson);
      await automations.create(boardId, { name: form.name, trigger: Number(form.trigger), actionsJson: form.actionsJson, enabled: true });
      setForm({ ...form, name: '' });
    });
  };
  const run = (rule) => {
    const input = window.prompt(t('Ключи задач через запятую, например KAN-1, KAN-2'));
    if (!input) return;
    act(async () => {
      const result = await automations.run(boardId, rule.id, input.split(/[\s,;]+/).filter(Boolean));
      setStatus(t('Правило применено к задачам: ${count}', { count: result.appliedCount }) + (result.notFound?.length ? ` · ${t('Не найдены')}: ${result.notFound.join(', ')}` : ''));
    });
  };
  const toggle = (rule) => act(() => automations.update(boardId, rule.id, {
    name: rule.name, trigger: rule.trigger, conditionsJson: rule.conditionsJson, actionsJson: rule.actionsJson, enabled: !rule.enabled,
  }));
  return <>
    <div className="jira-header"><h1>{t('Правила автоматизации')}</h1></div>
    <form className="jira-card jira-form" onSubmit={submit}>
      <label>{t('Название')}<input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
      <label>{t('Триггер')}<select value={form.trigger} onChange={(e) => setForm({ ...form, trigger: e.target.value })}>
        {AUTOMATION_TRIGGERS.map((name, index) => <option key={name} value={index}>{name}</option>)}
      </select></label>
      <label>{t('Действия (JSON)')}<textarea value={form.actionsJson} onChange={(e) => setForm({ ...form, actionsJson: e.target.value })} /></label>
      <p>{t('Доступные действия')}: {'{"type":"setPriority","value":"High"}'}, {'{"type":"addLabel","value":"..."}'}, {'{"type":"move","columnId":"..."}'}</p>
      <button className="jira-button jira-button-primary" type="submit">{t('Создать')}</button>
    </form>
    {error && <p className="jira-error">{error}</p>}{status && <p className="jira-card">{status}</p>}
    <div className="jira-grid">{items.map((rule) => <article className="jira-card" key={rule.id}>
      <div className="jira-card-header"><h2>{rule.name}</h2>
        <button className="jira-button jira-button-danger" type="button" onClick={() => { if (window.confirm(t('Удалить?'))) act(() => automations.delete(boardId, rule.id)); }}>{t('Удалить')}</button>
      </div>
      <p>{AUTOMATION_TRIGGERS[rule.trigger] || rule.trigger} · <code>{rule.actionsJson}</code></p>
      <div className="jira-actions">
        <button className="jira-button" type="button" onClick={() => toggle(rule)}>{rule.enabled ? t('Выключить') : t('Включить')}</button>
        <button className="jira-button" type="button" onClick={() => run(rule)}>{t('Запустить')}</button>
      </div>
    </article>)}</div>
  </>;
}

function PermissionSettings({ boardId }) {
  const { t } = useLocalization();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { permissions.getByBoard(boardId).then(setData).catch((e) => setError(e.message)); }, [boardId]);
  return <>
    <div className="jira-header"><h1>{t('Разрешения проекта')}</h1></div>
    {error && <p className="jira-error">{error}</p>}
    {data && <>
      <p>{t('Ваш уровень доступа')}: <strong>{t(PERMISSION_LABELS[data.currentPermission])}</strong>. {t('Роли участников меняются в настройках команды.')}</p>
      <div className="jira-table-wrap"><table className="jira-table"><thead><tr><th>{t('Участник')}</th><th>Email</th><th>{t('Доступ')}</th></tr></thead>
        <tbody>{data.members.map((member) => <tr key={member.userId}>
          <td>{member.displayName || '—'}{member.isOwner ? ` (${t('владелец')})` : ''}</td><td>{member.email || '—'}</td><td>{t(PERMISSION_LABELS[member.permission])}</td>
        </tr>)}</tbody></table></div>
    </>}
  </>;
}

function Integrations({ boardId }) {
  const { t } = useLocalization();
  const [data, setData] = useState({ github: [], webhooks: [] });
  const [repository, setRepository] = useState('');
  const [secretKey, setSecretKey] = useState(DEFAULT_SECRET_KEY);
  const [installationId, setInstallationId] = useState('');
  const [webhook, setWebhook] = useState({ url: '', secretConfigurationKey: '', events: ['IssueCreated', 'IssueUpdated', 'IssueMoved'] });
  const [error, setError] = useState('');
  const load = useCallback(() => integrations.getByBoard(boardId).then(setData).catch((e) => setError(e.message)), [boardId]);
  useEffect(() => { load(); }, [load]);
  const act = async (action) => {
    setError('');
    try { await action(); await load(); } catch (e) { setError(e.message); }
  };
  const saveGithub = (e) => {
    e.preventDefault();
    const parsed = parseRepository(repository);
    if (!parsed) { setError(t('Укажите репозиторий в формате owner/repository')); return; }
    act(async () => {
      await integrations.saveGithub(boardId, {
        ...parsed, installationId: Number(installationId) || 0, webhookSecretConfigurationKey: secretKey.trim(), enabled: true,
      });
      setRepository(''); setInstallationId('');
    });
  };
  const saveWebhook = (e) => {
    e.preventDefault();
    act(async () => {
      await integrations.createWebhook(boardId, { url: webhook.url.trim(), secretConfigurationKey: webhook.secretConfigurationKey.trim(), events: webhook.events.join(','), enabled: true });
      setWebhook({ ...webhook, url: '' });
    });
  };
  const toggleEvent = (name) => setWebhook((current) => ({
    ...current, events: current.events.includes(name) ? current.events.filter((e) => e !== name) : [...current.events, name],
  }));
  return <>
    <div className="jira-header"><h1>{t('Интеграции GitHub и webhooks')}</h1></div>
    {error && <p className="jira-error">{error}</p>}
    <div className="jira-grid">
      <form className="jira-card jira-form" onSubmit={saveGithub}>
        <h2>GitHub</h2>
        <p>{data.githubAppConfigured ? t('GitHub App настроена на сервере: Installation ID определится автоматически.') : t('GitHub App не настроена на сервере: доступен только приём webhook-событий.')}</p>
        <label>{t('Репозиторий')}<input required value={repository} onChange={(e) => setRepository(e.target.value)} placeholder="owner/repository" /></label>
        <label>{t('Ключ секрета webhook в конфигурации сервера')}<input required value={secretKey} onChange={(e) => setSecretKey(e.target.value)} /></label>
        {!data.githubAppConfigured && <label>Installation ID<input type="number" min="0" value={installationId} onChange={(e) => setInstallationId(e.target.value)} /></label>}
        <button className="jira-button jira-button-primary" type="submit">{t('Подключить')}</button>
        {(data.github || []).length === 0 ? <p>{t('Репозиторий не подключён.')}</p> : <ul className="jira-link-list">{data.github.map((item) => <li key={item.id}>
          <div className="jira-card-header">
            <a href={`https://github.com/${item.repositoryOwner}/${item.repositoryName}`} target="_blank" rel="noreferrer">{item.repositoryOwner}/{item.repositoryName}</a>
            <button className="jira-button jira-button-danger" type="button" onClick={() => { if (window.confirm(t('Отключить репозиторий?'))) act(() => integrations.deleteGithub(boardId, item.id)); }}>{t('Отключить')}</button>
          </div>
          <small>Installation ID: {item.installationId || '—'} · {item.webhookSecretConfigurationKey}</small>
        </li>)}</ul>}
      </form>
      <form className="jira-card jira-form" onSubmit={saveWebhook}>
        <h2>Webhooks</h2>
        <label>HTTPS URL<input required type="url" pattern="https://.*" value={webhook.url} onChange={(e) => setWebhook({ ...webhook, url: e.target.value })} /></label>
        <label>{t('Ключ секрета подписи в конфигурации сервера')}<input required value={webhook.secretConfigurationKey} onChange={(e) => setWebhook({ ...webhook, secretConfigurationKey: e.target.value })} placeholder="Webhooks:MySecret" /></label>
        <fieldset className="jira-actions">{WEBHOOK_EVENTS.map((name) => <label key={name}><input type="checkbox" checked={webhook.events.includes(name)} onChange={() => toggleEvent(name)} /> {name}</label>)}</fieldset>
        <button className="jira-button jira-button-primary" type="submit" disabled={!webhook.events.length}>{t('Добавить')}</button>
        <ul className="jira-link-list">{(data.webhooks || []).map((hook) => <li key={hook.id}>
          <div className="jira-card-header"><span>{hook.url}</span>
            <button className="jira-button jira-button-danger" type="button" onClick={() => act(() => integrations.deleteWebhook(boardId, hook.id))}>{t('Удалить')}</button>
          </div>
          <small>{hook.events}</small>
        </li>)}</ul>
      </form>
    </div>
  </>;
}

export default function ProjectSettingsPage({ mode }) {
  const { boardId } = useParams();
  let content;
  if (CONFIG[mode]) content = <ListSettings mode={mode} boardId={boardId} />;
  else if (mode === 'automations') content = <AutomationSettings boardId={boardId} />;
  else if (mode === 'integrations') content = <Integrations boardId={boardId} />;
  else if (mode === 'permissions') content = <PermissionSettings boardId={boardId} />;
  else content = <WorkflowEditor boardId={boardId} />;
  return <div className="page jira-page">{content}</div>;
}
