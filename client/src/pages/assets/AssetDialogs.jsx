import React, { useEffect, useMemo, useState } from 'react';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { assets as assetsApi, teams as teamsApi } from '../../api.js';
import NavIcon from '../../components/NavIcons.jsx';
import { isValidSpaceKey, suggestSpaceKey } from '../../utils/spaceKey.js';

export const ATTRIBUTE_TYPES = ['Текст', 'Число', 'Дата', 'Да/нет', 'Список', 'Статус', 'Пользователь', 'Ссылка на объект', 'URL', 'Email'];
export const ATTR = { Text: 0, Number: 1, Date: 2, Boolean: 3, Select: 4, Status: 5, User: 6, Reference: 7, Url: 8, Email: 9 };
export const TYPE_ICONS = ['box', 'laptop', 'server', 'monitor', 'phone', 'license', 'software', 'location', 'person', 'service', 'network', 'folder'];
export const PERMISSION = { View: 0, Work: 1, Manage: 2, Admin: 3 };

export const SCHEMA_TEMPLATES = [
  ['empty', 'box', 'Пустая схема', 'Начните с нуля и создайте собственные типы объектов.'],
  ['it', 'laptop', 'ИТ-активы', 'Ноутбуки, серверы, мониторы, лицензии и офисы с владельцами, статусами и гарантией.'],
  ['services', 'service', 'Бизнес-сервисы', 'Сервисы, приложения и окружения со ссылками друг на друга — основа для анализа влияния.'],
  ['facilities', 'location', 'Помещения и инвентарь', 'Здания, помещения и инвентарь с инвентарными номерами и состоянием.'],
];

