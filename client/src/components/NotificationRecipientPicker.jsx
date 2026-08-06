import React, { useMemo, useState } from 'react';
import './NotificationRecipientPicker.css';

export default function NotificationRecipientPicker({ members = [], selectedIds = [], onChange, disabled = false }) {
  const [query, setQuery] = useState('');
  const normalized = query.trim().toLowerCase();
  const selected = members.filter((member) => selectedIds.includes(member.userId));
  const matches = useMemo(() => {
    if (!normalized) return [];
    return members
      .filter((member) => !selectedIds.includes(member.userId))
      .filter((member) =>
        member.displayName?.toLowerCase().includes(normalized)
        || member.email?.toLowerCase().includes(normalized))
      .slice(0, 6);
  }, [members, selectedIds, normalized]);

  const add = (userId) => {
    onChange?.([...selectedIds, userId]);
    setQuery('');
  };

  return (
    <div className="notification-recipient-picker">
      <div className="notification-recipient-tags">
        {selected.map((member) => (
          <span key={member.userId} className="notification-recipient-tag">
            <span title={member.email}>{member.displayName}</span>
            <button type="button" disabled={disabled} onClick={() => onChange?.(selectedIds.filter((id) => id !== member.userId))}>✕</button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={query}
        disabled={disabled}
        placeholder="Введите имя или email участника"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && matches.length > 0) {
            event.preventDefault();
            add(matches[0].userId);
          }
        }}
      />
      {normalized && (
        <ul className="notification-recipient-results">
          {matches.length > 0 ? matches.map((member) => (
            <li key={member.userId}>
              <button type="button" onClick={() => add(member.userId)}>
                <strong>{member.displayName}</strong>
                <span>{member.email}</span>
              </button>
            </li>
          )) : <li className="notification-recipient-empty">Участник команды не найден</li>}
        </ul>
      )}
    </div>
  );
}
