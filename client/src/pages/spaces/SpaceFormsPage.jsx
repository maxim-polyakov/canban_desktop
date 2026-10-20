import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from '../../i18n/navigation.jsx';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { spaceContent } from '../../api.js';
import NavIcon from '../../components/NavIcons.jsx';
import { IssueTypeIcon, getIssueTypeMeta } from '../../components/IssueIcons.jsx';
import { timeAgo } from '../../utils/timeAgo.js';
import './SpaceContent.css';

const FIELD_TYPES = [
  ['text', 'Короткий текст'],
  ['paragraph', 'Абзац'],
  ['number', 'Число'],
  ['date', 'Дата'],
  ['select', 'Раскрывающийся список'],
  ['email', 'Email'],
];
const ISSUE_TYPES = [2, 1, 3, 0];
const newId = () => Math.random().toString(36).slice(2, 10);

function FormsEmpty({ onCreate, t }) {
  return (
    <div className="sc-empty sc-forms-empty">
      <h1>{t('Простой способ собирать и отслеживать запросы на выполнение работы')}</h1>
      <p>{t('Используйте формы, чтобы без труда создавать задачи из запросов заинтересованных лиц.')}</p>
      <div className="sc-forms-art" aria-hidden="true">
        <div className="sc-forms-art-card is-form"><strong>{t('Отправить форму')}</strong><i /><i /><i /></div>
        <NavIcon name="arrowRight" size={28} />
        <div className="sc-forms-art-card is-track"><strong>{t('Отслеживать запросы')}</strong><i /><i /><i /></div>
      </div>
      <div className="sc-forms-art-captions">
        <span><strong>{t('Зафиксируйте ключевые детали')}</strong>{t('и создайте запросы')}</span>
        <span><strong>{t('Рассортируйте задачи по приоритету')}</strong>{t('на доске или в колонке')}</span>
      </div>
      <button type="button" className="app-btn app-btn-primary" onClick={onCreate}><NavIcon name="plus" size={14} />{t('Создать форму')}</button>
    </div>
  );
}

