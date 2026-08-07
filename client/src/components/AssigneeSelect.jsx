import React, { useState, useRef, useEffect, useMemo } from 'react';
import AssigneeAvatar from './AssigneeAvatar';
import './AssigneeSelect.css';

export default function AssigneeSelect({ value, options = [], onChange, placeholder = '— назначить —' }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  const selectedIds = useMemo(() => Array.isArray(value) ? value : [], [value]);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, [open]);

  const normalized = query.trim().toLowerCase();
  const selected = useMemo(
    () => selectedIds.map((userId) => options.find((member) => member.userId === userId))
      .filter(Boolean),
    [options, selectedIds]
  );
  const matches = useMemo(() => {
    if (!normalized) return [];
    return options
      .filter((member) => !selectedIds.includes(member.userId))
      .filter((member) =>
        member.displayName?.toLowerCase().includes(normalized)
        || member.email?.toLowerCase().includes(normalized))
      .slice(0, 8);
  }, [options, selectedIds, normalized]);

  const handleSelect = (userId) => {
    onChange([...selectedIds, userId]);
    setQuery('');
    setOpen(true);
  };

  const handleRemove = (userId) => {
    onChange(selectedIds.filter((id) => id !== userId));
  };

  return (
    <div className="assignee-select" ref={ref} onPointerDown={(e) => e.stopPropagation()}>
      {selected.length > 0 && (
        <div className="assignee-select-tags">
          {selected.map((member) => (
            <span className="assignee-select-tag" key={member.userId}>
              <AssigneeAvatar displayName={member.displayName} avatarUrl={member.avatarUrl} size={22} />
              <span title={member.email}>{member.displayName}</span>
              <button type="button" onClick={() => handleRemove(member.userId)} title={`Убрать ${member.displayName}`}>✕</button>
            </span>
          ))}
        </div>
      )}
      <input
        type="text"
        className="assignee-select-search"
        value={query}
        placeholder={selected.length ? 'Добавить по имени или email' : `${placeholder} — имя или email`}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && matches.length > 0) {
            event.preventDefault();
            event.stopPropagation();
            handleSelect(matches[0].userId);
          }
          if (event.key === 'Escape') setOpen(false);
        }}
      />
      {open && normalized && (
        <ul className="assignee-select-dropdown" onPointerDown={(e) => e.stopPropagation()}>
          {matches.map((m) => (
            <li key={m.userId}>
              <button
                type="button"
                className="assignee-select-option"
                onPointerDown={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  handleSelect(m.userId);
                }}
              >
                <AssigneeAvatar displayName={m.displayName} avatarUrl={m.avatarUrl} size={24} />
                <span className="assignee-select-option-text">
                  <strong>{m.displayName}</strong>
                  <small>{m.email}</small>
                </span>
              </button>
            </li>
          ))}
          {matches.length === 0 && (
            <li className="assignee-select-empty">Участник команды не найден</li>
          )}
        </ul>
      )}
    </div>
  );
}
