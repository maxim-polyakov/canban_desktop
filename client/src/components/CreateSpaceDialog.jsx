import React, { useEffect, useMemo, useState } from 'react';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { boards as boardsApi, sprints as sprintsApi, teams as teamsApi } from '../api.js';
import NavIcon from './NavIcons.jsx';
import { isValidSpaceKey, suggestSpaceKey } from '../utils/spaceKey.js';
import { ACCESS_LEVELS, MANAGEMENT_TYPES, useSpaceTemplates } from '../utils/spaceFeatures.js';
import { WorkflowPreview } from '../pages/spaces/SpaceTemplatesPage.jsx';
import '../pages/spaces/SpaceTemplates.css';

const NEW_TEAM = '__new__';

const TYPE_POINTS = {
  team: ['Настройка за несколько минут', 'Свои статусы, поля и типы работ', 'Подходит для независимых команд'],
  company: ['Общие схемы и workflow', 'Управляют администраторы', 'Подходит для стандартизованных процессов'],
};

export default function CreateSpaceDialog({ open, initialTemplate, teamsWithBoards, onClose, onCreated, onChangeTemplate }) {
  const { t } = useLocalization();
  const { templates } = useSpaceTemplates();
  const [step, setStep] = useState('type');
  const [managementType, setManagementType] = useState('team');
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [newTeamName, setNewTeamName] = useState('');
  const [access, setAccess] = useState('private');
  const [copySettings, setCopySettings] = useState(false);
  const [copyFrom, setCopyFrom] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const allBoards = useMemo(
    () => teamsWithBoards.flatMap(({ team, boards }) => boards.map((b) => ({ ...b, teamName: team.name }))),
    [teamsWithBoards],
  );

  useEffect(() => {
    if (!open) return;
    setStep('type'); setManagementType('team');
    setName(''); setKey(''); setKeyTouched(false); setError(''); setNewTeamName('');
    setAccess('private'); setCopySettings(false); setCopyFrom('');
    setTeamId(teamsWithBoards[0]?.team.id || NEW_TEAM);
  }, [open, initialTemplate, teamsWithBoards]);

  if (!open) return null;

  const template = templates.find((x) => x.id === initialTemplate) || templates.find((x) => x.id === 'kanban');
  const effectiveKey = keyTouched ? key : suggestSpaceKey(name);
  const keyOk = isValidSpaceKey(effectiveKey);
  const canSubmit = template && name.trim() && keyOk && (teamId !== NEW_TEAM || newTeamName.trim()) && (!copySettings || copyFrom) && !saving;

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
      const board = await boardsApi.create({
        name: name.trim(),
        teamId: targetTeam,
        keyPrefix: effectiveKey,
        description: t(template.title),
        template: template.id,
        managementType,
        access,
        copySettingsFromBoardId: copySettings ? copyFrom : null,
      });
      if (template.createsSprint) {
        await sprintsApi.create(board.id, { name: `${effectiveKey} ${t('Спринт')} 1`, goal: null, startDate: null, endDate: null }).catch(() => {});
      }
      onCreated?.(board, template.id);
    } catch (err) {
      setError(err?.message || t('Не удалось создать раздел'));
    } finally {
      setSaving(false);
    }
  };

  const side = template && (
    <aside className="wiz-side">
      <div className={`tpl-card-art tpl-cat-${template.category}`}><NavIcon name={template.icon} size={28} /></div>
      <h3>{t(template.title)}</h3>
      <p>{t(template.description)}</p>
      <WorkflowPreview columns={template.columns} />
      <p style={{ marginTop: 12 }}>
        {t('Тип')}: <strong>{t(MANAGEMENT_TYPES.find(([id]) => id === managementType)[1])}</strong>
      </p>
      <button type="button" className="wiz-change" onClick={onChangeTemplate}>{t('Сменить шаблон')}</button>
    </aside>
  );

  return (
    <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="app-modal wiz-modal" role="dialog" aria-modal="true" aria-label={t('Создать раздел')} onSubmit={submit}>
        <div className="app-modal-header">
          <div>
            <div className="wiz-steps">
              <span className={step === 'type' ? 'is-current' : ''}>1. {t('Тип раздела')}</span>
              <span>›</span>
              <span className={step === 'details' ? 'is-current' : ''}>2. {t('Данные раздела')}</span>
            </div>
            <h2>{step === 'type' ? t('Выберите тип раздела') : t('Добавьте данные раздела')}</h2>
          </div>
          <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={onClose}><NavIcon name="close" /></button>
        </div>

        {step === 'type' ? (
          <div className="app-modal-body">
            <div className="wiz-types">
              {MANAGEMENT_TYPES.map(([id, title, description]) => (
                <div key={id} className="wiz-type">
                  <h3>{t(title)}</h3>
                  <p>{t(description)}</p>
                  <ul>{TYPE_POINTS[id].map((point) => <li key={point}>{t(point)}</li>)}</ul>
                  <button type="button" className={`app-btn ${id === 'team' ? 'app-btn-primary' : ''}`} onClick={() => { setManagementType(id); setStep('details'); }}>
                    {t('Выбрать')}
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="app-modal-body wiz-body">
            <div>
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
              <label className="app-field">
                <span>{t('Доступ')}</span>
                <select value={access} onChange={(e) => setAccess(e.target.value)}>
                  {ACCESS_LEVELS.map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}
                </select>
                <small className="wiz-access-desc">{t(ACCESS_LEVELS.find(([id]) => id === access)[2])}</small>
              </label>
              {allBoards.length > 0 && (
                <>
                  <label className="wiz-check">
                    <input type="checkbox" checked={copySettings} onChange={(e) => { setCopySettings(e.target.checked); if (!copyFrom) setCopyFrom(allBoards[0].id); }} />
                    {t('Использовать настройки существующего раздела')}
                  </label>
                  {copySettings && (
                    <label className="app-field">
                      <span>{t('Раздел, из которого взять workflow и функции')}</span>
                      <select value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
                        {allBoards.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.keyPrefix})</option>)}
                      </select>
                    </label>
                  )}
                </>
              )}
              {error && <p className="app-modal-error" role="alert">{error}</p>}
            </div>
            {side}
          </div>
        )}

        <div className="app-modal-footer">
          {step === 'details'
            ? <button type="button" className="app-btn app-btn-subtle" onClick={() => setStep('type')}>{t('Назад')}</button>
            : <button type="button" className="app-btn app-btn-subtle" onClick={onChangeTemplate}>{t('Назад к шаблонам')}</button>}
          {step === 'details' && (
            <button type="submit" className="app-btn app-btn-primary" disabled={!canSubmit}>{saving ? '…' : t('Создать')}</button>
          )}
        </div>
      </form>
    </div>
  );
}
