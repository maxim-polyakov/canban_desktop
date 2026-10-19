import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from '../../i18n/navigation.jsx';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { plans as plansApi, savedFilters as filtersApi, spaces as spacesApi, teams as teamsApi } from '../../api.js';
import NavIcon from '../../components/NavIcons.jsx';
import { IssueTypeIcon } from '../../components/IssueIcons.jsx';
import SpaceAvatar from '../../components/SpaceAvatar.jsx';
import { timeAgo } from '../../utils/timeAgo.js';
import {
  capacityTable, computeRanges, dependencyConflicts, startOfWeek, toApiDate,
} from '../../utils/planMath.js';
import PlanTimeline from './PlanTimeline.jsx';
import '../settings/Settings.css';
import '../spaces/SpaceTemplates.css';
import './Plans.css';

const ISSUE_TYPES = [[0, 'Эпик'], [1, 'История'], [2, 'Задача'], [3, 'Ошибка'], [4, 'Подзадача']];
const PLAN_ACCESS = [
  ['private', 'Частный', 'План видите только вы'],
  ['open', 'Открытый', 'Любой пользователь может просматривать план; менять его можете только вы'],
];
const VIEWS = [
  ['timeline', 'timeline', 'Таймлайн'],
  ['capacity', 'reports', 'Ёмкость'],
  ['dependencies', 'link', 'Зависимости'],
  ['releases', 'releases', 'Релизы'],
  ['teams', 'teams', 'Команды'],
  ['settings', 'settings', 'Настройки'],
];

function normalizeTeams(list) {
  return (Array.isArray(list) ? list : []).map((item) => {
    const team = item.team ?? item.Team ?? {};
    return { id: team.id ?? team.Id, name: team.name ?? team.Name ?? '' };
  }).filter((x) => x.id);
}

function useSourceOptions() {
  const [spaces, setSpaces] = useState([]);
  const [filters, setFilters] = useState([]);
  useEffect(() => {
    spacesApi.getMine().then((list) => setSpaces(Array.isArray(list) ? list : [])).catch(() => setSpaces([]));
    filtersApi.getAll().then((list) => setFilters(Array.isArray(list) ? list : [])).catch(() => setFilters([]));
  }, []);
  return { spaces, filters };
}

function SourcePicker({ value, onChange }) {
  const { t } = useLocalization();
  const { spaces, filters } = useSourceOptions();
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();
  const has = (kind, id) => value.some((s) => s.kind === kind && (kind === 'board' ? s.boardId === id : s.filterId === id));
  const toggle = (kind, id) => {
    if (has(kind, id)) onChange(value.filter((s) => !(s.kind === kind && (kind === 'board' ? s.boardId === id : s.filterId === id))));
    else onChange([...value, kind === 'board' ? { kind, boardId: id } : { kind, filterId: id }]);
  };
  const shownSpaces = spaces.filter((s) => !needle || `${s.name} ${s.key}`.toLowerCase().includes(needle));
  const shownFilters = filters.filter((f) => !needle || f.name.toLowerCase().includes(needle));
  return (
    <div className="plan-sources">
      <label className="settings-search">
        <NavIcon name="search" size={14} />
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Поиск разделов и фильтров')} aria-label={t('Поиск разделов и фильтров')} />
      </label>
      <div className="plan-source-group">{t('Разделы')}</div>
      {shownSpaces.map((space) => (
        <label key={space.id} className={`plan-source ${has('board', space.id) ? 'is-selected' : ''}`}>
          <input type="checkbox" checked={has('board', space.id)} onChange={() => toggle('board', space.id)} />
          <SpaceAvatar id={space.id} name={space.name} size={20} />
          <span>{space.name}</span><span className="sv-muted">{space.key}</span>
        </label>
      ))}
      {shownSpaces.length === 0 && <p className="sv-muted">{t('Нет разделов')}</p>}
      <div className="plan-source-group">{t('Фильтры')}</div>
      {shownFilters.map((filter) => (
        <label key={filter.id} className={`plan-source ${has('filter', filter.id) ? 'is-selected' : ''}`}>
          <input type="checkbox" checked={has('filter', filter.id)} onChange={() => toggle('filter', filter.id)} />
          <NavIcon name="filters" size={16} />
          <span>{filter.name}</span><code className="sv-muted plan-jql">{filter.jql}</code>
        </label>
      ))}
      {shownFilters.length === 0 && <p className="sv-muted">{t('Сохранённых фильтров нет. Создайте их в разделе «Фильтры».')}</p>}
    </div>
  );
}

