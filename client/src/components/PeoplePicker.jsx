import React, { useEffect, useState } from 'react';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { users as usersApi } from '../api.js';
import NavIcon from './NavIcons.jsx';
import './PeoplePicker.css';

/** Pick site users by display name; emails are never shown. `value` is a list of { id, displayName, avatarUrl }. */
export default function PeoplePicker({ id, value, onChange, excludeIds = [], autoFocus = false, disabled = false, placeholder }) {
  const { t } = useLocalization();
  const [people, setPeople] = useState([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    usersApi.getAll().then((list) => setPeople(Array.isArray(list) ? list : [])).catch(() => setPeople([]));
  }, []);

  const needle = query.trim().toLowerCase();
  const pickedIds = value.map((p) => p.id);
  const suggestions = needle
    ? people.filter((p) => !pickedIds.includes(p.id) && !excludeIds.includes(p.id) && (p.displayName || '').toLowerCase().includes(needle)).slice(0, 8)
    : [];
  const pick = (person) => {
    onChange([...value, { id: person.id, displayName: person.displayName, avatarUrl: person.avatarUrl }]);
    setQuery('');
  };
  const listId = `${id}-options`;

  return (
    <div className="people-picker">
      {value.length > 0 && (
        <div className="invite-picked">
          {value.map((p) => (
            <span key={p.id} className="invite-chip">
              {p.displayName}
              <button type="button" aria-label={t('Убрать')} onClick={() => onChange(value.filter((x) => x.id !== p.id))} disabled={disabled}><NavIcon name="close" size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <input
        id={id}
        value={query}
        autoFocus={autoFocus}
        autoComplete="off"
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && suggestions.length) { e.preventDefault(); pick(suggestions[0]); }
          if (e.key === 'Backspace' && !query && value.length) onChange(value.slice(0, -1));
        }}
        placeholder={placeholder || t('Начните вводить имя')}
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-controls={listId}
      />
      {suggestions.length > 0 && (
        <ul className="invite-options" id={listId} role="listbox">
          {suggestions.map((p) => (
            <li key={p.id} role="option" aria-selected="false">
              <button type="button" onClick={() => pick(p)}>
                {p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : <span className="invite-avatar">{(p.displayName || '?').slice(0, 1).toUpperCase()}</span>}
                {p.displayName}
              </button>
            </li>
          ))}
        </ul>
      )}
      {needle && suggestions.length === 0 && <span className="app-modal-hint">{t('Никого не найдено')}</span>}
    </div>
  );
}
