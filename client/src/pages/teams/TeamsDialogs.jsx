import React, { useEffect, useState } from 'react';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { kudos as kudosApi, people as peopleApi, teams as teamsApi, users as usersApi } from '../../api.js';
import NavIcon from '../../components/NavIcons.jsx';
import PeoplePicker from '../../components/PeoplePicker.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { suggestSpaceKey } from '../../utils/spaceKey.js';

export const KUDOS_KINDS = [
  ['thanks', '🙏', 'Спасибо'],
  ['teamwork', '🤝', 'Командная работа'],
  ['help', '🛟', 'Помощь'],
  ['idea', '💡', 'Отличная идея'],
  ['celebrate', '🎉', 'Поздравляю'],
];

export const kudosKindMeta = (kind) => KUDOS_KINDS.find(([k]) => k === kind) || KUDOS_KINDS[0];

function Modal({ title, onClose, onSubmit, children, footer }) {
  const { t } = useLocalization();
  return (
    <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className="app-modal" role="dialog" aria-modal="true" aria-label={title} onSubmit={onSubmit}>
        <div className="app-modal-header">
          <h2>{title}</h2>
          <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={onClose}><NavIcon name="close" /></button>
        </div>
        <div className="app-modal-body">{children}</div>
        <div className="app-modal-footer">{footer}</div>
      </form>
    </div>
  );
}

const PROFILE_FIELDS = [
  ['jobTitle', 'Должность', 120],
  ['department', 'Отдел', 120],
  ['organization', 'Организация', 120],
  ['location', 'Местоположение', 120],
];

export function EditProfileDialog({ open, profile, focusAbout = false, onClose, onSaved }) {
  const { t } = useLocalization();
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    setError('');
    setForm({
      jobTitle: profile?.jobTitle || '',
      department: profile?.department || '',
      organization: profile?.organization || '',
      location: profile?.location || '',
      aboutMe: profile?.aboutMe || '',
    });
  }, [open, profile]);
  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      onSaved?.(await peopleApi.saveMyProfile(form));
    } catch (err) {
      setError(err?.message || t('Не удалось сохранить'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={focusAbout ? t('Работа со мной') : t('Сведения о роли')}
      onClose={onClose}
      onSubmit={submit}
      footer={<>
        <button type="button" className="app-btn app-btn-subtle" onClick={onClose}>{t('Отмена')}</button>
        <button type="submit" className="app-btn app-btn-primary" disabled={saving}>{saving ? '…' : t('Сохранить')}</button>
      </>}
    >
      {!focusAbout && PROFILE_FIELDS.map(([key, label, max], index) => (
        <label key={key} className="app-field">
          <span>{t(label)}</span>
          <input value={form[key] ?? ''} maxLength={max} autoFocus={index === 0} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
        </label>
      ))}
      <label className="app-field">
        <span>{t('Работа со мной')}</span>
        <textarea
          rows={4}
          value={form.aboutMe ?? ''}
          maxLength={2000}
          autoFocus={focusAbout}
          placeholder={t('Например: предпочитаю асинхронные обновления в задачах. По срочным вопросам пишите с 9:00 до 18:00.')}
          onChange={(e) => setForm((f) => ({ ...f, aboutMe: e.target.value }))}
        />
      </label>
      {error && <p className="app-modal-error" role="alert">{error}</p>}
    </Modal>
  );
}

export function CreateTeamDialog({ open, onClose, onCreated }) {
  const { t } = useLocalization();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [picked, setPicked] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();
  useEffect(() => { if (open) { setName(''); setDescription(''); setPicked([]); setError(''); } }, [open]);
  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const team = await teamsApi.create({ name: name.trim(), description: description.trim() || null, key: suggestSpaceKey(name) || undefined });
      const failed = [];
      for (const person of picked) {
        const result = await teamsApi.inviteUser(team.id, person.id);
        if (!result.ok) failed.push(`${person.displayName}: ${result.error}`);
      }
      onCreated?.(team, failed);
    } catch (err) {
      setError(err?.message || t('Не удалось создать команду'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t('Создать команду')}
      onClose={onClose}
      onSubmit={submit}
      footer={<>
        <button type="button" className="app-btn app-btn-subtle" onClick={onClose}>{t('Отмена')}</button>
        <button type="submit" className="app-btn app-btn-primary" disabled={saving || !name.trim()}>{saving ? '…' : t('Создать')}</button>
      </>}
    >
      <p className="app-modal-hint">{t('Объединяйте людей, чтобы вместе работать в разделах, назначать задачи и следить за целями.')}</p>
      <label className="app-field">
        <span>{t('Название команды')} <span className="app-required">*</span></span>
        <input value={name} maxLength={200} autoFocus onChange={(e) => setName(e.target.value)} required />
      </label>
      <label className="app-field">
        <span>{t('Описание')}</span>
        <textarea rows={3} value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} placeholder={t('Над чем работает команда и как с ней связаться')} />
      </label>
      <div className="app-field">
        <label htmlFor="create-team-people">{t('Пригласить участников')}</label>
        <PeoplePicker id="create-team-people" value={picked} onChange={setPicked} excludeIds={user?.id ? [user.id] : []} disabled={saving} />
      </div>
      {error && <p className="app-modal-error" role="alert">{error}</p>}
    </Modal>
  );
}

