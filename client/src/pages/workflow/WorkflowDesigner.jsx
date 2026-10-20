import React, { useMemo, useRef, useState } from 'react';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import NavIcon from '../../components/NavIcons.jsx';
import { getPriorityMeta } from '../../components/IssueIcons.jsx';
import { STATUS_KINDS, newKey } from '../../utils/workflow.js';
import './WorkflowEditor.css';

export const NODE_W = 160;
export const NODE_H = 44;
const SNAP = 10;
const KINDS = STATUS_KINDS.filter((k) => k.value !== 5);
const ROLES = [['', 'Любой участник с правом работы'], ['Manage', 'Руководитель проекта и выше'], ['Admin', 'Только администратор']];
const ASSIGNEE_ACTIONS = [['', 'Не менять исполнителя'], ['currentUser', 'Назначить на того, кто выполняет переход'], ['unassigned', 'Снять исполнителя']];

const categoryOf = (kind) => KINDS.find((k) => k.value === kind)?.category ?? 'todo';
const snap = (v) => Math.max(0, Math.round(v / SNAP) * SNAP);
const centre = (s) => ({ x: s.x + NODE_W / 2, y: s.y + NODE_H / 2 });

/** Point where the line from the box centre towards `to` leaves the box. */
export function boxEdge(status, to) {
  const c = centre(status);
  const dx = to.x - c.x;
  const dy = to.y - c.y;
  if (dx === 0 && dy === 0) return c;
  const scale = Math.min(dx === 0 ? Infinity : (NODE_W / 2) / Math.abs(dx), dy === 0 ? Infinity : (NODE_H / 2) / Math.abs(dy));
  return { x: c.x + dx * scale, y: c.y + dy * scale };
}

function Checks({ options, value, onChange, disabled }) {
  const { t } = useLocalization();
  return (
    <div className="wf-checklist">
      {options.map(([v, label]) => (
        <label key={v} className="wf-check">
          <input type="checkbox" disabled={disabled} checked={value.includes(v)} onChange={(e) => onChange(e.target.checked ? [...value, v] : value.filter((x) => x !== v))} />
          {t(label)}
        </label>
      ))}
    </div>
  );
}

function StatusPanel({ data, status, onChange, readOnly }) {
  const { t } = useLocalization();
  const update = (patch) => onChange({ ...data, statuses: data.statuses.map((s) => (s.key === status.key ? { ...s, ...patch } : s)) });
  const remove = () => {
    if (!window.confirm(t('Удалить статус «{name}» и его переходы?').replace('{name}', status.name))) return;
    const statuses = data.statuses.filter((s) => s.key !== status.key);
    const transitions = data.transitions
      .filter((x) => x.to !== status.key)
      .map((x) => ({ ...x, from: x.from.filter((f) => f !== status.key) }))
      .filter((x) => x.any || x.from.length > 0);
    onChange({ ...data, statuses, transitions, initial: data.initial === status.key ? statuses[0]?.key : data.initial }, null);
  };
  return (
    <div className="wf-panel" aria-label={t('Статус')}>
      <h3>{t('Статус')}</h3>
      <label className="app-field">
        <span>{t('Название')}</span>
        <input aria-label={t('Название статуса')} value={status.name} maxLength={60} disabled={readOnly} onChange={(e) => update({ name: e.target.value })} />
      </label>
      <label className="app-field">
        <span>{t('Категория')}</span>
        <select aria-label={t('Категория статуса')} value={status.kind} disabled={readOnly} onChange={(e) => update({ kind: Number(e.target.value) })}>
          {KINDS.map((k) => <option key={k.value} value={k.value}>{t(k.label)}</option>)}
        </select>
      </label>
      {data.initial === status.key
        ? <p className="wf-muted">{t('Новые задачи создаются в этом статусе.')}</p>
        : !readOnly && <button type="button" className="app-btn app-btn-subtle" onClick={() => onChange({ ...data, initial: status.key })}>{t('Сделать начальным статусом')}</button>}
      {!readOnly && data.statuses.length > 1 && (
        <button type="button" className="app-btn app-btn-danger" onClick={remove}>{t('Удалить статус')}</button>
      )}
    </div>
  );
}

