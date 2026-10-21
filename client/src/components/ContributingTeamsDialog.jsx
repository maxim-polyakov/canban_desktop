import React, { useEffect, useMemo, useRef, useState } from 'react';
import { contributingTeams, teams as teamsApi } from '../api.js';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import NavIcon from './NavIcons.jsx';
import './ContributingTeamsDialog.css';

const COLORS = ['#1f845a', '#0c66e4', '#6e5dc6', '#c25100', '#ae2e24', '#206a83', '#943d73', '#5b7f24'];

export function teamColor(id = '') {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

export const TeamAvatar = ({ team, size = 24 }) => (
  <span className="ct-avatar" style={{ width: size, height: size, background: teamColor(team.id) }} aria-hidden="true">
    <NavIcon name="teams" size={Math.round(size * 0.6)} />
  </span>
);

export function memberCountText(count, t) {
  const n = Math.abs(count) % 100;
  const last = n % 10;
  const word = n > 10 && n < 20 ? 'участников' : last === 1 ? 'участник' : last >= 2 && last <= 4 ? 'участника' : 'участников';
  return `${count} ${t(word)}`;
}

const Illustration = () => (
  <svg className="ct-illustration" viewBox="0 0 400 120" aria-hidden="true">
    <rect width="400" height="120" fill="#dcfff1" />
    <g transform="translate(60 12) rotate(-3)">
      <rect width="210" height="46" rx="8" fill="#fff" stroke="#c7d1db" />
      <rect x="10" y="9" width="28" height="28" rx="6" fill="#4bce97" />
      <circle cx="21" cy="20" r="4" fill="#fff" /><circle cx="29" cy="22" r="3" fill="#fff" />
      <text x="48" y="28" fontSize="12" fontWeight="600" fill="#172b4d">Team Awesome</text>
      {['#f5cd47', '#9f8fef', '#6cc3e0', '#f87168'].map((c, i) => <circle key={c} cx={150 + i * 15} cy="23" r="10" fill={c} stroke="#fff" strokeWidth="2" />)}
    </g>
    <g transform="translate(36 66) rotate(4)">
      <rect width="96" height="38" rx="6" fill="#fff" stroke="#c7d1db" />
      <rect x="8" y="9" width="20" height="20" rx="4" fill="#579dff" />
      <path d="M36 16h44M36 24h30" stroke="#c7d1db" strokeWidth="3" strokeLinecap="round" />
    </g>
    <g transform="translate(150 70) rotate(-2)">
      <rect width="96" height="38" rx="6" fill="#fff" stroke="#c7d1db" />
      <rect x="8" y="9" width="20" height="20" rx="4" fill="#0c66e4" />
      <path d="M36 16h44M36 24h30" stroke="#c7d1db" strokeWidth="3" strokeLinecap="round" />
    </g>
    <g transform="translate(262 62) rotate(3)">
      <rect width="96" height="38" rx="6" fill="#fff" stroke="#c7d1db" />
      <rect x="8" y="9" width="20" height="20" rx="4" fill="#1d7afc" />
      <path d="M36 16h44M36 24h30" stroke="#c7d1db" strokeWidth="3" strokeLinecap="round" />
    </g>
    <path d="M330 18v14M323 25h14M352 34v8M348 38h8M300 8v8M296 12h8" stroke="#172b4d" strokeWidth="2" strokeLinecap="round" />
    <path d="M22 34l10 6M18 50h12M24 64l10-5" stroke="#172b4d" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

/** Jira's «Привязка участвующих команд» dialog opened from the space header. */
export default function ContributingTeamsDialog({ boardId, onClose, onSaved }) {
  const { t } = useLocalization();
  const [loaded, setLoaded] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [initialIds, setInitialIds] = useState([]);
  const [selected, setSelected] = useState([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState(null);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    let alive = true;
    contributingTeams.get(boardId).then((res) => {
      if (!alive) return;
      const teams = res?.teams || [];
      setSelected(teams);
      setInitialIds(teams.map((x) => x.id));
      setCanEdit(Boolean(res?.canEdit));
      setLoaded(true);
    }).catch((e) => { if (alive) { setError(e.message); setLoaded(true); } });
    return () => { alive = false; };
  }, [boardId]);

  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    const timer = setTimeout(() => {
      contributingTeams.search(boardId, query.trim()).then((res) => {
        if (!alive) return;
        setResults(res?.teams || []);
        setActive(0);
      }).catch(() => { if (alive) setResults([]); });
    }, 200);
    return () => { alive = false; clearTimeout(timer); };
  }, [open, query, boardId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { if (open) setOpen(false); else onClose(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const selectedIds = useMemo(() => new Set(selected.map((x) => x.id)), [selected]);
  const options = (results || []).filter((x) => !selectedIds.has(x.id));
  const name = query.trim();
  const exact = (results || []).some((x) => x.name.toLowerCase() === name.toLowerCase());
  const showCreate = name.length > 0 && !exact && !selected.some((x) => x.name.toLowerCase() === name.toLowerCase());
  const itemCount = options.length + (showCreate ? 1 : 0);
  const dirty = selected.length !== initialIds.length || selected.some((x, i) => x.id !== initialIds[i]);

  const add = (team) => {
    setSelected((list) => (list.some((x) => x.id === team.id) ? list : [...list, team]));
    setQuery('');
    setOpen(false);
    inputRef.current?.focus();
  };

  const create = async () => {
    setError('');
    try {
      const team = await teamsApi.create({ name });
      add({ id: team.id, name: team.name, memberCount: 1, members: [] });
      window.dispatchEvent(new CustomEvent('canban:spaces-changed'));
    } catch (e) { setError(t(e.message)); }
  };

  const choose = (index) => {
    if (index < options.length) add(options[index]);
    else if (showCreate) create();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((i) => (itemCount ? (i + 1) % itemCount : 0)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (itemCount ? (i - 1 + itemCount) % itemCount : 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (open && itemCount) choose(active); }
    else if (e.key === 'Backspace' && !query && selected.length) setSelected((list) => list.slice(0, -1));
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await contributingTeams.set(boardId, selected.map((x) => x.id));
      onSaved?.(res?.teams || []);
      onClose();
    } catch (e) {
      setError(t(e.message));
      setBusy(false);
    }
  };

  return (
    <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ct-modal" role="dialog" aria-modal="true" aria-labelledby="ct-title">
        <Illustration />
        <div className="ct-head">
          <h2 id="ct-title">{t('Привязка участвующих команд')}</h2>
          <button type="button" className="ct-close" aria-label={t('Закрыть')} onClick={onClose}><NavIcon name="close" size={14} /></button>
        </div>
        <p className="ct-text">{t('Добавьте команды, которые работают в этом разделе, чтобы все знали, к кому обратиться за помощью.')}</p>

        {canEdit && (
          <div className="ct-picker" ref={boxRef}>
            <div className={`ct-input ${open ? 'is-focused' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) { e.preventDefault(); inputRef.current?.focus(); } }}>
              <NavIcon name="teams" size={16} />
              {selected.map((team) => (
                <span key={team.id} className="ct-chip">
                  <TeamAvatar team={team} size={16} />
                  <span className="ct-chip-name">{team.name}</span>
                  <button type="button" aria-label={t('Удалить ${name}', { name: team.name })} onClick={() => setSelected((list) => list.filter((x) => x.id !== team.id))}>
                    <NavIcon name="close" size={10} />
                  </button>
                </span>
              ))}
              <input ref={inputRef} value={query} autoFocus placeholder={selected.length ? '' : t('Поиск и добавление команд')}
                aria-label={t('Поиск и добавление команд')} role="combobox" aria-expanded={open} aria-controls="ct-listbox" aria-autocomplete="list"
                onFocus={() => setOpen(true)} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onKeyDown={onKeyDown} />
            </div>
            {open && (
              <div className="ct-dropdown" id="ct-listbox" role="listbox">
                {results === null ? <p className="ct-empty">{t('Загрузка…')}</p> : (
                  <>
                    {options.length > 0 && <div className="ct-section">{t('Команды')}</div>}
                    {options.map((team, index) => (
                      <button key={team.id} type="button" role="option" aria-selected={index === active}
                        className={`ct-option ${index === active ? 'is-active' : ''}`}
                        onMouseEnter={() => setActive(index)} onMouseDown={(e) => e.preventDefault()} onClick={() => add(team)}>
                        <TeamAvatar team={team} size={24} />
                        <span className="ct-option-text">
                          <span className="ct-option-name">{team.name}</span>
                          <span className="ct-option-sub">{memberCountText(team.memberCount, t)}</span>
                        </span>
                        <span className="ct-faces">
                          {(team.members || []).slice(0, 3).map((m) => (
                            m.avatarUrl ? <img key={m.userId} src={m.avatarUrl} alt="" title={m.displayName} />
                              : <span key={m.userId} title={m.displayName}>{(m.displayName || '?').slice(0, 1).toUpperCase()}</span>
                          ))}
                        </span>
                      </button>
                    ))}
                    {showCreate && (
                      <button type="button" role="option" aria-selected={active === options.length}
                        className={`ct-option ct-create ${active === options.length ? 'is-active' : ''}`}
                        onMouseEnter={() => setActive(options.length)} onMouseDown={(e) => e.preventDefault()} onClick={create}>
                        <span className="ct-plus"><NavIcon name="plus" size={14} /></span>
                        <span className="ct-option-name">{t('Создать команду «${name}»', { name })}</span>
                      </button>
                    )}
                    {itemCount === 0 && <p className="ct-empty">{name ? t('Команды не найдены') : t('Все команды уже добавлены')}</p>}
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {loaded && !canEdit && (
          selected.length === 0
            ? <p className="ct-note">{t('К разделу пока не привязаны команды.')}</p>
            : (
              <ul className="ct-list">
                {selected.map((team) => (
                  <li key={team.id}><TeamAvatar team={team} size={24} /><span className="ct-option-name">{team.name}</span><span className="ct-option-sub">{memberCountText(team.memberCount, t)}</span></li>
                ))}
              </ul>
            )
        )}
        {loaded && !canEdit && <p className="ct-note">{t('Изменять команды раздела могут только его администраторы.')}</p>}
        {error && <p className="app-modal-error" role="alert">{error}</p>}

        <div className="ct-footer">
          <button type="button" className="app-btn app-btn-subtle" onClick={onClose}>{canEdit ? t('Отмена') : t('Закрыть')}</button>
          {canEdit && <button type="button" className="app-btn app-btn-primary" onClick={save} disabled={busy || !dirty}>{busy ? '…' : t('Сохранить')}</button>}
        </div>
      </div>
    </div>
  );
}
