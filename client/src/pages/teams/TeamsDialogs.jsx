import React, { useEffect, useState } from 'react';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { kudos as kudosApi, teams as teamsApi, users as usersApi } from '../../api.js';
import NavIcon from '../../components/NavIcons.jsx';
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

export function CreateTeamDialog({ open, onClose, onCreated }) {
  const { t } = useLocalization();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emails, setEmails] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { if (open) { setName(''); setDescription(''); setEmails(''); setError(''); } }, [open]);
  if (!open) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      const team = await teamsApi.create({ name: name.trim(), description: description.trim() || null, key: suggestSpaceKey(name) || undefined });
      const list = emails.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);
      const failed = [];
      for (const email of list) {
        const result = await teamsApi.inviteByEmail(team.id, email);
        if (!result.ok) failed.push(`${email}: ${result.error}`);
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
      <label className="app-field">
        <span>{t('Пригласить участников')}</span>
        <input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder={t('Адреса эл. почты через запятую')} />
      </label>
      {error && <p className="app-modal-error" role="alert">{error}</p>}
    </Modal>
  );
}

export function InvitePeopleDialog({ open, teams, defaultTeamId, onClose, onDone }) {
  const { t } = useLocalization();
  const [teamId, setTeamId] = useState('');
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState([]);
  const [people, setPeople] = useState([]);
  const [memberIds, setMemberIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!open) return;
    setTeamId(defaultTeamId || teams[0]?.id || ''); setQuery(''); setPicked([]); setResult(null);
    usersApi.getAll().then((list) => setPeople(Array.isArray(list) ? list : [])).catch(() => setPeople([]));
  }, [open, defaultTeamId, teams]);
  useEffect(() => {
    if (!open || !teamId) return;
    teamsApi.getMembers(teamId).then((list) => setMemberIds((list || []).map((m) => m.userId))).catch(() => setMemberIds([]));
  }, [open, teamId]);
  if (!open) return null;

  const needle = query.trim().toLowerCase();
  const pickedIds = picked.map((p) => p.id);
  const suggestions = needle && !needle.includes('@')
    ? people.filter((p) => !pickedIds.includes(p.id) && !memberIds.includes(p.id) && (p.displayName || '').toLowerCase().includes(needle)).slice(0, 8)
    : [];
  const emails = needle.includes('@') ? query.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean) : [];
  const pick = (person) => { setPicked((list) => [...list, person]); setQuery(''); };

  const submit = async (e) => {
    e.preventDefault();
    if (!teamId || (picked.length === 0 && emails.length === 0)) return;
    setSaving(true);
    const sent = [];
    const failed = [];
    for (const person of picked) {
      const r = await teamsApi.inviteUser(teamId, person.id);
      if (r.ok) sent.push(person.displayName); else failed.push(`${person.displayName}: ${r.error}`);
    }
    for (const email of emails) {
      const r = await teamsApi.inviteByEmail(teamId, email);
      if (r.ok) sent.push(email); else failed.push(`${email}: ${r.error}`);
    }
    setSaving(false);
    setResult({ sent, failed });
    if (sent.length) { setPicked([]); setQuery(''); onDone?.(); }
  };

  return (
    <Modal
      title={t('Добавить пользователей')}
      onClose={onClose}
      onSubmit={submit}
      footer={<>
        <button type="button" className="app-btn app-btn-subtle" onClick={onClose}>{t('Закрыть')}</button>
        <button type="submit" className="app-btn app-btn-primary" disabled={saving || !teamId || (picked.length === 0 && emails.length === 0)}>{saving ? '…' : t('Пригласить')}</button>
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
            {picked.length > 0 && (
              <div className="invite-picked">
                {picked.map((p) => (
                  <span key={p.id} className="invite-chip">
                    {p.displayName}
                    <button type="button" aria-label={t('Убрать')} onClick={() => setPicked((list) => list.filter((x) => x.id !== p.id))}><NavIcon name="close" size={12} /></button>
                  </span>
                ))}
              </div>
            )}
            <input id="invite-people-search" value={query} autoFocus autoComplete="off" onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && suggestions.length) { e.preventDefault(); pick(suggestions[0]); } }}
              placeholder={t('Имя или адрес эл. почты')} role="combobox" aria-expanded={suggestions.length > 0} aria-controls="invite-people-options" />
            {suggestions.length > 0 && (
              <ul className="invite-options" id="invite-people-options" role="listbox">
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
            {needle && !needle.includes('@') && suggestions.length === 0 && <span className="app-modal-hint">{t('Никого не найдено')}</span>}
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