export function Modal({ title, onClose, onSubmit, children, footer, wide }) {
  const { t } = useLocalization();
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <form className={`app-modal${wide ? ' app-modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} onSubmit={onSubmit}>
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

function useSubmit(action, onDone) {
  const { t } = useLocalization();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await action();
      onDone?.(result);
    } catch (err) {
      setError(err?.message || t('Не удалось сохранить'));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

function Footer({ onClose, busy, label, disabled, danger }) {
  const { t } = useLocalization();
  return (
    <>
      <button type="button" className="app-btn app-btn-subtle" onClick={onClose}>{t('Отмена')}</button>
      <button type="submit" className={`app-btn ${danger ? 'app-btn-danger' : 'app-btn-primary'}`} disabled={busy || disabled}>{busy ? '…' : label}</button>
    </>
  );
}

export function CreateSchemaDialog({ onClose, onCreated }) {
  const { t } = useLocalization();
  const [teams, setTeams] = useState([]);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [description, setDescription] = useState('');
  const [template, setTemplate] = useState('it');

  useEffect(() => {
    teamsApi.getMyTeamsWithBoards().then((list) => {
      const mapped = (list || []).map((x) => x.team || x);
      setTeams(mapped);
      setTeamId((current) => current || mapped[0]?.id || '');
    }).catch(() => setTeams([]));
  }, []);

  const effectiveKey = keyTouched ? key : suggestSpaceKey(name);
  const { busy, error, submit } = useSubmit(
    () => assetsApi.createSchema({ name: name.trim(), key: effectiveKey, teamId, description: description.trim() || null, template }),
    onCreated,
  );

  return (
    <Modal
      wide
      title={t('Создать схему объектов')}
      onClose={onClose}
      onSubmit={submit}
      footer={<Footer onClose={onClose} busy={busy} label={t('Создать')} disabled={!name.trim() || !isValidSpaceKey(effectiveKey) || !teamId} />}
    >
      <p className="app-modal-hint">{t('Схема объектов — это контейнер для типов объектов, их атрибутов и самих объектов. Начните с шаблона или с пустой схемы.')}</p>
      <div className="assets-template-grid" role="radiogroup" aria-label={t('Шаблон')}>
        {SCHEMA_TEMPLATES.map(([id, icon, label, desc]) => (
          <button type="button" role="radio" aria-checked={template === id} key={id} className={`assets-template-card${template === id ? ' is-selected' : ''}`} onClick={() => setTemplate(id)}>
            <span className="assets-template-icon"><NavIcon name={icon} size={20} /></span>
            <span className="assets-template-title">{t(label)}</span>
            <span className="assets-template-desc">{t(desc)}</span>
          </button>
        ))}
      </div>
      <div className="assets-form-row">
        <label className="app-field">
          <span>{t('Название')} <span className="app-required">*</span></span>
          <input value={name} maxLength={200} autoFocus onChange={(e) => setName(e.target.value)} placeholder={t('например, ИТ-активы')} required />
        </label>
        <label className="app-field assets-key-field">
          <span>{t('Ключ')} <span className="app-required">*</span></span>
          <input value={effectiveKey} maxLength={10} onChange={(e) => { setKeyTouched(true); setKey(e.target.value.toUpperCase()); }} />
        </label>
      </div>
      {effectiveKey && !isValidSpaceKey(effectiveKey) && <p className="app-field-help is-error">{t('Ключ: 2–10 латинских букв или цифр, начиная с буквы')}</p>}
      <p className="app-field-help">{t('Ключ станет префиксом объектов, например')} {effectiveKey || 'ITA'}-1</p>
      <label className="app-field">
        <span>{t('Команда')} <span className="app-required">*</span></span>
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
        <span className="app-field-help">{t('Участники команды увидят схему; изменять структуру смогут руководители и администраторы.')}</span>
      </label>
      <label className="app-field">
        <span>{t('Описание')}</span>
        <textarea rows={2} value={description} maxLength={2000} onChange={(e) => setDescription(e.target.value)} />
      </label>
      {error && <p className="app-modal-error" role="alert">{error}</p>}
    </Modal>
  );
}

export function EditSchemaDialog({ schema, onClose, onSaved }) {
  const { t } = useLocalization();
  const [name, setName] = useState(schema.name);
  const [description, setDescription] = useState(schema.description || '');
  const { busy, error, submit } = useSubmit(() => assetsApi.updateSchema(schema.id, { name: name.trim(), description: description.trim() || null }), onSaved);
  return (
    <Modal title={t('Настройки схемы')} onClose={onClose} onSubmit={submit} footer={<Footer onClose={onClose} busy={busy} label={t('Сохранить')} disabled={!name.trim()} />}>
      <label className="app-field"><span>{t('Название')}</span><input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} /></label>
      <label className="app-field"><span>{t('Ключ')}</span><input value={schema.key} disabled /></label>
      <label className="app-field"><span>{t('Описание')}</span><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      {error && <p className="app-modal-error" role="alert">{error}</p>}
    </Modal>
  );
}

export function ConfirmDialog({ title, message, confirmLabel, onClose, onConfirm }) {
  const { busy, error, submit } = useSubmit(onConfirm, onClose);
  return (
    <Modal title={title} onClose={onClose} onSubmit={submit} footer={<Footer onClose={onClose} busy={busy} label={confirmLabel} danger />}>
      <p>{message}</p>
      {error && <p className="app-modal-error" role="alert">{error}</p>}
    </Modal>
  );
}

export function TypeDialog({ schema, type, parentId, onClose, onSaved }) {
  const { t } = useLocalization();
  const [name, setName] = useState(type?.name || '');
  const [description, setDescription] = useState(type?.description || '');
  const [parent, setParent] = useState(type ? type.parentTypeId || '' : parentId || '');
  const [icon, setIcon] = useState(type?.icon || 'box');
  const blocked = useMemo(() => {
    if (!type) return new Set();
    const result = new Set([type.id]);
    let added = true;
    while (added) {
      added = false;
      schema.types.forEach((x) => { if (x.parentTypeId && result.has(x.parentTypeId) && !result.has(x.id)) { result.add(x.id); added = true; } });
    }
    return result;
  }, [schema.types, type]);
  const payload = { name: name.trim(), description: description.trim() || null, parentTypeId: parent || null, icon };
  const { busy, error, submit } = useSubmit(
    () => (type ? assetsApi.updateType(type.id, payload).then(() => ({ id: type.id })) : assetsApi.createType(schema.id, payload)),
    onSaved,
  );
  return (
    <Modal title={type ? t('Изменить тип объектов') : t('Создать тип объектов')} onClose={onClose} onSubmit={submit} footer={<Footer onClose={onClose} busy={busy} label={type ? t('Сохранить') : t('Создать')} disabled={!name.trim()} />}>
      <label className="app-field"><span>{t('Название')} <span className="app-required">*</span></span><input value={name} autoFocus maxLength={200} onChange={(e) => setName(e.target.value)} placeholder={t('например, Ноутбук')} /></label>
      <label className="app-field"><span>{t('Описание')}</span><textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
      <label className="app-field">
        <span>{t('Родительский тип')}</span>
        <select value={parent} onChange={(e) => setParent(e.target.value)}>
          <option value="">{t('Нет (верхний уровень)')}</option>
          {schema.types.filter((x) => !blocked.has(x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <span className="app-field-help">{t('Дочерний тип наследует все атрибуты родителя.')}</span>
      </label>
      <div className="app-field">
        <span>{t('Значок')}</span>
        <div className="assets-icon-picker" role="radiogroup" aria-label={t('Значок')}>
          {TYPE_ICONS.map((name) => (
            <button type="button" key={name} role="radio" aria-checked={icon === name} aria-label={name} className={icon === name ? 'is-selected' : ''} onClick={() => setIcon(name)}>
              <NavIcon name={name} size={18} />
            </button>
          ))}
        </div>
      </div>
      {error && <p className="app-modal-error" role="alert">{error}</p>}
    </Modal>
  );
}

export function AttributeDialog({ schema, typeId, attribute, onClose, onSaved }) {
  const { t } = useLocalization();
  const [name, setName] = useState(attribute?.name || '');
  const [type, setType] = useState(attribute?.type ?? ATTR.Text);
  const [required, setRequired] = useState(Boolean(attribute?.required));
  const [options, setOptions] = useState((attribute?.options || []).join('\n'));
  const [referenceTypeId, setReferenceTypeId] = useState(attribute?.referenceTypeId || schema.types[0]?.id || '');
  const needsOptions = type === ATTR.Select || type === ATTR.Status;
  const payload = { name: name.trim(), type, required, options: needsOptions ? options : null, referenceTypeId: type === ATTR.Reference ? referenceTypeId || null : null };
  const { busy, error, submit } = useSubmit(
    () => (attribute ? assetsApi.updateAttribute(attribute.id, payload) : assetsApi.createAttribute(typeId, payload)),
    onSaved,
  );
  return (
    <Modal title={attribute ? t('Изменить атрибут') : t('Добавить атрибут')} onClose={onClose} onSubmit={submit} footer={<Footer onClose={onClose} busy={busy} label={attribute ? t('Сохранить') : t('Добавить')} disabled={!name.trim() || (needsOptions && !options.trim())} />}>
      <label className="app-field"><span>{t('Название')} <span className="app-required">*</span></span><input value={name} autoFocus maxLength={200} onChange={(e) => setName(e.target.value)} placeholder={t('например, Серийный номер')} /></label>
      <label className="app-field">
        <span>{t('Тип')}</span>
        <select value={type} onChange={(e) => setType(Number(e.target.value))}>
          {ATTRIBUTE_TYPES.map((label, index) => <option key={label} value={index}>{t(label)}</option>)}
        </select>
      </label>
      {needsOptions && (
        <label className="app-field">
          <span>{t('Варианты значений')} <span className="app-required">*</span></span>
          <textarea rows={4} value={options} onChange={(e) => setOptions(e.target.value)} placeholder={t('Каждый вариант с новой строки')} />
        </label>
      )}
      {type === ATTR.Reference && (
        <label className="app-field">
          <span>{t('Ссылается на тип')}</span>
          <select value={referenceTypeId} onChange={(e) => setReferenceTypeId(e.target.value)}>
            {schema.types.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
      )}
      <label className="settings-checkbox"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> {t('Обязательный')}</label>
      {error && <p className="app-modal-error" role="alert">{error}</p>}
    </Modal>
  );
}

function ReferenceSelect({ schemaId, attribute, value, onChange }) {
  const { t } = useLocalization();
  const [options, setOptions] = useState(null);
  useEffect(() => {
    assetsApi.search({ schemaId, typeId: attribute.referenceTypeId || undefined, includeChildren: true, pageSize: 200 })
      .then((result) => setOptions(result.items || [])).catch(() => setOptions([]));
  }, [schemaId, attribute.referenceTypeId]);
  return (
    <select value={value || ''} onChange={(e) => onChange(e.target.value)}>
      <option value="">{options ? t('— не выбрано —') : t('Загрузка...')}</option>
      {(options || []).map((o) => <option key={o.id} value={o.id}>{o.label} ({o.key})</option>)}
    </select>
  );
}

export function AttributeInput({ attribute, value, onChange, users, schemaId }) {
  const { t } = useLocalization();
  const common = { value: value ?? '', onChange: (e) => onChange(e.target.value) };
  switch (attribute.type) {
    case ATTR.Number: return <input type="number" step="any" {...common} />;
    case ATTR.Date: return <input type="date" {...common} />;
    case ATTR.Boolean:
      return <select {...common}><option value="">—</option><option value="true">{t('Да')}</option><option value="false">{t('Нет')}</option></select>;
    case ATTR.Select:
    case ATTR.Status:
      return <select {...common}><option value="">—</option>{attribute.options.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
    case ATTR.User:
      return <select {...common}><option value="">—</option>{users.map((u) => <option key={u.id} value={u.id}>{u.displayName}{u.email ? ` · ${u.email}` : ''}</option>)}</select>;
    case ATTR.Reference: return <ReferenceSelect schemaId={schemaId} attribute={attribute} value={value} onChange={onChange} />;
    case ATTR.Url: return <input type="url" placeholder="https://" {...common} />;
    case ATTR.Email: return <input type="email" {...common} />;
    default: return <input maxLength={4000} {...common} />;
  }
}

export function ObjectDialog({ schema, typeId, object, users, onClose, onSaved }) {
  const { t } = useLocalization();
  const [objectTypeId, setObjectTypeId] = useState(object?.objectTypeId || typeId || schema.types[0]?.id || '');
  const [label, setLabel] = useState(object?.label || '');
  const [values, setValues] = useState(() => {
    const initial = {};
    (object?.attributes || []).forEach((a) => { initial[a.attribute.id] = a.referencedObjectId || a.value || ''; });
    return initial;
  });
  const type = schema.types.find((x) => x.id === objectTypeId);
  const attributes = type?.effectiveAttributes || [];
  const missing = attributes.some((a) => a.required && !String(values[a.id] ?? '').trim());
  const { busy, error, submit } = useSubmit(() => {
    const payload = { objectTypeId, label: label.trim(), values: Object.fromEntries(attributes.map((a) => [a.id, values[a.id] || null])) };
    return object ? assetsApi.updateObject(object.id, payload) : assetsApi.createObject(payload);
  }, onSaved);

  return (
    <Modal wide title={object ? `${t('Изменить')} ${object.key}` : t('Создать объект')} onClose={onClose} onSubmit={submit} footer={<Footer onClose={onClose} busy={busy} label={object ? t('Сохранить') : t('Создать')} disabled={!label.trim() || !objectTypeId || missing} />}>
      <div className="assets-form-row">
        <label className="app-field">
          <span>{t('Тип объекта')}</span>
          <select value={objectTypeId} onChange={(e) => setObjectTypeId(e.target.value)}>
            {schema.types.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
        </label>
        <label className="app-field">
          <span>{t('Название')} <span className="app-required">*</span></span>
          <input value={label} autoFocus maxLength={200} onChange={(e) => setLabel(e.target.value)} />
        </label>
      </div>
      <div className="assets-attr-form">
        {attributes.map((a) => (
          <label key={a.id} className="app-field">
            <span>{a.name}{a.required && <> <span className="app-required">*</span></>}</span>
            <AttributeInput attribute={a} value={values[a.id]} users={users} schemaId={schema.id} onChange={(v) => setValues((prev) => ({ ...prev, [a.id]: v }))} />
          </label>
        ))}
      </div>
      {attributes.length === 0 && <p className="app-modal-hint">{t('У этого типа пока нет атрибутов. Добавьте их на вкладке «Атрибуты».')}</p>}
      {error && <p className="app-modal-error" role="alert">{error}</p>}
    </Modal>
  );
}

export function ImportDialog({ type, onClose, onImported }) {
  const { t } = useLocalization();
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState(null);
  const columns = ['Key', 'Название', ...(type.effectiveAttributes || []).map((a) => a.name)];
  const { busy, error, submit } = useSubmit(async () => {
    const response = await assetsApi.importCsv(type.id, content);
    setResult(response);
    if (response.imported) onImported?.(response);
    return response;
  });
  const readFile = (file) => {
    if (!file) return;
    setFileName(file.name);
    setResult(null);
    const reader = new FileReader();
    reader.onload = () => setContent(String(reader.result || ''));
    reader.readAsText(file, 'utf-8');
  };
  return (
    <Modal wide title={`${t('Импорт объектов')}: ${type.name}`} onClose={onClose} onSubmit={submit} footer={<Footer onClose={onClose} busy={busy} label={t('Импортировать')} disabled={!content.trim()} />}>
      <p className="app-modal-hint">{t('Загрузите CSV-файл. Первая строка — заголовки. Строки с заполненным «Key» обновят существующие объекты, остальные будут созданы. Если в файле есть ошибки, ничего не сохранится.')}</p>
      <p className="app-field-help">{t('Колонки')}: <code>{columns.join(', ')}</code></p>
      <label className="assets-dropzone">
        <NavIcon name="upload" size={20} />
        <span>{fileName || t('Выберите CSV-файл')}</span>
        <input type="file" accept=".csv,text/csv" onChange={(e) => readFile(e.target.files?.[0])} />
      </label>
      <label className="app-field">
        <span>{t('или вставьте содержимое')}</span>
        <textarea rows={5} value={content} onChange={(e) => { setContent(e.target.value); setResult(null); }} placeholder={columns.join(',')} />
      </label>
      {result?.imported && <p className="app-modal-success" role="status">{t('Готово')}: {t('создано')} {result.created}, {t('обновлено')} {result.updated}</p>}
      {result?.unknownColumns?.length > 0 && <p className="app-field-help">{t('Пропущены неизвестные колонки')}: {result.unknownColumns.join(', ')}</p>}
      {result && !result.imported && (
        <div className="app-modal-error" role="alert">
          <strong>{t('Импорт не выполнен, исправьте ошибки')}:</strong>
          <ul className="assets-error-list">{result.errors.slice(0, 20).map((e) => <li key={`${e.row}-${e.message}`}>{t('Строка')} {e.row}: {e.message}</li>)}</ul>
        </div>
      )}
      {error && <p className="app-modal-error" role="alert">{error}</p>}
    </Modal>
  );
}