function TransitionPanel({ data, transition, onChange, fields, screens, groups, readOnly }) {
  const { t } = useLocalization();
  const update = (patch) => onChange({ ...data, transitions: data.transitions.map((x) => (x.key === transition.key ? { ...x, ...patch } : x)) });
  const nested = (part, patch) => update({ [part]: { ...(transition[part] || {}), ...patch } });
  const statusOptions = data.statuses.map((s) => [s.key, s.name]);
  const conditions = transition.conditions || {};
  const validators = transition.validators || {};
  const post = transition.post || {};
  const patterns = validators.patterns || [];
  const patternFields = [['summary', 'Сводка'], ['description', 'Описание'], ...fields.filter((f) => !f.system).map((f) => [f.key, f.label])];
  const remove = () => {
    if (!window.confirm(t('Удалить переход «{name}»?').replace('{name}', transition.name))) return;
    onChange({ ...data, transitions: data.transitions.filter((x) => x.key !== transition.key) }, null);
  };
  return (
    <div className="wf-panel" aria-label={t('Переход')}>
      <h3>{t('Переход')}</h3>
      <label className="app-field">
        <span>{t('Название')}</span>
        <input aria-label={t('Название перехода')} value={transition.name} maxLength={60} disabled={readOnly} onChange={(e) => update({ name: e.target.value })} />
      </label>
      <label className="app-check">
        <input type="checkbox" checked={!!transition.any} disabled={readOnly} onChange={(e) => update({ any: e.target.checked, from: e.target.checked ? [] : transition.from })} />
        {t('Из любого статуса (глобальный переход)')}
      </label>
      {!transition.any && (
        <div className="app-field">
          <span>{t('Из статусов')}</span>
          <Checks options={statusOptions.filter(([k]) => k !== transition.to)} value={transition.from} onChange={(from) => update({ from })} disabled={readOnly} />
        </div>
      )}
      <label className="app-field">
        <span>{t('В статус')}</span>
        <select aria-label={t('В статус')} value={transition.to} disabled={readOnly} onChange={(e) => update({ to: e.target.value, from: transition.from.filter((f) => f !== e.target.value) })}>
          {statusOptions.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
        </select>
      </label>
      <label className="app-field">
        <span>{t('Экран перехода')}</span>
        <select aria-label={t('Экран перехода')} value={transition.screenId ?? ''} disabled={readOnly} onChange={(e) => update({ screenId: e.target.value || null })}>
          <option value="">{t('Без экрана')}</option>
          {screens.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>

      <h4 className="wf-dialog-section">{t('Условия')}</h4>
      <p className="wf-muted">{t('Если условие не выполнено, переход недоступен.')}</p>
      <label className="app-field">
        <span>{t('Кто может выполнять')}</span>
        <select value={conditions.role ?? ''} disabled={readOnly} onChange={(e) => nested('conditions', { role: e.target.value || null })}>
          {ROLES.map(([v, label]) => <option key={v} value={v}>{t(label)}</option>)}
        </select>
      </label>
      {groups.length > 0 && (
        <div className="app-field">
          <span>{t('Только участники групп')}</span>
          <Checks options={groups.map((g) => [g.id, g.name])} value={conditions.groups || []} onChange={(list) => nested('conditions', { groups: list })} disabled={readOnly} />
        </div>
      )}
      <label className="app-check"><input type="checkbox" disabled={readOnly} checked={!!conditions.onlyAssignee} onChange={(e) => nested('conditions', { onlyAssignee: e.target.checked })} />{t('Только исполнитель задачи')}</label>
      <label className="app-check"><input type="checkbox" disabled={readOnly} checked={!!conditions.requireAssignee} onChange={(e) => nested('conditions', { requireAssignee: e.target.checked })} />{t('У задачи должен быть исполнитель')}</label>
      <label className="app-check"><input type="checkbox" disabled={readOnly} checked={!!conditions.requireEstimate} onChange={(e) => nested('conditions', { requireEstimate: e.target.checked })} />{t('У задачи должна быть оценка')}</label>

      <h4 className="wf-dialog-section">{t('Валидаторы')}</h4>
      <p className="wf-muted">{t('Проверяются после заполнения экрана перехода; при ошибке задача остаётся в прежнем статусе.')}</p>
      <div className="app-field">
        <span>{t('Обязательные поля')}</span>
        <Checks options={fields.map((f) => [f.key, f.label])} value={validators.requiredFields || []} onChange={(list) => nested('validators', { requiredFields: list })} disabled={readOnly} />
      </div>
      <div className="app-field">
        <span>{t('Проверка формата (регулярное выражение)')}</span>
        {patterns.map((p, index) => (
          <div key={index} className="wf-pattern-row">
            <select aria-label={t('Поле для проверки')} value={p.field} disabled={readOnly} onChange={(e) => nested('validators', { patterns: patterns.map((x, i) => (i === index ? { ...x, field: e.target.value } : x)) })}>
              {patternFields.map(([k, label]) => <option key={k} value={k}>{t(label)}</option>)}
            </select>
            <input aria-label={t('Регулярное выражение')} value={p.pattern} maxLength={200} disabled={readOnly} placeholder="^[A-Z]+-\d+" onChange={(e) => nested('validators', { patterns: patterns.map((x, i) => (i === index ? { ...x, pattern: e.target.value } : x)) })} />
            <input aria-label={t('Сообщение об ошибке')} value={p.message ?? ''} maxLength={200} disabled={readOnly} placeholder={t('Сообщение об ошибке')} onChange={(e) => nested('validators', { patterns: patterns.map((x, i) => (i === index ? { ...x, message: e.target.value } : x)) })} />
            {!readOnly && <button type="button" className="app-icon-btn" aria-label={t('Удалить проверку')} onClick={() => nested('validators', { patterns: patterns.filter((_, i) => i !== index) })}><NavIcon name="close" size={12} /></button>}
          </div>
        ))}
        {!readOnly && <button type="button" className="app-btn app-btn-subtle" onClick={() => nested('validators', { patterns: [...patterns, { field: 'summary', pattern: '', message: '' }] })}>{t('Добавить проверку')}</button>}
      </div>
      <label className="app-field">
        <span>{t('Задача должна была пройти статус')}</span>
        <select aria-label={t('Предыдущий статус')} value={validators.previousStatus ?? ''} disabled={readOnly} onChange={(e) => nested('validators', { previousStatus: e.target.value || null })}>
          <option value="">{t('Не проверять')}</option>
          {statusOptions.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
        </select>
      </label>

      <h4 className="wf-dialog-section">{t('Действия после перехода')}</h4>
      <label className="app-field">
        <span>{t('Исполнитель')}</span>
        <select value={post.assignee ?? ''} disabled={readOnly} onChange={(e) => nested('post', { assignee: e.target.value || null })}>
          {ASSIGNEE_ACTIONS.map(([v, label]) => <option key={v} value={v}>{t(label)}</option>)}
        </select>
      </label>
      <label className="app-field">
        <span>{t('Приоритет')}</span>
        <select value={post.priority ?? ''} disabled={readOnly} onChange={(e) => nested('post', { priority: e.target.value === '' ? null : Number(e.target.value) })}>
          <option value="">{t('Не менять приоритет')}</option>
          {[4, 3, 2, 1, 0].map((p) => <option key={p} value={p}>{t(getPriorityMeta(p).label)}</option>)}
        </select>
      </label>
      <label className="app-check"><input type="checkbox" disabled={readOnly} checked={transition.enabled !== false} onChange={(e) => update({ enabled: e.target.checked })} />{t('Переход включён')}</label>
      {!readOnly && <button type="button" className="app-btn app-btn-danger" onClick={remove}>{t('Удалить переход')}</button>}
    </div>
  );
}

/**
 * Workflow diagram editor: drag statuses to arrange them, drag from a status's handle to another
 * status to add a transition, click a status or transition to edit it.
 */
export default function WorkflowDesigner({ value, onChange, fields = [], screens = [], groups = [], readOnly = false }) {
  const { t } = useLocalization();
  const svgRef = useRef(null);
  const [selected, setSelected] = useState(null);
  const [drag, setDrag] = useState(null);
  const data = value;
  const byKey = useMemo(() => new Map(data.statuses.map((s) => [s.key, s])), [data.statuses]);
  const width = Math.max(900, ...data.statuses.map((s) => s.x + NODE_W + 80));
  const height = Math.max(420, ...data.statuses.map((s) => s.y + NODE_H + 80));

  const change = (next, select) => { onChange(next); if (select !== undefined) setSelected(select); };
  const point = (e) => {
    const rect = svgRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const statusAt = (p) => data.statuses.find((s) => p.x >= s.x && p.x <= s.x + NODE_W && p.y >= s.y && p.y <= s.y + NODE_H);
  const moveStatus = (key, x, y) => onChange({ ...data, statuses: data.statuses.map((s) => (s.key === key ? { ...s, x: snap(x), y: snap(y) } : s)) });

  const addStatus = () => {
    const key = newKey('s', data.statuses.map((s) => s.key));
    const last = data.statuses[data.statuses.length - 1];
    const status = { key, name: `${t('Статус')} ${data.statuses.length + 1}`, kind: 1, x: last ? snap(last.x + 200) : 40, y: last ? last.y : 120 };
    change({ ...data, statuses: [...data.statuses, status], initial: data.initial ?? key }, { type: 'status', key });
  };
  const addTransition = (from, to) => {
    const key = newKey('t', data.transitions.map((x) => x.key));
    const transition = { key, name: byKey.get(to)?.name ?? t('Переход'), from: from ? [from] : [], any: !from, to, enabled: true, conditions: {}, validators: {}, post: {} };
    change({ ...data, transitions: [...data.transitions, transition] }, { type: 'transition', key });
  };

  const onNodeDown = (e, status) => {
    if (readOnly) { setSelected({ type: 'status', key: status.key }); return; }
    e.stopPropagation();
    svgRef.current.setPointerCapture?.(e.pointerId);
    const p = point(e);
    setDrag({ type: 'node', key: status.key, dx: p.x - status.x, dy: p.y - status.y, startX: p.x, startY: p.y, moved: false });
  };
  const onHandleDown = (e, status) => {
    e.stopPropagation();
    svgRef.current.setPointerCapture?.(e.pointerId);
    const p = point(e);
    setDrag({ type: 'link', from: status.key, x: p.x, y: p.y });
  };
  const onMove = (e) => {
    if (!drag) return;
    const p = point(e);
    if (drag.type === 'node') {
      const moved = drag.moved || Math.abs(p.x - drag.startX) > 3 || Math.abs(p.y - drag.startY) > 3;
      if (moved) moveStatus(drag.key, p.x - drag.dx, p.y - drag.dy);
      if (moved !== drag.moved) setDrag({ ...drag, moved });
    } else setDrag({ ...drag, x: p.x, y: p.y });
  };
  const onUp = (e) => {
    if (!drag) return;
    if (drag.type === 'node' && !drag.moved) setSelected({ type: 'status', key: drag.key });
    if (drag.type === 'link') {
      const target = statusAt(point(e));
      if (target && target.key !== drag.from) addTransition(drag.from, target.key);
    }
    setDrag(null);
  };
  const onNodeKey = (e, status) => {
    const step = e.shiftKey ? 50 : SNAP;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key] && !readOnly) {
      e.preventDefault();
      moveStatus(status.key, status.x + moves[e.key][0], status.y + moves[e.key][1]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setSelected({ type: 'status', key: status.key });
    }
  };

  const edges = [];
  data.transitions.forEach((x) => {
    const to = byKey.get(x.to);
    if (!to) return;
    if (x.any) { edges.push({ x, any: true, to }); return; }
    x.from.forEach((f) => { const from = byKey.get(f); if (from) edges.push({ x, from, to }); });
  });
  const pairs = new Set(edges.filter((e) => !e.any).map((e) => `${e.from.key}>${e.to.key}`));

  const selectedStatus = selected?.type === 'status' ? byKey.get(selected.key) : null;
  const selectedTransition = selected?.type === 'transition' ? data.transitions.find((x) => x.key === selected.key) : null;
  const initial = byKey.get(data.initial);

  return (
    <div className="wf-designer">
      {!readOnly && (
        <div className="wf-designer-toolbar">
          <button type="button" className="app-btn app-btn-subtle" onClick={addStatus}><NavIcon name="plus" size={14} /> {t('Добавить статус')}</button>
          <button type="button" className="app-btn app-btn-subtle" disabled={!data.statuses.length} onClick={() => addTransition(selectedStatus?.key ?? data.statuses[0].key, data.statuses.find((s) => s.key !== (selectedStatus?.key ?? data.statuses[0].key))?.key ?? data.statuses[0].key)}>
            <NavIcon name="plus" size={14} /> {t('Добавить переход')}
          </button>
          <span className="wf-muted">{t('Перетаскивайте статусы; чтобы добавить переход, потяните за точку справа от статуса к другому статусу.')}</span>
        </div>
      )}
      <div className="wf-designer-body">
        <div className="wf-canvas-wrap">
          <svg
            ref={svgRef}
            className={`wf-canvas${drag?.type === 'node' && drag.moved ? ' is-dragging' : ''}`}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            role="application"
            aria-label={t('Схема workflow')}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerLeave={() => drag?.type === 'link' && setDrag(null)}
            onClick={(e) => { if (e.target === svgRef.current) setSelected(null); }}
          >
            <defs>
              <marker id="wfd-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 10 5 0 10z" fill="currentColor" />
              </marker>
            </defs>
            {initial && (
              <g className="wf-initial">
                <circle cx={Math.max(8, initial.x - 34)} cy={initial.y + NODE_H / 2} r="7" />
                <path d={`M${Math.max(8, initial.x - 34) + 7} ${initial.y + NODE_H / 2} L${initial.x - 2} ${initial.y + NODE_H / 2}`} markerEnd="url(#wfd-arrow)" />
              </g>
            )}
            {edges.map((edge) => {
              const active = selectedTransition?.key === edge.x.key;
              const cls = `wf-edge${edge.x.enabled === false ? ' is-disabled' : ''}${active ? ' is-selected' : ''}`;
              const select = () => setSelected({ type: 'transition', key: edge.x.key });
              const keySelect = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(); } };
              if (edge.any) {
                const c = centre(edge.to);
                return (
                  <g key={`${edge.x.key}-any`} className={cls}>
                    <path d={`M${c.x} ${edge.to.y - 34} L${c.x} ${edge.to.y - 2}`} markerEnd="url(#wfd-arrow)" />
                    <text x={c.x} y={edge.to.y - 40} textAnchor="middle" role="button" tabIndex={0} aria-label={`${t('Переход')} ${edge.x.name}`} onClick={select} onKeyDown={keySelect}>
                      {t('Любой')} · {edge.x.name}
                    </text>
                  </g>
                );
              }
              const a = centre(edge.from);
              const b = centre(edge.to);
              const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
              const offset = pairs.has(`${edge.to.key}>${edge.from.key}`) ? 9 : 0;
              const nx = (-(b.y - a.y) / len) * offset;
              const ny = ((b.x - a.x) / len) * offset;
              const start = boxEdge(edge.from, { x: b.x + nx, y: b.y + ny });
              const end = boxEdge(edge.to, { x: a.x + nx, y: a.y + ny });
              const sx = start.x + nx; const sy = start.y + ny; const ex = end.x + nx; const ey = end.y + ny;
              return (
                <g key={`${edge.x.key}-${edge.from.key}`} className={cls}>
                  <line x1={sx} y1={sy} x2={ex} y2={ey} markerEnd="url(#wfd-arrow)" />
                  <line className="wf-edge-hit" x1={sx} y1={sy} x2={ex} y2={ey} onClick={select} />
                  <text x={(sx + ex) / 2 + nx * 1.4} y={(sy + ey) / 2 + ny * 1.4 - 4} textAnchor="middle" role="button" tabIndex={0} aria-label={`${t('Переход')} ${edge.x.name}`} onClick={select} onKeyDown={keySelect}>
                    {edge.x.name}
                  </text>
                </g>
              );
            })}
            {drag?.type === 'link' && byKey.get(drag.from) && (
              <line className="wf-edge is-drafting" x1={centre(byKey.get(drag.from)).x} y1={centre(byKey.get(drag.from)).y} x2={drag.x} y2={drag.y} markerEnd="url(#wfd-arrow)" />
            )}
            {data.statuses.map((s) => (
              <g
                key={s.key}
                className={`wf-status is-${categoryOf(s.kind)}${selectedStatus?.key === s.key ? ' is-selected' : ''}`}
                role="button"
                tabIndex={0}
                aria-label={`${t('Статус')} ${s.name}`}
                data-status={s.key}
                onPointerDown={(e) => onNodeDown(e, s)}
                onKeyDown={(e) => onNodeKey(e, s)}
              >
                <rect x={s.x} y={s.y} width={NODE_W} height={NODE_H} rx="4" />
                <text x={s.x + NODE_W / 2} y={s.y + NODE_H / 2 + 4} textAnchor="middle">{(s.name || '').toUpperCase().slice(0, 20)}</text>
                {!readOnly && (
                  <circle className="wf-handle" cx={s.x + NODE_W} cy={s.y + NODE_H / 2} r="6" aria-label={`${t('Новый переход из')} ${s.name}`} onPointerDown={(e) => onHandleDown(e, s)} />
                )}
              </g>
            ))}
          </svg>
        </div>
        {(selectedStatus || selectedTransition) && (
          <aside className="wf-designer-panel">
            <button type="button" className="app-icon-btn wf-panel-close" aria-label={t('Закрыть')} onClick={() => setSelected(null)}><NavIcon name="close" size={14} /></button>
            {selectedStatus && <StatusPanel data={data} status={selectedStatus} onChange={change} readOnly={readOnly} />}
            {selectedTransition && <TransitionPanel data={data} transition={selectedTransition} onChange={change} fields={fields} screens={screens} groups={groups} readOnly={readOnly} />}
          </aside>
        )}
      </div>
    </div>
  );
}
