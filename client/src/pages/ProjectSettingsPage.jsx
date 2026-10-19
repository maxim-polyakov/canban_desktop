import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from '../i18n/navigation.jsx';
import {
  automations, components, integrations, permissions, releases, workflows,
} from '../api.js';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import './JiraPages.css';

const CONFIG = {
  components: { title: 'Компоненты', api: components, create: (api, boardId, data) => api.create(boardId, data), fields: ['name', 'description', 'leadUserId'] },
  releases: { title: 'Релизы', api: releases, create: (api, boardId, data) => api.create(boardId, data), fields: ['name', 'description', 'releaseDate'] },
  automations: { title: 'Правила автоматизации', api: automations, create: (api, boardId, data) => api.create(boardId, data), fields: ['name', 'trigger', 'action'] },
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
      const result = await config.api.getByBoard(boardId);
      setItems(Array.isArray(result) ? result : result?.items || []);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [boardId, config]);
  useEffect(() => { load(); }, [load]);
  const submit = async (event) => {
    event.preventDefault();
    try { await config.create(config.api, boardId, form); setForm({}); await load(); } catch (e) { setError(e.message); }
  };
  return (
    <>
      <div className="jira-header"><h1>{t(config.title)}</h1></div>
      <form className="jira-toolbar" onSubmit={submit}>
        {config.fields.map((field) => <input key={field} required={field === 'name'} type={field.endsWith('Date') ? 'date' : 'text'} value={form[field] || ''} onChange={(e) => setForm({ ...form, [field]: e.target.value })} placeholder={t(field)} aria-label={t(field)} />)}
        <button className="jira-button jira-button-primary" type="submit">{t('Создать')}</button>
      </form>
      {error && <p className="jira-error">{error}</p>}
      {loading ? <div className="jira-state">{t('Загрузка...')}</div> : items.length === 0 ? <div className="jira-state">{t('Данных пока нет.')}</div> : (
        <div className="jira-grid">{items.map((item) => <article className="jira-card" key={item.id}>
          <div className="jira-card-header"><h2>{item.name}</h2><button className="jira-button jira-button-danger" type="button" onClick={async () => { await config.api.delete(item.id); load(); }}>{t('Удалить')}</button></div>
          <p>{item.description || item.trigger || t('Без описания')}</p>
          {mode === 'releases' && <p>{t('Дата релиза')}: {item.releaseDate ? new Date(item.releaseDate).toLocaleDateString() : '—'} · {item.status || t('Запланирован')}</p>}
          {mode === 'automations' && <div className="jira-actions">
            <span>{item.enabled === false ? t('Выключено') : t('Включено')}</span>
            <button className="jira-button" type="button" onClick={() => config.api.run(item.id)}>{t('Запустить')}</button>
          </div>}
        </article>)}</div>
      )}
    </>
  );
}

function JsonSettings({ mode, boardId }) {
  const { t } = useLocalization();
  const definition = useMemo(() => ({
    workflow: { title: 'Редактор workflow', load: () => workflows.getByBoard(boardId), save: (data) => workflows.save(boardId, data) },
    permissions: { title: 'Разрешения проекта', load: () => permissions.getByBoard(boardId), save: (data) => permissions.save(boardId, data) },
  })[mode], [boardId, mode]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setLoading(true);
    definition.load().then((data) => setText(JSON.stringify(data, null, 2))).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [definition]);
  const save = async () => {
    try { setError(''); await definition.save(JSON.parse(text)); } catch (e) { setError(e.message || t('Некорректный JSON')); }
  };
  return <>
    <div className="jira-header"><h1>{t(definition.title)}</h1><button className="jira-button jira-button-primary" type="button" onClick={save}>{t('Сохранить')}</button></div>
    {error && <p className="jira-error">{error}</p>}
    {loading ? <div className="jira-state">{t('Загрузка...')}</div> : <div className="jira-card"><textarea aria-label={t('Конфигурация')} style={{ width: '100%', minHeight: 480 }} value={text} onChange={(e) => setText(e.target.value)} /></div>}
  </>;
}

function Integrations({ boardId }) {
  const { t } = useLocalization();
  const [data, setData] = useState({});
  const [repository, setRepository] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(() => integrations.getByBoard(boardId).then(setData).catch((e) => setError(e.message)), [boardId]);
  useEffect(() => { load(); }, [load]);
  return <>
    <div className="jira-header"><h1>{t('Интеграции GitHub и webhooks')}</h1></div>
    {error && <p className="jira-error">{error}</p>}
    <div className="jira-grid">
      <form className="jira-card jira-form" onSubmit={async (e) => { e.preventDefault(); await integrations.saveGithub(boardId, { repository }); setRepository(''); load(); }}>
        <h2>GitHub</h2><label>{t('Репозиторий')}<input required value={repository} onChange={(e) => setRepository(e.target.value)} placeholder="owner/repository" /></label>
        <button className="jira-button jira-button-primary" type="submit">{t('Подключить')}</button>
        <p>{data.github?.repository || t('Репозиторий не подключён.')}</p>
      </form>
      <form className="jira-card jira-form" onSubmit={async (e) => { e.preventDefault(); await integrations.createWebhook(boardId, { url: webhookUrl, events: ['quest.updated'] }); setWebhookUrl(''); load(); }}>
        <h2>Webhooks</h2><label>URL<input required type="url" value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} /></label>
        <button className="jira-button jira-button-primary" type="submit">{t('Добавить')}</button>
        <ul className="jira-link-list">{(data.webhooks || []).map((hook) => <li key={hook.id}>{hook.url}</li>)}</ul>
      </form>
    </div>
  </>;
}

export default function ProjectSettingsPage({ mode }) {
  const { boardId } = useParams();
  return <div className="page jira-page">
    {CONFIG[mode] ? <ListSettings mode={mode} boardId={boardId} /> : mode === 'integrations' ? <Integrations boardId={boardId} /> : <JsonSettings mode={mode} boardId={boardId} />}
  </div>;
}