function ExclusionFields({ doneDays, setDoneDays, types, setTypes }) {
  const { t } = useLocalization();
  return (
    <>
      <label className="app-field">
        <span>{t('Выполненные задачи')}</span>
        <select value={doneDays === null ? 'all' : String(doneDays)} onChange={(e) => setDoneDays(e.target.value === 'all' ? null : Number(e.target.value))}>
          <option value="0">{t('Скрывать все выполненные')}</option>
          {[7, 14, 30, 60, 90].map((n) => <option key={n} value={n}>{t('Скрывать выполненные больше')} {n} {t('дн. назад')}</option>)}
          <option value="all">{t('Показывать все выполненные')}</option>
        </select>
      </label>
      <fieldset className="plan-fieldset">
        <legend>{t('Скрыть типы работ')}</legend>
        {ISSUE_TYPES.map(([id, label]) => (
          <label key={id} className="wiz-check">
            <input type="checkbox" checked={types.includes(id)} onChange={() => setTypes(types.includes(id) ? types.filter((x) => x !== id) : [...types, id])} />
            <IssueTypeIcon issueType={id} size={14} />{t(label)}
          </label>
        ))}
      </fieldset>
    </>
  );
}

export function PlansListPage() {
  const { t, locale } = useLocalization();
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    plansApi.list().then((data) => setList(Array.isArray(data) ? data : [])).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, []);
  const needle = query.trim().toLowerCase();
  const rows = list.filter((p) => !needle || p.name.toLowerCase().includes(needle));
  return (
    <div className="settings-shell">
      <section className="settings-content is-wide">
        <div className="settings-title-row">
          <h1 className="settings-title">{t('Планы')}</h1>
          <div className="settings-actions"><Link to="/plans/new" className="app-btn app-btn-primary">{t('Создать план')}</Link></div>
        </div>
        <p className="sv-muted">{t('Планируйте работу нескольких разделов и команд на общем таймлайне, учитывайте ёмкость и зависимости, сравнивайте сценарии.')}</p>
        <div className="settings-toolbar">
          <label className="settings-search">
            <NavIcon name="search" size={14} />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Поиск планов')} aria-label={t('Поиск планов')} />
          </label>
        </div>
        {error && <p className="settings-save-status is-error">{error}</p>}
        <div className="settings-table-wrap">
          <table className="settings-table">
            <thead>
              <tr><th>{t('Имя')}</th><th className="hide-mobile">{t('Владелец')}</th><th className="hide-mobile">{t('Источники')}</th><th>{t('Доступ')}</th><th className="hide-mobile">{t('Обновлено')}</th></tr>
            </thead>
            <tbody>
              {rows.map((plan) => (
                <tr key={plan.id}>
                  <td><Link to={`/plans/${plan.id}`} className="settings-table-name"><span className="plan-icon"><NavIcon name="plans" size={16} /></span><span>{plan.name}</span></Link></td>
                  <td className="hide-mobile">{plan.ownerName || '—'}</td>
                  <td className="hide-mobile">{plan.sources}</td>
                  <td><span className="settings-lozenge">{t(plan.access === 'open' ? 'Открытый' : 'Частный')}</span></td>
                  <td className="hide-mobile">{timeAgo(plan.updatedAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && rows.length === 0 && (
            <div className="settings-empty">
              {list.length ? t('Нет планов, соответствующих поиску.') : t('У вас пока нет планов.')}
              {!list.length && <div style={{ marginTop: 12 }}><Link to="/plans/new" className="app-btn app-btn-primary">{t('Создать план')}</Link></div>}
            </div>
          )}
          {loading && <p className="settings-empty">{t('Загрузка...')}</p>}
        </div>
      </section>
    </div>
  );
}

export function CreatePlanPage() {
  const { t } = useLocalization();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [access, setAccess] = useState('private');
  const [sources, setSources] = useState([]);
  const [doneDays, setDoneDays] = useState(30);
  const [types, setTypes] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const steps = ['Данные плана', 'Источники работ', 'Исключения'];
  const canNext = step === 0 ? name.trim() : step === 1 ? sources.length > 0 : true;

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const plan = await plansApi.create({ name: name.trim(), access, sources, excludeDoneAfterDays: doneDays, excludedIssueTypes: types });
      navigate(`/plans/${plan.id}`);
    } catch (e) {
      setError(e.message || t('Не удалось создать план'));
      setSaving(false);
    }
  };

  return (
    <div className="settings-shell">
      <section className="settings-content plan-create">
        <div className="settings-breadcrumbs"><Link to="/plans">{t('Планы')}</Link><span>/</span><span>{t('Создать план')}</span></div>
        <h1 className="settings-title">{t('Создать план')}</h1>
        <ol className="plan-stepper">
          {steps.map((label, i) => <li key={label} className={i === step ? 'is-current' : i < step ? 'is-done' : ''}>{i + 1}. {t(label)}</li>)}
        </ol>
        {step === 0 && (
          <>
            <label className="app-field">
              <span>{t('Название плана')} <span className="app-required">*</span></span>
              <input value={name} maxLength={200} autoFocus onChange={(e) => setName(e.target.value)} placeholder={t('Например, Дорожная карта на квартал')} />
            </label>
            <div className="sv-options">
              <span className="app-field"><span>{t('Доступ')}</span></span>
              {PLAN_ACCESS.map(([id, label, description]) => (
                <label key={id} className={`sv-option ${access === id ? 'is-selected' : ''}`}>
                  <input type="radio" name="plan-access" checked={access === id} onChange={() => setAccess(id)} />
                  <span><strong>{t(label)}</strong><span className="sv-muted">{t(description)}</span></span>
                </label>
              ))}
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <p className="sv-muted">{t('Выберите разделы и фильтры, задачи из которых попадут в план.')}</p>
            <SourcePicker value={sources} onChange={setSources} />
          </>
        )}
        {step === 2 && (
          <>
            <p className="sv-muted">{t('Уберите из плана то, что не нужно планировать. Отдельные задачи можно исключить позже прямо на таймлайне.')}</p>
            <ExclusionFields doneDays={doneDays} setDoneDays={setDoneDays} types={types} setTypes={setTypes} />
          </>
        )}
        {error && <p className="app-modal-error" role="alert">{error}</p>}
        <div className="plan-create-footer">
          <button type="button" className="app-btn app-btn-subtle" onClick={() => (step === 0 ? navigate('/plans') : setStep(step - 1))}>{t(step === 0 ? 'Отмена' : 'Назад')}</button>
          {step < steps.length - 1
            ? <button type="button" className="app-btn app-btn-primary" disabled={!canNext} onClick={() => setStep(step + 1)}>{t('Далее')}</button>
            : <button type="button" className="app-btn app-btn-primary" disabled={saving} onClick={submit}>{saving ? '…' : t('Создать')}</button>}
        </div>
      </section>
    </div>
  );
}

function CapacityView({ items, ranges, teams, canEdit, onTeamUpdate }) {
  const { t, locale } = useLocalization();
  const [count, setCount] = useState(8);
  const from = startOfWeek(new Date());
  const table = capacityTable(items, ranges, teams, from, count);
  if (teams.length === 0) return <p className="settings-empty">{t('Добавьте команды на вкладке «Команды», чтобы планировать ёмкость.')}</p>;
  return (
    <div className="plan-capacity">
      <div className="settings-toolbar">
        <span className="sv-muted">{t('Сумма story points открытых задач по итерациям; задача относится к итерации, в которую попадает её окончание.')}</span>
        <select className="app-select" value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label={t('Итераций')}>
          {[4, 8, 12].map((n) => <option key={n} value={n}>{n} {t('итераций')}</option>)}
        </select>
      </div>
      {table.map(({ team, slots }) => (
        <div key={team.id} className="sv-card plan-capacity-team">
          <div className="plan-capacity-head">
            <h2>{team.name}</h2>
            {canEdit ? (
              <span className="plan-capacity-edit">
                <label>{t('Ёмкость')} <input type="number" min="0" defaultValue={team.capacity} onBlur={(e) => onTeamUpdate(team.id, { capacity: Number(e.target.value) })} /></label>
                <label>{t('Итерация, дней')} <input type="number" min="1" max="90" defaultValue={team.iterationDays} onBlur={(e) => onTeamUpdate(team.id, { iterationDays: Number(e.target.value) })} /></label>
              </span>
            ) : <span className="sv-muted">{team.capacity} SP / {team.iterationDays} {t('дн.')}</span>}
          </div>
          <div className="plan-capacity-grid">
            {slots.map((slot) => {
              const pct = team.capacity ? Math.round((slot.points / team.capacity) * 100) : 0;
              const over = slot.points > team.capacity;
              return (
                <div key={slot.start.toISOString()} className={`plan-slot ${over ? 'is-over' : ''}`}>
                  <span className="plan-slot-dates">{slot.start.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – {slot.end.toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</span>
                  <span className="plan-slot-bar"><span style={{ width: `${Math.min(100, pct)}%` }} /></span>
                  <span className="plan-slot-value"><strong>{slot.points}</strong> / {team.capacity} SP · {slot.items} {t('задач')}</span>
                  {over && <span className="plan-slot-warn">{t('Перегрузка')} +{slot.points - team.capacity}</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function DependenciesView({ items, ranges, dependencies, canEdit, onAdd, onRemove }) {
  const { t, locale } = useLocalization();
  const [blocker, setBlocker] = useState('');
  const [blocked, setBlocked] = useState('');
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const conflicts = dependencyConflicts(dependencies, ranges);
  const fmt = (id) => {
    const range = ranges.get(id);
    return range ? `${range.start.toLocaleDateString(locale)} – ${range.end.toLocaleDateString(locale)}` : t('Нет дат');
  };
  const options = [...items].sort((a, b) => a.issueKey.localeCompare(b.issueKey, undefined, { numeric: true }));
  return (
    <div>
      {canEdit && (
        <div className="settings-toolbar plan-dep-form">
          <select className="app-select" value={blocker} onChange={(e) => setBlocker(e.target.value)} aria-label={t('Блокирующая задача')}>
            <option value="">{t('Блокирующая задача')}</option>
            {options.map((i) => <option key={i.id} value={i.id}>{i.issueKey} {i.title}</option>)}
          </select>
          <span>{t('блокирует')}</span>
          <select className="app-select" value={blocked} onChange={(e) => setBlocked(e.target.value)} aria-label={t('Заблокированная задача')}>
            <option value="">{t('Заблокированная задача')}</option>
            {options.filter((i) => i.id !== blocker).map((i) => <option key={i.id} value={i.id}>{i.issueKey} {i.title}</option>)}
          </select>
          <button type="button" className="app-btn app-btn-primary" disabled={!blocker || !blocked} onClick={() => { onAdd(blocker, blocked); setBlocker(''); setBlocked(''); }}>{t('Добавить')}</button>
        </div>
      )}
      <div className="settings-table-wrap">
        <table className="settings-table">
          <thead><tr><th>{t('Блокирующая задача')}</th><th>{t('Сроки')}</th><th>{t('Заблокированная задача')}</th><th>{t('Сроки')}</th><th>{t('Состояние')}</th>{canEdit && <th className="is-narrow" />}</tr></thead>
          <tbody>
            {dependencies.map((dep) => {
              const a = byId.get(dep.blockerId);
              const b = byId.get(dep.blockedId);
              return (
                <tr key={dep.id}>
                  <td>{a && <Link to={`/board/${a.boardId}/issue/${a.id}`}>{a.issueKey} {a.title}</Link>}</td>
                  <td className="sv-muted">{fmt(dep.blockerId)}</td>
                  <td>{b && <Link to={`/board/${b.boardId}/issue/${b.id}`}>{b.issueKey} {b.title}</Link>}</td>
                  <td className="sv-muted">{fmt(dep.blockedId)}</td>
                  <td>{conflicts.has(dep.id) ? <span className="settings-lozenge is-danger">{t('Конфликт сроков')}</span> : <span className="settings-lozenge is-success">{t('В порядке')}</span>}</td>
                  {canEdit && <td className="is-narrow"><button type="button" className="app-icon-btn" aria-label={t('Удалить')} onClick={() => onRemove(dep.id)}><NavIcon name="trash" size={14} /></button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
        {dependencies.length === 0 && <p className="settings-empty">{t('Зависимостей пока нет. Добавьте их здесь или через меню задачи на таймлайне.')}</p>}
      </div>
    </div>
  );
}

function ReleasesView({ items, ranges, releases, boardsById }) {
  const { t, locale } = useLocalization();
  if (releases.length === 0) return <p className="settings-empty">{t('В разделах плана нет релизов. Создайте их на вкладке «Релизы» раздела.')}</p>;
  return (
    <div className="plan-releases">
      {releases.map((release) => {
        const scoped = items.filter((i) => i.releaseIds.includes(release.id));
        const done = scoped.filter((i) => i.statusCategory === 'done').length;
        const releaseDate = release.releaseDate ? new Date(release.releaseDate) : null;
        const late = releaseDate ? scoped.filter((i) => i.statusCategory !== 'done' && ranges.get(i.id)?.end > releaseDate) : [];
        return (
          <div key={release.id} className="sv-card">
            <div className="plan-capacity-head">
              <h2><NavIcon name="releases" size={16} /> {release.name}</h2>
              <span className={`settings-lozenge ${release.status === 1 ? 'is-success' : ''}`}>{t(release.status === 1 ? 'Выпущен' : 'Не выпущен')}</span>
            </div>
            <p className="sv-muted">{boardsById.get(release.boardId)?.name} · {releaseDate ? releaseDate.toLocaleDateString(locale) : t('Без даты')}</p>
            <div className="sv-bar-track plan-release-progress"><span style={{ width: `${scoped.length ? (done / scoped.length) * 100 : 0}%`, background: '#22a06b' }} /></div>
            <p>{done} / {scoped.length} {t('задач выполнено')}</p>
            {late.length > 0 && (
              <div className="plan-late">
                <strong>{t('Не успевают к релизу')}: {late.length}</strong>
                <ul>{late.slice(0, 5).map((i) => <li key={i.id}><Link to={`/board/${i.boardId}/issue/${i.id}`}>{i.issueKey} {i.title}</Link></li>)}</ul>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TeamsView({ plan, canEdit, onChanged }) {
  const { t } = useLocalization();
  const [canbanTeams, setCanbanTeams] = useState([]);
  const [name, setName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { teamsApi.getMyTeamsWithBoards().then((l) => setCanbanTeams(normalizeTeams(l))).catch(() => {}); }, []);
  const run = async (action) => {
    setError('');
    try { await action(); onChanged(); } catch (e) { setError(e.message); }
  };
  const add = () => run(async () => {
    const linked = canbanTeams.find((x) => x.id === teamId);
    await plansApi.addTeam(plan.id, { name: name.trim() || linked?.name || '', teamId: teamId || null });
    setName(''); setTeamId('');
  });
  return (
    <div>
      <p className="sv-muted">{t('Команды плана определяют ёмкость. Задачи разделов автоматически относятся к связанной команде; на таймлайне команду можно сменить.')}</p>
      {canEdit && (
        <div className="settings-toolbar">
          <input className="app-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('Название команды')} aria-label={t('Название команды')} />
          <select className="app-select" value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label={t('Связанная команда')}>
            <option value="">{t('Без связи с командой')}</option>
            {canbanTeams.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          <button type="button" className="app-btn app-btn-primary" disabled={!name.trim() && !teamId} onClick={add}>{t('Добавить команду')}</button>
        </div>
      )}
      {error && <p className="settings-save-status is-error">{error}</p>}
      <div className="settings-table-wrap">
        <table className="settings-table">
          <thead><tr><th>{t('Команда')}</th><th>{t('Связанная команда')}</th><th>{t('Ёмкость, SP')}</th><th>{t('Итерация, дней')}</th>{canEdit && <th className="is-narrow" />}</tr></thead>
          <tbody>
            {plan.teams.map((team) => (
              <tr key={team.id}>
                <td>{canEdit ? <input className="app-input" defaultValue={team.name} onBlur={(e) => e.target.value.trim() && e.target.value !== team.name && run(() => plansApi.updateTeam(plan.id, team.id, { name: e.target.value }))} /> : team.name}</td>
                <td>{canbanTeams.find((x) => x.id === team.teamId)?.name || '—'}</td>
                <td>{canEdit ? <input className="app-input plan-num" type="number" min="0" defaultValue={team.capacity} onBlur={(e) => run(() => plansApi.updateTeam(plan.id, team.id, { capacity: Number(e.target.value) }))} /> : team.capacity}</td>
                <td>{canEdit ? <input className="app-input plan-num" type="number" min="1" max="90" defaultValue={team.iterationDays} onBlur={(e) => run(() => plansApi.updateTeam(plan.id, team.id, { iterationDays: Number(e.target.value) }))} /> : team.iterationDays}</td>
                {canEdit && <td className="is-narrow"><button type="button" className="app-icon-btn" aria-label={t('Удалить')} onClick={() => run(() => plansApi.deleteTeam(plan.id, team.id))}><NavIcon name="trash" size={14} /></button></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {plan.teams.length === 0 && <p className="settings-empty">{t('Команд пока нет.')}</p>}
      </div>
    </div>
  );
}

function SettingsView({ plan, canEdit, excludedItems, onSaved, onInclude, onDelete }) {
  const { t } = useLocalization();
  const [name, setName] = useState(plan.name);
  const [description, setDescription] = useState(plan.description || '');
  const [access, setAccess] = useState(plan.access);
  const [sources, setSources] = useState(plan.sources.map((s) => ({ kind: s.kind, boardId: s.boardId, filterId: s.filterId })));
  const [doneDays, setDoneDays] = useState(plan.excludeDoneAfterDays);
  const [types, setTypes] = useState(plan.excludedIssueTypes || []);
  const [status, setStatus] = useState('');
  const [confirm, setConfirm] = useState(false);

  const save = async () => {
    setStatus('…');
    try {
      await plansApi.update(plan.id, {
        name, description, access, sources, excludedIssueTypes: types,
        excludeDoneAfterDays: doneDays ?? undefined, showAllDone: doneDays === null,
      });
      setStatus(t('Сохранено'));
      onSaved();
    } catch (e) {
      setStatus(e.message);
    }
  };
  if (!canEdit) return <p className="settings-empty">{t('Менять настройки плана может только его владелец.')}</p>;
  return (
    <div className="plan-settings">
      <div className="sv-card">
        <h2>{t('Сведения')}</h2>
        <label className="app-field"><span>{t('Название плана')}</span><input value={name} maxLength={200} onChange={(e) => setName(e.target.value)} /></label>
        <label className="app-field"><span>{t('Описание')}</span><textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <label className="app-field">
          <span>{t('Доступ')}</span>
          <select value={access} onChange={(e) => setAccess(e.target.value)}>{PLAN_ACCESS.map(([id, label]) => <option key={id} value={id}>{t(label)}</option>)}</select>
        </label>
      </div>
      <div className="sv-card">
        <h2>{t('Источники работ')}</h2>
        <SourcePicker value={sources} onChange={setSources} />
      </div>
      <div className="sv-card">
        <h2>{t('Исключения')}</h2>
        <ExclusionFields doneDays={doneDays} setDoneDays={setDoneDays} types={types} setTypes={setTypes} />
        <h3 className="plan-sub">{t('Исключённые задачи')}</h3>
        {excludedItems.length === 0 && <p className="sv-muted">{t('Нет исключённых задач.')}</p>}
        <ul className="plan-excluded">
          {excludedItems.map((item) => (
            <li key={item.id}>
              <span className="sv-inline"><IssueTypeIcon issueType={item.issueType} size={14} /><Link to={`/board/${item.boardId}/issue/${item.id}`}>{item.issueKey} {item.title}</Link></span>
              <button type="button" className="app-btn app-btn-subtle" onClick={() => onInclude(item.id)}>{t('Вернуть в план')}</button>
            </li>
          ))}
        </ul>
      </div>
      <div className="plan-create-footer">
        <button type="button" className="app-btn app-btn-danger" onClick={() => setConfirm(true)}>{t('Удалить план')}</button>
        <span className="sv-muted">{status}</span>
        <button type="button" className="app-btn app-btn-primary" disabled={!name.trim() || sources.length === 0} onClick={save}>{t('Сохранить')}</button>
      </div>
      {confirm && (
        <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirm(false); }}>
          <div className="app-modal" role="alertdialog" aria-modal="true">
            <div className="app-modal-header"><h2>{t('Удалить план')} «{plan.name}»?</h2></div>
            <div className="app-modal-body"><p>{t('План, его сценарии и команды будут удалены. Задачи в разделах не изменятся.')}</p></div>
            <div className="app-modal-footer">
              <button type="button" className="app-btn app-btn-subtle" onClick={() => setConfirm(false)}>{t('Отмена')}</button>
              <button type="button" className="app-btn app-btn-danger" onClick={onDelete}>{t('Удалить')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ScenarioBar({ plan, scenario, onSelect, onCreated, onApply, changes }) {
  const { t } = useLocalization();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [copy, setCopy] = useState(true);
  const [error, setError] = useState('');
  const create = async () => {
    setError('');
    try {
      const created = await plansApi.addScenario(plan.id, { name: name.trim(), copyFromScenarioId: copy ? scenario.id : null });
      setCreating(false); setName('');
      onCreated(created.id);
    } catch (e) { setError(e.message); }
  };
  return (
    <div className="plan-scenarios">
      <span className="plan-scenario-dot" style={{ background: scenario.color }} />
      <select className="app-select" value={scenario.id} onChange={(e) => onSelect(e.target.value)} aria-label={t('Сценарий')}>
        {plan.scenarios.map((s) => <option key={s.id} value={s.id}>{s.isDefault ? t(s.name) : s.name}{s.changes ? ` (${s.changes})` : ''}</option>)}
      </select>
      {plan.canEdit && <button type="button" className="app-btn" onClick={() => setCreating(true)}><NavIcon name="plus" size={14} />{t('Сценарий')}</button>}
      {plan.canEdit && (
        <button type="button" className="app-btn app-btn-primary" disabled={!changes} onClick={onApply} title={t('Записать даты сценария в задачи')}>
          {t('Сохранить изменения в задачах')}{changes ? ` (${changes})` : ''}
        </button>
      )}
      {creating && (
        <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setCreating(false); }}>
          <div className="app-modal" role="dialog" aria-modal="true" aria-label={t('Новый сценарий')}>
            <div className="app-modal-header"><h2>{t('Новый сценарий')}</h2></div>
            <div className="app-modal-body">
              <p className="sv-muted">{t('Сценарий — черновик плана: меняйте даты и команды, не затрагивая задачи, и сравнивайте варианты.')}</p>
              <label className="app-field"><span>{t('Название')}</span><input value={name} autoFocus maxLength={200} onChange={(e) => setName(e.target.value)} /></label>
              <label className="wiz-check"><input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} />{t('Скопировать изменения из текущего сценария')} «{scenario.name}»</label>
              {error && <p className="app-modal-error">{error}</p>}
            </div>
            <div className="app-modal-footer">
              <button type="button" className="app-btn app-btn-subtle" onClick={() => setCreating(false)}>{t('Отмена')}</button>
              <button type="button" className="app-btn app-btn-primary" disabled={!name.trim()} onClick={create}>{t('Создать')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PlanPage() {
  const { t } = useLocalization();
  const navigate = useNavigate();
  const { planId } = useParams();
  const { search } = useLocation();
  const view = new URLSearchParams(search).get('view') || 'timeline';
  const [plan, setPlan] = useState(null);
  const [scenarioId, setScenarioId] = useState(null);
  const [timeline, setTimeline] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const requestRef = useRef(0);

  const loadPlan = useCallback(() => plansApi.get(planId).then((p) => { setPlan(p); return p; }).catch((e) => { setError(e.message); return null; }), [planId]);
  const loadTimeline = useCallback((sid) => {
    const request = ++requestRef.current;
    return plansApi.timeline(planId, sid).then((data) => { if (request === requestRef.current) setTimeline(data); }).catch((e) => setError(e.message));
  }, [planId]);

  useEffect(() => { setPlan(null); setTimeline(null); setScenarioId(null); loadPlan(); }, [loadPlan]);
  useEffect(() => {
    if (!plan) return;
    const sid = scenarioId && plan.scenarios.some((s) => s.id === scenarioId) ? scenarioId : plan.scenarios[0]?.id;
    if (sid !== scenarioId) { setScenarioId(sid); return; }
    loadTimeline(sid);
  }, [plan, scenarioId, loadTimeline]);

  const items = useMemo(() => timeline?.items || [], [timeline]);
  const ranges = useMemo(() => computeRanges(items), [items]);
  const boardsById = useMemo(() => new Map((timeline?.boards || []).map((b) => [b.id, b])), [timeline]);
  const scenario = plan?.scenarios.find((s) => s.id === scenarioId) || plan?.scenarios[0];
  const changes = items.filter((i) => i.changed && i.dueDate !== i.originalDueDate).length;

  const act = async (action, message) => {
    setError('');
    try {
      await action();
      if (message) setNotice(message);
      await Promise.all([loadPlan(), loadTimeline(scenarioId)]);
    } catch (e) {
      setError(e.message);
    }
  };

  const schedule = (questId, range) => {
    setTimeline((current) => current && {
      ...current,
      items: current.items.map((i) => (i.id === questId ? { ...i, startDate: toApiDate(range.start), dueDate: toApiDate(range.end), changed: true } : i)),
    });
    act(() => plansApi.schedule(planId, scenarioId, questId, { startDate: toApiDate(range.start), dueDate: toApiDate(range.end) }));
  };

  if (error && !plan) return <div className="settings-shell"><section className="settings-content"><p className="settings-save-status is-error">{error}</p><Link to="/plans">{t('Все планы')}</Link></section></div>;
  if (!plan || !scenario) return <div className="settings-shell"><section className="settings-content"><p className="settings-empty">{t('Загрузка...')}</p></section></div>;

  return (
    <div className="settings-shell plan-shell">
      <section className="settings-content is-wide plan-page">
        <div className="settings-breadcrumbs"><Link to="/plans">{t('Планы')}</Link><span>/</span><span>{plan.name}</span></div>
        <div className="settings-title-row">
          <h1 className="settings-title"><span className="plan-icon"><NavIcon name="plans" size={18} /></span>{plan.name}</h1>
          <ScenarioBar
            plan={plan}
            scenario={scenario}
            changes={changes}
            onSelect={setScenarioId}
            onCreated={(id) => { setScenarioId(id); loadPlan(); }}
            onApply={() => act(async () => {
              const result = await plansApi.applyScenario(planId, scenario.id);
              setNotice(`${t('Обновлено задач')}: ${result.applied}${result.skipped ? `. ${t('Пропущено без прав')}: ${result.skipped}` : ''}`);
            })}
          />
        </div>
        <nav className="app-space-tabs plan-tabs" aria-label={t('Представления плана')}>
          {VIEWS.map(([id, icon, label]) => (
            <Link key={id} to={`/plans/${planId}${id === 'timeline' ? '' : `?view=${id}`}`} className={`app-space-tab ${view === id ? 'is-active' : ''}`}>
              <NavIcon name={icon} size={14} />{t(label)}
            </Link>
          ))}
        </nav>
        {error && <p className="settings-save-status is-error" role="alert">{error}</p>}
        {notice && <p className="settings-save-status" role="status" onClick={() => setNotice('')}>{notice}</p>}
        {timeline?.truncated && <p className="settings-save-status is-error">{t('Показаны первые 2000 задач. Уточните источники или исключения.')}</p>}
        {!timeline && <p className="settings-empty">{t('Загрузка...')}</p>}
        {timeline && view === 'timeline' && (
          <>
            <p className="sv-muted plan-summary">
              {items.length} {t('задач')} · {timeline.dependencies.length} {t('зависимостей')} · {t('Исключено')}: {timeline.excludedCount}
            </p>
            <PlanTimeline
              items={items}
              ranges={ranges}
              dependencies={timeline.dependencies}
              releases={timeline.releases}
              teams={plan.teams}
              boardsById={boardsById}
              canEdit={plan.canEdit}
              scenarioColor={scenario.color}
              onSchedule={schedule}
              onReset={(questId) => act(() => plansApi.resetSchedule(planId, scenarioId, questId))}
              onExclude={(questId) => act(() => plansApi.exclude(planId, questId), t('Задача исключена из плана'))}
              onTeamChange={(questId, teamId) => act(() => plansApi.schedule(planId, scenarioId, questId, teamId ? { planTeamId: teamId } : { clearTeam: true }))}
              onAddDependency={(blocker, blocked) => act(() => plansApi.addDependency(planId, { blockerQuestId: blocker, blockedQuestId: blocked }), t('Зависимость добавлена'))}
            />
          </>
        )}
        {timeline && view === 'capacity' && (
          <CapacityView items={items} ranges={ranges} teams={plan.teams} canEdit={plan.canEdit} onTeamUpdate={(teamId, patch) => act(() => plansApi.updateTeam(planId, teamId, patch))} />
        )}
        {timeline && view === 'dependencies' && (
          <DependenciesView
            items={items}
            ranges={ranges}
            dependencies={timeline.dependencies}
            canEdit={plan.canEdit}
            onAdd={(blocker, blocked) => act(() => plansApi.addDependency(planId, { blockerQuestId: blocker, blockedQuestId: blocked }))}
            onRemove={(linkId) => act(() => plansApi.removeDependency(planId, linkId))}
          />
        )}
        {timeline && view === 'releases' && <ReleasesView items={items} ranges={ranges} releases={timeline.releases} boardsById={boardsById} />}
        {view === 'teams' && <TeamsView plan={plan} canEdit={plan.canEdit} onChanged={() => { loadPlan(); loadTimeline(scenarioId); }} />}
        {view === 'settings' && (
          <SettingsView
            key={plan.updatedAt}
            plan={plan}
            canEdit={plan.canEdit}
            excludedItems={plan.exclusions}
            onSaved={() => { loadPlan(); loadTimeline(scenarioId); }}
            onInclude={(questId) => act(() => plansApi.include(planId, questId))}
            onDelete={async () => { await plansApi.delete(planId).catch((e) => setError(e.message)); navigate('/plans'); }}
          />
        )}
      </section>
    </div>
  );
}

export function PlansFlyoutContent({ onNavigate }) {
  const { t } = useLocalization();
  const [list, setList] = useState(null);
  useEffect(() => { plansApi.list().then((l) => setList(Array.isArray(l) ? l : [])).catch(() => setList([])); }, []);
  return (
    <>
      <div className="app-flyout-section">{t('Недавние планы')}</div>
      {list === null && <p className="app-flyout-empty">{t('Загрузка...')}</p>}
      {list?.slice(0, 6).map((plan) => (
        <Link key={plan.id} to={`/plans/${plan.id}`} className="app-nav-item app-nav-link" onClick={onNavigate}>
          <NavIcon name="plans" /><span className="app-nav-label">{plan.name}</span>
        </Link>
      ))}
      {list?.length === 0 && <p className="app-flyout-empty">{t('Планируйте работу нескольких разделов на одном таймлайне.')}</p>}
      <Link to="/plans/new" className="app-nav-item app-nav-link" onClick={onNavigate}><NavIcon name="plus" /><span className="app-nav-label">{t('Создать план')}</span></Link>
      <Link to="/plans" className="app-flyout-footer" onClick={onNavigate}>{t('Смотреть все планы')}</Link>
    </>
  );
}
