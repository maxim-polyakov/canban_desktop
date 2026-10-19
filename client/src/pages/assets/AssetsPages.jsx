import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from '../../i18n/navigation.jsx';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { assets as assetsApi, users as usersApi } from '../../api.js';
import NavIcon from '../../components/NavIcons.jsx';
import {
  ATTR, ATTRIBUTE_TYPES, AttributeDialog, ConfirmDialog, CreateSchemaDialog, EditSchemaDialog,
  ImportDialog, ObjectDialog, PERMISSION, TypeDialog,
} from './AssetDialogs.jsx';
import '../settings/Settings.css';
import './Assets.css';

const PAGE_SIZE = 50;

export const AQL_EXAMPLES = [
  ['objectType = "Ноутбук"', 'Все объекты типа'],
  ['objectTypeAndChildren = "Оборудование"', 'Тип и все дочерние типы'],
  ['"Владелец" = currentUser()', 'Назначенные мне'],
  ['"Статус" IN ("На складе", "В ремонте")', 'Несколько значений'],
  ['"Гарантия до" < now()', 'Сравнение дат'],
  ['"Серийный номер" IS EMPTY', 'Пустое значение'],
  ['Name ~ "mac" ORDER BY updated DESC', 'Поиск по названию и сортировка'],
  ['linkedIssues = KAN-12', 'Объекты, связанные с задачей'],
];

function useQueryParams() {
  const location = useLocation();
  return useMemo(() => new URLSearchParams(location.search), [location.search]);
}

function useUsers() {
  const [users, setUsers] = useState([]);
  useEffect(() => { usersApi.getAll().then((list) => setUsers(Array.isArray(list) ? list : [])).catch(() => setUsers([])); }, []);
  return users;
}

function TypeIcon({ icon, size = 16 }) {
  return <span className="assets-type-icon"><NavIcon name={icon || 'box'} size={size} /></span>;
}

function statusTone(attribute, value) {
  const index = (attribute.options || []).indexOf(value);
  return ['is-success', 'is-info', 'is-warning', ''][Math.min(Math.max(index, 0), 3)];
}

export function AttributeValue({ attribute, value, display, reference }) {
  const { t, formatDate } = useLocalization();
  if (value == null && !reference) return <span className="assets-muted">—</span>;
  switch (attribute.type) {
    case ATTR.Reference:
      return reference ? <Link to={`/assets/object/${reference.id}`} className="assets-ref"><NavIcon name="link" size={12} />{reference.label} <span className="assets-muted">{reference.key}</span></Link> : <span>{display}</span>;
    case ATTR.Status: return <span className={`settings-lozenge ${statusTone(attribute, value)}`}>{value}</span>;
    case ATTR.Boolean: return <span>{value === 'true' ? t('Да') : t('Нет')}</span>;
    case ATTR.Date: return <span>{formatDate(`${value}T00:00:00`, { day: 'numeric', month: 'short', year: 'numeric' })}</span>;
    case ATTR.Url: return <a href={value} target="_blank" rel="noreferrer">{value}</a>;
    case ATTR.Email: return <a href={`mailto:${value}`}>{value}</a>;
    case ATTR.Number: return <span>{Number(value).toLocaleString()}</span>;
    default: return <span>{display ?? value}</span>;
  }
}

function AssetsHeader({ tab, actions }) {
  const { t } = useLocalization();
  return (
    <>
      <div className="settings-title-row">
        <h1 className="settings-title">{t('Активы')}</h1>
        {actions && <div className="settings-actions">{actions}</div>}
      </div>
      <nav className="assets-tabs" aria-label={t('Активы')}>
        <Link to="/assets" className={tab === 'schemas' ? 'is-active' : ''}>{t('Схемы объектов')}</Link>
        <Link to="/assets/search" className={tab === 'search' ? 'is-active' : ''}>{t('Поиск объектов')}</Link>
      </nav>
    </>
  );
}

