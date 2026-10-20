import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from '../../i18n/navigation.jsx';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { boards as boardsApi, spaces as spacesApi } from '../../api.js';
import SpaceAvatar, { SpaceAvatarPicker } from '../../components/SpaceAvatar.jsx';
import { SPACES_CHANGED_EVENT } from '../../components/AppSidebar.jsx';
import { DeleteSpaceDialog } from '../SpacesPage.jsx';
import { isValidSpaceKey } from '../../utils/spaceKey.js';
import SettingsShell, { SaveStatus, SettingsSection } from './SettingsShell.jsx';

export function spaceSettingsNav(boardId) {
  return {
    title: 'Настройки раздела',
    back: { to: `/board/${boardId}`, label: 'Назад к разделу' },
    groups: [
      { items: [[`/board/${boardId}/settings`, 'settings', 'Сведения']] },
      { title: 'Работа', items: [
        [`/board/${boardId}/workflow`, 'workflow', 'Рабочие процессы'],
        [`/board/${boardId}/components`, 'components', 'Компоненты'],
        [`/board/${boardId}/releases`, 'releases', 'Релизы'],
      ] },
      { title: 'Доступ', items: [[`/board/${boardId}/permissions`, 'lock', 'Разрешения']] },
      { title: 'Приложения', items: [
        [`/board/${boardId}/automations`, 'automation', 'Автоматизация'],
        [`/board/${boardId}/integrations`, 'integrations', 'Интеграции'],
        [`/board/${boardId}/operations`, 'operations', 'Импорт и экспорт'],
      ] },
    ],
  };
}

export default function SpaceSettingsPage() {
  const { boardId } = useParams();
  const { t } = useLocalization();
  const navigate = useNavigate();
  const [board, setBoard] = useState(null);
  const [meta, setMeta] = useState(null);
  const [form, setForm] = useState({ name: '', keyPrefix: '', description: '' });
  const [status, setStatus] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const closePicker = useCallback(() => setPickerOpen(false), []);
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    setBoard(null);
    boardsApi.getById(boardId).then((b) => {
      setBoard(b);
      setForm({ name: b.name || '', keyPrefix: b.keyPrefix || '', description: b.description || '' });
    }).catch((e) => setStatus(e.message || t('Не удалось загрузить раздел')));
    spacesApi.getMine().then((list) => setMeta(list.find((s) => s.id === boardId) || null)).catch(() => {});
  }, [boardId, t]);

  const dirty = board && (form.name !== (board.name || '') || form.keyPrefix !== (board.keyPrefix || '') || form.description !== (board.description || ''));
  const keyOk = isValidSpaceKey(form.keyPrefix);

  const save = async (event) => {
    event.preventDefault();
    if (!dirty || !form.name.trim() || !keyOk) return;
    setStatus('saving');
    try {
      const updated = await boardsApi.update(boardId, { name: form.name.trim(), description: form.description, keyPrefix: form.keyPrefix });
      setBoard((b) => ({ ...b, ...updated }));
      setStatus('saved');
      window.dispatchEvent(new CustomEvent(SPACES_CHANGED_EVENT));
    } catch (e) {
      setStatus(e.message || t('Не удалось сохранить изменения'));
    }
  };

  const confirmDelete = async () => {
    setDeleteBusy(true);
    setDeleteError('');
    const result = await boardsApi.delete(boardId).catch(() => ({ ok: false }));
    setDeleteBusy(false);
    if (result === true) {
      window.dispatchEvent(new CustomEvent(SPACES_CHANGED_EVENT));
      navigate('/spaces');
    } else {
      setDeleteError(result?.status === 403 ? t('Удалять раздел может только владелец команды или создатель раздела.') : t('Не удалось удалить раздел'));
    }
  };

  return (
    <SettingsShell
      nav={spaceSettingsNav(boardId)}
      breadcrumbs={[['Разделы', '/spaces'], [board?.name || '…', `/board/${boardId}`], ['Настройки раздела']]}
      title={t('Сведения')}
      actions={<SaveStatus state={status} />}
    >
      <form onSubmit={save}>
        <SettingsSection>
          <div className="space-settings-avatar">
            <SpaceAvatar id={boardId} name={form.name || '?'} avatarUrl={board?.avatarUrl} size={96} />
            <span className="app-space-avatar">
              <button type="button" className="app-btn" disabled={!board} onClick={() => setPickerOpen((v) => !v)}>{t('Изменить аватар')}</button>
              {pickerOpen && (
                <SpaceAvatarPicker boardId={boardId} value={board?.avatarUrl} onClose={closePicker}
                  onChange={(avatarUrl) => { setBoard((b) => ({ ...b, avatarUrl })); setPickerOpen(false); window.dispatchEvent(new CustomEvent(SPACES_CHANGED_EVENT)); }} />
              )}
            </span>
          </div>
          <label className="settings-field">
            <span>{t('Имя')} *</span>
            <input value={form.name} maxLength={200} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required disabled={!board} />
          </label>
          <label className="settings-field">
            <span>{t('Ключ')} *</span>
            <input value={form.keyPrefix} maxLength={10} onChange={(e) => setForm((f) => ({ ...f, keyPrefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }))} aria-invalid={!keyOk} disabled={!board} />
            <small>{t('Новые задачи получат ключи вида')} {form.keyPrefix || 'KAN'}-1. {t('Существующие ключи задач не меняются.')}</small>
          </label>
          <label className="settings-field">
            <span>{t('Описание')}</span>
            <textarea value={form.description} maxLength={2000} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} disabled={!board} />
          </label>
          <div className="settings-field">
            <span>{t('Руководитель раздела')}</span>
            <div>{meta?.leadName ? <Link to={`/profile/${meta.leadId}`}>{meta.leadName}</Link> : '—'} <small>({t('владелец команды')} {meta?.teamName || ''})</small></div>
          </div>
          <div className="settings-field">
            <span>{t('Тип')}</span>
            <div>{meta ? (meta.hasSprints ? 'Scrum' : 'Kanban') : '…'} · {meta?.issueCount ?? 0} {t('задач')}</div>
          </div>
          <button type="submit" className="app-btn app-btn-primary" disabled={!dirty || !form.name.trim() || !keyOk}>{t('Сохранить')}</button>
        </SettingsSection>
      </form>
      <SettingsSection title={t('Удалить раздел')} description={t('Раздел, его задачи, спринты и история будут удалены без возможности восстановления.')}>
        <button type="button" className="app-btn app-btn-danger" disabled={!board} onClick={() => { setDeleteError(''); setDeleting(true); }}>{t('Удалить раздел')}</button>
      </SettingsSection>
      {deleting && board && (
        <DeleteSpaceDialog space={{ id: boardId, name: board.name, key: board.keyPrefix }} busy={deleteBusy} error={deleteError} onCancel={() => setDeleting(false)} onConfirm={confirmDelete} />
      )}
    </SettingsShell>
  );
}
