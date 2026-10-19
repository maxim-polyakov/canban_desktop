import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from '../../i18n/navigation.jsx';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { dashboards as dashboardsApi, people as peopleApi, spaces as spacesApi } from '../../api.js';
import NavIcon from '../../components/NavIcons.jsx';
import { forgetDashboard, rememberDashboard } from '../../utils/navHistory.js';
import { ISSUE_TYPES, STATUS_CATEGORIES } from '../../utils/issueFilters.js';
import { getIssueTypeMeta, getPriorityMeta, IssueTypeIcon, PriorityIcon } from '../../components/IssueIcons.jsx';
import DashboardWidgetBody from './DashboardWidget.jsx';
import {
  CATEGORIES, CHARTS, MAX_PER_ROW, catalogEntry, newId, rowWidth, sampleData, templateLayout, TEMPLATES, WIDGET_CATALOG,
} from './dashboardWidgets.js';
import './Dashboards.css';

export const DASHBOARDS_CHANGED_EVENT = 'canban:dashboards-changed';
export const notifyDashboardsChanged = () => window.dispatchEvent(new CustomEvent(DASHBOARDS_CHANGED_EVENT));

const BANNER_KEY = 'canban.dashboards.bannerDismissed';
const PRIORITIES = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
const CREATED_PERIODS = [[7, 'последние 7 дней'], [30, 'последние 30 дней'], [90, 'последние 90 дней'], [180, 'последние 180 дней'], [365, 'последние 365 дней']];

function useOutsideClose(open, onClose) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, onClose]);
  return ref;
}

function useSpacesAndPeople() {
  const [spaceList, setSpaceList] = useState([]);
  const [peopleList, setPeopleList] = useState([]);
  useEffect(() => {
    spacesApi.getMine().then((v) => setSpaceList(Array.isArray(v) ? v : [])).catch(() => setSpaceList([]));
    peopleApi.workWith().then((v) => setPeopleList(Array.isArray(v) ? v : [])).catch(() => setPeopleList([]));
  }, []);
  return { spaceList, peopleList };
}