/** Jira Assets landing: object schemas the user can see. */
export function AssetsHomePage() {
  const { t, formatDate } = useLocalization();
  const navigate = useNavigate();
  const [schemas, setSchemas] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    assetsApi.getSchemas().then(setSchemas).catch((e) => { setError(e.message); setSchemas([]); });
  }, []);

  const rows = (schemas || []).filter((s) => {
    const needle = query.trim().toLowerCase();
    return !needle || s.name.toLowerCase().includes(needle) || s.key.toLowerCase().includes(needle);
  });

  return (
    <div className="settings-shell assets-page">
      <section className="settings-content is-wide">
        <AssetsHeader tab="schemas" actions={<button type="button" className="app-btn app-btn-primary" onClick={() => setCreating(true)}>{t('Создать схему')}</button>} />
        <p className="settings-description">{t('Отслеживайте оборудование, программное обеспечение, сервисы и всё, что важно для работы, и связывайте их с задачами.')}</p>
        {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
        {schemas && schemas.length === 0 ? (
          <div className="assets-empty">
            <div className="assets-empty-art" aria-hidden="true"><NavIcon name="assets" size={56} /></div>
            <h2>{t('Создайте первую схему объектов')}</h2>
            <p>{t('Схема объединяет типы объектов — например, ноутбуки, серверы и лицензии — и их атрибуты. Начните с готового шаблона.')}</p>
            <button type="button" className="app-btn app-btn-primary" onClick={() => setCreating(true)}>{t('Создать схему')}</button>
          </div>
        ) : (
          <>
            <div className="settings-toolbar">
              <label className="settings-search">
                <NavIcon name="search" size={14} />
                <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Поиск схем')} aria-label={t('Поиск схем')} />
              </label>
            </div>
            <div className="settings-table-wrap">
              <table className="settings-table">
                <thead>
                  <tr>
                    <th>{t('Название')}</th>
                    <th className="is-narrow">{t('Ключ')}</th>
                    <th className="hide-mobile">{t('Команда')}</th>
                    <th className="is-narrow">{t('Типов')}</th>
                    <th className="is-narrow">{t('Объектов')}</th>
                    <th className="hide-mobile">{t('Обновлено')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <Link to={`/assets/schema/${s.id}`} className="settings-table-name">
                          <TypeIcon icon="assets" />
                          <span>{s.name}{s.description && <span className="settings-row-desc" style={{ display: 'block' }}>{s.description}</span>}</span>
                        </Link>
                      </td>
                      <td className="is-narrow"><span className="assets-key">{s.key}</span></td>
                      <td className="hide-mobile">{s.teamName || '—'}</td>
                      <td className="is-narrow">{s.typeCount}</td>
                      <td className="is-narrow">{s.objectCount}</td>
                      <td className="hide-mobile">{formatDate(s.updatedAt, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!schemas && <p className="settings-empty">{t('Загрузка...')}</p>}
              {schemas && schemas.length > 0 && rows.length === 0 && <p className="settings-empty">{t('Ничего не найдено')}</p>}
            </div>
          </>
        )}
      </section>
      {creating && <CreateSchemaDialog onClose={() => setCreating(false)} onCreated={(schema) => navigate(`/assets/schema/${schema.id}`)} />}
    </div>
  );
}

function AqlHelp({ onPick }) {
  const { t } = useLocalization();
  return (
    <div className="assets-aql-help">
      <p>{t('AQL (язык запросов активов): поле, оператор и значение. Операторы: =, !=, ~ (содержит), !~, >, <, >=, <=, IN, NOT IN, IS EMPTY, IS NOT EMPTY. Условия объединяются через AND, OR, NOT и скобки. Названия атрибутов с пробелами берите в кавычки.')}</p>
      <ul>
        {AQL_EXAMPLES.map(([aql, label]) => (
          <li key={aql}><button type="button" className="assets-link-btn" onClick={() => onPick(aql)}><code>{aql}</code></button> — {t(label)}</li>
        ))}
      </ul>
    </div>
  );
}

function Pagination({ page, total, onChange }) {
  const { t } = useLocalization();
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  return (
    <div className="assets-pagination">
      <button type="button" className="app-btn app-btn-subtle" disabled={page <= 1} onClick={() => onChange(page - 1)}>{t('Назад')}</button>
      <span>{page} / {pages}</span>
      <button type="button" className="app-btn app-btn-subtle" disabled={page >= pages} onClick={() => onChange(page + 1)}>{t('Вперёд')}</button>
    </div>
  );
}

/** Global AQL search across every schema the user can see. */
export function AssetSearchPage() {
  const { t, formatDate } = useLocalization();
  const params = useQueryParams();
  const navigate = useNavigate();
  const aql = params.get('aql') || '';
  const page = Number(params.get('page')) || 1;
  const [draft, setDraft] = useState(aql);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [help, setHelp] = useState(!aql);

  useEffect(() => { setDraft(aql); }, [aql]);
  useEffect(() => {
    setError('');
    setResult(null);
    assetsApi.search({ aql, page, pageSize: PAGE_SIZE }).then(setResult).catch((e) => { setError(e.message); setResult({ items: [], total: 0 }); });
  }, [aql, page]);

  const run = (value, nextPage = 1) => navigate(`/assets/search?aql=${encodeURIComponent(value)}${nextPage > 1 ? `&page=${nextPage}` : ''}`);

  return (
    <div className="settings-shell assets-page">
      <section className="settings-content is-wide">
        <AssetsHeader tab="search" />
        <form className="assets-aql-bar" onSubmit={(e) => { e.preventDefault(); run(draft.trim()); }}>
          <span className="assets-aql-label">AQL</span>
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('Введите AQL-запрос или текст для поиска')} aria-label="AQL" spellCheck={false} />
          <button type="submit" className="app-btn app-btn-primary">{t('Поиск')}</button>
          <button type="button" className="app-btn app-btn-subtle" onClick={() => setHelp((v) => !v)} aria-expanded={help}>{t('Справка')}</button>
        </form>
        {help && <AqlHelp onPick={(value) => { setDraft(value); run(value); }} />}
        {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
        {result && !error && <p className="assets-muted">{t('Найдено объектов')}: {result.total}</p>}
        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead>
              <tr>
                <th className="is-narrow">{t('Ключ')}</th>
                <th>{t('Название')}</th>
                <th>{t('Тип')}</th>
                <th className="hide-mobile">{t('Схема')}</th>
                <th className="is-narrow hide-mobile">{t('Задачи')}</th>
                <th className="hide-mobile">{t('Обновлено')}</th>
              </tr>
            </thead>
            <tbody>
              {(result?.items || []).map((o) => (
                <tr key={o.id} className="assets-row-link" onClick={() => navigate(`/assets/object/${o.id}`)}>
                  <td className="is-narrow"><span className="assets-key">{o.key}</span></td>
                  <td><Link to={`/assets/object/${o.id}`} className="settings-table-name" onClick={(e) => e.stopPropagation()}><TypeIcon icon={o.typeIcon} />{o.label}</Link></td>
                  <td>{o.typeName}</td>
                  <td className="hide-mobile"><Link to={`/assets/schema/${o.schemaId}`} onClick={(e) => e.stopPropagation()}>{o.schemaName}</Link></td>
                  <td className="is-narrow hide-mobile">{o.issueCount || '—'}</td>
                  <td className="hide-mobile">{formatDate(o.updatedAt, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!result && <p className="settings-empty">{t('Загрузка...')}</p>}
          {result && result.items.length === 0 && !error && <p className="settings-empty">{t('Объекты не найдены')}</p>}
        </div>
        {result && <Pagination page={page} total={result.total} onChange={(p) => run(aql, p)} />}
      </section>
    </div>
  );
}

function TypeTree({ types, selectedId, onSelect, onAddChild, canManage }) {
  const { t } = useLocalization();
  const [collapsed, setCollapsed] = useState(new Set());
  const children = useMemo(() => {
    const map = new Map();
    types.forEach((type) => {
      const key = type.parentTypeId || 'root';
      map.set(key, [...(map.get(key) || []), type]);
    });
    return map;
  }, [types]);
  const total = useCallback(function count(id) {
    return (types.find((x) => x.id === id)?.objectCount || 0) + (children.get(id) || []).reduce((sum, c) => sum + count(c.id), 0);
  }, [types, children]);

  const render = (parent, depth) => (children.get(parent) || []).map((type) => {
    const kids = children.get(type.id) || [];
    const isCollapsed = collapsed.has(type.id);
    return (
      <li key={type.id}>
        <div className={`assets-tree-item${selectedId === type.id ? ' is-selected' : ''}`} style={{ paddingLeft: 8 + depth * 16 }}>
          <button
            type="button"
            className="assets-tree-toggle"
            aria-label={isCollapsed ? t('Развернуть') : t('Свернуть')}
            style={{ visibility: kids.length ? 'visible' : 'hidden' }}
            onClick={() => setCollapsed((prev) => { const next = new Set(prev); if (next.has(type.id)) next.delete(type.id); else next.add(type.id); return next; })}
          >
            <NavIcon name={isCollapsed ? 'chevronRight' : 'chevronDown'} size={12} />
          </button>
          <button type="button" className="assets-tree-label" onClick={() => onSelect(type.id)} aria-current={selectedId === type.id ? 'true' : undefined}>
            <TypeIcon icon={type.icon} />
            <span className="assets-tree-name">{type.name}</span>
            <span className="assets-count">{kids.length ? total(type.id) : type.objectCount}</span>
          </button>
          {canManage && <button type="button" className="assets-tree-add" title={t('Добавить дочерний тип')} aria-label={t('Добавить дочерний тип')} onClick={() => onAddChild(type.id)}><NavIcon name="plus" size={12} /></button>}
        </div>
        {kids.length > 0 && !isCollapsed && <ul>{render(type.id, depth + 1)}</ul>}
      </li>
    );
  });

  return <ul className="assets-tree">{render('root', 0)}</ul>;
}

function ObjectsTable({ schema, type, reloadKey }) {
  const { t, formatDate } = useLocalization();
  const navigate = useNavigate();
  const [filter, setFilter] = useState('');
  const [applied, setApplied] = useState('');
  const [includeChildren, setIncludeChildren] = useState(true);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { setPage(1); setFilter(''); setApplied(''); }, [type.id]);
  useEffect(() => {
    setResult(null);
    setError('');
    assetsApi.search({ schemaId: schema.id, typeId: type.id, includeChildren, aql: applied, page, pageSize: PAGE_SIZE })
      .then(setResult).catch((e) => { setError(e.message); setResult({ items: [], total: 0, columns: [] }); });
  }, [schema.id, type.id, includeChildren, applied, page, reloadKey]);

  const columns = (result?.columns || type.effectiveAttributes || []).slice(0, 5);
  const hasChildren = schema.types.some((x) => x.parentTypeId === type.id);

  return (
    <>
      <div className="settings-toolbar">
        <form className="settings-search assets-filter" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(filter.trim()); }}>
          <NavIcon name="search" size={14} />
          <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('Фильтр: текст или AQL')} aria-label={t('Фильтр: текст или AQL')} />
        </form>
        {hasChildren && <label className="settings-checkbox"><input type="checkbox" checked={includeChildren} onChange={(e) => { setPage(1); setIncludeChildren(e.target.checked); }} /> {t('Включая дочерние типы')}</label>}
        {result && <span className="assets-muted">{t('Объектов')}: {result.total}</span>}
      </div>
      {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
      <div className="settings-table-wrap">
        <table className="settings-table">
          <thead>
            <tr>
              <th className="is-narrow">{t('Ключ')}</th>
              <th>{t('Название')}</th>
              {includeChildren && hasChildren && <th className="hide-mobile">{t('Тип')}</th>}
              {columns.map((c) => <th key={c.id} className="hide-mobile">{c.name}</th>)}
              <th className="hide-mobile">{t('Обновлено')}</th>
            </tr>
          </thead>
          <tbody>
            {(result?.items || []).map((o) => (
              <tr key={o.id} className="assets-row-link" onClick={() => navigate(`/assets/object/${o.id}`)}>
                <td className="is-narrow"><span className="assets-key">{o.key}</span></td>
                <td><Link to={`/assets/object/${o.id}`} className="settings-table-name" onClick={(e) => e.stopPropagation()}><TypeIcon icon={o.typeIcon} />{o.label}</Link></td>
                {includeChildren && hasChildren && <td className="hide-mobile">{o.typeName}</td>}
                {columns.map((c) => {
                  const v = o.values.find((x) => x.attributeId === c.id);
                  return <td key={c.id} className="hide-mobile">{v ? <AttributeValue attribute={c} value={v.value} display={v.display} reference={v.referencedObjectId ? { id: v.referencedObjectId, label: v.display, key: '' } : null} /> : <span className="assets-muted">—</span>}</td>;
                })}
                <td className="hide-mobile">{formatDate(o.updatedAt, { day: 'numeric', month: 'short' })}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!result && <p className="settings-empty">{t('Загрузка...')}</p>}
        {result && result.items.length === 0 && !error && <p className="settings-empty">{applied ? t('Объекты не найдены') : t('В этом типе пока нет объектов.')}</p>}
      </div>
      {result && <Pagination page={page} total={result.total} onChange={setPage} />}
    </>
  );
}

function AttributesTable({ schema, type, canManage, onEdit, onDelete, onAdd }) {
  const { t } = useLocalization();
  const typeName = (id) => schema.types.find((x) => x.id === id)?.name || '—';
  return (
    <>
      {canManage && <div className="settings-toolbar"><button type="button" className="app-btn" onClick={onAdd}><NavIcon name="plus" size={14} /> {t('Добавить атрибут')}</button></div>}
      <div className="settings-table-wrap">
        <table className="settings-table">
          <thead>
            <tr>
              <th>{t('Атрибут')}</th>
              <th>{t('Тип')}</th>
              <th className="hide-mobile">{t('Подробности')}</th>
              <th className="is-narrow">{t('Обязательный')}</th>
              <th className="hide-mobile">{t('Наследуется от')}</th>
              {canManage && <th className="is-narrow" aria-label={t('Действия')} />}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>{t('Ключ')}</strong></td><td>{t('Системный')}</td><td className="hide-mobile">{schema.key}-N</td><td className="is-narrow">✓</td><td className="hide-mobile">—</td>{canManage && <td />}
            </tr>
            <tr>
              <td><strong>{t('Название')}</strong></td><td>{t('Текст')}</td><td className="hide-mobile">{t('Метка объекта')}</td><td className="is-narrow">✓</td><td className="hide-mobile">—</td>{canManage && <td />}
            </tr>
            {(type.effectiveAttributes || []).map((a) => {
              const inherited = a.objectTypeId !== type.id;
              return (
                <tr key={a.id}>
                  <td>{a.name}</td>
                  <td>{t(ATTRIBUTE_TYPES[a.type] || '')}</td>
                  <td className="hide-mobile">{a.type === ATTR.Reference ? `→ ${typeName(a.referenceTypeId)}` : (a.options || []).join(', ') || '—'}</td>
                  <td className="is-narrow">{a.required ? '✓' : ''}</td>
                  <td className="hide-mobile">{inherited ? typeName(a.objectTypeId) : '—'}</td>
                  {canManage && (
                    <td className="is-narrow assets-row-actions">
                      {!inherited && <>
                        <button type="button" className="app-icon-btn" aria-label={t('Изменить')} onClick={() => onEdit(a)}><NavIcon name="edit" size={14} /></button>
                        <button type="button" className="app-icon-btn" aria-label={t('Удалить')} onClick={() => onDelete(a)}><NavIcon name="trash" size={14} /></button>
                      </>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Schema workspace: object type tree on the left, objects or attributes of the selected type on the right. */
export function AssetSchemaPage() {
  const { t } = useLocalization();
  const { schemaId } = useParams();
  const params = useQueryParams();
  const navigate = useNavigate();
  const users = useUsers();
  const [schema, setSchema] = useState(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const typeId = params.get('type');
  const tab = params.get('tab') === 'attributes' ? 'attributes' : 'objects';

  const load = useCallback(() => assetsApi.getSchema(schemaId).then(setSchema).catch((e) => setError(e.message)), [schemaId]);
  useEffect(() => { load(); }, [load]);

  const select = (id, nextTab = tab) => navigate(`/assets/schema/${schemaId}?type=${id}${nextTab === 'attributes' ? '&tab=attributes' : ''}`, { replace: true });
  const selected = schema?.types.find((x) => x.id === typeId) || schema?.types.find((x) => !x.parentTypeId) || null;
  const canWork = schema?.permission >= PERMISSION.Work;
  const canManage = schema?.permission >= PERMISSION.Manage;
  const canAdmin = schema?.permission >= PERMISSION.Admin;
  const close = () => setDialog(null);
  const refresh = () => { close(); setReloadKey((k) => k + 1); return load(); };

  if (error) return <div className="settings-shell"><section className="settings-content"><p className="settings-save-status is-error" role="alert">{error}</p><Link to="/assets">{t('Ко всем схемам')}</Link></section></div>;
  if (!schema) return <div className="settings-shell"><section className="settings-content"><p className="settings-empty">{t('Загрузка...')}</p></section></div>;

  return (
    <div className="assets-page assets-schema">
      <div className="assets-schema-header">
        <nav className="settings-breadcrumbs" aria-label={t('Навигация')}>
          <Link to="/assets">{t('Активы')}</Link><span className="settings-breadcrumbs-sep">/</span><Link to="/assets">{t('Схемы объектов')}</Link>
        </nav>
        <div className="settings-title-row">
          <h1 className="settings-title"><TypeIcon icon="assets" size={20} /> {schema.name} <span className="assets-key">{schema.key}</span></h1>
          <div className="settings-actions">
            {canWork && schema.types.length > 0 && <button type="button" className="app-btn app-btn-primary" onClick={() => setDialog({ kind: 'object' })}>{t('Создать объект')}</button>}
            <div className="assets-menu">
              <button type="button" className="app-btn app-btn-subtle" aria-haspopup="menu" aria-expanded={menuOpen} aria-label={t('Ещё')} onClick={() => setMenuOpen((v) => !v)}><NavIcon name="more" /></button>
              {menuOpen && (
                <div className="assets-menu-list" role="menu" onMouseLeave={() => setMenuOpen(false)}>
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); navigate(`/assets/search?aql=${encodeURIComponent(`schemaKey = ${schema.key}`)}`); }}>{t('Поиск в схеме (AQL)')}</button>
                  {canManage && <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setDialog({ kind: 'schema' }); }}>{t('Настройки схемы')}</button>}
                  {canAdmin && <button type="button" role="menuitem" className="is-danger" onClick={() => { setMenuOpen(false); setDialog({ kind: 'deleteSchema' }); }}>{t('Удалить схему')}</button>}
                </div>
              )}
            </div>
          </div>
        </div>
        {schema.description && <p className="settings-description">{schema.description}</p>}
      </div>

      <div className="assets-schema-body">
        <aside className="assets-schema-side" aria-label={t('Типы объектов')}>
          <div className="assets-side-header">
            <h2>{t('Типы объектов')}</h2>
            {canManage && <button type="button" className="app-icon-btn" aria-label={t('Создать тип объектов')} title={t('Создать тип объектов')} onClick={() => setDialog({ kind: 'type' })}><NavIcon name="plus" size={14} /></button>}
          </div>
          {schema.types.length === 0
            ? <p className="assets-muted assets-side-empty">{t('Типов пока нет.')}{canManage && <> <button type="button" className="assets-link-btn" onClick={() => setDialog({ kind: 'type' })}>{t('Создать тип')}</button></>}</p>
            : <TypeTree types={schema.types} selectedId={selected?.id} onSelect={(id) => select(id)} canManage={canManage} onAddChild={(id) => setDialog({ kind: 'type', parentId: id })} />}
        </aside>

        <section className="assets-schema-main">
          {selected ? (
            <>
              <div className="assets-type-header">
                <div>
                  <h2><TypeIcon icon={selected.icon} size={18} /> {selected.name}</h2>
                  {selected.description && <p className="assets-muted">{selected.description}</p>}
                </div>
                <div className="settings-actions">
                  {canWork && <button type="button" className="app-btn" onClick={() => setDialog({ kind: 'import' })}><NavIcon name="upload" size={14} /> {t('Импорт')}</button>}
                  <button type="button" className="app-btn" onClick={() => assetsApi.exportCsv(selected.id).then((blob) => downloadBlob(blob, `${schema.key}-${selected.name}.csv`)).catch((e) => setError(e.message))}><NavIcon name="download" size={14} /> {t('Экспорт')}</button>
                  {canManage && <button type="button" className="app-icon-btn" aria-label={t('Изменить тип')} title={t('Изменить тип')} onClick={() => setDialog({ kind: 'type', type: selected })}><NavIcon name="edit" size={14} /></button>}
                  {canManage && <button type="button" className="app-icon-btn" aria-label={t('Удалить тип')} title={t('Удалить тип')} onClick={() => setDialog({ kind: 'deleteType' })}><NavIcon name="trash" size={14} /></button>}
                </div>
              </div>
              <nav className="assets-tabs is-small" aria-label={selected.name}>
                <button type="button" className={tab === 'objects' ? 'is-active' : ''} onClick={() => select(selected.id, 'objects')}>{t('Объекты')}</button>
                <button type="button" className={tab === 'attributes' ? 'is-active' : ''} onClick={() => select(selected.id, 'attributes')}>{t('Атрибуты')} <span className="assets-count">{selected.effectiveAttributes.length + 2}</span></button>
              </nav>
              {tab === 'objects'
                ? <ObjectsTable schema={schema} type={selected} reloadKey={reloadKey} />
                : <AttributesTable schema={schema} type={selected} canManage={canManage} onAdd={() => setDialog({ kind: 'attribute' })} onEdit={(a) => setDialog({ kind: 'attribute', attribute: a })} onDelete={(a) => setDialog({ kind: 'deleteAttribute', attribute: a })} />}
            </>
          ) : (
            <div className="assets-empty">
              <div className="assets-empty-art" aria-hidden="true"><NavIcon name="box" size={48} /></div>
              <h2>{t('Создайте тип объектов')}</h2>
              <p>{t('Типы объектов описывают, что вы отслеживаете: например, «Ноутбук» или «Лицензия». У каждого типа свои атрибуты.')}</p>
              {canManage && <button type="button" className="app-btn app-btn-primary" onClick={() => setDialog({ kind: 'type' })}>{t('Создать тип объектов')}</button>}
            </div>
          )}
        </section>
      </div>

      {dialog?.kind === 'type' && <TypeDialog schema={schema} type={dialog.type} parentId={dialog.parentId} onClose={close} onSaved={(r) => refresh().then(() => r?.id && select(r.id))} />}
      {dialog?.kind === 'attribute' && <AttributeDialog schema={schema} typeId={selected.id} attribute={dialog.attribute} onClose={close} onSaved={refresh} />}
      {dialog?.kind === 'object' && <ObjectDialog schema={schema} typeId={selected?.id} users={users} onClose={close} onSaved={(o) => navigate(`/assets/object/${o.id}`)} />}
      {dialog?.kind === 'import' && <ImportDialog type={selected} onClose={refresh} />}
      {dialog?.kind === 'schema' && <EditSchemaDialog schema={schema} onClose={close} onSaved={refresh} />}
      {dialog?.kind === 'deleteType' && <ConfirmDialog title={t('Удалить тип объектов?')} message={`${t('Тип')} «${selected.name}» ${t('и его атрибуты будут удалены. Удалить можно только тип без объектов и дочерних типов.')}`} confirmLabel={t('Удалить')} onClose={close} onConfirm={() => assetsApi.deleteType(selected.id).then(() => { navigate(`/assets/schema/${schemaId}`, { replace: true }); return refresh(); })} />}
      {dialog?.kind === 'deleteAttribute' && <ConfirmDialog title={t('Удалить атрибут?')} message={`${t('Атрибут')} «${dialog.attribute.name}» ${t('и все его значения будут удалены без возможности восстановления.')}`} confirmLabel={t('Удалить')} onClose={close} onConfirm={() => assetsApi.deleteAttribute(dialog.attribute.id).then(refresh)} />}
      {dialog?.kind === 'deleteSchema' && <ConfirmDialog title={t('Удалить схему объектов?')} message={`${t('Схема')} «${schema.name}» ${t('со всеми типами, объектами и связями с задачами будет удалена без возможности восстановления.')}`} confirmLabel={t('Удалить')} onClose={close} onConfirm={() => assetsApi.deleteSchema(schema.id).then(() => navigate('/assets'))} />}
    </div>
  );
}

function ReferenceGraph({ objectId }) {
  const { t } = useLocalization();
  const navigate = useNavigate();
  const [depth, setDepth] = useState(1);
  const [graph, setGraph] = useState(null);
  useEffect(() => { setGraph(null); assetsApi.getGraph(objectId, depth).then(setGraph).catch(() => setGraph({ nodes: [], edges: [] })); }, [objectId, depth]);

  const layout = useMemo(() => {
    if (!graph) return null;
    const level = new Map([[graph.rootId, 0]]);
    let frontier = [graph.rootId];
    while (frontier.length) {
      const next = [];
      graph.edges.forEach((e) => {
        [[e.from, e.to], [e.to, e.from]].forEach(([a, b]) => {
          if (frontier.includes(a) && !level.has(b)) { level.set(b, level.get(a) + 1); next.push(b); }
        });
      });
      frontier = next;
    }
    const rings = new Map();
    graph.nodes.forEach((n) => { const l = level.get(n.id) ?? 1; rings.set(l, [...(rings.get(l) || []), n]); });
    const pos = new Map();
    rings.forEach((nodes, l) => nodes.forEach((n, i) => {
      if (l === 0) { pos.set(n.id, [320, 200]); return; }
      const angle = (2 * Math.PI * i) / nodes.length - Math.PI / 2 + (l - 1) * 0.35;
      pos.set(n.id, [320 + Math.cos(angle) * 140 * l, 200 + Math.sin(angle) * 80 * l]);
    }));
    return pos;
  }, [graph]);

  return (
    <section className="assets-card">
      <div className="assets-card-header">
        <h3><NavIcon name="graph" size={14} /> {t('Граф связей')}</h3>
        <select className="app-select" value={depth} onChange={(e) => setDepth(Number(e.target.value))} aria-label={t('Глубина')}>
          <option value={1}>{t('1 уровень')}</option>
          <option value={2}>{t('2 уровня')}</option>
          <option value={3}>{t('3 уровня')}</option>
        </select>
      </div>
      {!graph && <p className="assets-muted">{t('Загрузка...')}</p>}
      {graph && graph.edges.length === 0 && <p className="assets-muted">{t('У объекта пока нет ссылок на другие объекты. Добавьте атрибут типа «Ссылка на объект».')}</p>}
      {graph && graph.edges.length > 0 && layout && (
        <svg className="assets-graph" viewBox="0 0 640 400" role="img" aria-label={t('Граф связей')}>
          <defs><marker id="assets-arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z" /></marker></defs>
          {graph.edges.map((e) => {
            const [x1, y1] = layout.get(e.from) || [0, 0];
            const [x2, y2] = layout.get(e.to) || [0, 0];
            const len = Math.hypot(x2 - x1, y2 - y1) || 1;
            const ex = x2 - ((x2 - x1) / len) * 26;
            const ey = y2 - ((y2 - y1) / len) * 26;
            return (
              <g key={`${e.from}-${e.to}-${e.label}`} className="assets-graph-edge">
                <line x1={x1} y1={y1} x2={ex} y2={ey} markerEnd="url(#assets-arrow)" />
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 - 4} textAnchor="middle">{e.label}</text>
              </g>
            );
          })}
          {graph.nodes.map((n) => {
            const [x, y] = layout.get(n.id) || [0, 0];
            const root = n.id === graph.rootId;
            return (
              <g key={n.id} className={`assets-graph-node${root ? ' is-root' : ''}`} transform={`translate(${x} ${y})`} onClick={() => !root && navigate(`/assets/object/${n.id}`)} role={root ? undefined : 'link'} tabIndex={root ? undefined : 0} onKeyDown={(e) => { if (!root && e.key === 'Enter') navigate(`/assets/object/${n.id}`); }}>
                <circle r="24" />
                <g transform="translate(-9 -9)"><NavIcon name={n.icon || 'box'} size={18} /></g>
                <text y="40" textAnchor="middle">{n.label.length > 22 ? `${n.label.slice(0, 21)}…` : n.label}</text>
                <text y="54" textAnchor="middle" className="assets-graph-key">{n.key}</text>
              </g>
            );
          })}
        </svg>
      )}
    </section>
  );
}

function LinkedIssues({ object, onChanged }) {
  const { t } = useLocalization();
  const [key, setKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const link = async (e) => {
    e.preventDefault();
    if (!key.trim()) return;
    setBusy(true);
    setError('');
    try { await assetsApi.linkIssue(object.id, { issueKey: key.trim() }); setKey(''); onChanged(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  const unlink = async (questId) => {
    setError('');
    try { await assetsApi.unlinkIssue(object.id, questId); onChanged(); } catch (err) { setError(err.message); }
  };
  return (
    <section className="assets-card">
      <div className="assets-card-header"><h3>{t('Связанные задачи')} <span className="assets-count">{object.issues.length}</span></h3></div>
      <form className="assets-inline-form" onSubmit={link}>
        <input value={key} onChange={(e) => setKey(e.target.value)} placeholder={t('Ключ задачи, например KAN-12')} aria-label={t('Ключ задачи')} />
        <button type="submit" className="app-btn" disabled={busy || !key.trim()}>{t('Связать')}</button>
      </form>
      {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
      {object.issues.length === 0 ? <p className="assets-muted">{t('Объект пока не связан ни с одной задачей.')}</p> : (
        <ul className="assets-issue-list">
          {object.issues.map((issue) => (
            <li key={issue.id}>
              <Link to={`/board/${issue.boardId}/issue/${issue.id}`}><span className="assets-key">{issue.issueKey}</span> {issue.title}</Link>
              <span className={`settings-lozenge ${issue.completedAt ? 'is-success' : 'is-info'}`}>{issue.status}</span>
              <button type="button" className="app-icon-btn" aria-label={t('Отвязать')} title={t('Отвязать')} onClick={() => unlink(issue.id)}><NavIcon name="close" size={12} /></button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function historyText(t, item) {
  if (item.field === 'created') return t('создал(а) объект');
  if (item.field === 'issue') return item.newValue ? `${t('связал(а) с задачей')} ${item.newValue}` : `${t('отвязал(а) задачу')} ${item.oldValue}`;
  const field = item.field === 'label' ? t('Название') : item.field === 'objectType' ? t('Тип объекта') : item.field;
  return `${t('изменил(а)')} «${field}»: ${item.oldValue || '—'} → ${item.newValue || '—'}`;
}

/** Object detail: attributes, outbound/inbound references, graph, linked work items and history. */
export function AssetObjectPage() {
  const { t, formatDate } = useLocalization();
  const { objectId } = useParams();
  const navigate = useNavigate();
  const users = useUsers();
  const [object, setObject] = useState(null);
  const [schema, setSchema] = useState(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState(null);

  const load = useCallback(() => assetsApi.getObject(objectId).then((o) => { setObject(o); return o; }).catch((e) => setError(e.message)), [objectId]);
  useEffect(() => { setObject(null); load(); }, [load]);
  useEffect(() => { if (object?.schema.id && schema?.id !== object.schema.id) assetsApi.getSchema(object.schema.id).then(setSchema).catch(() => {}); }, [object, schema]);

  if (error) return <div className="settings-shell"><section className="settings-content"><p className="settings-save-status is-error" role="alert">{error}</p><Link to="/assets">{t('Ко всем схемам')}</Link></section></div>;
  if (!object) return <div className="settings-shell"><section className="settings-content"><p className="settings-empty">{t('Загрузка...')}</p></section></div>;
  const canWork = object.permission >= PERMISSION.Work;

  return (
    <div className="settings-shell assets-page">
      <section className="settings-content is-wide">
        <nav className="settings-breadcrumbs" aria-label={t('Навигация')}>
          <Link to="/assets">{t('Активы')}</Link><span className="settings-breadcrumbs-sep">/</span>
          <Link to={`/assets/schema/${object.schema.id}`}>{object.schema.name}</Link><span className="settings-breadcrumbs-sep">/</span>
          <Link to={`/assets/schema/${object.schema.id}?type=${object.type.id}`}>{object.type.path.join(' / ')}</Link>
        </nav>
        <div className="settings-title-row">
          <h1 className="settings-title"><TypeIcon icon={object.type.icon} size={22} /> {object.label} <span className="assets-key">{object.key}</span></h1>
          {canWork && (
            <div className="settings-actions">
              <button type="button" className="app-btn" disabled={!schema} onClick={() => setDialog('edit')}><NavIcon name="edit" size={14} /> {t('Изменить')}</button>
              <button type="button" className="app-btn app-btn-subtle" onClick={() => setDialog('delete')}><NavIcon name="trash" size={14} /> {t('Удалить')}</button>
            </div>
          )}
        </div>

        <div className="assets-object-layout">
          <div className="assets-object-main">
            <section className="assets-card">
              <div className="assets-card-header"><h3>{t('Атрибуты')}</h3></div>
              <dl className="assets-attr-list">
                <dt>{t('Ключ')}</dt><dd><span className="assets-key">{object.key}</span></dd>
                <dt>{t('Название')}</dt><dd>{object.label}</dd>
                <dt>{t('Тип объекта')}</dt><dd><TypeIcon icon={object.type.icon} /> {object.type.name}</dd>
                {object.attributes.map((a) => (
                  <React.Fragment key={a.attribute.id}>
                    <dt>{a.attribute.name}</dt>
                    <dd><AttributeValue attribute={a.attribute} value={a.value} display={a.display} reference={a.reference} /></dd>
                  </React.Fragment>
                ))}
              </dl>
            </section>
            <ReferenceGraph objectId={object.id} />
            <section className="assets-card">
              <div className="assets-card-header"><h3>{t('Входящие ссылки')} <span className="assets-count">{object.inboundReferences.length}</span></h3></div>
              {object.inboundReferences.length === 0 ? <p className="assets-muted">{t('Другие объекты не ссылаются на этот объект.')}</p> : (
                <table className="settings-table">
                  <thead><tr><th>{t('Объект')}</th><th>{t('Тип')}</th><th>{t('Через атрибут')}</th></tr></thead>
                  <tbody>
                    {object.inboundReferences.map((r) => (
                      <tr key={`${r.id}-${r.attributeName}`}>
                        <td><Link to={`/assets/object/${r.id}`} className="settings-table-name"><TypeIcon icon={r.typeIcon} />{r.label} <span className="assets-muted">{r.key}</span></Link></td>
                        <td>{r.typeName}</td>
                        <td>{r.attributeName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </div>
          <aside className="assets-object-side">
            <LinkedIssues object={object} onChanged={load} />
            <section className="assets-card">
              <div className="assets-card-header"><h3>{t('Сведения')}</h3></div>
              <dl className="assets-attr-list is-compact">
                <dt>{t('Схема')}</dt><dd><Link to={`/assets/schema/${object.schema.id}`}>{object.schema.name}</Link></dd>
                <dt>{t('Создан')}</dt><dd>{formatDate(object.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}{object.createdBy && <> · {object.createdBy.displayName}</>}</dd>
                <dt>{t('Обновлён')}</dt><dd>{formatDate(object.updatedAt, { dateStyle: 'medium', timeStyle: 'short' })}</dd>
              </dl>
            </section>
            <section className="assets-card">
              <div className="assets-card-header"><h3>{t('История')}</h3></div>
              {object.history.length === 0 ? <p className="assets-muted">{t('История пока пуста.')}</p> : (
                <ul className="assets-history">
                  {object.history.map((h) => (
                    <li key={h.id}>
                      <strong>{h.user?.displayName || t('Система')}</strong> {historyText(t, h)}
                      <span className="assets-muted"> · {formatDate(h.createdAt, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </aside>
        </div>
      </section>
      {dialog === 'edit' && schema && <ObjectDialog schema={schema} object={object} users={users} onClose={() => setDialog(null)} onSaved={(o) => { setDialog(null); setObject(o); }} />}
      {dialog === 'delete' && <ConfirmDialog title={t('Удалить объект?')} message={`${object.key} «${object.label}» ${t('будет удалён вместе со связями с задачами. Ссылки других объектов на него очистятся.')}`} confirmLabel={t('Удалить')} onClose={() => setDialog(null)} onConfirm={() => assetsApi.deleteObject(object.id).then(() => navigate(`/assets/schema/${object.schema.id}?type=${object.type.id}`))} />}
    </div>
  );
}
