import React, { useCallback, useEffect, useState } from 'react';
import { filterSubscriptions as api } from '../api.js';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import NavIcon from './NavIcons.jsx';
import './FilterSubscriptionsDialog.css';

export const WEEK_DAYS = [[1, 'Пн'], [2, 'Вт'], [3, 'Ср'], [4, 'Чт'], [5, 'Пт'], [6, 'Сб'], [7, 'Вс']];
const INTERVALS = [1, 2, 3, 4, 6, 8, 12];
const pad = (n) => String(n).padStart(2, '0');
const browserTimeZone = () => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; }
};

export const emptySubscription = () => ({
  groupId: '', frequency: 'daily', time: '09:00', daysOfWeek: [1, 2, 3, 4, 5], dayOfMonth: 1, intervalHours: 1,
  timeZone: browserTimeZone(), emailWhenEmpty: false,
});

export function toRequest(form) {
  const [hour, minute] = String(form.time || '09:00').split(':').map((x) => Number(x) || 0);
  return {
    groupId: form.groupId || null, frequency: form.frequency, hour, minute, daysOfWeek: form.daysOfWeek,
    dayOfMonth: Number(form.dayOfMonth) || 1, intervalHours: Number(form.intervalHours) || 1, timeZone: form.timeZone, emailWhenEmpty: form.emailWhenEmpty,
  };
}

const fromSubscription = (s) => ({
  groupId: s.groupId || '', frequency: s.frequency, time: `${pad(s.hour)}:${pad(s.minute)}`, daysOfWeek: s.daysOfWeek?.length ? s.daysOfWeek : [1, 2, 3, 4, 5],
  dayOfMonth: s.dayOfMonth || 1, intervalHours: s.intervalHours || 1, timeZone: s.timeZone || browserTimeZone(), emailWhenEmpty: s.emailWhenEmpty,
});

export function describeSchedule(s, t) {
  const time = `${pad(s.hour)}:${pad(s.minute)}`;
  if (s.frequency === 'hourly') return s.intervalHours === 1 ? t('Каждый час') : t('Каждые ${n} ч', { n: s.intervalHours });
  if (s.frequency === 'weekly') {
    const days = WEEK_DAYS.filter(([d]) => s.daysOfWeek?.includes(d)).map(([, label]) => t(label)).join(', ');
    return `${days} ${t('в')} ${time}`;
  }
  if (s.frequency === 'monthly') return t('${day}-го числа каждого месяца в ${time}', { day: s.dayOfMonth, time });
  return t('Ежедневно в ${time}', { time });
}

function SubscriptionForm({ initial, groups, saving, error, onSubmit, onCancel, t }) {
  const [form, setForm] = useState(initial);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleDay = (day) => set({ daysOfWeek: form.daysOfWeek.includes(day) ? form.daysOfWeek.filter((d) => d !== day) : [...form.daysOfWeek, day].sort() });
  return (
    <form className="fsd-form" onSubmit={(e) => { e.preventDefault(); onSubmit(form); }}>
      <label className="app-field">
        <span>{t('Получатель')}</span>
        <select value={form.groupId} onChange={(e) => set({ groupId: e.target.value })} aria-label={t('Получатель')}>
          <option value="">{t('Личная подписка')}</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{t('Группа')}: {g.name} ({g.teamName})</option>)}
        </select>
      </label>
      <fieldset className="fsd-fieldset">
        <legend>{t('Расписание')}</legend>
        <div className="fsd-segment" role="radiogroup" aria-label={t('Расписание')}>
          {[['daily', 'Ежедневно'], ['weekly', 'Дни недели'], ['monthly', 'День месяца'], ['hourly', 'Каждые N часов']].map(([value, label]) => (
            <label key={value} className={form.frequency === value ? 'is-active' : ''}>
              <input type="radio" name="frequency" value={value} checked={form.frequency === value} onChange={() => set({ frequency: value })} />
              {t(label)}
            </label>
          ))}
        </div>
        {form.frequency === 'weekly' && (
          <div className="fsd-days" role="group" aria-label={t('Дни недели')}>
            {WEEK_DAYS.map(([day, label]) => (
              <button key={day} type="button" aria-pressed={form.daysOfWeek.includes(day)} className={form.daysOfWeek.includes(day) ? 'is-active' : ''} onClick={() => toggleDay(day)}>{t(label)}</button>
            ))}
          </div>
        )}
        {form.frequency === 'monthly' && (
          <label className="app-field fsd-inline">
            <span>{t('День месяца')}</span>
            <select value={form.dayOfMonth} onChange={(e) => set({ dayOfMonth: Number(e.target.value) })} aria-label={t('День месяца')}>
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
        )}
        {form.frequency === 'hourly' ? (
          <label className="app-field fsd-inline">
            <span>{t('Интервал')}</span>
            <select value={form.intervalHours} onChange={(e) => set({ intervalHours: Number(e.target.value) })} aria-label={t('Интервал')}>
              {INTERVALS.map((n) => <option key={n} value={n}>{n === 1 ? t('Каждый час') : t('Каждые ${n} ч', { n })}</option>)}
            </select>
          </label>
        ) : (
          <label className="app-field fsd-inline">
            <span>{t('Время')}</span>
            <input type="time" value={form.time} onChange={(e) => set({ time: e.target.value })} aria-label={t('Время')} required />
          </label>
        )}
        <p className="fsd-hint">{t('Часовой пояс')}: {form.timeZone}</p>
      </fieldset>
      <label className="fsd-check">
        <input type="checkbox" checked={form.emailWhenEmpty} onChange={(e) => set({ emailWhenEmpty: e.target.checked })} />
        {t('Отправлять по электронной почте, даже если задачи не найдены')}
      </label>
      {error && <p className="app-modal-error" role="alert">{error}</p>}
      <div className="fsd-form-actions">
        <button type="button" className="app-btn app-btn-subtle" onClick={onCancel}>{t('Отмена')}</button>
        <button type="submit" className="app-btn app-btn-primary" disabled={saving}>{saving ? '…' : t('Подписаться')}</button>
      </div>
    </form>
  );
}

