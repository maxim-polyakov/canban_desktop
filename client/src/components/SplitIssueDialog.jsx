import React, { useEffect, useState } from 'react';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { IssueTypeIcon } from './IssueIcons.jsx';
import NavIcon from './NavIcons.jsx';
import './SplitIssueDialog.css';

const parsePoints = (value) => {
  if (String(value ?? '').trim() === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : NaN;
};

/** Builds the update for the original issue and the create payloads for the split-off issues. */
export const buildSplit = (quest, original, parts, targetSprintId) => ({
  update: {
    ...(original.title.trim() !== quest.title ? { title: original.title.trim() } : {}),
    ...(parsePoints(original.points) !== (quest.storyPoints ?? null) ? { storyPoints: parsePoints(original.points), storyPointsSet: true } : {}),
  },
  creates: parts.map((part) => ({
    title: part.title.trim(),
    columnId: quest.columnId,
    category: quest.category ?? 0,
    xpReward: quest.xpReward ?? 10,
    isEpic: false,
    issueType: quest.issueType,
    issueTypeId: quest.issueTypeId ?? null,
    priority: quest.priority,
    labels: quest.labels || null,
    sprintId: targetSprintId || null,
    parentQuestId: quest.parentQuestId ?? null,
    assigneeIds: quest.assigneeIds ?? [],
    storyPoints: parsePoints(part.points),
  })),
});

/** Jira's «Разделить задачу»: edit the original and add one or more new issues with their own estimates. */
export default function SplitIssueDialog({ quest, sprints = [], onSplit, onClose }) {
  const { t } = useLocalization();
  const [original, setOriginal] = useState({ title: quest.title ?? '', points: quest.storyPoints ?? '' });
  const [parts, setParts] = useState([{ title: '', points: '' }]);
  const [target, setTarget] = useState(quest.sprintId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const setPart = (index, patch) => setParts((list) => list.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  const submit = async (e) => {
    e.preventDefault();
    if (!original.title.trim() || parts.some((p) => !p.title.trim())) { setError(t('Укажите название для каждой задачи.')); return; }
    if ([original, ...parts].some((p) => Number.isNaN(parsePoints(p.points)))) { setError(t('Оценка должна быть целым неотрицательным числом.')); return; }
    setSaving(true);
    setError('');
    try {
      await onSplit(buildSplit(quest, original, parts, target));
    } catch (err) {
      setError(t(err?.message || 'Не удалось разделить задачу.'));
      setSaving(false);
    }
  };

  const row = (value, onChange, label, autoFocus = false) => (
    <div className="sid-row">
      <IssueTypeIcon issueType={quest.issueType} typeId={quest.issueTypeId} size={16} />
      <input className="sid-title" value={value.title} autoFocus={autoFocus} maxLength={500} aria-label={label} placeholder={t('Что нужно сделать?')} onChange={(e) => onChange({ title: e.target.value })} />
      <input className="sid-points" type="number" min="0" value={value.points} aria-label={`${label}: ${t('Примерная оценка сложности')}`} placeholder="-" onChange={(e) => onChange({ points: e.target.value })} />
    </div>
  );

  return (
    <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <form className="app-modal sid-modal" role="dialog" aria-modal="true" aria-label={t('Разделить задачу ${key}', { key: quest.issueKey })} onSubmit={submit}>
        <div className="app-modal-header">
          <h2>{t('Разделить задачу ${key}', { key: quest.issueKey })}</h2>
          <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={onClose} disabled={saving}><NavIcon name="close" /></button>
        </div>
        <div className="app-modal-body sid-body">
          <p className="sid-hint">{t('Разделите работу на несколько задач. Исходная задача сохранит свою историю, а новые получат тип, приоритет, исполнителя, метки и родителя исходной.')}</p>
          <div className="sid-head"><span>{t('Название')}</span><span>{t('Оценка')}</span></div>
          <div className="sid-group">
            <span className="sid-key">{quest.issueKey}</span>
            {row(original, (patch) => setOriginal((v) => ({ ...v, ...patch })), t('Исходная задача'))}
          </div>
          {parts.map((part, index) => (
            <div key={index} className="sid-group">
              <span className="sid-key">{t('Новая задача ${n}', { n: index + 1 })}</span>
              <div className="sid-part">
                {row(part, (patch) => setPart(index, patch), t('Новая задача ${n}', { n: index + 1 }), index === parts.length - 1)}
                {parts.length > 1 && (
                  <button type="button" className="app-icon-btn" aria-label={t('Убрать новую задачу ${n}', { n: index + 1 })} onClick={() => setParts((list) => list.filter((_, i) => i !== index))}><NavIcon name="close" /></button>
                )}
              </div>
            </div>
          ))}
          <button type="button" className="sid-add" onClick={() => setParts((list) => [...list, { title: '', points: '' }])}>+ {t('Добавить задачу')}</button>
          <label className="sid-target">
            <span>{t('Переместить новые задачи в')}</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value="">{t('Бэклог')}</option>
            </select>
          </label>
          {error && <p className="app-modal-error" role="alert">{error}</p>}
        </div>
        <div className="app-modal-footer">
          <button type="button" className="app-btn app-btn-subtle" onClick={onClose} disabled={saving}>{t('Отмена')}</button>
          <button type="submit" className="app-btn app-btn-primary" disabled={saving}>{saving ? '…' : t('Разделить')}</button>
        </div>
      </form>
    </div>
  );
}