function Menu({ label, items, icon = 'more', className = '' }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  return (
    <span className={`dash-menu ${className}`} ref={ref}>
      <button type="button" className="dash-icon-btn" aria-label={label} title={label} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <NavIcon name={icon} size={16} />
      </button>
      {open && (
        <div className="dash-menu-list" role="menu">
          {items.filter(Boolean).map((item) => (
            <button key={item.label} type="button" role="menuitem" className={`dash-menu-item ${item.danger ? 'is-danger' : ''}`} onClick={() => { close(); item.onClick(); }}>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

function Chip({ label, active, summary, children, disabled, onClear }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  return (
    <span className="dash-chip-wrap" ref={ref}>
      <button type="button" className={`dash-chip ${active ? 'is-active' : ''}`} disabled={disabled} aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span>{label}{active && summary ? `: ${summary}` : ''}</span>
        {!disabled && <NavIcon name="chevronDown" size={12} />}
      </button>
      {active && onClear && !disabled && (
        <button type="button" className="dash-chip-clear" aria-label={label} onClick={onClear}><NavIcon name="close" size={10} /></button>
      )}
      {open && <div className="dash-popover" role="dialog" aria-label={label}>{typeof children === 'function' ? children(close) : children}</div>}
    </span>
  );
}

function CheckList({ options, selected, onChange, searchable, placeholder }) {
  const { t } = useLocalization();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const visible = needle ? options.filter((o) => o.label.toLowerCase().includes(needle)) : options;
  const toggle = (id) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  return (
    <>
      {searchable && <input className="dash-popover-search" type="search" autoFocus value={query} placeholder={placeholder} aria-label={placeholder} onChange={(e) => setQuery(e.target.value)} />}
      <div className="dash-checklist">
        {visible.map((o) => (
          <label key={o.id} className="dash-check">
            <input type="checkbox" checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
            {o.icon}<span>{o.label}</span>
          </label>
        ))}
        {visible.length === 0 && <p className="dash-muted">{t('Ничего не найдено')}</p>}
      </div>
    </>
  );
}

function Modal({ title, onClose, children, footer, wide, className = '' }) {
  const { t } = useLocalization();
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="app-modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`app-modal dash-modal ${wide ? 'is-wide' : ''} ${className}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="app-modal-header">
          <h2>{title}</h2>
          <button type="button" className="dash-icon-btn" aria-label={t('Закрыть')} onClick={onClose}><NavIcon name="close" size={16} /></button>
        </div>
        <div className="dash-modal-body">{children}</div>
        {footer && <div className="dash-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}

function Audience({ value }) {
  const { t } = useLocalization();
  return value === 'org'
    ? <span className="dash-audience"><NavIcon name="teams" size={14} />{t('Моя организация')}</span>
    : <span className="dash-audience"><NavIcon name="lock" size={14} />{t('Закрытые')}</span>;
}

function Avatar({ name, url, size = 24 }) {
  return url
    ? <img className="dash-avatar" src={url} alt="" style={{ width: size, height: size }} />
    : <span className="dash-avatar" style={{ width: size, height: size }}>{(name || '?').slice(0, 1).toUpperCase()}</span>;
}

// ---------- list page ----------

export function DashboardsListPage() {
  const { t } = useLocalization();
  const navigate = useNavigate();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const tab = params.get('tab') === 'trash' ? 'trash' : 'all';
  const { spaceList } = useSpacesAndPeople();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [owners, setOwners] = useState([]);
  const [spacesFilter, setSpacesFilter] = useState([]);
  const [teamsFilter, setTeamsFilter] = useState([]);
  const [sortDir, setSortDir] = useState('asc');
  const [bannerHidden, setBannerHidden] = useState(() => window.localStorage.getItem(BANNER_KEY) === '1');
  const createParam = params.get('create') === '1';
  const [createOpen, setCreateOpen] = useState(createParam);

  useEffect(() => {
    if (createParam) setCreateOpen(true);
  }, [createParam]);

  const load = useCallback(() => {
    setItems(null);
    dashboardsApi.list(tab === 'trash').then((v) => setItems(Array.isArray(v) ? v : [])).catch((e) => { setItems([]); setError(e.message); });
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn) => {
    setError('');
    try { await fn(); notifyDashboardsChanged(); load(); } catch (e) { setError(e.message); }
  };
  const toggleStar = (d) => act(() => dashboardsApi.star(d.id, !d.starred));
  const copy = (d) => act(async () => {
    const created = await dashboardsApi.copy(d.id);
    navigate(`/dashboards/${created.dashboard.id}/edit`);
  });
  const trash = (d) => act(async () => { await dashboardsApi.trash(d.id); forgetDashboard(d.id); });
  const restore = (d) => act(() => dashboardsApi.restore(d.id));
  const purge = (d) => {
    if (!window.confirm(t('Удалить дашборд «${name}» навсегда?', { name: d.name }))) return;
    act(() => dashboardsApi.purge(d.id));
  };
  const dismissBanner = () => { window.localStorage.setItem(BANNER_KEY, '1'); setBannerHidden(true); };
  const closeCreate = () => {
    setCreateOpen(false);
    if (createParam) navigate('/dashboards', { replace: true });
  };

  const spaceById = new Map(spaceList.map((s) => [s.id, s]));
  const ownerOptions = [...new Map((items || []).map((d) => [d.ownerUserId, { id: d.ownerUserId, label: d.ownerName || t('Пользователь') }])).values()];
  const teamOptions = [...new Map(spaceList.map((s) => [s.teamId, { id: s.teamId, label: s.teamName }])).values()].filter((x) => x.id);
  const needle = query.trim().toLowerCase();
  const visible = (items || [])
    .filter((d) => !needle || d.name.toLowerCase().includes(needle) || (d.description || '').toLowerCase().includes(needle))
    .filter((d) => owners.length === 0 || owners.includes(d.ownerUserId))
    .filter((d) => spacesFilter.length === 0 || (d.boardIds || []).some((id) => spacesFilter.includes(id)))
    .filter((d) => teamsFilter.length === 0 || (d.boardIds || []).some((id) => teamsFilter.includes(spaceById.get(id)?.teamId)))
    .sort((a, b) => (b.isDefault - a.isDefault) || (sortDir === 'asc' ? 1 : -1) * a.name.localeCompare(b.name));

  return (
    <div className="page dash-page">
      <div className="dash-header">
        <h1>{t('Дашборды')}</h1>
        <button type="button" className="dash-btn dash-btn-primary" onClick={() => setCreateOpen(true)}>{t('Создать дашборд')}</button>
      </div>
      {!bannerHidden && (
        <div className="dash-banner" role="note">
          <NavIcon name="info" size={18} />
          <div>
            <strong>{t('Новые дашборды уже здесь!')}</strong>
            <p>{t('Создавайте дашборды из шаблонов, настраивайте общие фильтры и собирайте виджеты по задачам, DevOps и целям в одном месте.')}</p>
            <button type="button" className="dash-link" onClick={() => setCreateOpen(true)}>{t('Подробнее')}</button>
          </div>
          <button type="button" className="dash-icon-btn" aria-label={t('Скрыть')} onClick={dismissBanner}><NavIcon name="close" size={14} /></button>
        </div>
      )}
      <div className="dash-tabs" role="tablist">
        <Link role="tab" aria-selected={tab === 'all'} className={tab === 'all' ? 'is-active' : ''} to="/dashboards">{t('Все дашборды')}</Link>
        <Link role="tab" aria-selected={tab === 'trash'} className={tab === 'trash' ? 'is-active' : ''} to="/dashboards?tab=trash">{t('В корзине')}</Link>
      </div>
      {tab === 'trash' && <p className="dash-muted">{t('Дашборды в корзине удаляются навсегда через 30 дней.')}</p>}
      <div className="dash-filters">
        <label className="dash-search">
          <NavIcon name="search" size={14} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Поиск досок управления')} aria-label={t('Поиск досок управления')} />
        </label>
        <Chip label={t('Менеджер')} active={owners.length > 0} summary={owners.length} onClear={() => setOwners([])}>
          <CheckList options={ownerOptions} selected={owners} onChange={setOwners} searchable placeholder={t('Поиск пользователей')} />
        </Chip>
        <Chip label={t('Раздел')} active={spacesFilter.length > 0} summary={spacesFilter.length} onClear={() => setSpacesFilter([])}>
          <CheckList options={spaceList.map((s) => ({ id: s.id, label: s.name }))} selected={spacesFilter} onChange={setSpacesFilter} searchable placeholder={t('Поиск разделов')} />
        </Chip>
        <Chip label={t('Группа')} active={teamsFilter.length > 0} summary={teamsFilter.length} onClear={() => setTeamsFilter([])}>
          <CheckList options={teamOptions} selected={teamsFilter} onChange={setTeamsFilter} searchable placeholder={t('Поиск команд')} />
        </Chip>
      </div>
      {error && <p className="dash-error" role="alert">{error}</p>}
      <div className="dash-table-card">
        <table className="dash-list-table">
          <thead>
            <tr>
              <th className="is-star" aria-label={t('Отмеченные')}><NavIcon name="star" size={14} /></th>
              <th><button type="button" className="dash-sort" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>{t('Название')}<NavIcon name={sortDir === 'asc' ? 'arrowUp' : 'arrowDown'} size={12} /></button></th>
              <th>{t('Менеджеры')}</th>
              <th>{t('Читатели')}</th>
              <th>{t('Редакторы')}</th>
              <th>{t('Пометки')}</th>
              <th className="is-actions" aria-label={t('Действия')} />
            </tr>
          </thead>
          <tbody>
            {visible.map((d) => (
              <tr key={d.id}>
                <td className="is-star">
                  {tab === 'all' && (
                    <button type="button" className={`dash-star ${d.starred ? 'is-starred' : ''}`} aria-label={d.starred ? t('Убрать из отмеченных') : t('Отметить')} onClick={() => toggleStar(d)}>
                      <NavIcon name="star" size={14} filled={d.starred} />
                    </button>
                  )}
                </td>
                <td>
                  {tab === 'all' ? <Link to={`/dashboards/${d.id}`} className="dash-name">{d.name}</Link> : <span className="dash-name">{d.name}</span>}
                  {d.isDefault && <span className="dash-badge">{t('По умолчанию')}</span>}
                  {d.description && <div className="dash-muted dash-desc">{d.description}</div>}
                </td>
                <td><span className="dash-person"><Avatar name={d.ownerName} url={d.ownerAvatarUrl} />{d.ownerName || t('Пользователь')}</span></td>
                <td><Audience value={d.viewers} /></td>
                <td><Audience value={d.editors} /></td>
                <td>{t('${count} чел.', { count: d.starCount })}</td>
                <td className="is-actions">
                  <Menu label={t('Действия')} items={tab === 'all' ? [
                    { label: t('Открыть'), onClick: () => navigate(`/dashboards/${d.id}`) },
                    d.canEdit && { label: t('Изменить'), onClick: () => navigate(`/dashboards/${d.id}/edit`) },
                    { label: t('Копировать'), onClick: () => copy(d) },
                    d.isOwner && !d.isDefault && { label: t('Переместить в корзину'), danger: true, onClick: () => trash(d) },
                  ] : [
                    { label: t('Восстановить'), onClick: () => restore(d) },
                    { label: t('Удалить навсегда'), danger: true, onClick: () => purge(d) },
                  ]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items === null && <div className="dash-state">{t('Загрузка...')}</div>}
        {items !== null && visible.length === 0 && (
          <div className="dash-state">
            {tab === 'trash' ? t('Корзина пуста.') : items.length === 0 ? (
              <>
                <p>{t('Здесь будут отображаться дашборды, которые вы создали или которыми с вами поделились.')}</p>
                <button type="button" className="dash-btn dash-btn-primary" onClick={() => setCreateOpen(true)}>{t('Создать дашборд')}</button>
              </>
            ) : t('Дашборды не найдены.')}
          </div>
        )}
      </div>
      {createOpen && <CreateDashboardDialog spaceList={spaceList} onClose={closeCreate} />}
    </div>
  );
}

// ---------- create ----------

function TemplateThumb({ template }) {
  const rows = template.rows.length ? template.rows : [[['blank', '', {}, 3]]];
  return (
    <div className="dash-thumb" aria-hidden="true">
      {rows.slice(0, 3).map((row, r) => (
        <div key={r} className="dash-thumb-row">
          {row.map(([type, , config, size = 1], w) => (
            <div key={w} className={`dash-thumb-cell is-${type === 'blank' ? 'blank' : config?.chart || 'table'}`} style={{ flex: size }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function TemplatePreview({ template, onClose, onUse }) {
  const { t } = useLocalization();
  const layout = templateLayout(template);
  const data = Object.fromEntries(layout.rows.flatMap((r) => r.widgets).map((w) => [w.id, sampleData(w)]));
  return (
    <Modal title={t(template.name)} onClose={onClose} wide className="dash-preview-modal"
      footer={<><button type="button" className="dash-btn" onClick={onClose}>{t('Закрыть')}</button><button type="button" className="dash-btn dash-btn-primary" onClick={onUse}>{t('Использовать шаблон')}</button></>}>
      <div className="dash-preview">
        <div className="dash-preview-canvas">
          <p className="dash-preview-note"><NavIcon name="info" size={14} />{t('Это просто пример. Он не отражает реальные данные.')}</p>
          <DashboardGrid layout={layout} data={data} sample />
        </div>
        <aside className="dash-preview-info">
          <h3>{t('Информация о шаблоне')}</h3>
          <p>{t(template.description)}</p>
          {template.details && <p className="dash-muted">{t(template.details)}</p>}
          <h4>{t('Виджеты')}</h4>
          <ul>{layout.rows.flatMap((r) => r.widgets).map((w) => <li key={w.id}>{t(w.title)}</li>)}</ul>
        </aside>
      </div>
    </Modal>
  );
}

export function CreateDashboardDialog({ spaceList, onClose }) {
  const { t } = useLocalization();
  const navigate = useNavigate();
  const [step, setStep] = useState('gallery');
  const [templateId, setTemplateId] = useState('blank');
  const [preview, setPreview] = useState(null);
  const [categories, setCategories] = useState([]);
  const [name, setName] = useState('');
  const [boardId, setBoardId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const template = TEMPLATES.find((x) => x.id === templateId);

  const next = () => {
    setName(templateId === 'blank' ? t('Новый дашборд') : t(template.name));
    setStep(templateId === 'blank' ? 'categories' : 'details');
  };
  const create = async () => {
    if (!name.trim()) { setError(t('Введите название дашборда.')); return; }
    setBusy(true);
    setError('');
    try {
      const created = await dashboardsApi.create({
        name: name.trim(), template: templateId, categories: templateId === 'blank' ? categories : [], boardIds: boardId ? [boardId] : [],
      });
      notifyDashboardsChanged();
      onClose();
      navigate(`/dashboards/${created.dashboard.id}/edit`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };
  const toggleCategory = (id) => setCategories((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const detailsFields = (
    <div className="dash-form">
      <label className="dash-field">
        <span>{t('Название')} <b aria-hidden="true">*</b></span>
        <input autoFocus value={name} maxLength={200} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="dash-field">
        <span>{t('Раздел')}</span>
        <select value={boardId} onChange={(e) => setBoardId(e.target.value)}>
          <option value="">{t('Все доступные разделы')}</option>
          {spaceList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <small className="dash-muted">{t('Виджеты покажут данные только по выбранному разделу. Фильтр можно изменить позже.')}</small>
      </label>
    </div>
  );

  if (preview) {
    return <TemplatePreview template={preview} onClose={() => setPreview(null)} onUse={() => { setTemplateId(preview.id); setPreview(null); setName(t(preview.name)); setStep('details'); }} />;
  }

  if (step === 'categories') {
    return (
      <Modal title={t('Что вы хотите отслеживать?')} onClose={onClose} wide
        footer={<><button type="button" className="dash-btn" onClick={() => setStep('gallery')}>{t('Назад')}</button><button type="button" className="dash-btn dash-btn-primary" disabled={busy} onClick={create}>{t('Создать дашборд')}</button></>}>
        <p className="dash-muted">{t('Выберите хотя бы одну категорию, и мы применим к дашборду фильтры и добавим подходящие виджеты. Можно пропустить этот шаг и начать с пустого дашборда.')}</p>
        <div className="dash-categories">
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" className={`dash-category ${categories.includes(c.id) ? 'is-selected' : ''}`} aria-pressed={categories.includes(c.id)} onClick={() => toggleCategory(c.id)}>
              <span className="dash-category-icon"><NavIcon name={c.icon} size={20} /></span>
              <strong>{t(c.name)}</strong>
              <span className="dash-muted">{t(c.description)}</span>
              <span className="dash-category-check" aria-hidden="true">{categories.includes(c.id) && <svg viewBox="0 0 16 16" width="12" height="12"><path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" /></svg>}</span>
            </button>
          ))}
        </div>
        {detailsFields}
        {error && <p className="dash-error" role="alert">{error}</p>}
      </Modal>
    );
  }

  if (step === 'details') {
    return (
      <Modal title={t('Создание дашборда')} onClose={onClose}
        footer={<><button type="button" className="dash-btn" onClick={() => setStep('gallery')}>{t('Назад')}</button><button type="button" className="dash-btn dash-btn-primary" disabled={busy} onClick={create}>{t('Создать дашборд')}</button></>}>
        <div className="dash-chosen-template"><TemplateThumb template={template} /><div><strong>{t(template.name)}</strong><p className="dash-muted">{t(template.description)}</p></div></div>
        {detailsFields}
        {error && <p className="dash-error" role="alert">{error}</p>}
      </Modal>
    );
  }

  return (
    <Modal title={t('Создание дашборда')} onClose={onClose} wide
      footer={<><button type="button" className="dash-btn" onClick={onClose}>{t('Отмена')}</button><button type="button" className="dash-btn dash-btn-primary" onClick={next}>{t('Далее')}</button></>}>
      <div className="dash-gallery">
        {TEMPLATES.map((tpl) => (
          <button key={tpl.id} type="button" className={`dash-template ${templateId === tpl.id ? 'is-selected' : ''}`} aria-pressed={templateId === tpl.id}
            onClick={() => { setTemplateId(tpl.id); if (tpl.id !== 'blank') setPreview(tpl); }}>
            <TemplateThumb template={tpl} />
            <strong>{t(tpl.name)}</strong>
            <span className="dash-muted">{t(tpl.description)}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

// ---------- grid ----------

function WidgetCard({ widget, data, editing, sample, canGrow, onEdit, onResize, onCopy, onDelete }) {
  const { t } = useLocalization();
  return (
    <section className={`dash-widget ${editing ? 'is-editing' : ''}`} style={{ flex: widget.size || 1 }} aria-label={t(widget.title)}>
      <header className="dash-widget-header">
        <h3 title={t(widget.title)}>{t(widget.title) || t(catalogEntry(widget.type)?.title)}</h3>
        {editing && (
          <div className="dash-widget-toolbar">
            <button type="button" className="dash-icon-btn" aria-label={t('Изменить виджет')} title={t('Изменить виджет')} onClick={onEdit}><NavIcon name="edit" size={14} /></button>
            <button type="button" className="dash-icon-btn" aria-label={t('Изменить размер')} title={canGrow ? t('Увеличить') : t('Уменьшить')} onClick={onResize}><NavIcon name="expand" size={14} /></button>
            <button type="button" className="dash-icon-btn" aria-label={t('Копировать виджет')} title={t('Копировать виджет')} onClick={onCopy}><NavIcon name="copy" size={14} /></button>
            <button type="button" className="dash-icon-btn" aria-label={t('Удалить виджет')} title={t('Удалить виджет')} onClick={onDelete}><NavIcon name="trash" size={14} /></button>
          </div>
        )}
      </header>
      <div className="dash-widget-body"><DashboardWidgetBody widget={widget} data={data} sample={sample} /></div>
    </section>
  );
}

export function DashboardGrid({ layout, data, editing = false, sample = false, onChange, onAddWidget, onEditWidget }) {
  const { t } = useLocalization();
  const rows = layout?.rows || [];
  const update = (fn) => onChange?.(fn(JSON.parse(JSON.stringify(layout))));
  const removeWidget = (r, w) => update((l) => { l.rows[r].widgets.splice(w, 1); return l; });
  const resize = (r, w) => update((l) => {
    const row = l.rows[r];
    const widget = row.widgets[w];
    const free = MAX_PER_ROW - rowWidth(row);
    widget.size = free > 0 ? (widget.size || 1) + 1 : 1;
    return l;
  });
  const copy = (r, w) => update((l) => {
    const clone = { ...JSON.parse(JSON.stringify(l.rows[r].widgets[w])), id: newId('w'), size: 1 };
    if (rowWidth(l.rows[r]) < MAX_PER_ROW) l.rows[r].widgets.splice(w + 1, 0, clone);
    else l.rows.splice(r + 1, 0, { id: newId('r'), widgets: [clone] });
    return l;
  });
  const addRow = (index) => update((l) => { l.rows.splice(index, 0, { id: newId('r'), widgets: [] }); return l; });
  const removeRow = (r) => update((l) => { l.rows.splice(r, 1); if (!l.rows.length) l.rows.push({ id: newId('r'), widgets: [] }); return l; });

  const addRowButton = (index) => editing && (
    <div className="dash-row-add">
      <button type="button" className="dash-row-add-btn" aria-label={t('Добавить строку')} title={t('Добавить строку')} onClick={() => addRow(index)}><NavIcon name="plus" size={14} /></button>
    </div>
  );

  return (
    <div className={`dash-grid ${sample ? 'is-sample' : ''}`}>
      {addRowButton(0)}
      {rows.map((row, r) => {
        const free = MAX_PER_ROW - rowWidth(row);
        return (
          <React.Fragment key={row.id}>
            <div className="dash-row">
              {row.widgets.map((widget, w) => (
                <WidgetCard key={widget.id} widget={widget} data={data?.[widget.id]} editing={editing} sample={sample} canGrow={free > 0}
                  onEdit={() => onEditWidget?.(r, w)} onResize={() => resize(r, w)} onCopy={() => copy(r, w)} onDelete={() => removeWidget(r, w)} />
              ))}
              {editing && Array.from({ length: free }, (_, i) => (
                <button key={`slot-${i}`} type="button" className="dash-slot" onClick={() => onAddWidget?.(r)}>
                  <NavIcon name="plus" size={14} />{t('Добавить виджет')}
                </button>
              ))}
              {editing && row.widgets.length === 0 && rows.length > 1 && (
                <button type="button" className="dash-icon-btn dash-row-remove" aria-label={t('Удалить строку')} title={t('Удалить строку')} onClick={() => removeRow(r)}><NavIcon name="close" size={14} /></button>
              )}
            </div>
            {addRowButton(r + 1)}
          </React.Fragment>
        );
      })}
      {!editing && rows.every((row) => row.widgets.length === 0) && (
        <div className="dash-widget dash-widget-placeholder">
          <DashboardWidgetBody widget={{ type: 'none' }} data={{ kind: 'none' }} />
        </div>
      )}
    </div>
  );
}

// ---------- widget picker / config ----------

function WidgetDialog({ initial, onClose, onSave }) {
  const { t } = useLocalization();
  const [type, setType] = useState(initial?.type || null);
  const [title, setTitle] = useState(initial?.title || '');
  const [config, setConfig] = useState(initial?.config || {});
  const [query, setQuery] = useState('');
  const entry = type && catalogEntry(type);

  const pick = (item) => { setType(item.type); setTitle(t(item.title)); setConfig({ ...item.config }); };

  if (!entry) {
    const needle = query.trim().toLowerCase();
    const groups = ['Задачи', 'DevOps', 'Цели'];
    return (
      <Modal title={t('Добавить виджет')} onClose={onClose} wide>
        <label className="dash-search dash-search-wide">
          <NavIcon name="search" size={14} />
          <input type="search" autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Поиск виджетов')} aria-label={t('Поиск виджетов')} />
        </label>
        {groups.map((group) => {
          const list = WIDGET_CATALOG.filter((w) => w.group === group && (!needle || t(w.title).toLowerCase().includes(needle) || t(w.description).toLowerCase().includes(needle)));
          if (!list.length) return null;
          return (
            <div key={group} className="dash-picker-group">
              <h4>{t(group)}</h4>
              <div className="dash-picker">
                {list.map((item) => (
                  <button key={item.type} type="button" className="dash-picker-item" onClick={() => pick(item)}>
                    <span className="dash-picker-icon"><NavIcon name={item.group === 'DevOps' ? 'code' : item.group === 'Цели' ? 'goals' : 'chart'} size={18} /></span>
                    <span><strong>{t(item.title)}</strong><span className="dash-muted">{t(item.description)}</span></span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </Modal>
    );
  }

  return (
    <Modal title={initial ? t('Настройки виджета') : t(entry.title)} onClose={onClose}
      footer={<>
        {!initial && <button type="button" className="dash-btn" onClick={() => setType(null)}>{t('Назад')}</button>}
        <button type="button" className="dash-btn" onClick={onClose}>{t('Отмена')}</button>
        <button type="button" className="dash-btn dash-btn-primary" onClick={() => onSave({ type, title: title.trim() || t(entry.title), config })}>{initial ? t('Сохранить') : t('Добавить')}</button>
      </>}>
      <p className="dash-muted">{t(entry.description)}</p>
      <div className="dash-form">
        <label className="dash-field">
          <span>{t('Заголовок')}</span>
          <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />
        </label>
        {entry.fields.map(([key, label, options]) => (
          <label key={key} className="dash-field">
            <span>{t(label)}</span>
            <select value={String(config[key] ?? '')} onChange={(e) => {
              const raw = e.target.value;
              setConfig({ ...config, [key]: /^\d+$/.test(raw) ? Number(raw) : raw });
            }}>
              {options.map((option) => {
                const [value, text] = Array.isArray(option) ? option : [option, CHARTS[option]];
                return <option key={value} value={String(value)}>{t(text)}</option>;
              })}
            </select>
          </label>
        ))}
      </div>
    </Modal>
  );
}

function AccessDialog({ dashboard, onClose, onSave }) {
  const { t } = useLocalization();
  const [viewers, setViewers] = useState(dashboard.viewers);
  const [editors, setEditors] = useState(dashboard.editors);
  const radio = (name, value, setter, current, label, hint, disabled) => (
    <label className={`dash-radio ${disabled ? 'is-disabled' : ''}`}>
      <input type="radio" name={name} checked={current === value} disabled={disabled} onChange={() => setter(value)} />
      <span><strong>{t(label)}</strong><span className="dash-muted">{t(hint)}</span></span>
    </label>
  );
  return (
    <Modal title={t('Доступ к дашборду')} onClose={onClose}
      footer={<><button type="button" className="dash-btn" onClick={onClose}>{t('Отмена')}</button><button type="button" className="dash-btn dash-btn-primary" onClick={() => onSave({ viewers, editors: viewers === 'private' ? 'private' : editors })}>{t('Сохранить')}</button></>}>
      <fieldset className="dash-fieldset">
        <legend>{t('Кто может просматривать')}</legend>
        {radio('viewers', 'private', setViewers, viewers, 'Закрытые', 'Только вы.')}
        {radio('viewers', 'org', setViewers, viewers, 'Моя организация', 'Все, кто состоит с вами в командах.')}
      </fieldset>
      <fieldset className="dash-fieldset">
        <legend>{t('Кто может изменять')}</legend>
        {radio('editors', 'private', setEditors, viewers === 'private' ? 'private' : editors, 'Закрытые', 'Только вы.')}
        {radio('editors', 'org', setEditors, viewers === 'private' ? 'private' : editors, 'Моя организация', 'Все, кто может просматривать дашборд.', viewers === 'private')}
      </fieldset>
    </Modal>
  );
}

// ---------- filter bar ----------

function FilterBar({ filters, spaceList, peopleList, disabled, onChange }) {
  const { t } = useLocalization();
  const f = { boardIds: [], issueTypes: [], priorities: [], statusCategories: [], createdDays: null, assignees: [], ...filters };
  const set = (patch) => onChange({ ...f, ...patch });
  const spaceOptions = spaceList.map((s) => ({ id: s.id, label: s.name }));
  const typeOptions = ISSUE_TYPES.map((name, i) => ({ id: name, label: t(getIssueTypeMeta(i).label), icon: <IssueTypeIcon issueType={i} size={14} /> }));
  const priorityOptions = PRIORITIES.map((name) => {
    const value = 4 - PRIORITIES.indexOf(name);
    return { id: name, label: t(getPriorityMeta(value).label), icon: <PriorityIcon priority={value} size={14} /> };
  });
  const statusOptions = STATUS_CATEGORIES.map((s) => ({ id: s.id, label: t(s.label) }));
  const assigneeOptions = [{ id: 'me', label: t('Я') }, { id: 'none', label: t('Не назначено') }, ...peopleList.map((p) => ({ id: p.id, label: p.displayName || p.email }))];
  const firstSpace = spaceList.find((s) => s.id === f.boardIds[0]);
  const spaceSummary = f.boardIds.length === 1 && firstSpace ? firstSpace.name : f.boardIds.length ? `(${f.boardIds.length})` : '';
  const count = (list) => (list.length ? `(${list.length})` : '');
  const chip = (label, key, options, extra = {}) => (
    <Chip label={label} active={f[key].length > 0} summary={count(f[key])} disabled={disabled} onClear={() => set({ [key]: [] })}>
      <CheckList options={options} selected={f[key]} onChange={(v) => set({ [key]: v })} {...extra} />
    </Chip>
  );
  return (
    <div className="dash-filterbar" aria-label={t('Фильтры дашборда')}>
      <Chip label={t('Раздел')} active={f.boardIds.length > 0} summary={spaceSummary} disabled={disabled} onClear={() => set({ boardIds: [] })}>
        <CheckList options={spaceOptions} selected={f.boardIds} onChange={(v) => set({ boardIds: v })} searchable placeholder={t('Поиск разделов')} />
      </Chip>
      {chip(t('Тип задачи'), 'issueTypes', typeOptions)}
      {chip(t('Приоритет задачи'), 'priorities', priorityOptions)}
      {chip(t('Статус задачи'), 'statusCategories', statusOptions)}
      <Chip label={t('Дата создания задачи')} active={Boolean(f.createdDays)} summary={t(CREATED_PERIODS.find((p) => p[0] === f.createdDays)?.[1] || '${days} дн.', { days: f.createdDays })} disabled={disabled} onClear={() => set({ createdDays: null })}>
        {(close) => (
          <div className="dash-checklist">
            {CREATED_PERIODS.map(([days, label]) => (
              <label key={days} className="dash-check">
                <input type="radio" name="createdDays" checked={f.createdDays === days} onChange={() => { set({ createdDays: days }); close(); }} />
                <span>{t(label)}</span>
              </label>
            ))}
          </div>
        )}
      </Chip>
      {chip(t('Исполнитель задачи'), 'assignees', assigneeOptions, { searchable: true, placeholder: t('Поиск пользователей') })}
    </div>
  );
}

// ---------- dashboard page ----------

export function DashboardPage({ editing = false }) {
  const { t } = useLocalization();
  const navigate = useNavigate();
  const { dashboardId } = useParams();
  const { spaceList, peopleList } = useSpacesAndPeople();
  const [detail, setDetail] = useState(null);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [widgetDialog, setWidgetDialog] = useState(null);
  const [accessOpen, setAccessOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [copied, setCopied] = useState(false);

  const loadData = useCallback(() => {
    dashboardsApi.data(dashboardId).then((v) => setData(v?.widgets || {})).catch((e) => { if (e.status !== 404) setError(e.message); });
  }, [dashboardId]);

  useEffect(() => {
    setDetail(null);
    setData(null);
    setNotFound(false);
    dashboardsApi.get(dashboardId).then((v) => {
      setDetail(v);
      rememberDashboard({ id: v.dashboard.id, name: v.dashboard.name });
    }).catch((e) => {
      if (e.status === 404) { setNotFound(true); forgetDashboard(dashboardId); } else setError(e.message);
    });
    loadData();
  }, [dashboardId, loadData]);

  const dashboard = detail?.dashboard;
  const canEdit = Boolean(dashboard?.canEdit);
  const isEditing = editing && canEdit;

  const save = async (patch, { reload = true } = {}) => {
    setSaving(true);
    setError('');
    try {
      const updated = await dashboardsApi.update(dashboardId, patch);
      setDetail(updated);
      if (patch.name) { rememberDashboard({ id: updated.dashboard.id, name: updated.dashboard.name }); notifyDashboardsChanged(); }
      if (reload) loadData();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };
  const changeLayout = (layout) => {
    setDetail((d) => ({ ...d, layout }));
    save({ layout });
  };
  const toggleStar = async () => {
    try {
      await dashboardsApi.star(dashboardId, !dashboard.starred);
      setDetail((d) => ({ ...d, dashboard: { ...d.dashboard, starred: !d.dashboard.starred, starCount: d.dashboard.starCount + (d.dashboard.starred ? -1 : 1) } }));
      notifyDashboardsChanged();
    } catch (e) { setError(e.message); }
  };
  const saveWidget = (widget) => {
    const layout = JSON.parse(JSON.stringify(detail.layout));
    if (widgetDialog.widgetIndex != null) {
      const target = layout.rows[widgetDialog.rowIndex].widgets[widgetDialog.widgetIndex];
      Object.assign(target, widget);
    } else {
      let rowIndex = widgetDialog.rowIndex ?? layout.rows.findIndex((r) => rowWidth(r) < MAX_PER_ROW);
      if (rowIndex < 0 || rowWidth(layout.rows[rowIndex]) >= MAX_PER_ROW) { layout.rows.push({ id: newId('r'), widgets: [] }); rowIndex = layout.rows.length - 1; }
      layout.rows[rowIndex].widgets.push({ id: newId('w'), size: 1, ...widget });
    }
    setWidgetDialog(null);
    changeLayout(layout);
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/dashboards/${dashboardId}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch { setError(t('Не удалось скопировать ссылку.')); }
  };
  const copyDashboard = async () => {
    try {
      const created = await dashboardsApi.copy(dashboardId);
      notifyDashboardsChanged();
      navigate(`/dashboards/${created.dashboard.id}/edit`);
    } catch (e) { setError(e.message); }
  };
  const trash = async () => {
    if (!window.confirm(t('Переместить дашборд «${name}» в корзину?', { name: dashboard.name }))) return;
    try {
      await dashboardsApi.trash(dashboardId);
      forgetDashboard(dashboardId);
      notifyDashboardsChanged();
      navigate('/dashboards');
    } catch (e) { setError(e.message); }
  };
  const commitName = () => {
    setRenaming(false);
    const name = nameDraft.trim();
    if (name && name !== dashboard.name) save({ name }, { reload: false });
  };

  if (notFound) {
    return (
      <div className="page dash-page">
        <div className="dash-state">
          <h2>{t('Дашборд не найден')}</h2>
          <p>{t('Возможно, он удалён или у вас нет к нему доступа.')}</p>
          <Link className="dash-btn" to="/dashboards">{t('Просмотреть все дашборды')}</Link>
        </div>
      </div>
    );
  }
  if (!detail) return <div className="page dash-page"><div className="dash-state">{error || t('Загрузка...')}</div></div>;

  return (
    <div className="page dash-page dash-view">
      <div className="dash-breadcrumbs"><Link to="/dashboards">{t('Дашборды')}</Link></div>
      <div className="dash-header">
        <div className="dash-title">
          {isEditing && renaming ? (
            <input className="dash-title-input" autoFocus value={nameDraft} maxLength={200} aria-label={t('Название')}
              onChange={(e) => setNameDraft(e.target.value)} onBlur={commitName}
              onKeyDown={(e) => { if (e.key === 'Enter') commitName(); if (e.key === 'Escape') setRenaming(false); }} />
          ) : (
            <h1 className={isEditing ? 'is-editable' : ''} title={isEditing ? t('Нажмите, чтобы переименовать') : undefined}
              onClick={() => { if (isEditing) { setNameDraft(dashboard.name); setRenaming(true); } }}>{dashboard.name}</h1>
          )}
          <button type="button" className={`dash-star ${dashboard.starred ? 'is-starred' : ''}`} aria-label={dashboard.starred ? t('Убрать из отмеченных') : t('Отметить')} onClick={toggleStar}>
            <NavIcon name="star" size={16} filled={dashboard.starred} />
          </button>
          <button type="button" className="dash-icon-btn" aria-label={t('Скопировать ссылку')} title={copied ? t('Ссылка скопирована') : t('Скопировать ссылку')} onClick={copyLink}><NavIcon name="megaphone" size={16} /></button>
          <button type="button" className="dash-icon-btn" aria-label={t('Доступ')} title={dashboard.viewers === 'org' ? t('Доступно моей организации') : t('Закрытый дашборд')}
            disabled={!dashboard.isOwner} onClick={() => setAccessOpen(true)}><NavIcon name={dashboard.viewers === 'org' ? 'teams' : 'lock'} size={16} /></button>
          {saving && <span className="dash-muted">{t('Сохранение...')}</span>}
          {copied && <span className="dash-muted" role="status">{t('Ссылка скопирована')}</span>}
        </div>
        <div className="dash-actions">
          {isEditing ? (
            <>
              <button type="button" className="dash-btn" onClick={() => setWidgetDialog({})}><NavIcon name="plus" size={14} />{t('Добавить виджет')}</button>
              <button type="button" className="dash-btn dash-btn-primary" onClick={() => navigate(`/dashboards/${dashboardId}`)}>{t('Завершить')}</button>
            </>
          ) : (
            <>
              {canEdit && <button type="button" className="dash-btn" onClick={() => navigate(`/dashboards/${dashboardId}/edit`)}><NavIcon name="edit" size={14} />{t('Изменить')}</button>}
              <button type="button" className="dash-btn" onClick={loadData} aria-label={t('Обновить')} title={t('Обновить')}><NavIcon name="refresh" size={14} /></button>
            </>
          )}
          <Menu label={t('Другие действия')} items={[
            { label: t('Копировать дашборд'), onClick: copyDashboard },
            dashboard.isOwner && { label: t('Доступ'), onClick: () => setAccessOpen(true) },
            dashboard.isOwner && !dashboard.isDefault && { label: t('Переместить в корзину'), danger: true, onClick: trash },
          ]} />
        </div>
      </div>
      {dashboard.description && <p className="dash-muted">{dashboard.description}</p>}
      <FilterBar filters={detail.filters} spaceList={spaceList} peopleList={peopleList} disabled={!isEditing}
        onChange={(filters) => { setDetail((d) => ({ ...d, filters })); save({ filters }); }} />
      {error && <p className="dash-error" role="alert">{error}</p>}
      <DashboardGrid layout={detail.layout} data={data} editing={isEditing} onChange={changeLayout}
        onAddWidget={(rowIndex) => setWidgetDialog({ rowIndex })}
        onEditWidget={(rowIndex, widgetIndex) => setWidgetDialog({ rowIndex, widgetIndex })} />
      {widgetDialog && (
        <WidgetDialog
          initial={widgetDialog.widgetIndex != null ? detail.layout.rows[widgetDialog.rowIndex].widgets[widgetDialog.widgetIndex] : null}
          onClose={() => setWidgetDialog(null)} onSave={saveWidget} />
      )}
      {accessOpen && <AccessDialog dashboard={dashboard} onClose={() => setAccessOpen(false)} onSave={(patch) => { setAccessOpen(false); save(patch, { reload: false }); }} />}
    </div>
  );
}