/** Jira's "Подписки на фильтр": list, create, edit, delete and run subscriptions of one filter. */
export default function FilterSubscriptionsDialog({ filter, currentUserId, onClose, onChanged }) {
  const { t, language } = useLocalization();
  const [items, setItems] = useState(null);
  const [groups, setGroups] = useState([]);
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const load = useCallback(() => api.list(filter.id)
    .then((list) => { setItems(Array.isArray(list) ? list : []); onChanged?.(filter.id, Array.isArray(list) ? list : []); })
    .catch((e) => { setItems([]); setError(e.message); }), [filter.id, onChanged]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.groups().then((g) => setGroups(Array.isArray(g) ? g : [])).catch(() => setGroups([])); }, []);

  const submit = async (form) => {
    setSaving(true);
    setError('');
    try {
      if (editing === 'new') await api.create(filter.id, toRequest(form));
      else await api.update(editing.id, toRequest(form));
      setEditing(null);
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s) => {
    if (!window.confirm(t('Удалить подписку?'))) return;
    try { await api.delete(s.id); await load(); } catch (e) { setError(e.message); }
  };

  const run = async (s) => {
    setStatus('');
    try {
      const result = await api.run(s.id);
      setStatus(t('Отправлено писем: ${n}', { n: result?.sent ?? 0 }));
      await load();
    } catch (e) { setError(e.message); }
  };

  const formatDate = (value) => (value ? new Date(value).toLocaleString(language || 'ru', { dateStyle: 'medium', timeStyle: 'short' }) : '—');

  return (
    <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="app-modal fsd-modal" role="dialog" aria-modal="true" aria-label={t('Подписки на фильтр')}>
        <div className="app-modal-header">
          <h2>{editing ? t(editing === 'new' ? 'Подписка на фильтр' : 'Изменить подписку') : t('Подписки на фильтр')}: {filter.name}</h2>
          <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={onClose}><NavIcon name="close" /></button>
        </div>
        <div className="app-modal-body">
          {editing ? (
            <SubscriptionForm
              initial={editing === 'new' ? emptySubscription() : fromSubscription(editing)}
              groups={groups}
              saving={saving}
              error={error}
              onSubmit={submit}
              onCancel={() => { setEditing(null); setError(''); }}
              t={t}
            />
          ) : (
            <>
              {items === null ? <p className="fsd-hint">{t('Загрузка...')}</p> : items.length === 0 ? (
                <p className="fsd-empty">{t('На этот фильтр пока нет подписок. Подпишитесь, чтобы получать результаты на почту по расписанию.')}</p>
              ) : (
                <table className="fsd-table">
                  <thead>
                    <tr><th>{t('Получатель')}</th><th>{t('Расписание')}</th><th>{t('Последняя отправка')}</th><th>{t('Следующая')}</th><th aria-label={t('Действия')} /></tr>
                  </thead>
                  <tbody>
                    {items.map((s) => (
                      <tr key={s.id}>
                        <td>{s.groupName ? `${t('Группа')}: ${s.groupName}` : s.ownerUserId === currentUserId ? t('Вы') : s.ownerName}</td>
                        <td>{describeSchedule(s, t)}</td>
                        <td>{formatDate(s.lastRunAt)}</td>
                        <td>{formatDate(s.nextRunAt)}</td>
                        <td className="fsd-actions">
                          {s.ownerUserId === currentUserId && <button type="button" className="inav-link" onClick={() => setEditing(s)}>{t('Изменить')}</button>}
                          {s.canEdit && <button type="button" className="inav-link" onClick={() => run(s)}>{t('Запустить сейчас')}</button>}
                          {s.canEdit && <button type="button" className="inav-link" onClick={() => remove(s)}>{t('Удалить')}</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {status && <p className="fsd-status" role="status">{status}</p>}
              {error && <p className="app-modal-error" role="alert">{error}</p>}
            </>
          )}
        </div>
        {!editing && (
          <div className="app-modal-footer">
            <button type="button" className="app-btn app-btn-subtle" onClick={onClose}>{t('Закрыть')}</button>
            <button type="button" className="app-btn app-btn-primary" onClick={() => { setEditing('new'); setError(''); }}>{t('Новая подписка')}</button>
          </div>
        )}
      </div>
    </div>
  );
}
