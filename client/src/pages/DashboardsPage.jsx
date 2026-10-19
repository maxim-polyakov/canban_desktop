import React, { useCallback, useEffect, useState } from 'react';
import { dashboards, parseGadgets } from '../api/jira.js';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import './JiraPages.css';

const GADGET_TYPES = ['burndown', 'velocity', 'cumulativeFlow', 'release', 'timeTracking'];

export default function DashboardsPage() {
  const { t } = useLocalization();
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [name, setName] = useState('');
  const [gadgetType, setGadgetType] = useState(GADGET_TYPES[0]);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try {
      const list = await dashboards.getAll();
      setItems(Array.isArray(list) ? list : []);
      setSelectedId((current) => current || list?.[0]?.id || null);
    } catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const selected = items.find((item) => item.id === selectedId) || null;
  const act = async (action) => {
    setError('');
    try { await action(); await load(); } catch (e) { setError(e.message); }
  };
  return <div className="page jira-page">
    <div className="jira-header"><h1>{t('Дашборды')}</h1>
      <form className="jira-actions" onSubmit={(e) => { e.preventDefault(); act(async () => { const created = await dashboards.create({ name }); setName(''); setSelectedId(created.id); }); }}>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Название дашборда')} />
        <button className="jira-button jira-button-primary" type="submit">{t('Создать')}</button>
      </form>
    </div>
    {error && <p className="jira-error">{error}</p>}
    <div className="jira-toolbar">{items.map((item) => <button key={item.id} className={`jira-button${item.id === selectedId ? ' jira-button-primary' : ''}`} type="button" onClick={() => setSelectedId(item.id)}>{item.name}</button>)}</div>
    {!selected ? <div className="jira-state">{t('Создайте первый дашборд.')}</div> : <>
      <div className="jira-header"><h2>{selected.name}</h2>
        <div className="jira-actions">
          <select value={gadgetType} onChange={(e) => setGadgetType(e.target.value)} aria-label={t('Тип гаджета')}>
            {GADGET_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <button className="jira-button" type="button" onClick={() => act(() => dashboards.addGadget(selected, { type: gadgetType, title: gadgetType }))}>{t('Добавить гаджет')}</button>
        </div>
      </div>
      <div className="jira-grid">{parseGadgets(selected).map((gadget) => <article className="jira-card" key={gadget.id}>
        <div className="jira-card-header"><h2>{gadget.title || gadget.type}</h2>
          <button type="button" className="jira-button jira-button-danger" aria-label={t('Удалить')} onClick={() => act(() => dashboards.deleteGadget(selected, gadget.id))}>×</button>
        </div>
        <p>{t('Данные отчёта доступны в разделе «Отчёты» проекта.')}</p>
      </article>)}</div>
    </>}
  </div>;
}
