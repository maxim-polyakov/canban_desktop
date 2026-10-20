import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import NavIcon from './NavIcons.jsx';
import './StartSprintDialog.css';

export const DURATIONS = [
  ['1', '1 неделя'],
  ['2', '2 недели'],
  ['3', '3 недели'],
  ['4', '4 недели'],
  ['custom', 'Особая'],
];

const pad = (n) => String(n).padStart(2, '0');

/** Splits a Date into local `YYYY-MM-DD` and `HH:mm` strings for date/time inputs. */
export const toLocalParts = (date) => ({
  date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
  time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
});

export const fromLocalParts = (date, time) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '')) return null;
  const value = new Date(`${date}T${time}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
};

export const addWeeks = (date, weeks) => new Date(date.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);

/** Picks the preset matching an already planned sprint, otherwise Jira's default of two weeks. */
export const initialDuration = (sprint) => {
  if (!sprint?.startDate || !sprint?.endDate) return '2';
  const days = (new Date(sprint.endDate) - new Date(sprint.startDate)) / 86400000;
  const preset = DURATIONS.find(([value]) => value !== 'custom' && Math.abs(Number(value) * 7 - days) < 0.01);
  return preset ? preset[0] : 'custom';
};

export const issueCountText = (count, t) => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return t('${n} задача будет включена в спринт.', { n: count });
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return t('${n} задачи будут включены в спринт.', { n: count });
  return t('${n} задач будут включены в спринт.', { n: count });
};

export default function StartSprintDialog({ sprint, issueCount = 0, anotherActive = false, onStart, onClose }) {
  const { t } = useLocalization();
  const initial = useMemo(() => {
    const plannedStart = sprint?.startDate ? new Date(sprint.startDate) : null;
    const start = plannedStart && plannedStart > new Date() ? plannedStart : new Date();
    const duration = initialDuration(sprint);
    const end = duration === 'custom' ? new Date(sprint.endDate) : addWeeks(start, Number(duration));
    return { duration, start: toLocalParts(start), end: toLocalParts(end) };
  }, [sprint]);
  const [name, setName] = useState(sprint?.name ?? '');
  const [duration, setDuration] = useState(initial.duration);
  const [startDate, setStartDate] = useState(initial.start.date);
  const [startTime, setStartTime] = useState(initial.start.time);
  const [customEnd, setCustomEnd] = useState(initial.end);
  const [autoComplete, setAutoComplete] = useState(!!sprint?.autoComplete);
  const [goal, setGoal] = useState(sprint?.goal ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const nameRef = useRef(null);

  useEffect(() => { nameRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const start = fromLocalParts(startDate, startTime);
  const end = duration === 'custom'
    ? fromLocalParts(customEnd.date, customEnd.time)
    : start && addWeeks(start, Number(duration));
  const endParts = duration === 'custom' ? customEnd : end ? toLocalParts(end) : { date: '', time: '' };

  const changeDuration = (value) => {
    if (value === 'custom' && end) setCustomEnd(toLocalParts(end));
    setDuration(value);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) { setError(t('Укажите название спринта.')); return; }
    if (!start) { setError(t('Укажите дату и время начала.')); return; }
    if (!end) { setError(t('Укажите дату и время окончания.')); return; }
    if (end <= start) { setError(t('Дата окончания должна быть позже даты начала.')); return; }
    setSaving(true);
    setError('');
    try {
      await onStart({ name: name.trim(), goal: goal.trim(), startDate: start.toISOString(), endDate: end.toISOString(), autoComplete });
    } catch (err) {
      setError(t(err?.message || 'Не удалось запустить спринт.'));
      setSaving(false);
    }
  };

  const title = anotherActive ? t('Запустить другой спринт') : t('Начать спринт');

  return (
    <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <form className="app-modal ssd-modal" role="dialog" aria-modal="true" aria-label={title} onSubmit={submit}>
        <div className="app-modal-header">
          <h2>{title}</h2>
          <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={onClose} disabled={saving}><NavIcon name="close" /></button>
        </div>
        <div className="app-modal-body ssd-body">
          <p className="ssd-count">{issueCountText(issueCount, t)}</p>
          <p className="ssd-required-note">{t('Обязательные поля отмечены звездочкой')} <span className="ssd-star">*</span></p>

          <label className="ssd-field">
            <span className="ssd-label">{t('Название спринта')} <span className="ssd-star">*</span></span>
            <input ref={nameRef} type="text" value={name} maxLength={200} onChange={(e) => setName(e.target.value)} required />
          </label>

          <label className="ssd-field ssd-narrow">
            <span className="ssd-label">{t('Длительность')} <span className="ssd-star">*</span></span>
            <select value={duration} onChange={(e) => changeDuration(e.target.value)}>
              {DURATIONS.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
            </select>
          </label>

          <div className="ssd-field">
            <span className="ssd-label" id="ssd-start-label">{t('Дата начала')} <span className="ssd-star">*</span></span>
            <div className="ssd-datetime" role="group" aria-labelledby="ssd-start-label">
              <input type="date" aria-label={t('Дата начала')} value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              <input type="time" aria-label={t('Время начала')} value={startTime} onChange={(e) => setStartTime(e.target.value)} required />
            </div>
            <span className="ssd-hint">{t('Формат даты: ДД.ММ.ГГГГ. Формат времени: например, 13:00')}</span>
          </div>

          <div className="ssd-field">
            <span className="ssd-label" id="ssd-end-label">{t('Дата окончания')} <span className="ssd-star">*</span></span>
            <div className="ssd-datetime" role="group" aria-labelledby="ssd-end-label">
              <input type="date" aria-label={t('Дата окончания')} value={endParts.date} disabled={duration !== 'custom'} onChange={(e) => setCustomEnd((v) => ({ ...v, date: e.target.value }))} required />
              <input type="time" aria-label={t('Время окончания')} value={endParts.time} disabled={duration !== 'custom'} onChange={(e) => setCustomEnd((v) => ({ ...v, time: e.target.value }))} required />
            </div>
            {duration !== 'custom' && <span className="ssd-hint">{t('Чтобы указать дату окончания вручную, выберите длительность «Особая».')}</span>}
          </div>

          <label className="ssd-toggle">
            <input type="checkbox" role="switch" checked={autoComplete} onChange={(e) => setAutoComplete(e.target.checked)} />
            <span className="ssd-toggle-track" aria-hidden="true" />
            <span>{t('Автоматически завершать спринт')}</span>
          </label>
          {autoComplete && <span className="ssd-hint ssd-toggle-hint">{t('В дату окончания спринт завершится сам, а незавершённые задачи вернутся в бэклог.')}</span>}

          <label className="ssd-field">
            <span className="ssd-label">{t('Цель спринта')}</span>
            <textarea rows={4} value={goal} maxLength={2000} onChange={(e) => setGoal(e.target.value)} />
          </label>

          {error && <p className="app-modal-error" role="alert">{error}</p>}
        </div>
        <div className="app-modal-footer">
          <button type="button" className="app-btn app-btn-subtle" onClick={onClose} disabled={saving}>{t('Отмена')}</button>
          <button type="submit" className="app-btn app-btn-primary" disabled={saving}>{saving ? '…' : t('Начать')}</button>
        </div>
      </form>
    </div>
  );
}