export function SpaceFormsListPage() {
  const { boardId } = useParams();
  const navigate = useNavigate();
  const { t, language } = useLocalization();
  const [forms, setForms] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    spaceContent.listForms(boardId).then((list) => setForms(Array.isArray(list) ? list : [])).catch((e) => { setForms([]); setError(e.message); });
  }, [boardId]);

  const create = async () => {
    setError('');
    try {
      const form = await spaceContent.createForm(boardId, { title: t('Новая форма') });
      navigate(`/board/${boardId}/forms/${form.id}`);
    } catch (e) {
      setError(e.status === 403 ? t('Создавать формы могут только администраторы раздела.') : e.message);
    }
  };

  return (
    <div className="sc-page">
      {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
      {!forms && <p className="settings-empty">{t('Загрузка...')}</p>}
      {forms && forms.length === 0 && <FormsEmpty onCreate={create} t={t} />}
      {forms && forms.length > 0 && (
        <>
          <div className="sc-head">
            <h1>{t('Формы')}</h1>
            <button type="button" className="app-btn app-btn-primary" onClick={create}><NavIcon name="plus" size={14} />{t('Создать форму')}</button>
          </div>
          <div className="sc-form-cards">
            {forms.map((form) => (
              <div key={form.id} className="sc-form-card">
                <div className="sc-form-card-head">
                  <IssueTypeIcon issueType={form.issueType} typeId={form.issueTypeId} size={16} />
                  <Link to={`/board/${boardId}/forms/${form.id}/submit`} className="sc-form-card-title">{form.title}</Link>
                  <span className={`settings-lozenge ${form.isOpen ? 'is-success' : ''}`}>{t(form.isOpen ? 'Открыта' : 'Закрыта')}</span>
                </div>
                {form.description && <p className="sc-muted">{form.description}</p>}
                <div className="sc-form-card-foot">
                  <span className="sc-muted">{form.fields.length} {t('полей')} · {form.submissionCount} {t('ответов')} · {timeAgo(form.updatedAt, language)}</span>
                  <span className="sc-doc-buttons">
                    <Link to={`/board/${boardId}/forms/${form.id}/submit`} className="app-btn">{t('Заполнить')}</Link>
                    <Link to={`/board/${boardId}/forms/${form.id}`} className="app-btn app-btn-subtle">{t('Изменить')}</Link>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FieldEditor({ field, onChange, onRemove, onMove, first, last, t }) {
  const summary = field.type === 'summary';
  return (
    <div className="sc-field-editor">
      <div className="sc-field-row">
        <input value={field.label} onChange={(e) => onChange({ ...field, label: e.target.value })} placeholder={t('Подпись поля')} aria-label={t('Подпись поля')} maxLength={200} />
        {summary
          ? <span className="settings-lozenge is-info">{t('Название задачи')}</span>
          : (
            <select value={field.type} onChange={(e) => onChange({ ...field, type: e.target.value, options: e.target.value === 'select' ? field.options?.length ? field.options : [t('Вариант 1')] : null })} aria-label={t('Тип поля')}>
              {FIELD_TYPES.map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
            </select>
          )}
        <label className="sc-check"><input type="checkbox" checked={summary || field.required} disabled={summary} onChange={(e) => onChange({ ...field, required: e.target.checked })} />{t('Обязательное')}</label>
        <span className="sc-field-tools">
          <button type="button" className="app-icon-btn" disabled={first} onClick={() => onMove(-1)} aria-label={t('Выше')}><NavIcon name="chevronUp" size={14} /></button>
          <button type="button" className="app-icon-btn" disabled={last} onClick={() => onMove(1)} aria-label={t('Ниже')}><NavIcon name="chevronDown" size={14} /></button>
          {!summary && <button type="button" className="app-icon-btn" onClick={onRemove} aria-label={t('Удалить поле')}><NavIcon name="close" size={14} /></button>}
        </span>
      </div>
      {field.type === 'select' && (
        <textarea className="sc-field-options" rows={3} value={(field.options || []).join('\n')}
          onChange={(e) => onChange({ ...field, options: e.target.value.split('\n') })} placeholder={t('Каждый вариант с новой строки')} aria-label={t('Варианты')} />
      )}
    </div>
  );
}

export function SpaceFormEditPage() {
  const { boardId, formId } = useParams();
  const navigate = useNavigate();
  const { t } = useLocalization();
  const [form, setForm] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    spaceContent.getForm(boardId, formId).then(setForm).catch((e) => setError(e.message));
  }, [boardId, formId]);

  const patch = (changes) => { setForm((f) => ({ ...f, ...changes })); setStatus(''); };
  const setField = (index, field) => patch({ fields: form.fields.map((f, i) => (i === index ? field : f)) });
  const move = (index, delta) => {
    const fields = [...form.fields];
    [fields[index], fields[index + delta]] = [fields[index + delta], fields[index]];
    patch({ fields });
  };

  const save = async () => {
    setError('');
    setStatus('saving');
    try {
      const fields = form.fields.map((f) => ({ ...f, options: f.type === 'select' ? (f.options || []).map((o) => o.trim()).filter(Boolean) : null }));
      const saved = await spaceContent.updateForm(boardId, formId, { title: form.title, description: form.description || '', issueType: form.issueType, isOpen: form.isOpen, fields });
      setForm(saved);
      setStatus('saved');
    } catch (e) {
      setStatus('');
      setError(e.status === 403 ? t('Изменять формы могут только администраторы раздела.') : e.message);
    }
  };

  const remove = async () => {
    if (!window.confirm(`${t('Удалить форму')} «${form.title}»?`)) return;
    try {
      await spaceContent.deleteForm(boardId, formId);
      navigate(`/board/${boardId}/forms`);
    } catch (e) {
      setError(e.message);
    }
  };

  if (!form) return <div className="sc-page">{error ? <p className="settings-save-status is-error">{error}</p> : <p className="settings-empty">{t('Загрузка...')}</p>}</div>;

  return (
    <div className="sc-page sc-form-edit">
      <div className="settings-breadcrumbs"><Link to={`/board/${boardId}/forms`}>{t('Формы')}</Link></div>
      <div className="sc-head">
        <h1>{t('Настройка формы')}</h1>
        <span className="sc-doc-buttons">
          {status === 'saved' && <span className="sc-muted">{t('Сохранено')}</span>}
          <Link to={`/board/${boardId}/forms/${formId}/submit`} className="app-btn">{t('Предпросмотр')}</Link>
          <button type="button" className="app-btn app-btn-primary" onClick={save} disabled={status === 'saving' || !form.title.trim()}>{status === 'saving' ? t('Сохранение...') : t('Сохранить')}</button>
        </span>
      </div>
      {error && <p className="settings-save-status is-error" role="alert">{error}</p>}

      <div className="sc-form-settings">
        <label className="settings-field"><span>{t('Название формы')} *</span><input value={form.title} maxLength={255} onChange={(e) => patch({ title: e.target.value })} /></label>
        <label className="settings-field"><span>{t('Описание')}</span><textarea value={form.description || ''} maxLength={2000} rows={2} onChange={(e) => patch({ description: e.target.value })} /></label>
        <div className="sc-form-settings-row">
          <label className="settings-field">
            <span>{t('Тип создаваемой задачи')}</span>
            <select value={form.issueType} onChange={(e) => patch({ issueType: Number(e.target.value) })}>
              {ISSUE_TYPES.map((type) => <option key={type} value={type}>{t(getIssueTypeMeta(type).label)}</option>)}
            </select>
          </label>
          <label className="sc-check sc-toggle"><input type="checkbox" checked={form.isOpen} onChange={(e) => patch({ isOpen: e.target.checked })} />{t('Принимать ответы')}</label>
        </div>
      </div>

      <h2 className="sc-subhead">{t('Поля')}</h2>
      <div className="sc-fields">
        {form.fields.map((field, index) => (
          <FieldEditor key={field.id} field={field} t={t} first={index === 0} last={index === form.fields.length - 1}
            onChange={(next) => setField(index, next)} onRemove={() => patch({ fields: form.fields.filter((_, i) => i !== index) })} onMove={(delta) => move(index, delta)} />
        ))}
      </div>
      <div className="sc-add-field">
        {FIELD_TYPES.map(([type, label]) => (
          <button key={type} type="button" className="app-btn app-btn-subtle"
            onClick={() => patch({ fields: [...form.fields, { id: newId(), label: t(label), type, required: false, options: type === 'select' ? [t('Вариант 1'), t('Вариант 2')] : null }] })}>
            <NavIcon name="plus" size={12} />{t(label)}
          </button>
        ))}
      </div>
      <div className="sc-danger">
        <button type="button" className="app-btn app-btn-danger" onClick={remove}>{t('Удалить форму')}</button>
      </div>
    </div>
  );
}

function FieldInput({ field, value, onChange }) {
  const props = { id: `f-${field.id}`, value: value || '', onChange: (e) => onChange(e.target.value), required: field.required };
  switch (field.type) {
    case 'paragraph': return <textarea rows={5} {...props} />;
    case 'number': return <input type="number" step="any" {...props} />;
    case 'date': return <input type="date" {...props} />;
    case 'email': return <input type="email" {...props} />;
    case 'select':
      return (
        <select {...props}>
          <option value="" />
          {(field.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    default: return <input type="text" maxLength={field.type === 'summary' ? 255 : undefined} {...props} />;
  }
}

export function SpaceFormSubmitPage() {
  const { boardId, formId } = useParams();
  const { t } = useLocalization();
  const [form, setForm] = useState(null);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);

  const load = useCallback(() => spaceContent.getForm(boardId, formId).then(setForm).catch((e) => setError(e.message)), [boardId, formId]);
  useEffect(() => { load(); }, [load]);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setCreated(await spaceContent.submitForm(boardId, formId, answers));
      setAnswers({});
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!form) return <div className="sc-page">{error ? <p className="settings-save-status is-error">{error}</p> : <p className="settings-empty">{t('Загрузка...')}</p>}</div>;

  return (
    <div className="sc-page sc-form-fill">
      <div className="settings-breadcrumbs"><Link to={`/board/${boardId}/forms`}>{t('Формы')}</Link></div>
      <form className="sc-form-sheet" onSubmit={submit}>
        <h1>{form.title}</h1>
        {form.description && <p className="sc-muted">{form.description}</p>}
        {!form.isOpen && <p className="settings-save-status is-error">{t('Форма закрыта для новых ответов.')}</p>}
        {created && (
          <p className="app-modal-success" role="status">
            {t('Запрос отправлен. Создана задача')} <Link to={`/board/${boardId}/issue/${created.id}`}>{created.issueKey}</Link>
          </p>
        )}
        {form.fields.map((field) => (
          <label key={field.id} className="settings-field" htmlFor={`f-${field.id}`}>
            <span>{field.label}{field.required ? ' *' : ''}</span>
            <FieldInput field={field} value={answers[field.id]} onChange={(value) => setAnswers((a) => ({ ...a, [field.id]: value }))} />
          </label>
        ))}
        {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
        <div className="settings-actions">
          <button type="submit" className="app-btn app-btn-primary" disabled={busy || !form.isOpen}>{busy ? t('Отправка...') : t('Отправить')}</button>
        </div>
      </form>
    </div>
  );
}
