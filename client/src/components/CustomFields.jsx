import React, { useEffect, useState } from 'react';
import { issueConfig } from '../api.js';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { fieldApplies, formatFieldValue, isEmptyValue } from '../utils/issueConfig.js';
import './CustomFields.css';

function toDraft(field, value) {
  if (field.fieldType === 'multiselect') return Array.isArray(value) ? value : [];
  if (field.fieldType === 'checkbox') return value === true;
  if (field.fieldType === 'labels') return Array.isArray(value) ? value.join(', ') : (value ?? '');
  return value === undefined || value === null ? '' : String(value);
}

export function CustomFieldInput({ field, value, onChange, onCommit, people = [], disabled, id }) {
  const { t } = useLocalization();
  const commit = (next) => { onChange(next); onCommit?.(next); };
  const common = { id, disabled, 'aria-label': field.name };
  switch (field.fieldType) {
    case 'paragraph':
      return <textarea {...common} rows={3} value={value} maxLength={10000} onChange={(e) => onChange(e.target.value)} onBlur={() => onCommit?.(value)} />;
    case 'number':
      return <input {...common} type="number" step="any" value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => onCommit?.(value)} />;
    case 'date':
      return <input {...common} type="date" value={value} onChange={(e) => commit(e.target.value)} />;
    case 'url':
      return <input {...common} type="url" value={value} maxLength={2000} placeholder="https://" onChange={(e) => onChange(e.target.value)} onBlur={() => onCommit?.(value)} />;
    case 'select':
      return (
        <select {...common} value={value} onChange={(e) => commit(e.target.value)}>
          <option value="">{t('Нет')}</option>
          {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      );
    case 'multiselect':
      return (
        <div className="custom-field-options" role="group" aria-label={field.name}>
          {field.options.map((option) => (
            <label key={option} className="custom-field-option">
              <input
                type="checkbox"
                disabled={disabled}
                checked={value.includes(option)}
                onChange={(e) => commit(e.target.checked ? [...value, option] : value.filter((x) => x !== option))}
              />
              {option}
            </label>
          ))}
        </div>
      );
    case 'checkbox':
      return (
        <label className="custom-field-option">
          <input {...common} type="checkbox" checked={value} onChange={(e) => commit(e.target.checked)} />
          {t('Да')}
        </label>
      );
    case 'user':
      return (
        <select {...common} value={value} onChange={(e) => commit(e.target.value)}>
          <option value="">{t('Не выбран')}</option>
          {people.map((person) => {
            const personId = person.userId ?? person.id;
            return <option key={personId} value={personId}>{person.displayName}</option>;
          })}
        </select>
      );
    case 'labels':
      return <input {...common} value={value} placeholder={t('метка1, метка2')} onChange={(e) => onChange(e.target.value)} onBlur={() => onCommit?.(value)} />;
    default:
      return <input {...common} value={value} maxLength={255} onChange={(e) => onChange(e.target.value)} onBlur={() => onCommit?.(value)} />;
  }
}

function FieldRow({ quest, field, people, onSaved }) {
  const { t } = useLocalization();
  const stored = quest.customFields?.[field.id];
  const [draft, setDraft] = useState(() => toDraft(field, stored));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setDraft(toDraft(field, stored)); }, [field, stored]);

  const save = async (next) => {
    const current = toDraft(field, stored);
    if (JSON.stringify(next) === JSON.stringify(current)) return;
    setSaving(true);
    setError('');
    try {
      const values = await issueConfig.setValue(quest.id, field.id, isEmptyValue(next) ? null : next);
      onSaved?.(values);
    } catch (e) {
      setError(t(e.message || 'Не удалось сохранить поле.'));
      setDraft(current);
    } finally {
      setSaving(false);
    }
  };

  const inputId = `custom-field-${field.id}`;
  return (
    <div className="custom-field-row">
      <label htmlFor={inputId} title={field.description || undefined}>
        {field.name}{field.required && <span className="app-required"> *</span>}
      </label>
      <div className="custom-field-control">
        <CustomFieldInput id={inputId} field={field} value={draft} onChange={setDraft} onCommit={save} people={people} disabled={saving} />
        {error && <p className="issue-drawer-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}

export default function CustomFieldsPanel({ quest, fields = [], people = [], onSaved }) {
  const { t } = useLocalization();
  const visible = fields.filter((field) => fieldApplies(field, quest.issueType, quest.issueTypeId));
  if (visible.length === 0) return null;
  return (
    <section className="issue-drawer-section custom-fields-panel" aria-label={t('Другие поля')}>
      <h4>{t('Другие поля')}</h4>
      {visible.map((field) => <FieldRow key={field.id} quest={quest} field={field} people={people} onSaved={onSaved} />)}
    </section>
  );
}

export function CustomFieldSummary({ quest, fields = [], people = [] }) {
  const items = fields
    .filter((field) => fieldApplies(field, quest.issueType, quest.issueTypeId))
    .map((field) => ({ field, text: formatFieldValue(field, quest.customFields?.[field.id], people) }))
    .filter((x) => x.text);
  if (items.length === 0) return null;
  return (
    <dl className="custom-field-summary">
      {items.map(({ field, text }) => <React.Fragment key={field.id}><dt>{field.name}</dt><dd>{text}</dd></React.Fragment>)}
    </dl>
  );
}
