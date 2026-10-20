import React, { useEffect, useRef, useState } from 'react';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { boards as boardsApi } from '../api.js';
import NavIcon from './NavIcons.jsx';
import './SpaceAvatar.css';

// Jira project avatars are colourful rounded tiles; pick a stable colour per space.
const COLORS = ['#1D7AFC', '#22A06B', '#E2B203', '#F87462', '#8270DB', '#2898BD', '#E774BB', '#FEA362'];

export function spaceColor(id = '') {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export const SPACE_AVATAR_PRESETS = [
  ['rocket', 'projects', '#1D7AFC'], ['target', 'goals', '#E2483D'], ['people', 'teams', '#22A06B'], ['star', 'star', '#F5CD47'],
  ['idea', 'bulb', '#FCA700'], ['chat', 'chat', '#6E5DC6'], ['code', 'code', '#0C66E4'], ['laptop', 'laptop', '#626F86'],
  ['box', 'box', '#C97CF4'], ['megaphone', 'megaphone', '#E56910'], ['chart', 'chart', '#1F845A'], ['calendar', 'calendar', '#CD519D'],
  ['globe', 'globe', '#2898BD'], ['sparkle', 'sparkle', '#AE4787'], ['bolt', 'automation', '#946F00'], ['cube', 'assets', '#5E4DB2'],
  ['board', 'board', '#0055CC'], ['docs', 'docs', '#44546F'], ['folder', 'folder', '#B38600'], ['network', 'network', '#206A83'],
  ['phone', 'phone', '#943D73'], ['moon', 'moon', '#352C63'], ['sun', 'sun', '#FF8F73'], ['server', 'server', '#216E4E'],
];
const presetByKey = new Map(SPACE_AVATAR_PRESETS.map(([key, icon, color]) => [key, { icon, color }]));

/** Space avatar: uploaded photo, a built-in icon ("preset:<name>") or, by default, a coloured tile with the first letter. */
export default function SpaceAvatar({ id, name = '', avatarUrl, size = 20, className = '' }) {
  const radius = Math.max(3, Math.round(size / 5));
  if (avatarUrl && !avatarUrl.startsWith('preset:')) {
    return <img src={avatarUrl} alt="" className={`space-avatar is-image ${className}`.trim()} style={{ width: size, height: size, borderRadius: radius }} />;
  }
  const preset = avatarUrl && presetByKey.get(avatarUrl.slice(7));
  return (
    <span
      className={`space-avatar ${className}`.trim()}
      style={{ width: size, height: size, background: preset?.color || spaceColor(id), fontSize: Math.round(size * 0.5), borderRadius: radius }}
      aria-hidden="true"
    >
      {preset ? <NavIcon name={preset.icon} size={Math.round(size * 0.6)} /> : (name.trim()[0] || '?').toUpperCase()}
    </span>
  );
}

const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Popover like Jira's "Выбор аватара": built-in avatars plus upload by click or drag and drop. Parent must be position: relative. */
export function SpaceAvatarPicker({ boardId, value, onChange, onClose }) {
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
      const board = await action();
      onChange(board?.avatarUrl ?? null);
    } catch (err) {
      setError(err?.status === 403 ? t('Менять аватар могут только администраторы раздела.') : err?.message || t('Не удалось сохранить'));
    } finally {
      setBusy(false);
    }
  };

  const upload = (file) => {
    if (!file) return;
    if (!TYPES.includes(file.type)) { setError(t('Допустимые форматы: JPEG, PNG, WebP, GIF.')); return; }
    if (file.size > MAX_BYTES) { setError(t('Размер файла не должен превышать 2 МБ.')); return; }
    run(() => boardsApi.uploadAvatar(boardId, file));
  };

  return (
    <div className="space-avatar-picker" ref={ref} role="dialog" aria-label={t('Выбор аватара')}>
      <div className="space-avatar-picker-head">
        <strong>{t('Выбор аватара')}</strong>
        <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={onClose}><NavIcon name="close" size={14} /></button>
      </div>
      <div className="space-avatar-grid" role="listbox" aria-label={t('Аватары')}>
        {SPACE_AVATAR_PRESETS.map(([key]) => {
          const preset = `preset:${key}`;
          return (
            <button key={key} type="button" role="option" aria-selected={value === preset} className={`space-avatar-option ${value === preset ? 'is-selected' : ''}`}
              disabled={busy} onClick={() => run(() => boardsApi.setAvatar(boardId, preset))}>
              <SpaceAvatar avatarUrl={preset} size={28} />
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className={`space-avatar-drop ${dragging ? 'is-dragging' : ''}`}
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files?.[0]); }}
      >
        <span className="space-avatar-drop-link">{busy ? t('Загрузка…') : t('Выберите изображение для загрузки')}</span>
        <span>{t('или перетащите его сюда')}</span>
      </button>
      <input ref={fileRef} type="file" accept={TYPES.join(',')} hidden onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ''; }} />
      {value && (
        <button type="button" className="app-btn app-btn-subtle space-avatar-reset" disabled={busy} onClick={() => run(() => boardsApi.setAvatar(boardId, null))}>
          {t('Сбросить аватар')}
        </button>
      )}
      {error && <p className="app-modal-error" role="alert">{error}</p>}
    </div>
  );
}
