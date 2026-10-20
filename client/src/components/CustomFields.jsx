import React, { useEffect, useState } from 'react';
import { issueConfig } from '../api.js';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { MULTI_FIELD_TYPES, fieldApplies, formatFieldValue, isEmptyValue } from '../utils/issueConfig.js';
import { arrangeFields, fieldKey, fieldRule, onScreen, typeToken } from '../utils/issueLayout.js';
import './CustomFields.css';

function toDraft(field, value) {
  if (MULTI_FIELD_TYPES.includes(field.fieldType) || field.fieldType === 'cascading') return Array.isArray(value) ? value : [];
  if (field.fieldType === 'checkbox') return value === true;
  if (field.fieldType === 'labels') return Array.isArray(value) ? value.join(', ') : (value ?? '');
  return value === undefined || value === null ? '' : String(value);
}

function CheckboxGroup({ label, items, value, disabled, onChange }) {
  return (
    <div className="custom-field-options" role="group" aria-label={label}>
      {items.map((item) => (
        <label key={item.value} className="custom-field-option">
          <input
            type="checkbox"
            disabled={disabled}
            checked={value.includes(item.value)}
            onChange={(e) => onChange(e.target.checked ? [...value, item.value] : value.filter((x) => x !== item.value))}
          />
          {item.label}
        </label>
      ))}
    </div>
  );
}

export function CustomFieldInput({ field, value, onChange, onCommit, people = [], refs = {}, disabled, id }) {
  const { t } = useLocalization();
  const commit = (next) => { onChange(next); onCommit?.(next); };
  const common = { id, disabled, 'aria-label': field.name };
  const versions = (refs.versions || []).map((v) => ({ value: v.id, label: v.name }));
  const groups = (refs.groups || []).map((g) => ({ value: g.id, label: g.name }));
  switch (field.fieldType) {
    case 'cascading': {
      const [parent = '', child = ''] = Array.isArray(value) ? value : [];
      const children = (field.children || {})[parent] || [];
      return (
        <span className="custom-field-cascade">
          <select {...common} value={parent} onChange={(e) => commit(e.target.value ? [e.target.value] : [])}>
            <option value="">{t('Нет')}</option>
            {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          {children.length > 0 && (
            <select
              disabled={disabled}
              aria-label={`${field.name}: ${t('уточнение')}`}
              value={child}
              onChange={(e) => commit(e.target.value ? [parent, e.target.value] : [parent])}
            >
              <option value="">{t('Нет')}</option>
              {children.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          )}
        </span>
      );
    }
    case 'version':
    case 'group':
      return (
        <select {...common} value={value} onChange={(e) => commit(e.target.value)}>
          <option value="">{t('Нет')}</option>
          {(field.fieldType === 'version' ? versions : groups).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      );
    case 'versions':
    case 'groups': {
      const items = field.fieldType === 'versions' ? versions : groups;
      if (items.length === 0) return <span className="custom-field-empty">{t(field.fieldType === 'versions' ? 'В пространстве нет версий' : 'В команде нет групп')}</span>;
      return <CheckboxGroup label={field.name} items={items} value={value} disabled={disabled} onChange={commit} />;
    }
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
      return <CheckboxGroup label={field.name} items={field.options.map((o) => ({ value: o, label: o }))} value={value} disabled={disabled} onChange={commit} />;
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

function FieldRow({ quest, field, people, refs, readOnly, onSaved }) {
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
        <CustomFieldInput id={inputId} field={field} value={draft} onChange={setDraft} onCommit={save} people={people} refs={refs} disabled={saving || readOnly} />
        {error && <p className="issue-drawer-error" role="alert">{error}</p>}
      </div>
    </div>
  );
}

/** A field as the space's field configuration presents it for an issue type. */
export function configuredField(layout, token, field) {
  const rule = fieldRule(layout, token, fieldKey(field.id));
  return { ...field, required: !!(field.required || rule.required), description: rule.description || field.description };
}

export default function CustomFieldsPanel({ quest, fields = [], people = [], refs = {}, layout = null, onSaved }) {
  const { t } = useLocalization();
  const token = typeToken(quest.issueType, quest.issueTypeId);
  const applicable = fields.filter((field) => fieldApplies(field, quest.issueType, quest.issueTypeId));
  const groups = arrangeFields(layout, token, 'view', applicable).filter((group) => group.fields.length > 0);
  if (groups.length === 0) return null;
  return (
    <section className="issue-drawer-section custom-fields-panel" aria-label={t('Другие поля')}>
      <h4>{t('Другие поля')}</h4>
      {groups.map((group, index) => (
        <React.Fragment key={group.name ?? index}>
          {group.name && <h5 className="custom-field-tab">{group.name}</h5>}
          {group.fields.map((field) => (
            <FieldRow
              key={field.id}
              quest={quest}
              field={configuredField(layout, token, field)}
              people={people}
              refs={refs}
              readOnly={!onScreen(layout, token, 'edit', fieldKey(field.id))}
              onSaved={onSaved}
            />
          ))}
        </React.Fragment>
      ))}
    </section>
  );
}

export function CustomFieldSummary({ quest, fields = [], people = [], refs = {} }) {
  const items = fields
    .filter((field) => fieldApplies(field, quest.issueType, quest.issueTypeId))
    .map((field) => ({ field, text: formatFieldValue(field, quest.customFields?.[field.id], people, refs) }))
    .filter((x) => x.text);
  if (items.length === 0) return null;
  return (
    <dl className="custom-field-summary">
      {items.map(({ field, text }) => <React.Fragment key={field.id}><dt>{field.name}</dt><dd>{text}</dd></React.Fragment>)}
    </dl>
  );
}
