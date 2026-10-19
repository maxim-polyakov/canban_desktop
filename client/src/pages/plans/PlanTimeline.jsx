import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '../../i18n/navigation.jsx';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import NavIcon from '../../components/NavIcons.jsx';
import { IssueTypeIcon } from '../../components/IssueIcons.jsx';
import {
  addDays, buildRows, daysBetween, dependencyConflicts, moveRange, startOfDay, startOfWeek, visibleRows,
} from '../../utils/planMath.js';

const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 44;
const ZOOMS = { weeks: 26, months: 9, quarters: 3.2 };

function useTimelineWindow(ranges, zoom) {
  return useMemo(() => {
    const today = startOfDay(new Date());
    let min = addDays(today, -28);
    let max = addDays(today, zoom === 'quarters' ? 365 : zoom === 'months' ? 180 : 84);
    ranges.forEach((range) => {
      if (!range) return;
      if (range.start < min) min = range.start;
      if (range.end > max) max = range.end;
    });
    const start = startOfWeek(addDays(min, -7));
    const end = addDays(max, 21);
    return { start, days: daysBetween(start, end) + 1 };
  }, [ranges, zoom]);
}

function HeaderScale({ start, days, dayWidth, locale }) {
  const months = [];
  for (let i = 0; i < days;) {
    const date = addDays(start, i);
    const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    const span = Math.min(days - i, daysBetween(date, nextMonth));
    months.push({ key: i, left: i * dayWidth, width: span * dayWidth, label: date.toLocaleDateString(locale, { month: dayWidth < 5 ? 'short' : 'long', year: 'numeric' }) });
    i += span;
  }
  const weeks = [];
  if (dayWidth >= 6) {
    for (let i = 0; i < days; i += 7) weeks.push({ key: i, left: i * dayWidth, label: addDays(start, i).getDate() });
  }
  return (
    <div className="plan-scale" style={{ width: days * dayWidth, height: HEADER_HEIGHT }}>
      {months.map((m) => <div key={m.key} className="plan-scale-month" style={{ left: m.left, width: m.width }}>{m.label}</div>)}
      {weeks.map((w) => <div key={w.key} className="plan-scale-week" style={{ left: w.left }}>{w.label}</div>)}
    </div>
  );
}

