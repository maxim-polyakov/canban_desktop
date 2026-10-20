import React, { useRef, useState } from 'react';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { IssueTypeIcon } from './IssueIcons.jsx';
import AssigneeAvatar from './AssigneeAvatar.jsx';
import { BASE_TYPES } from '../utils/issueConfig.js';
import './QuickCreateIssue.css';

const CREATABLE_BASE_TYPES = BASE_TYPES.filter((type) => type.value !== 4);

function Popover({ open, onClose, children, label }) {
  if (!open) return null;
  return (
    <>
      <div className="qc-backdrop" onMouseDown={onClose} />
      <div className="qc-popover" role="listbox" aria-label={label}>{children}</div>
    </>
  );
}

/** Jira-style inline composer: only the summary is required; type, due date and assignee are optional. */
export default function QuickCreateIssue({ members = [], issueTypes = [], onCreate, onCancel }) {
  const { t } = useLocalization();
  const [title, setTitle] = useState('');
  const [type, setType] = useState({ issueType: 2, typeId: null });
  const [dueDate, setDueDate] = useState('');
  const [assigneeId, setAssigneeId] = useState(null);
  const [menu, setMenu] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const formRef = useRef(null);
  const inputRef = useRef(null);

  const types = [
    ...CREATABLE_BASE_TYPES.map((x) => ({ key: String(x.value), issueType: x.value, typeId: null, name: t(x.label) })),
    ...issueTypes.filter((x) => x.baseType !== 4).map((x) => ({ key: x.id, issueType: x.baseType, typeId: x.id, name: x.name })),
  ];
  const currentType = types.find((x) => (type.typeId ? x.typeId === type.typeId : !x.typeId && x.issueType === type.issueType)) || types[0];
  const assignee = members.find((m) => m.userId === assigneeId);

  const submit = async (e) => {
    e?.preventDefault();
    const summary = title.trim();
    if (!summary || busy) return;
    setBusy(true);
    setError('');
    try {
      await onCreate({
        title: summary,
        issueType: type.issueType,
        issueTypeId: type.typeId,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        assigneeIds: assigneeId ? [assigneeId] : [],
      });
      setTitle('');
      inputRef.current?.focus();
    } catch (err) {
      setError(t(err.message || 'Не удалось создать задачу.'));
    } finally {
      setBusy(false);
    }
  };

  const onBlur = (e) => {
    if (menu || formRef.current?.contains(e.relatedTarget)) return;
    if (!title.trim()) onCancel?.();
  };

  return (
    <form ref={formRef} className="qc-form" onSubmit={submit} onBlur={onBlur}>
      <textarea
        ref={inputRef}
        className="qc-title"
        rows={2}
        maxLength={255}
        autoFocus
        value={title}
        placeholder={t('Что нужно сделать?')}
        aria-label={t('Что нужно сделать?')}
        disabled={busy}
        onChange={(e) => setTitle(e.target.value.replace(/\r?\n/g, ' '))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) submit(e);
          if (e.key === 'Escape') onCancel?.();
        }}
      />
      {error && <p className="qc-error" role="alert">{error}</p>}
      <div className="qc-bar">
        <div className="qc-anchor">
          <button type="button" className="qc-chip" aria-label={t('Тип задачи')} title={currentType?.name} onClick={() => setMenu(menu === 'type' ? null : 'type')}>
            <IssueTypeIcon issueType={currentType?.issueType} typeId={currentType?.typeId} size={16} />
            <span className="qc-caret" aria-hidden="true">▾</span>
          </button>
          <Popover open={menu === 'type'} onClose={() => setMenu(null)} label={t('Тип задачи')}>
            {types.map((x) => (
              <button key={x.key} type="button" role="option" aria-selected={x === currentType} className="qc-option"
                onClick={() => { setType({ issueType: x.issueType, typeId: x.typeId }); setMenu(null); inputRef.current?.focus(); }}>
                <IssueTypeIcon issueType={x.issueType} typeId={x.typeId} size={16} /> {x.name}
              </button>
            ))}
          </Popover>
        </div>
        <label className={`qc-chip qc-date ${dueDate ? 'is-set' : ''}`} title={dueDate ? `${t('Срок исполнения')}: ${dueDate}` : t('Срок исполнения')}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M7 2h2v2h6V2h2v2h3v18H4V4h3V2zm-1 8v10h12V10H6zm0-4v2h12V6H6z" /></svg>
          {dueDate && <span className="qc-date-text">{dueDate.slice(5).split('-').reverse().join('.')}</span>}
          <input type="date" value={dueDate} aria-label={t('Срок исполнения')} onChange={(e) => setDueDate(e.target.value)} />
        </label>
        <div className="qc-anchor">
          <button type="button" className="qc-chip" aria-label={t('Исполнитель')} title={assignee ? assignee.displayName : t('Не назначено')} onClick={() => setMenu(menu === 'assignee' ? null : 'assignee')}>
            {assignee
              ? <AssigneeAvatar userId={assignee.userId} displayName={assignee.displayName} avatarUrl={assignee.avatarUrl} size={18} />
              : <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path fill="currentColor" d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-4 0-8 2-8 5v1h16v-1c0-3-4-5-8-5z" /></svg>}
          </button>
          <Popover open={menu === 'assignee'} onClose={() => setMenu(null)} label={t('Исполнитель')}>
            <button type="button" role="option" aria-selected={!assigneeId} className="qc-option" onClick={() => { setAssigneeId(null); setMenu(null); inputRef.current?.focus(); }}>
              {t('Не назначено')}
            </button>
            {members.map((m) => (
              <button key={m.userId} type="button" role="option" aria-selected={m.userId === assigneeId} className="qc-option"
                onClick={() => { setAssigneeId(m.userId); setMenu(null); inputRef.current?.focus(); }}>
                <AssigneeAvatar userId={m.userId} displayName={m.displayName} avatarUrl={m.avatarUrl} size={18} /> {m.displayName}
              </button>
            ))}
          </Popover>
        </div>
        <button type="submit" className="qc-submit" aria-label={t('Создать')} title={t('Создать')} disabled={!title.trim() || busy}>↵</button>
      </div>
    </form>
  );
}
