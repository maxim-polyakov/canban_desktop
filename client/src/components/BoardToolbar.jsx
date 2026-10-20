import React, { useEffect, useRef, useState } from 'react';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import AssigneeAvatar from './AssigneeAvatar.jsx';
import { IssueTypeIcon, PriorityIcon } from './IssueIcons.jsx';
import { BASE_TYPES } from '../utils/issueConfig.js';
import { activeBoardFilterCount, GROUP_OPTIONS, UNASSIGNED } from '../utils/boardLanes.js';
import './BoardToolbar.css';

const VISIBLE_PEOPLE = 5;
const PRIORITIES = [[4, 'Высший'], [3, 'Высокий'], [2, 'Средний'], [1, 'Низкий'], [0, 'Низший']];

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return { open, setOpen, ref };
}

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="7" cy="7" r="4.5" /><path d="M10.5 10.5L14 14" strokeLinecap="round" />
  </svg>
);
const FilterIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
    <path d="M2 4h12M4.5 8h7M7 12h2" />
  </svg>
);
const GroupIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
    <path d="M8 2l6 3-6 3-6-3z" /><path d="M2 8l6 3 6-3M2 11l6 3 6-3" />
  </svg>
);
const PersonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <circle cx="8" cy="5.5" r="2.75" /><path d="M2.75 14c.6-2.7 2.7-4.25 5.25-4.25S12.65 11.3 13.25 14" strokeLinecap="round" />
  </svg>
);

function CheckRow({ checked, onChange, children }) {
  return (
    <label className="btb-check">
      <input type="checkbox" checked={checked} onChange={onChange} />
      {children}
    </label>
  );
}

