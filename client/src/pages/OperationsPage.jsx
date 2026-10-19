import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from '../i18n/navigation.jsx';
import { boards, bulk, importExport, quests } from '../api.js';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import './JiraPages.css';

const ARCHIVE_COLUMN_KIND = 5;

export function resolveQuestIds(input, issues) {
  const tokens = input.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean);
  const byKey = new Map(issues.map((issue) => [String(issue.issueKey || '').toUpperCase(), issue.id]));
  const byId = new Set(issues.map((issue) => issue.id));
  const ids = [];
  const unknown = [];
  tokens.forEach((token) => {
    const id = byId.has(token) ? token : byKey.get(token.toUpperCase());
    if (id) ids.push(id); else unknown.push(token);
  });
  return { ids: [...new Set(ids)], unknown };
}

export default function OperationsPage() {
  const { boardId } = useParams();
  const { t } = useLocalization();
  const [columns, setColumns] = useState([]);
  const [issues, setIssues] = useState([]);
  const [keys, setKeys] = useState('');
  const [targetColumnId, setTargetColumnId] = useState('');
  const [importColumnId, setImportColumnId] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [board, list] = await Promise.all([boards.getById(boardId), quests.filter(boardId, {})]);
      const boardColumns = (board?.columns || []).filter((column) => column.kind !== ARCHIVE_COLUMN_KIND);
      setColumns(boardColumns);
      setImportColumnId((current) => current || boardColumns[0]?.id || '');
      setIssues(Array.isArray(list) ? list : []);
    } catch (e) { setError(e.message); }
  }, [boardId]);
  useEffect(() => { load(); }, [load]);

  const { ids: questIds, unknown } = resolveQuestIds(keys, issues);

  const run = async (action) => {
    setError(''); setStatus('');
    try {
      const result = action === 'delete'
        ? await bulk.delete(boardId, questIds)
        : await bulk.update(boardId, questIds, { columnId: targetColumnId });
      setStatus(t('Обработано задач: ${count}', { count: result?.updatedCount ?? questIds.length }));
      setKeys('');
      await load();
    } catch (e) { setError(e.message); }
  };

  const exportData = async (format) => {
    setError('');
    try {
      const content = await importExport.exportBoard(boardId, format);
      const blob = new Blob([content], { type: format === 'csv' ? 'text/csv' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `board-${boardId}.${format}`; link.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); }
  };

  const selectFile = async (file) => {
    setError(''); setStatus(''); setPreview(null); setImportFile(file || null);
    if (!file) return;
    try {
      const format = file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json';
      setPreview(await importExport.preview(format, await file.text()));
    } catch (e) { setError(e.message); }
  };

  const runImport = async () => {
    setError(''); setStatus('');
    try {
      const result = await importExport.importBoard(boardId, importFile, importColumnId);
      setStatus(t('Импортировано задач: ${count}', { count: result?.createdCount ?? 0 }));
      setImportFile(null); setPreview(null);
      await load();
    } catch (e) { setError(e.message); }
  };

  return <div className="page jira-page">
    <div className="jira-header"><h1>{t('Импорт, экспорт и массовые операции')}</h1></div>
    {error && <p className="jira-error">{error}</p>}{status && <p className="jira-card">{status}</p>}
    <div className="jira-grid">
      <section className="jira-card jira-form"><h2>{t('Массовое изменение')}</h2>
        <label>{t('Ключи задач')}<textarea value={keys} onChange={(e) => setKeys(e.target.value)} placeholder="KAN-1, KAN-2" /></label>
        {unknown.length > 0 && <p className="jira-error">{t('Не найдены')}: {unknown.join(', ')}</p>}
        <label>{t('Переместить в колонку')}
          <select value={targetColumnId} onChange={(e) => setTargetColumnId(e.target.value)}>
            <option value="">—</option>
            {columns.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}
          </select>
        </label>
        <div className="jira-actions">
          <button className="jira-button jira-button-primary" disabled={!questIds.length || !targetColumnId} type="button" onClick={() => run('update')}>{t('Применить')}</button>
          <button className="jira-button jira-button-danger" disabled={!questIds.length} type="button" onClick={() => { if (window.confirm(t('Удалить выбранные задачи?'))) run('delete'); }}>{t('Удалить')}</button>
        </div>
      </section>
      <section className="jira-card jira-form"><h2>{t('Импорт и экспорт')}</h2>
        <label>{t('Колонка для импорта')}
          <select value={importColumnId} onChange={(e) => setImportColumnId(e.target.value)}>
            {columns.map((column) => <option key={column.id} value={column.id}>{column.title}</option>)}
          </select>
        </label>
        <input type="file" accept=".json,.csv" onChange={(e) => selectFile(e.target.files?.[0])} />
        {preview && <p>{t('Строк к импорту')}: {preview.validRows}{preview.errors?.length ? ` · ${t('Ошибки')}: ${preview.errors.join('; ')}` : ''}</p>}
        <div className="jira-actions">
          <button className="jira-button jira-button-primary" type="button" disabled={!importFile || !importColumnId || !preview?.validRows} onClick={runImport}>{t('Импортировать')}</button>
          <button className="jira-button" type="button" onClick={() => exportData('json')}>{t('Экспорт JSON')}</button>
          <button className="jira-button" type="button" onClick={() => exportData('csv')}>{t('Экспорт CSV')}</button>
        </div>
      </section>
    </div>
  </div>;
}