export default function PlanTimeline({
  items, ranges, dependencies, releases, teams, boardsById, canEdit, scenarioColor,
  onSchedule, onReset, onExclude, onTeamChange, onAddDependency,
}) {
  const { t, locale } = useLocalization();
  const [zoom, setZoom] = useState('weeks');
  const [groupBy, setGroupBy] = useState('space');
  const [query, setQuery] = useState('');
  const [showDeps, setShowDeps] = useState(true);
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [drag, setDrag] = useState(null);
  const [menu, setMenu] = useState(null);
  const [linking, setLinking] = useState(null);
  const scrollRef = useRef(null);
  const dayWidth = ZOOMS[zoom];
  const teamsById = useMemo(() => new Map(teams.map((x) => [x.id, x])), [teams]);

  const needle = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!needle) return items;
    const keep = new Set(items.filter((x) => `${x.issueKey} ${x.title}`.toLowerCase().includes(needle)).map((x) => x.id));
    const byId = new Map(items.map((x) => [x.id, x]));
    [...keep].forEach((id) => { let p = byId.get(id)?.parentId; while (p && byId.has(p)) { keep.add(p); p = byId.get(p).parentId; } });
    return items.filter((x) => keep.has(x.id));
  }, [items, needle]);

  const label = (key) => {
    if (groupBy === 'team') return key ? teamsById.get(key)?.name || t('Команда') : t('Без команды');
    const board = boardsById.get(key);
    return board ? `${board.name} (${board.key})` : t('Раздел');
  };
  const rows = visibleRows(buildRows(filtered, groupBy, label), collapsed);

  const effective = useMemo(() => {
    if (!drag?.preview) return ranges;
    const copy = new Map(ranges);
    copy.set(drag.id, drag.preview);
    return copy;
  }, [ranges, drag]);
  const view = useTimelineWindow(ranges, zoom);
  const conflicts = useMemo(() => dependencyConflicts(dependencies, effective), [dependencies, effective]);
  const x = (date) => daysBetween(view.start, date) * dayWidth;
  const todayX = x(startOfDay(new Date()));

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, todayX - 120);
  }, [zoom, todayX]);

  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);

  const startDrag = (event, item, mode) => {
    if (!canEdit || ranges.get(item.id)?.rollup) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ id: item.id, mode, originX: event.clientX, range: ranges.get(item.id), preview: null });
  };
  const onPointerMove = (event) => {
    if (!drag) return;
    const delta = Math.round((event.clientX - drag.originX) / dayWidth);
    setDrag((d) => ({ ...d, preview: delta ? moveRange(d.range, d.mode, delta) : null }));
  };
  const onPointerUp = () => {
    if (!drag) return;
    const { id, preview } = drag;
    setDrag(null);
    if (preview) onSchedule(id, preview);
  };

  const rowIndex = new Map();
  rows.forEach((row, i) => { if (row.type === 'item') rowIndex.set(row.item.id, i); });

  const scheduleDefault = (item) => {
    const start = startOfDay(new Date());
    onSchedule(item.id, { start, end: addDays(start, 6) });
  };

  const clickBar = (item) => {
    if (!linking) return false;
    if (linking !== item.id) onAddDependency(linking, item.id);
    setLinking(null);
    return true;
  };

  const width = view.days * dayWidth;
  const height = rows.length * ROW_HEIGHT;

  return (
    <div className="plan-timeline">
      <div className="settings-toolbar plan-toolbar">
        <label className="settings-search">
          <NavIcon name="search" size={14} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Поиск по плану')} aria-label={t('Поиск по плану')} />
        </label>
        <select className="app-select" value={groupBy} onChange={(e) => setGroupBy(e.target.value)} aria-label={t('Группировка')}>
          <option value="space">{t('По разделам')}</option>
          <option value="team">{t('По командам')}</option>
          <option value="none">{t('Без группировки')}</option>
        </select>
        <div className="plan-seg" role="group" aria-label={t('Масштаб')}>
          {[['weeks', 'Недели'], ['months', 'Месяцы'], ['quarters', 'Кварталы']].map(([id, text]) => (
            <button key={id} type="button" className={zoom === id ? 'is-active' : ''} onClick={() => setZoom(id)}>{t(text)}</button>
          ))}
        </div>
        <label className="wiz-check"><input type="checkbox" checked={showDeps} onChange={(e) => setShowDeps(e.target.checked)} />{t('Зависимости')}</label>
        <button type="button" className="app-btn" onClick={() => { if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, todayX - 120); }}>{t('Сегодня')}</button>
      </div>
      {linking && (
        <div className="plan-linking" role="status">
          {t('Выберите задачу, которую блокирует')} {items.find((i) => i.id === linking)?.issueKey}
          <button type="button" className="app-btn app-btn-subtle" onClick={() => setLinking(null)}>{t('Отмена')}</button>
        </div>
      )}

      <div className="plan-grid">
        <div className="plan-left">
          <div className="plan-left-head" style={{ height: HEADER_HEIGHT }}>
            <span>{t('Задача')}</span><span>{t('Команда')}</span><span>{t('Статус')}</span>
          </div>
          {rows.map((row) => (row.type === 'group' ? (
            <button
              key={`g:${row.key}`}
              type="button"
              className="plan-row plan-group-row"
              style={{ height: ROW_HEIGHT }}
              onClick={() => setCollapsed((s) => { const n = new Set(s); const k = `group:${row.key}`; if (n.has(k)) n.delete(k); else n.add(k); return n; })}
            >
              <NavIcon name={collapsed.has(`group:${row.key}`) ? 'chevronRight' : 'chevronDown'} size={12} />
              <strong>{row.label}</strong><span className="sv-muted">{row.count}</span>
            </button>
          ) : (
            <div key={row.item.id} className={`plan-row ${row.item.changed ? 'is-changed' : ''}`} style={{ height: ROW_HEIGHT }}>
              <span className="plan-cell-title" style={{ paddingLeft: 4 + row.depth * 18 }}>
                {row.hasChildren ? (
                  <button type="button" className="plan-toggle" aria-label={t('Развернуть')} onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(row.item.id)) n.delete(row.item.id); else n.add(row.item.id); return n; })}>
                    <NavIcon name={collapsed.has(row.item.id) ? 'chevronRight' : 'chevronDown'} size={12} />
                  </button>
                ) : <span className="plan-toggle" />}
                <IssueTypeIcon issueType={row.item.issueType} size={14} />
                <Link to={`/board/${row.item.boardId}/issue/${row.item.id}`} className="plan-key">{row.item.issueKey}</Link>
                <span className="plan-title" title={row.item.title}>{row.item.title}</span>
                {row.item.changed && <span className="plan-changed-dot" style={{ background: scenarioColor }} title={t('Изменено в сценарии')} />}
              </span>
              <span className="plan-cell-team">
                {canEdit ? (
                  <select value={row.item.planTeamId || ''} onChange={(e) => onTeamChange(row.item.id, e.target.value || null)} aria-label={t('Команда')}>
                    <option value="">—</option>
                    {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                ) : (teamsById.get(row.item.planTeamId)?.name || '—')}
              </span>
              <span className="plan-cell-status">
                <span className={`tpl-status tpl-status-${row.item.statusCategory}`} title={row.item.status}>{row.item.status}</span>
              </span>
              {canEdit && (
                <button type="button" className="app-icon-btn plan-row-more" aria-label={t('Действия')} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ item: row.item, top: r.bottom, left: r.left }); }}>
                  <NavIcon name="more" size={14} />
                </button>
              )}
            </div>
          )))}
          {rows.length === 0 && <p className="settings-empty">{t('В плане нет задач, соответствующих фильтру.')}</p>}
        </div>

        <div className="plan-right" ref={scrollRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={() => setDrag(null)}>
          <HeaderScale start={view.start} days={view.days} dayWidth={dayWidth} locale={locale} />
          <div className="plan-canvas" style={{ width, height }}>
            {rows.map((row, i) => <div key={i} className={`plan-canvas-row ${row.type === 'group' ? 'is-group' : ''}`} style={{ top: i * ROW_HEIGHT, height: ROW_HEIGHT, width }} />)}
            {releases.filter((r) => r.releaseDate).map((release) => (
              <div key={release.id} className={`plan-release ${release.status === 1 ? 'is-released' : ''}`} style={{ left: x(new Date(release.releaseDate)), height }} title={`${release.name} — ${new Date(release.releaseDate).toLocaleDateString(locale)}`}>
                <span className="plan-release-flag">{release.name}</span>
              </div>
            ))}
            <div className="plan-today" style={{ left: todayX, height }} />
            {rows.map((row, i) => {
              if (row.type !== 'item') return null;
              const range = effective.get(row.item.id);
              const top = i * ROW_HEIGHT + 8;
              if (!range) {
                return canEdit ? (
                  <button key={row.item.id} type="button" className="plan-nodates" style={{ top, left: todayX + 4 }} onClick={() => scheduleDefault(row.item)}>
                    {t('Запланировать')}
                  </button>
                ) : null;
              }
              const left = x(range.start);
              const barWidth = Math.max(dayWidth, (daysBetween(range.start, range.end) + 1) * dayWidth);
              const draggable = canEdit && !range.rollup;
              return (
                <div
                  key={row.item.id}
                  className={`plan-bar is-${row.item.statusCategory} ${range.rollup ? 'is-rollup' : ''} ${range.estimated ? 'is-estimated' : ''} ${row.item.changed ? 'is-changed' : ''} ${linking ? 'is-linkable' : ''}`}
                  style={{ top, left, width: barWidth, '--scenario': scenarioColor }}
                  title={`${row.item.issueKey} ${row.item.title}\n${range.start.toLocaleDateString(locale)} — ${range.end.toLocaleDateString(locale)}`}
                  onPointerDown={(e) => { if (linking) { e.preventDefault(); clickBar(row.item); return; } if (draggable) startDrag(e, row.item, 'move'); }}
                >
                  {draggable && <span className="plan-bar-handle is-start" onPointerDown={(e) => startDrag(e, row.item, 'start')} />}
                  <span className="plan-bar-label">{barWidth > 60 ? row.item.title : ''}</span>
                  {draggable && <span className="plan-bar-handle is-end" onPointerDown={(e) => startDrag(e, row.item, 'end')} />}
                </div>
              );
            })}
            {showDeps && (
              <svg className="plan-deps" width={width} height={height} aria-hidden="true">
                <defs>
                  <marker id="plan-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 8 4 0 8z" fill="#626f86" /></marker>
                  <marker id="plan-arrow-bad" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 8 4 0 8z" fill="#c9372c" /></marker>
                </defs>
                {dependencies.map((dep) => {
                  const a = effective.get(dep.blockerId);
                  const b = effective.get(dep.blockedId);
                  if (!a || !b || !rowIndex.has(dep.blockerId) || !rowIndex.has(dep.blockedId)) return null;
                  const x1 = x(a.end) + dayWidth;
                  const y1 = rowIndex.get(dep.blockerId) * ROW_HEIGHT + ROW_HEIGHT / 2;
                  const x2 = x(b.start);
                  const y2 = rowIndex.get(dep.blockedId) * ROW_HEIGHT + ROW_HEIGHT / 2;
                  const bad = conflicts.has(dep.id);
                  const mid = Math.max(x1 + 10, (x1 + x2) / 2);
                  return (
                    <path key={dep.id} d={`M${x1} ${y1} C${mid} ${y1} ${Math.min(mid, x2 - 10)} ${y2} ${x2} ${y2}`} fill="none"
                      stroke={bad ? '#c9372c' : '#626f86'} strokeWidth="1.5" strokeDasharray={bad ? '4 3' : undefined} markerEnd={`url(#${bad ? 'plan-arrow-bad' : 'plan-arrow'})`} />
                  );
                })}
              </svg>
            )}
          </div>
        </div>
      </div>

      {menu && (
        <div className="app-menu plan-menu" role="menu" style={{ top: menu.top + 4, left: menu.left - 180 }} onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" className="app-menu-item" role="menuitem" onClick={() => { setLinking(menu.item.id); setMenu(null); }}><NavIcon name="link" />{t('Добавить зависимость')}</button>
          {menu.item.changed && <button type="button" className="app-menu-item" role="menuitem" onClick={() => { onReset(menu.item.id); setMenu(null); }}><NavIcon name="recent" />{t('Отменить изменения в сценарии')}</button>}
          <Link to={`/board/${menu.item.boardId}/issue/${menu.item.id}`} className="app-menu-item" role="menuitem"><NavIcon name="external" />{t('Открыть задачу')}</Link>
          <div className="app-menu-divider" />
          <button type="button" className="app-menu-item is-danger" role="menuitem" onClick={() => { onExclude(menu.item.id); setMenu(null); }}><NavIcon name="eyeOff" />{t('Исключить из плана')}</button>
        </div>
      )}
    </div>
  );
}
