import React, { useMemo, useState } from 'react';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import NavIcon from './NavIcons.jsx';
import { CustomFieldInput } from './CustomFields.jsx';
import { getPriorityMeta } from './IssueIcons.jsx';
import { SYSTEM_FIELDS } from '../utils/issueLayout.js';
import { TRANSITION_SCREEN_FIELDS } from '../utils/workflow.js';

const label = (key) => SYSTEM_FIELDS.find(([k]) => k === key)?.[1] ?? key;

function initialValue(key, issue, field) {
  if (field) return issue.customFields?.[field.id] ?? (['multiselect', 'checkbox', 'labels', 'users', 'versions', 'groups', 'cascading'].includes(field.fieldType) ? [] : '');
  switch (key) {
    case 'summary': return issue.title ?? '';
    case 'description': return issue.description ?? '';
    case 'assignee': return issue.assignees?.[0]?.userId ?? issue.assigneeId ?? '';
    case 'priority': return String(issue.priority ?? 2);
    case 'duedate': return issue.dueDate ? String(issue.dueDate).slice(0, 10) : '';
    case 'labels': return issue.labels ?? '';
    case 'storypoints': return issue.storyPoints ?? '';
    case 'originalestimate': return issue.originalEstimateMinutes != null ? String(issue.originalEstimateMinutes / 60) : '';
    default: return '';
  }
}

function payloadValue(key, value) {
  switch (key) {
    case 'priority': return Number(value);
    case 'storypoints': return value === '' ? null : Number(value);
    case 'originalestimate': return value === '' ? null : Math.round(Number(value) * 60);
    case 'duedate':
    case 'assignee': return value || null;
    default: return value;
  }
}

/**
 * Asks for the values of a transition's screen (and lets the user pick between several transitions
 * to the same status) before the issue moves.
 */
export default function TransitionScreenDialog({ issue, transitions, config, people = [], targetName, onCancel, onSubmit }) {
  const { t } = useLocalization();
  const [key, setKey] = useState(transitions[0]?.key);
  const [values, setValues] = useState({});
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const transition = transitions.find((x) => x.key === key) ?? transitions[0];
  const customById = useMemo(() => new Map((config?.fields || []).map((f) => [`cf:${f.id}`, f])), [config]);
  const tabs = (transition?.screen || [])
    .map((tab) => ({ ...tab, fields: tab.fields.filter((f) => TRANSITION_SCREEN_FIELDS.includes(f) || customById.has(f)) }))
    .filter((tab) => tab.fields.length > 0);
  const value = (fieldKey) => (fieldKey in values ? values[fieldKey] : initialValue(fieldKey, issue, customById.get(fieldKey)));
  const set = (fieldKey, next) => setValues((current) => ({ ...current, [fieldKey]: next }));

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const fields = {};
    tabs.forEach((tab) => tab.fields.forEach((fieldKey) => {
      if (fieldKey in values) fields[fieldKey] = customById.has(fieldKey) ? values[fieldKey] : payloadValue(fieldKey, values[fieldKey]);
    }));
    try {
      await onSubmit({ transition: transition.key, fields, comment: comment.trim() || undefined });
    } catch (err) {
      setError(t(err.message || 'Не удалось выполнить переход.'));
      setBusy(false);
    }
  };

  const systemInput = (fieldKey) => {
    const common = { id: `tr-${fieldKey}`, value: value(fieldKey), disabled: busy, onChange: (e) => set(fieldKey, e.target.value) };
    switch (fieldKey) {
      case 'description': return <textarea rows={4} {...common} />;
      case 'assignee':
        return (
          <select {...common}>
            <option value="">{t('Не назначен')}</option>
            {people.map((p) => <option key={p.userId} value={p.userId}>{p.displayName}</option>)}
          </select>
        );
      case 'priority':
        return <select {...common}>{[4, 3, 2, 1, 0].map((p) => <option key={p} value={String(p)}>{t(getPriorityMeta(p).label)}</option>)}</select>;
      case 'duedate': return <input type="date" {...common} />;
      case 'storypoints': return <input type="number" min="0" max="100" {...common} />;
      case 'originalestimate': return <input type="number" min="0" step="0.25" {...common} />;
      default: return <input {...common} />;
    }
  };

  return (
    <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <form className="app-modal" role="dialog" aria-modal="true" aria-label={transition?.name || t('Переход')} onSubmit={submit}>
        <div className="app-modal-header">
          <h2>{transition?.name || t('Переход')}</h2>
          <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={onCancel} disabled={busy}><NavIcon name="close" /></button>
        </div>
        <div className="app-modal-body">
          <p className="app-modal-hint">{issue.issueKey} → {targetName}</p>
          {transitions.length > 1 && (
            <fieldset className="settings-choice-list">
              <legend>{t('Переход')}</legend>
              {transitions.map((x) => (
                <label key={x.key} className="app-check">
                  <input type="radio" name="transition" checked={x.key === transition.key} onChange={() => { setKey(x.key); setValues({}); }} />
                  {x.name}
                </label>
              ))}
            </fieldset>
          )}
          {tabs.map((tab) => (
            <div key={tab.name}>
              {tabs.length > 1 && <h3 className="create-issue-tab">{tab.name}</h3>}
              {tab.fields.map((fieldKey) => {
                const field = customById.get(fieldKey);
                return (
                  <label key={fieldKey} className="app-field" htmlFor={`tr-${fieldKey}`}>
                    <span>{field ? field.name : t(label(fieldKey))}{fieldKey === 'originalestimate' ? ` (${t('ч')})` : ''}</span>
                    {field
                      ? <CustomFieldInput id={`tr-${fieldKey}`} field={field} value={value(fieldKey)} onChange={(next) => set(fieldKey, next)} people={people} refs={config} disabled={busy} />
                      : systemInput(fieldKey)}
                  </label>
                );
              })}
            </div>
          ))}
          <label className="app-field">
            <span>{t('Комментарий')}</span>
            <textarea rows={3} value={comment} maxLength={10000} onChange={(e) => setComment(e.target.value)} disabled={busy} />
          </label>
          {error && <p className="app-modal-error" role="alert">{error}</p>}
        </div>
        <div className="app-modal-footer">
          <button type="button" className="app-btn app-btn-subtle" onClick={onCancel} disabled={busy}>{t('Отмена')}</button>
          <button type="submit" className="app-btn app-btn-primary" disabled={busy}>{busy ? '…' : (transition?.name || t('Выполнить'))}</button>
        </div>
      </form>
    </div>
  );
}