export function InvitePeopleDialog({ open, teams, defaultTeamId, onClose, onDone }) {
  const { t } = useLocalization();
  const [teamId, setTeamId] = useState('');
  const [picked, setPicked] = useState([]);
  const [memberIds, setMemberIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!open) return;
    setTeamId(defaultTeamId || teams[0]?.id || ''); setPicked([]); setResult(null);
  }, [open, defaultTeamId, teams]);
  useEffect(() => {
    if (!open || !teamId) return;
    teamsApi.getMembers(teamId).then((list) => setMemberIds((list || []).map((m) => m.userId))).catch(() => setMemberIds([]));
  }, [open, teamId]);
  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!teamId || picked.length === 0) return;
    setSaving(true);
    const sent = [];
    const failed = [];
    for (const person of picked) {
      const r = await teamsApi.inviteUser(teamId, person.id);
      if (r.ok) sent.push(person.displayName); else failed.push(`${person.displayName}: ${r.error}`);
    }
    setSaving(false);
    setResult({ sent, failed });
    if (sent.length) { setPicked([]); onDone?.(); }
  };

  return (
    <Modal
      title={t('Добавить пользователей')}
      onClose={onClose}
      onSubmit={submit}
      footer={<>
        <button type="button" className="app-btn app-btn-subtle" onClick={onClose}>{t('Закрыть')}</button>
        <button type="submit" className="app-btn app-btn-primary" disabled={saving || !teamId || picked.length === 0}>{saving ? '…' : t('Пригласить')}</button>
      </>}
    >
      {teams.length === 0 ? <p className="app-modal-hint">{t('Сначала создайте команду, чтобы приглашать в неё людей.')}</p> : (
        <>
          <label className="app-field">
            <span>{t('Команда')} <span className="app-required">*</span></span>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>
          <div className="app-field">
            <label htmlFor="invite-people-search">{t('Пользователи')} <span className="app-required">*</span></label>
            <PeoplePicker id="invite-people-search" value={picked} onChange={setPicked} excludeIds={memberIds} autoFocus disabled={saving} />
          </div>
          <p className="app-modal-hint">{t('Пользователь получит приглашение и появится в команде после его принятия.')}</p>
        </>
      )}
      {result?.sent.length > 0 && <p className="app-modal-success">{t('Приглашения отправлены')}: {result.sent.join(', ')}</p>}
      {result?.failed.length > 0 && <p className="app-modal-error" role="alert">{result.failed.join('; ')}</p>}
    </Modal>
  );
}

export function SendKudosDialog({ open, defaultUserId, currentUserId, onClose, onSent }) {
  const { t } = useLocalization();
  const [userList, setUserList] = useState([]);
  const [toUserId, setToUserId] = useState('');
  const [kind, setKind] = useState('thanks');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setKind('thanks'); setMessage(''); setError('');
    setToUserId(defaultUserId || '');
    usersApi.getAll().then((list) => setUserList((Array.isArray(list) ? list : []).filter((u) => u.id !== currentUserId))).catch(() => {});
  }, [open, defaultUserId, currentUserId]);
  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!toUserId || !message.trim()) return;
    setSaving(true);
    setError('');
    try {
      const sent = await kudosApi.send({ toUserId, kind, message: message.trim() });
      onSent?.(sent);
    } catch (err) {
      setError(err?.message || t('Не удалось отправить похвалу'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t('Отправить похвалу')}
      onClose={onClose}
      onSubmit={submit}
      footer={<>
        <button type="button" className="app-btn app-btn-subtle" onClick={onClose}>{t('Отмена')}</button>
        <button type="submit" className="app-btn app-btn-primary" disabled={saving || !toUserId || !message.trim()}>{saving ? '…' : t('Отправить')}</button>
      </>}
    >
      <label className="app-field">
        <span>{t('Кому')} <span className="app-required">*</span></span>
        <select value={toUserId} onChange={(e) => setToUserId(e.target.value)} required>
          <option value="" disabled>{t('Выберите человека')}</option>
          {userList.map((u) => <option key={u.id} value={u.id}>{u.displayName}</option>)}
        </select>
      </label>
      <div className="app-field">
        <span>{t('За что')}</span>
        <div className="kudos-kind-picker" role="radiogroup" aria-label={t('За что')}>
          {KUDOS_KINDS.map(([value, emoji, label]) => (
            <button key={value} type="button" role="radio" aria-checked={kind === value} className={`kudos-kind ${kind === value ? 'is-selected' : ''}`} onClick={() => setKind(value)}>
              <span aria-hidden="true">{emoji}</span>{t(label)}
            </button>
          ))}
        </div>
      </div>
      <label className="app-field">
        <span>{t('Сообщение')} <span className="app-required">*</span></span>
        <textarea rows={4} value={message} maxLength={1000} onChange={(e) => setMessage(e.target.value)} placeholder={t('Расскажите, чем вам помог этот человек')} required />
      </label>
      {error && <p className="app-modal-error" role="alert">{error}</p>}
    </Modal>
  );
}
