import React, { useMemo, useState } from 'react';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import NavIcon from './NavIcons.jsx';
import { boards } from '../api.js';
import {
  STATUS_CATEGORIES, draftFromLayout, draftProblem, draftToRequest, moveStatus, shiftStatus, statusTone,
} from '../utils/boardColumnLayout.js';
import './ColumnConfigDialog.css';

let seq = 0;
const nextId = (prefix) => `${prefix}-${Date.now().toString(36)}-${++seq}`;

function Menu({ label, items }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ccd-menu">
      <button type="button" className="ccd-menu-btn" aria-label={label} aria-expanded={open} onClick={() => setOpen((v) => !v)}>⋯</button>
      {open && (
        <>
          <div className="ccd-menu-backdrop" onClick={() => setOpen(false)} />
          <div className="ccd-menu-list" role="menu">
            {items.filter(Boolean).map((item) => (
              <button key={item.label} type="button" role="menuitem" disabled={item.disabled} className={item.danger ? 'is-danger' : ''} onClick={() => { setOpen(false); item.run(); }}>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AddStatusForm({ statuses, onCancel, onAdd }) {
  const { t } = useLocalization();
  const [name, setName] = useState('');
  const [kind, setKind] = useState(0);
  const existing = statuses.find((s) => s.title.trim().toLowerCase() === name.trim().toLowerCase());
  const submit = (e) => {
    e.preventDefault();
    if (name.trim()) onAdd(name.trim(), kind);
  };
  return (
    <form className="ccd-add-status" onSubmit={submit}>
      <label className="ccd-field">
        <span>{t('Имя статуса')}</span>
        <input list="ccd-status-names" value={name} maxLength={100} autoFocus onChange={(e) => setName(e.target.value)} aria-label={t('Имя статуса')} />
        <datalist id="ccd-status-names">
          {statuses.map((s) => <option key={s.id} value={s.title} />)}
        </datalist>
      </label>
      <label className="ccd-field">
        <span>{t('Категория статуса')}</span>
        <select value={existing ? existing.kind : kind} disabled={!!existing} onChange={(e) => setKind(Number(e.target.value))} aria-label={t('Категория статуса')}>
          {STATUS_CATEGORIES.map((c) => <option key={c.kind} value={c.kind}>{t(c.label)}</option>)}
          {existing && !STATUS_CATEGORIES.some((c) => c.kind === existing.kind) && <option value={existing.kind}>{t('В работе')}</option>}
        </select>
      </label>
      <div className="ccd-add-actions">
        <button type="button" className="app-btn app-btn-subtle" onClick={onCancel}>{t('Отмена')}</button>
        <button type="submit" className="app-btn app-btn-primary" disabled={!name.trim()}>{t('Добавить')}</button>
      </div>
    </form>
  );
}

export default function ColumnConfigDialog({ boardId, layout, onClose, onPublished }) {
  const { t } = useLocalization();
  const [draft, setDraft] = useState(() => draftFromLayout(layout));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [addingTo, setAddingTo] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [newColumn, setNewColumn] = useState(null);
  const [dragging, setDragging] = useState(null);

  const statuses = useMemo(
    () => [...(layout?.statuses || []), ...draft.newStatuses],
    [layout, draft.newStatuses],
  );
  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const problem = draftProblem(draft);

  const update = (fn) => { setDraft((d) => fn(d)); setDirty(true); setError(''); };
  const lanes = [null, ...draft.columns.map((c) => c.id)];

  const addStatus = (columnId, name, kind) => {
    const existing = statuses.find((s) => s.title.trim().toLowerCase() === name.toLowerCase());
    if (existing) update((d) => moveStatus(d, existing.id, columnId));
    else {
      const status = { id: nextId('status'), title: name, kind, isNew: true };
      update((d) => moveStatus({ ...d, hidden: [...d.hidden, status.id], newStatuses: [...d.newStatuses, status] }, status.id, columnId));
    }
    setAddingTo(null);
  };

  const removeNewStatus = (id) => update((d) => ({
    ...d,
    newStatuses: d.newStatuses.filter((s) => s.id !== id),
    hidden: d.hidden.filter((x) => x !== id),
    columns: d.columns.map((c) => ({ ...c, statusIds: c.statusIds.filter((x) => x !== id) })),
  }));

  const addColumn = (e) => {
    e.preventDefault();
    const name = newColumn?.trim();
    if (!name) return;
    const id = nextId('new');
    update((d) => ({ ...d, columns: [...d.columns, { id, name, statusIds: [] }] }));
    setNewColumn(null);
    setAddingTo(id);
  };

  const moveColumn = (id, step) => update((d) => {
    const columns = [...d.columns];
    const from = columns.findIndex((c) => c.id === id);
    const to = from + step;
    if (from < 0 || to < 0 || to >= columns.length) return d;
    [columns[from], columns[to]] = [columns[to], columns[from]];
    return { ...d, columns };
  });

  const deleteColumn = (id) => update((d) => {
    const column = d.columns.find((c) => c.id === id);
    return { ...d, columns: d.columns.filter((c) => c.id !== id), hidden: [...d.hidden, ...(column?.statusIds || [])] };
  });

  const rename = (id, name) => update((d) => ({ ...d, columns: d.columns.map((c) => (c.id === id ? { ...c, name } : c)) }));

  const publish = async () => {
    if (problem) { setError(t(problem)); return; }
    setBusy(true);
    setError('');
    try {
      const saved = await boards.publishColumnLayout(boardId, draftToRequest(draft));
      onPublished(saved);
    } catch (e) {
      setError(t(e.message || 'Не удалось опубликовать изменения'));
      setBusy(false);
    }
  };

  const drop = (columnId, index) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragging) update((d) => moveStatus(d, dragging, columnId, index));
    setDragging(null);
  };

  const statusCard = (id, laneId, index) => {
    const status = statusById.get(id);
    if (!status) return null;
    const lane = lanes.indexOf(laneId);
    return (
      <div
        key={id}
        className={`ccd-status ${dragging === id ? 'is-dragging' : ''}`}
        draggable={!busy}
        onDragStart={(e) => { setDragging(id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', id); }}
        onDragEnd={() => setDragging(null)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={drop(laneId, index)}
      >
        <span className={`ccd-lozenge is-${statusTone(status.kind)}`}>{status.title}</span>
        <Menu
          label={t('Действия со статусом')}
          items={[
            { label: t('Переместить статус влево'), disabled: lane <= 0, run: () => update((d) => shiftStatus(d, id, -1)) },
            { label: t('Переместить статус вправо'), disabled: lane >= lanes.length - 1, run: () => update((d) => shiftStatus(d, id, 1)) },
            laneId !== null && { label: t('Скрыть статус'), run: () => update((d) => moveStatus(d, id, null)) },
            status.isNew && { label: t('Удалить статус'), danger: true, run: () => removeNewStatus(id) },
          ]}
        />
      </div>
    );
  };

  return (
    <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="app-modal ccd-modal" role="dialog" aria-modal="true" aria-label={t('Настроить столбцы')}>
        <div className="app-modal-header">
          <h2>{t('Настроить столбцы')}</h2>
          <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={onClose} disabled={busy}><NavIcon name="close" /></button>
        </div>
        <div className="app-modal-body">
          <div className="ccd-banner">
            <strong>{t('Расширение')}</strong>
            <p>{t('В одном столбце может быть несколько статусов. Статусы, которых нет ни в одном столбце, скрыты с доски. Изменения увидят все участники пространства после публикации.')}</p>
          </div>
          <div className="ccd-lanes">
            <section className="ccd-lane ccd-hidden" aria-label={t('Скрытые статусы')} onDragOver={(e) => e.preventDefault()} onDrop={drop(null)}>
              <header className="ccd-lane-head"><span>{t('Скрытые статусы')}</span></header>
              <p className="ccd-lane-hint">{t('Задачи с этими статусами не будут отображаться.')}</p>
              {draft.hidden.map((id, index) => statusCard(id, null, index))}
            </section>
            {draft.columns.map((column, columnIndex) => {
              const empty = column.statusIds.length === 0;
              return (
                <section
                  key={column.id}
                  className={`ccd-lane ${empty ? 'is-invalid' : ''}`}
                  aria-label={column.name}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={drop(column.id)}
                >
                  <header className="ccd-lane-head">
                    {renaming === column.id ? (
                      <input
                        className="ccd-rename"
                        autoFocus
                        maxLength={100}
                        defaultValue={column.name}
                        aria-label={t('Название столбца')}
                        onBlur={(e) => { if (e.target.value.trim()) rename(column.id, e.target.value.trim()); setRenaming(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(null); }}
                      />
                    ) : (
                      <button type="button" className="ccd-lane-title" onClick={() => setRenaming(column.id)} title={t('Переименовать')}>
                        {empty && <span className="ccd-warn" aria-hidden="true">◆</span>}
                        {column.name}
                      </button>
                    )}
                    <Menu
                      label={t('Действия со столбцом')}
                      items={[
                        { label: t('Переименовать'), run: () => setRenaming(column.id) },
                        { label: t('Переместить столбец влево'), disabled: columnIndex === 0, run: () => moveColumn(column.id, -1) },
                        { label: t('Переместить столбец вправо'), disabled: columnIndex === draft.columns.length - 1, run: () => moveColumn(column.id, 1) },
                        { label: t('Удалить столбец'), danger: true, run: () => deleteColumn(column.id) },
                      ]}
                    />
                  </header>
                  {empty && <p className="ccd-lane-error">{t('Столбцы должны иметь хотя бы по одному статусу.')}</p>}
                  {column.statusIds.map((id, index) => statusCard(id, column.id, index))}
                  {addingTo === column.id ? (
                    <AddStatusForm statuses={statuses} onCancel={() => setAddingTo(null)} onAdd={(name, kind) => addStatus(column.id, name, kind)} />
                  ) : (
                    <button type="button" className="ccd-add-status-btn" onClick={() => setAddingTo(column.id)}>+ {t('Добавить статус')}</button>
                  )}
                </section>
              );
            })}
            <div className="ccd-new-column">
              {newColumn === null ? (
                <button type="button" className="ccd-plus" aria-label={t('Добавить столбец')} title={t('Добавить столбец')} onClick={() => setNewColumn('')}>+</button>
              ) : (
                <form className="ccd-lane" onSubmit={addColumn}>
                  <header className="ccd-lane-head">
                    <input className="ccd-rename" autoFocus maxLength={100} value={newColumn} placeholder={t('Название столбца')} aria-label={t('Название столбца')}
                      onChange={(e) => setNewColumn(e.target.value)}
                      onBlur={() => { if (!newColumn.trim()) setNewColumn(null); }}
                      onKeyDown={(e) => { if (e.key === 'Escape') setNewColumn(null); }} />
                  </header>
                </form>
              )}
            </div>
          </div>
          {error && <p className="app-modal-error" role="alert">{error}</p>}
        </div>
        <div className="app-modal-footer">
          <button type="button" className="app-btn app-btn-subtle" onClick={onClose} disabled={busy}>{t('Отмена')}</button>
          <button type="button" className="app-btn app-btn-primary" onClick={publish} disabled={busy || !dirty || !!problem}>{busy ? '…' : t('Опубликовать')}</button>
        </div>
      </div>
    </div>
  );
}
