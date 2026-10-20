import React, { useEffect, useRef, useState } from 'react';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { teams as teamsApi } from '../api.js';
import NavIcon from './NavIcons.jsx';
import './TeamAvatar.css';

export const TEAM_AVATAR_PRESETS = [
  ['rocket', 'projects', '#1D7AFC'], ['target', 'goals', '#E2483D'], ['people', 'teams', '#22A06B'], ['star', 'star', '#F5CD47'],
  ['idea', 'bulb', '#FCA700'], ['chat', 'chat', '#6E5DC6'], ['code', 'code', '#0C66E4'], ['laptop', 'laptop', '#626F86'],
  ['box', 'box', '#C97CF4'], ['megaphone', 'megaphone', '#E56910'], ['chart', 'chart', '#1F845A'], ['calendar', 'calendar', '#CD519D'],
  ['globe', 'globe', '#2898BD'], ['sparkle', 'sparkle', '#AE4787'], ['bolt', 'automation', '#946F00'], ['cube', 'assets', '#5E4DB2'],
  ['board', 'board', '#0055CC'], ['docs', 'docs', '#44546F'], ['folder', 'folder', '#B38600'], ['network', 'network', '#206A83'],
  ['phone', 'phone', '#943D73'], ['moon', 'moon', '#352C63'], ['sun', 'sun', '#FF8F73'], ['server', 'server', '#216E4E'],
];
const presetByKey = new Map(TEAM_AVATAR_PRESETS.map(([key, icon, color]) => [key, { icon, color }]));

const DEFAULT_PRESETS = TEAM_AVATAR_PRESETS.filter(([key]) => key !== 'people');

/** Built-in avatar a team shows until it picks one; stable per team id (or name). */
export function defaultTeamPreset(seed = '') {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const [, icon, color] = DEFAULT_PRESETS[hash % DEFAULT_PRESETS.length];
  return { icon, color };
}

export default function TeamAvatar({ id = '', avatarUrl, name = '', size = 24, className = '' }) {
  const style = { width: size, height: size, borderRadius: Math.max(3, Math.round(size / 6)) };
  if (avatarUrl && !avatarUrl.startsWith('preset:')) {
    return <img src={avatarUrl} alt="" className={`team-avatar is-image ${className}`.trim()} style={style} />;
  }
  const preset = (avatarUrl && presetByKey.get(avatarUrl.slice(7))) || defaultTeamPreset(id || name);
  return (
    <span className={`team-avatar ${className}`.trim()} style={{ ...style, background: preset.color }} aria-hidden="true" title={name || undefined}>
      <NavIcon name={preset.icon} size={Math.round(size * 0.6)} />
    </span>
  );
}

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Popover like Jira's "Выбор аватара": built-in avatars plus upload by click or drag and drop. */
export function TeamAvatarPicker({ teamId, value, onChange, onClose }) {
  const { t } = useLocalization();
  const ref = useRef(null);
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const close = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey); };
  }, [onClose]);

  const run = async (action) => {
    setBusy(true);
    setError('');
    try {
      const team = await action();
      onChange(team?.avatarUrl ?? null);
    } catch (err) {
      setError(err?.message || t('Не удалось сохранить'));
    } finally {
      setBusy(false);
    }
  };

  const upload = (file) => {
    if (!file) return;
    if (!TYPES.includes(file.type)) { setError(t('Допустимые форматы: JPEG, PNG, WebP, GIF.')); return; }
    if (file.size > MAX_BYTES) { setError(t('Размер файла не должен превышать 2 МБ.')); return; }
    run(() => teamsApi.uploadAvatar(teamId, file));
  };

  return (
    <div className="team-avatar-picker" ref={ref} role="dialog" aria-label={t('Выбор аватара')}>
      <div className="team-avatar-picker-head">
        <strong>{t('Выбор аватара')}</strong>
        <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={onClose}><NavIcon name="close" size={14} /></button>
      </div>
      <div className="team-avatar-grid" role="listbox" aria-label={t('Аватары')}>
        {TEAM_AVATAR_PRESETS.map(([key]) => {
          const preset = `preset:${key}`;
          return (
            <button key={key} type="button" role="option" aria-selected={value === preset} className={`team-avatar-option ${value === preset ? 'is-selected' : ''}`}
              disabled={busy} onClick={() => run(() => teamsApi.setAvatar(teamId, preset))}>
              <TeamAvatar avatarUrl={preset} size={28} />
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className={`team-avatar-drop ${dragging ? 'is-dragging' : ''}`}
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files?.[0]); }}
      >
        <span className="team-avatar-drop-link">{busy ? t('Загрузка…') : t('Выберите изображение для загрузки')}</span>
        <span>{t('или перетащите его сюда')}</span>
      </button>
      <input ref={fileRef} type="file" accept={TYPES.join(',')} hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
      {value && (
        <button type="button" className="app-btn app-btn-subtle team-avatar-reset" disabled={busy} onClick={() => run(() => teamsApi.setAvatar(teamId, null))}>
          {t('Сбросить аватар')}
        </button>
      )}
      {error && <p className="app-modal-error" role="alert">{error}</p>}
    </div>
  );
}
