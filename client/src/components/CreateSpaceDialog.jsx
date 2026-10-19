import React, { useEffect, useState } from 'react';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { boards as boardsApi, sprints as sprintsApi, teams as teamsApi } from '../api.js';
import NavIcon from './NavIcons.jsx';
import { isValidSpaceKey, suggestSpaceKey } from '../utils/spaceKey.js';

export const SPACE_TEMPLATES = [
  {
    id: 'kanban',
    icon: 'board',
    title: 'Канбан',
    description: 'Визуализируйте работу на доске и ограничивайте незавершённую работу, чтобы задачи двигались быстрее.',
  },
  {
    id: 'scrum',
    icon: 'releases',
    title: 'Scrum',
    description: 'Планируйте спринты, ведите бэклог и отслеживайте скорость команды.',
  },
  {
    id: 'bugs',
    icon: 'issues',
    title: 'Отслеживание ошибок',
    description: 'Собирайте, приоритизируйте и исправляйте ошибки в одном списке.',
  },
];

const NEW_TEAM = '__new__';

export default function CreateSpaceDialog({ open, initialTemplate, teamsWithBoards, onClose, onCreated }) {
  const { t } = useLocalization();
  const [template, setTemplate] = useState('kanban');
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTemplate(initialTemplate || 'kanban');
    setName(''); setKey(''); setKeyTouched(false); setError(''); setNewTeamName('');
    setTeamId(teamsWithBoards[0]?.team.id || NEW_TEAM);
  }, [open, initialTemplate, teamsWithBoards]);

  if (!open) return null;

  const effectiveKey = keyTouched ? key : suggestSpaceKey(name);
  const keyOk = isValidSpaceKey(effectiveKey);
  const canSubmit = name.trim() && keyOk && (teamId !== NEW_TEAM || newTeamName.trim()) && !saving;

  const submit = async (event) => {
    event.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    try {
      let targetTeam = teamId;
      if (teamId === NEW_TEAM) {
        const team = await teamsApi.create({ name: newTeamName.trim(), key: effectiveKey });
        targetTeam = team.id;
      }
      const board = await boardsApi.create({ name: name.trim(), teamId: targetTeam, keyPrefix: effectiveKey, description: t(SPACE_TEMPLATES.find((x) => x.id === template).title) });
      if (template === 'scrum') {
        await sprintsApi.create(board.id, { name: `${effectiveKey} ${t('Спринт')} 1`, goal: null, startDate: null, endDate: null }).catch(() => {});
      }
      onCreated?.(board, template);
    } catch (err) {
      setError(err?.message || t('Не удалось создать раздел'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="app-modal app-modal-wide" role="dialog" aria-modal="true" aria-label={t('Создать раздел')} onSubmit={submit}>
        <div className="app-modal-header">
          <h2>{t('Создать раздел')}</h2>
          <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={onClose}><NavIcon name="close" /></button>
        </div>
        <div className="app-modal-body">
          <div className="app-template-grid" role="radiogroup" aria-label={t('Шаблон')}>
            {SPACE_TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                role="radio"
                aria-checked={template === tpl.id}
                className={`app-template-card ${template === tpl.id ? 'is-selected' : ''}`}
                onClick={() => setTemplate(tpl.id)}
              >
                <span className="app-template-icon"><NavIcon name={tpl.icon} size={20} /></span>
                <span className="app-template-title">{t(tpl.title)}</span>
                <span className="app-template-desc">{t(tpl.description)}</span>
              </button>
            ))}
          </div>
          <p className="app-modal-hint">{t('Обязательные поля отмечены звёздочкой')} <span className="app-required">*</span></p>
          <label className="app-field">
            <span>{t('Имя')} <span className="app-required">*</span></span>
            <input value={name} maxLength={200} autoFocus onChange={(e) => setName(e.target.value)} placeholder={t('Попробуйте название команды, проекта или цели')} required />
          </label>
          <label className="app-field">
            <span>{t('Ключ')} <span className="app-required">*</span></span>
            <input
              value={effectiveKey}
              maxLength={10}
              onChange={(e) => { setKeyTouched(true); setKey(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')); }}
              aria-invalid={!keyOk && effectiveKey !== ''}
            />
            <small className="app-field-help">{t('Ключ используется как префикс задач, например')} {effectiveKey || 'KAN'}-1</small>
          </label>
          <label className="app-field">
            <span>{t('Команда')} <span className="app-required">*</span></span>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {teamsWithBoards.map(({ team }) => <option key={team.id} value={team.id}>{team.name}</option>)}
              <option value={NEW_TEAM}>{t('+ Новая команда')}</option>
            </select>
          </label>
          {teamId === NEW_TEAM && (
            <label className="app-field">
              <span>{t('Название команды')} <span className="app-required">*</span></span>
              <input value={newTeamName} maxLength={200} onChange={(e) => setNewTeamName(e.target.value)} required />
            </label>
          )}
          {error && <p className="app-modal-error" role="alert">{error}</p>}
        </div>
        <div className="app-modal-footer">
          <button type="button" className="app-btn app-btn-subtle" onClick={onClose}>{t('Отмена')}</button>
          <button type="submit" className="app-btn app-btn-primary" disabled={!canSubmit}>{saving ? '…' : t('Создать раздел')}</button>
        </div>
      </form>
    </div>
  );
}
