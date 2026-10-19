import React, { useRef, useState } from 'react';
import { useParams } from '../i18n/navigation.jsx';
import { bulk, importExport, quests } from '../api.js';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import './JiraPages.css';

export default function OperationsPage() {
  const { boardId } = useParams();
  const { t } = useLocalization();
  const fileRef = useRef(null);
  const [ids, setIds] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const questIds = ids.split(/[\s,]+/).map((value) => value.trim()).filter(Boolean);
  const run = async (action) => {
    setError(''); setStatus('');
    try {
      if (action === 'delete') await bulk.delete(questIds);
      else await bulk.update({ questIds, fields: { status } });
      setStatus(t('Операция выполнена.'));
    } catch (e) { setError(e.message); }
  };
  const exportData = async (format) => {
    try {
      const result = await importExport.exportBoard(boardId, format);
      const blob = new Blob([typeof result === 'string' ? result : JSON.stringify(result, null, 2)], { type: format === 'csv' ? 'text/csv' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `board-${boardId}.${format}`; link.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); }
  };
  return <div className="page jira-page">
    <div className="jira-header"><h1>{t('Импорт, экспорт и массовые операции')}</h1></div>
    {error && <p className="jira-error">{error}</p>}{status && <p className="jira-card">{status}</p>}
    <div className="jira-grid">
      <section className="jira-card jira-form"><h2>{t('Массовое изменение')}</h2>
        <label>{t('ID задач')}<textarea value={ids} onChange={(e) => setIds(e.target.value)} placeholder="id-1, id-2" /></label>
        <label>{t('Новый статус')}<input value={status} onChange={(e) => setStatus(e.target.value)} /></label>
        <div className="jira-actions"><button className="jira-button jira-button-primary" disabled={!questIds.length} type="button" onClick={() => run('update')}>{t('Применить')}</button>
          <button className="jira-button jira-button-danger" disabled={!questIds.length} type="button" onClick={() => run('delete')}>{t('Удалить')}</button></div>
      </section>
      <section className="jira-card jira-form"><h2>{t('Импорт и экспорт')}</h2>
        <input ref={fileRef} type="file" accept=".json,.csv" onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; try { await importExport.importBoard(boardId, file); setStatus(t('Импорт завершён.')); } catch (err) { setError(err.message); } }} />
        <div className="jira-actions"><button className="jira-button" type="button" onClick={() => exportData('json')}>{t('Экспорт JSON')}</button><button className="jira-button" type="button" onClick={() => exportData('csv')}>{t('Экспорт CSV')}</button></div>
      </section>
      <section className="jira-card jira-form"><h2>{t('Клонирование')}</h2>
        <p>{t('Клонирование доступно из карточки задачи и сохраняет выбранный проектный контекст.')}</p>
        <button className="jira-button" type="button" disabled={!questIds[0]} onClick={async () => { try { await quests.get(questIds[0]); setStatus(t('Задача найдена. Откройте её карточку для клонирования.')); } catch (e) { setError(e.message); } }}>{t('Проверить первую задачу')}</button>
      </section>
    </div>
  </div>;
}
