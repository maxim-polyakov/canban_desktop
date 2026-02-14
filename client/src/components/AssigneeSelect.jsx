import React, { useState, useRef, useEffect } from 'react';
import AssigneeAvatar from './AssigneeAvatar';
import './AssigneeSelect.css';

export default function AssigneeSelect({ value, options = [], onChange, placeholder = '— назначить —' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onOutside);
    return () => document.removeEventListener('pointerdown', onOutside);
  }, [open]);

  const selected = options.find((m) => m.userId === value);

  const handleSelect = (userId) => {
    onChange(userId || null);
    setOpen(false);
  };

  return (
    <div className="assignee-select" ref={ref}>
      <button
        type="button"
        className="assignee-select-trigger"
        onClick={() => setOpen((o) => !o)}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {selected ? (
          <>
            <AssigneeAvatar displayName={selected.displayName} avatarUrl={selected.avatarUrl} size={22} />
            <span className="assignee-select-trigger-label">{selected.displayName}</span>
          </>
        ) : (
          <span className="assignee-select-placeholder">{placeholder}</span>
        )}
        <span className="assignee-select-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <ul className="assignee-select-dropdown" onPointerDown={(e) => e.stopPropagation()}>
          <li>
            <button type="button" className="assignee-select-option" onClick={() => handleSelect('')}>
              <span className="assignee-select-option-placeholder">{placeholder}</span>
            </button>
          </li>
          {options.map((m) => (
            <li key={m.userId}>
              <button
                type="button"
                className={'assignee-select-option' + (value === m.userId ? ' assignee-select-option-selected' : '')}
                onClick={() => handleSelect(m.userId)}
              >
                <AssigneeAvatar displayName={m.displayName} avatarUrl={m.avatarUrl} size={24} />
                <span>{m.displayName}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
