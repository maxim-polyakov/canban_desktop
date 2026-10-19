import React, { useCallback, useEffect, useState } from 'react';
import { dashboards } from '../api.js';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import './JiraPages.css';

export default function DashboardsPage() {
  const { t } = useLocalization();
  const [items, setItems] = useState([]);
  const [selected, setSelected] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const result = await dashboards.getAll();
      const list = Array.isArray(result) ? result : result?.items || [];
      setItems(list);
      if (list[0]) setSelected((current) => current || list[0]);
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  return <div className="page jira-page">
    <div className="jira-header"><h1>{t('Дашборды')}</h1>
      <form className="jira-actions" onSubmit={async (e) => { e.preventDefault(); const created = await dashboards.create({ name }); setName(''); setSelected(created); load(); }}>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Название дашборда')} />
        <button className="jira-button jira-button-primary" type="submit">{t('Создать')}</button>
      </form>
    </div>
    {error && <p className="jira-error">{error}</p>}
    <div className="jira-toolbar">{items.map((item) => <button key={item.id} className="jira-button" type="button" onClick={async () => setSelected(await dashboards.get(item.id))}>{item.name}</button>)}</div>
    {!selected ? <div className="jira-state">{t('Создайте первый дашборд.')}</div> : <>
      <div className="jira-header"><h2>{selected.name}</h2><button className="jira-button" type="button" onClick={async () => { const type = window.prompt(t('Тип гаджета: burndown, velocity, cumulativeFlow, releaseProgress, estimates')); if (type) { await dashboards.addGadget(selected.id, { type, title: type }); setSelected(await dashboards.get(selected.id)); } }}>{t('Добавить гаджет')}</button></div>
      <div className="jira-grid">{(selected.gadgets || []).map((gadget) => <article className="jira-card" key={gadget.id}>
        <div className="jira-card-header"><h2>{gadget.title || gadget.type}</h2><button type="button" className="jira-button jira-button-danger" onClick={async () => { await dashboards.deleteGadget(selected.id, gadget.id); setSelected(await dashboards.get(selected.id)); }}>×</button></div>
        {gadget.error ? <p className="jira-error">{gadget.error}</p> : gadget.data?.length ? <ul className="jira-link-list">{gadget.data.slice(0, 10).map((point, index) => <li key={index}>{point.label || point.date || index}: {point.value ?? point.count ?? JSON.stringify(point)}</li>)}</ul> : <p>{t('Нет данных для гаджета.')}</p>}
      </article>)}</div>
    </>}
  </div>;
}