/** Jira board toolbar: search, people avatars, «Фильтр» and «Группа»; actions on the right go in `children`. */
export default function BoardToolbar({
  query, onQueryChange, members = [], filters, onFiltersChange, groupBy, onGroupByChange, issueTypes = [], labels = [], children,
}) {
  const { t } = useLocalization();
  const filter = usePopover();
  const group = usePopover();
  const more = usePopover();
  const { assigneeIds = [], types = [], priorities = [], labels: chosenLabels = [] } = filters;

  const toggle = (key, value) => {
    const list = filters[key] || [];
    onFiltersChange({ ...filters, [key]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value] });
  };
  const people = members.filter((m) => m.userId);
  const shown = people.slice(0, VISIBLE_PEOPLE);
  const hidden = people.slice(VISIBLE_PEOPLE);
  const typeChoices = [
    ...BASE_TYPES.map((type) => ({ token: String(type.value), issueType: type.value, name: type.label })),
    ...issueTypes.map((type) => ({ token: String(type.id), issueType: type.baseType, typeId: type.id, name: type.name })),
  ];
  const filterCount = activeBoardFilterCount(filters);
  const groupLabel = GROUP_OPTIONS.find(([value]) => value === groupBy)?.[1];

  return (
    <div className="btb" role="toolbar" aria-label={t('Панель доски')}>
      <label className="btb-search">
        <SearchIcon />
        <input type="search" value={query} onChange={(e) => onQueryChange(e.target.value)} placeholder={t('Поиск на доске')} aria-label={t('Поиск на доске')} />
      </label>

      <div className="btb-people" role="group" aria-label={t('Фильтр по исполнителю')}>
        <button
          type="button"
          className={`btb-avatar btb-unassigned ${assigneeIds.includes(UNASSIGNED) ? 'is-selected' : ''}`}
          aria-pressed={assigneeIds.includes(UNASSIGNED)}
          title={t('Не назначено')}
          aria-label={t('Не назначено')}
          onClick={() => toggle('assigneeIds', UNASSIGNED)}
        >
          <PersonIcon />
        </button>
        {shown.map((m) => (
          <button
            key={m.userId}
            type="button"
            className={`btb-avatar ${assigneeIds.includes(String(m.userId)) ? 'is-selected' : ''}`}
            aria-pressed={assigneeIds.includes(String(m.userId))}
            title={m.displayName}
            aria-label={m.displayName}
            onClick={() => toggle('assigneeIds', String(m.userId))}
          >
            <AssigneeAvatar userId={m.userId} displayName={m.displayName} avatarUrl={m.avatarUrl} size={28} />
          </button>
        ))}
        {hidden.length > 0 && (
          <div className="btb-popover-wrap" ref={more.ref}>
            <button type="button" className={`btb-avatar btb-more ${hidden.some((m) => assigneeIds.includes(String(m.userId))) ? 'is-selected' : ''}`} aria-expanded={more.open} aria-label={t('Ещё участники')} onClick={() => more.setOpen((v) => !v)}>
              +{hidden.length}
            </button>
            {more.open && (
              <div className="btb-popover" role="menu">
                {hidden.map((m) => (
                  <CheckRow key={m.userId} checked={assigneeIds.includes(String(m.userId))} onChange={() => toggle('assigneeIds', String(m.userId))}>
                    <AssigneeAvatar userId={m.userId} displayName={m.displayName} avatarUrl={m.avatarUrl} size={20} />
                    <span>{m.displayName}</span>
                  </CheckRow>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="btb-popover-wrap" ref={filter.ref}>
        <button type="button" className={`btb-btn ${filterCount ? 'is-active' : ''}`} aria-expanded={filter.open} onClick={() => filter.setOpen((v) => !v)}>
          <FilterIcon />{t('Фильтр')}{filterCount > 0 && <span className="btb-count">{filterCount}</span>}
        </button>
        {filter.open && (
          <div className="btb-popover btb-filter-panel" role="dialog" aria-label={t('Фильтр')}>
            <section>
              <h4>{t('Тип задачи')}</h4>
              {typeChoices.map((type) => (
                <CheckRow key={type.token} checked={types.includes(type.token)} onChange={() => toggle('types', type.token)}>
                  <IssueTypeIcon issueType={type.issueType} typeId={type.typeId} size={16} /><span>{t(type.name)}</span>
                </CheckRow>
              ))}
            </section>
            <section>
              <h4>{t('Приоритет')}</h4>
              {PRIORITIES.map(([value, label]) => (
                <CheckRow key={value} checked={priorities.includes(value)} onChange={() => toggle('priorities', value)}>
                  <PriorityIcon priority={value} size={16} /><span>{t(label)}</span>
                </CheckRow>
              ))}
            </section>
            {labels.length > 0 && (
              <section>
                <h4>{t('Метки')}</h4>
                {labels.map((label) => (
                  <CheckRow key={label} checked={chosenLabels.includes(label)} onChange={() => toggle('labels', label)}><span>{label}</span></CheckRow>
                ))}
              </section>
            )}
            {filterCount > 0 && (
              <button type="button" className="btb-clear" onClick={() => onFiltersChange({ ...filters, types: [], priorities: [], labels: [] })}>{t('Очистить фильтры')}</button>
            )}
          </div>
        )}
      </div>

      <div className="btb-popover-wrap" ref={group.ref}>
        <button type="button" className={`btb-btn ${groupBy !== 'none' ? 'is-active' : ''}`} aria-expanded={group.open} onClick={() => group.setOpen((v) => !v)}>
          <GroupIcon />{groupBy === 'none' ? t('Группа') : `${t('Группа')}: ${t(groupLabel)}`}
        </button>
        {group.open && (
          <div className="btb-popover" role="menu" aria-label={t('Группа')}>
            {GROUP_OPTIONS.map(([value, label]) => (
              <button key={value} type="button" role="menuitemradio" aria-checked={groupBy === value} className={`btb-menu-item ${groupBy === value ? 'is-selected' : ''}`} onClick={() => { onGroupByChange(value); group.setOpen(false); }}>
                {t(label)}
              </button>
            ))}
          </div>
        )}
      </div>

      {(query || assigneeIds.length > 0 || filterCount > 0) && (
        <button type="button" className="btb-link" onClick={() => { onQueryChange(''); onFiltersChange({ assigneeIds: [], types: [], priorities: [], labels: [] }); }}>{t('Очистить всё')}</button>
      )}

      <div className="btb-end">{children}</div>
    </div>
  );
}
