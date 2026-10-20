import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from '../../i18n/navigation.jsx';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { home as homeApi } from '../../api.js';
import NavIcon from '../../components/NavIcons.jsx';
import { IssueTypeIcon } from '../../components/IssueIcons.jsx';
import { timeAgo } from '../../utils/timeAgo.js';
import { formatScore, HOME_STATUSES } from '../../utils/homeItems.js';
import {
  Avatar, formatDate, fromInputDate, HOME_KINDS, HomeStatus, ICONS, ItemIcon, Progress, StatusUpdateComposer, TagInput, toInputDate,
  UpdateCard, useMyTeams, useOutsideClose, usePeople,
} from './HomePages.jsx';
import '../settings/Settings.css';
import './Home.css';

const TABS = {
  projects: [['about', 'Сведения'], ['updates', 'Обновления'], ['learnings', 'Выводы'], ['risks', 'Риски'], ['decisions', 'Решения']],
  goals: [['about', 'Сведения'], ['updates', 'Обновления'], ['children', 'Подцели'], ['learnings', 'Выводы'], ['risks', 'Риски'], ['decisions', 'Решения']],
};

const ENTRY_TABS = {
  learnings: {
    type: 'learning', art: '💡', title: 'Делитесь своими знаниями', add: 'Добавить новый вывод', titleLabel: 'Вывод',
    text: 'Поделитесь знаниями, полученными в компании, чтобы помочь другим в работе над похожими проектами.',
  },
  risks: {
    type: 'risk', art: '⚠️', title: 'Фиксируйте известные риски', add: 'Добавить новый риск', titleLabel: 'Риск',
    text: 'Отслеживайте риски и информируйте заинтересованных лиц, чтобы для них не стал неожиданностью наихудший сценарий, который может возникнуть в проекте.',
  },
  decisions: {
    type: 'decision', art: '🧭', title: 'Сообщайте о важных решениях', add: 'Добавить новое решение', titleLabel: 'Решение',
    text: 'Записывайте здесь важные решения по проекту, чтобы поделиться ими в очередном обновлении.',
  },
};

const ABOUT_SECTIONS = [
  ['description', 'Чем мы занимаемся', { projects: 'Опишите проект и связанные с ним задачи.', goals: 'Опишите цель и работу, которая к ней ведёт.' }],
  ['why', 'Зачем мы этим занимаемся', { projects: 'Разъясните, зачем выполняются эти задачи и какие цели они преследуют.', goals: 'Разъясните, почему эта цель важна.' }],
  ['success', 'Как будет определяться успех', { projects: 'Расскажите подробнее о том, чего вы хотите достичь.', goals: 'Расскажите, по каким признакам станет понятно, что цель достигнута.' }],
];

const STATUS_MENU = [['pending', 'on_track', 'at_risk', 'off_track', 'done'], ['paused', 'cancelled']];

function useClipboard() {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async (text) => {
    try { await navigator.clipboard.writeText(text); } catch { window.prompt('', text); return; }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, []);
  return [copied, copy];
}

/** Text input with a filtered list of colleagues; picking one calls onPick. */
function PeopleSearch({ people, exclude = [], placeholder, onPick, inputRef, autoFocus = false }) {
  const { t } = useLocalization();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(autoFocus);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  const needle = query.trim().toLowerCase();
  const options = people.filter((p) => !exclude.includes(p.id) && (!needle || (p.displayName || '').toLowerCase().includes(needle))).slice(0, 8);
  return (
    <div className="home-people-search" ref={ref}>
      <input ref={inputRef} autoFocus={autoFocus} value={query} placeholder={t(placeholder)} aria-label={t(placeholder)}
        onFocus={() => setOpen(true)} onChange={(e) => { setQuery(e.target.value); setOpen(true); }} />
      {open && (
        <div className="home-popover home-people-options" role="listbox">
          {options.map((p) => (
            <button key={p.id} type="button" role="option" aria-selected="false" className="home-popover-item home-person"
              onClick={() => { onPick(p.id); setQuery(''); setOpen(false); }}>
              <Avatar user={p} size={20} />{p.displayName}
            </button>
          ))}
          {options.length === 0 && <p className="home-muted">{t('Ничего не найдено')}</p>}
        </div>
      )}
    </div>
  );
}

function StatusMenu({ item, canEdit, onChange }) {
  const { t } = useLocalization();
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useOutsideClose(open, close);
  const current = HOME_STATUSES.find(([id]) => id === item.status) || HOME_STATUSES[3];
  if (!canEdit) return <HomeStatus status={item.status} score={item.score} kind={item.kind} />;
  return (
    <div className="home-chip-wrap" ref={ref}>
      <button type="button" className={`home-status-button ${current[2]}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {item.kind === 'goal' && item.score != null && <span>{formatScore(item.score)}</span>}
        {t(current[1])}<NavIcon name="chevronDown" size={12} />
      </button>
      {open && (
        <div className="home-popover home-status-menu" role="menu">
          {STATUS_MENU.map((group, index) => (
            <div key={index} className="home-status-menu-group">
              {group.map((id) => {
                const [, label, tone] = HOME_STATUSES.find(([s]) => s === id);
                return (
                  <button key={id} type="button" role="menuitemradio" aria-checked={item.status === id} className="home-popover-item"
                    onClick={() => { setOpen(false); if (id !== item.status) onChange(id); }}>
                    <span className={`home-status ${tone}`}>{t(label)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ShareDialog({ data, kind, people, onClose, run, link }) {
  const { t } = useLocalization();
  const { user } = useAuth();
  const item = data.item;
  const canEdit = item.canEdit;
  const [tab, setTab] = useState('access');
  const [copied, copy] = useClipboard();
  const followersSearch = useRef(null);
  const contributorIds = data.contributors.map((c) => c.id);
  const followerIds = data.followers.map((f) => f.id);
  const owner = data.ownerUser || item.owner;
  const suggestions = people.filter((p) => p.id !== owner?.id && !contributorIds.includes(p.id)).slice(0, 3);
  const tabs = [['access', 'Доступ', 1 + data.contributors.filter((c) => c.id !== owner?.id).length], ['followers', 'Подписчики', data.followers.length], ['channels', 'Каналы', 0]];

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="app-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="app-modal home-share" role="dialog" aria-modal="true" aria-label={t('Предоставление доступа')}>
        <div className="app-modal-header">
          <h2>{t('Предоставление доступа')}</h2>
          <div className="home-share-head-actions">
            <button type="button" className="app-icon-btn" title={copied ? t('Ссылка скопирована') : t('Копировать ссылку')} aria-label={t('Копировать ссылку')} onClick={() => copy(link)}>
              <NavIcon name={copied ? 'check' : 'link'} size={14} />
            </button>
            <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={onClose}><NavIcon name="close" size={14} /></button>
          </div>
        </div>
        <div className="app-modal-body">
          <div className="home-tabs" role="tablist">
            {tabs.map(([id, label, count]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={`home-tab ${tab === id ? 'is-active' : ''}`} onClick={() => setTab(id)}>
                {t(label)} <span className="home-tab-count">{count}</span>
              </button>
            ))}
          </div>

          {tab === 'access' && (
            <>
              {canEdit && (
                <>
                  <PeopleSearch people={people} exclude={[owner?.id, ...contributorIds]} placeholder="Поиск и приглашение пользователей"
                    onPick={(id) => run(() => homeApi.addContributor(item.id, id))} />
                  {suggestions.length > 0 && (
                    <div className="home-share-suggestions">
                      {suggestions.map((p) => (
                        <button key={p.id} type="button" className="home-chip" onClick={() => run(() => homeApi.addContributor(item.id, p.id))}>
                          <NavIcon name="plus" size={12} />{p.displayName}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
              <h3 className="home-share-label">{t('Общий доступ')}</h3>
              <div className="home-share-row">
                <NavIcon name={item.isPrivate ? 'lock' : 'globe'} size={16} />
                <div className="home-share-row-main">
                  {canEdit ? (
                    <select className="home-inline-select" value={item.isPrivate ? 'private' : 'open'} aria-label={t('Общий доступ')}
                      onChange={(e) => run(() => homeApi.update(item.id, { isPrivate: e.target.value === 'private' }))}>
                      <option value="open">{t('Открыто')}</option>
                      <option value="private">{t('Частный')}</option>
                    </select>
                  ) : <strong>{t(item.isPrivate ? 'Частный' : 'Открыто')}</strong>}
                  <span className="home-muted">
                    {t(item.isPrivate
                      ? 'Видят только владелец, участники, подписчики и команда.'
                      : 'Просматривать могут все из ваших команд, редактировать — владелец, участники и команда.')}
                  </span>
                </div>
              </div>
              <h3 className="home-share-label">{t('Особый доступ')}</h3>
              <ul className="home-share-people">
                {owner && (
                  <li>
                    <Avatar user={owner} size={28} />
                    <span className="home-share-person">{owner.displayName}{owner.id === user?.id && ` (${t('Вы')})`}</span>
                    <span className="home-muted">{t('Владелец')}</span>
                  </li>
                )}
                {data.contributors.filter((c) => c.id !== owner?.id).map((c) => (
                  <li key={c.id}>
                    <Avatar user={c} size={28} />
                    <span className="home-share-person">{c.displayName}{c.id === user?.id && ` (${t('Вы')})`}</span>
                    <span className="home-muted">{t('Может редактировать')}</span>
                    {(canEdit || c.id === user?.id) && (
                      <button type="button" className="app-icon-btn" aria-label={`${t('Убрать')} ${c.displayName}`} onClick={() => run(() => homeApi.removeContributor(item.id, c.id))}>
                        <NavIcon name="close" size={12} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {tab === 'followers' && (
            <>
              {canEdit && (
                <PeopleSearch inputRef={followersSearch} people={people} exclude={followerIds} placeholder="Поиск и приглашение пользователей"
                  onPick={(id) => run(() => homeApi.addFollower(item.id, id))} />
              )}
              <ul className="home-share-people">
                {data.followers.map((f) => (
                  <li key={f.id}>
                    <Avatar user={f} size={28} />
                    <span className="home-share-person">{f.displayName}{f.id === user?.id && ` (${t('Вы')})`}</span>
                    {(canEdit || f.id === user?.id) && (
                      <button type="button" className="app-icon-btn" aria-label={`${t('Убрать')} ${f.displayName}`} onClick={() => run(() => homeApi.removeFollower(item.id, f.id))}>
                        <NavIcon name="close" size={12} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {data.followers.length <= 1 && (
                <div className="home-empty">
                  <div className="home-empty-art" aria-hidden="true">👥</div>
                  <h3>{t('Добавьте подписчиков, чтобы делиться обновлениями')}</h3>
                  <p>{t('Подписчики видят обновления статуса в ленте «Обновления статуса» по всем элементам, которые они отслеживают.')}</p>
                  {canEdit && <button type="button" className="app-btn app-btn-primary" onClick={() => followersSearch.current?.focus()}>{t('Добавить подписчиков')}</button>}
                </div>
              )}
            </>
          )}

          {tab === 'channels' && (
            <div className="home-empty">
              <div className="home-empty-art" aria-hidden="true">📣</div>
              <h3>{t('Добавьте канал, чтобы расширить свою аудиторию')}</h3>
              <p>{t('Обновления передаются во все подключенные каналы сразу после публикации.')}</p>
              <div className="home-empty-actions">
                <button type="button" className="app-btn app-btn-subtle" disabled title={t('Скоро')}>{t('Подключить Slack')}</button>
                <button type="button" className="app-btn app-btn-subtle" disabled title={t('Скоро')}>{t('Подключить Teams')}</button>
              </div>
              <p className="home-muted">{t('Подключение каналов появится позже. Пока подписчики получают обновления в ленте.')}</p>
            </div>
          )}
          <p className="home-muted home-share-kind">{t(HOME_KINDS[kind].column)} · {item.key}</p>
        </div>
      </div>
    </div>
  );
}

function AboutSection({ title, placeholder, value, canEdit, onSave }) {
  const { t } = useLocalization();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  if (editing) {
    return (
      <section className="home-about">
        <h3>{t(title)}</h3>
        <textarea className="home-textarea" rows={5} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t(placeholder)} aria-label={t(title)} />
        <div className="home-composer-actions">
          <button type="button" className="app-btn app-btn-subtle" onClick={() => setEditing(false)}>{t('Отмена')}</button>
          <button type="button" className="app-btn app-btn-primary" onClick={() => { setEditing(false); onSave(draft); }}>{t('Сохранить')}</button>
        </div>
      </section>
    );
  }
  return (
    <section className="home-about">
      <h3>{t(title)}</h3>
      {canEdit ? (
        <button type="button" className="home-about-text is-editable" onClick={() => { setDraft(value || ''); setEditing(true); }}>
          {value || <span className="home-muted">{t(placeholder)}</span>}
        </button>
      ) : <p className="home-about-text">{value || <span className="home-muted">—</span>}</p>}
    </section>
  );
}

function Comments({ itemId, ownerId, comments, run }) {
  const { t, locale } = useLocalization();
  const { user } = useAuth();
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const submit = (e) => {
    e.preventDefault();
    if (!draft.trim()) return;
    run(async () => { await homeApi.addEntry(itemId, { type: 'comment', body: draft.trim() }); setDraft(''); setOpen(false); });
  };
  return (
    <section className="home-about">
      <h3>{t('Комментарии')}</h3>
      <ul className="home-comments">
        {comments.map((c) => (
          <li key={c.id}>
            <Avatar user={c.author} size={28} />
            <div className="home-comment-body">
              <div className="home-comment-head">
                <strong>{c.author?.displayName}</strong>
                <span className="home-muted">{timeAgo(c.createdAt, locale)}</span>
                {(c.author?.id === user?.id || ownerId === user?.id) && (
                  <button type="button" className="app-icon-btn" aria-label={t('Удалить комментарий')} title={t('Удалить комментарий')} onClick={() => run(() => homeApi.deleteEntry(itemId, c.id))}>
                    <NavIcon name="trash" size={12} />
                  </button>
                )}
              </div>
              <p className="home-update-text">{c.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <form className="home-comment-form" onSubmit={submit}>
        <Avatar user={user} size={28} />
        <div className="home-comment-body">
          {open ? (
            <>
              <textarea className="home-textarea" rows={3} autoFocus value={draft} maxLength={10000} onChange={(e) => setDraft(e.target.value)} aria-label={t('Комментарий')} />
              <div className="home-composer-actions">
                <button type="button" className="app-btn app-btn-subtle" onClick={() => { setOpen(false); setDraft(''); }}>{t('Отмена')}</button>
                <button type="submit" className="app-btn app-btn-primary" disabled={!draft.trim()}>{t('Сохранить')}</button>
              </div>
            </>
          ) : (
            <button type="button" className="home-comment-placeholder" onClick={() => setOpen(true)}>{t('Добавить комментарий… похвалите')}</button>
          )}
        </div>
      </form>
    </section>
  );
}

function EntryForm({ config, initial, isRisk, onCancel, onSubmit }) {
  const { t } = useLocalization();
  const [title, setTitle] = useState(initial?.title || '');
  const [body, setBody] = useState(initial?.body || '');
  return (
    <form className="home-card home-entry-form" onSubmit={(e) => { e.preventDefault(); if (title.trim()) onSubmit({ title: title.trim(), body }); }}>
      <label className="app-field">
        <span>{t(config.titleLabel)} <span className="app-required">*</span></span>
        <input autoFocus value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="app-field">
        <span>{t(isRisk ? 'Описание и план снижения риска' : 'Подробности')}</span>
        <textarea className="home-textarea" rows={4} value={body} maxLength={10000} onChange={(e) => setBody(e.target.value)} />
      </label>
      <div className="home-composer-actions">
        <button type="button" className="app-btn app-btn-subtle" onClick={onCancel}>{t('Отмена')}</button>
        <button type="submit" className="app-btn app-btn-primary" disabled={!title.trim()}>{t('Сохранить')}</button>
      </div>
    </form>
  );
}

function EntryTab({ tabId, itemId, entries, canEdit, run }) {
  const config = ENTRY_TABS[tabId];
  const { t, locale } = useLocalization();
  const { user } = useAuth();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const isRisk = config.type === 'risk';
  useEffect(() => { setAdding(false); setEditingId(null); }, [tabId]);

  if (!entries.length && !adding) {
    return (
      <div className="home-card home-empty is-wide">
        <div className="home-empty-art" aria-hidden="true">{config.art}</div>
        <div>
          <h3>{t(config.title)}</h3>
          <p>{t(config.text)}</p>
          {canEdit && <button type="button" className="app-btn app-btn-subtle" onClick={() => setAdding(true)}>{t(config.add)}</button>}
        </div>
      </div>
    );
  }
  return (
    <>
      {canEdit && !adding && <div><button type="button" className="app-btn app-btn-subtle" onClick={() => setAdding(true)}><NavIcon name="plus" size={12} />{t(config.add)}</button></div>}
      {adding && (
        <EntryForm config={config} isRisk={isRisk} onCancel={() => setAdding(false)}
          onSubmit={(values) => run(async () => { await homeApi.addEntry(itemId, { type: config.type, ...values }); setAdding(false); })} />
      )}
      {entries.slice().reverse().map((entry) => (editingId === entry.id ? (
        <EntryForm key={entry.id} config={config} isRisk={isRisk} initial={entry} onCancel={() => setEditingId(null)}
          onSubmit={(values) => run(async () => { await homeApi.updateEntry(itemId, entry.id, values); setEditingId(null); })} />
      ) : (
        <article key={entry.id} className={`home-card home-entry ${entry.resolved ? 'is-resolved' : ''}`}>
          <header className="home-update-head">
            <Avatar user={entry.author} size={28} />
            <div className="home-update-who">
              <strong>{entry.title}</strong>
              {isRisk && <span className={`home-status ${entry.resolved ? 'is-success' : 'is-warning'}`}>{t(entry.resolved ? 'Снят' : 'Активный')}</span>}
              <span className="home-muted">{entry.author?.displayName} · {timeAgo(entry.createdAt, locale)}</span>
            </div>
            {(canEdit || entry.author?.id === user?.id) && (
              <div className="home-entry-actions">
                {isRisk && (
                  <button type="button" className="app-btn app-btn-subtle" onClick={() => run(() => homeApi.updateEntry(itemId, entry.id, { resolved: !entry.resolved }))}>
                    {t(entry.resolved ? 'Вернуть' : 'Снять риск')}
                  </button>
                )}
                <button type="button" className="app-icon-btn" aria-label={t('Изменить')} title={t('Изменить')} onClick={() => setEditingId(entry.id)}><NavIcon name="edit" size={12} /></button>
                <button type="button" className="app-icon-btn" aria-label={t('Удалить')} title={t('Удалить')}
                  onClick={() => { if (window.confirm(t('Удалить без возможности восстановления?'))) run(() => homeApi.deleteEntry(itemId, entry.id)); }}>
                  <NavIcon name="trash" size={12} />
                </button>
              </div>
            )}
          </header>
          {entry.body && <p className="home-update-text home-entry-text">{entry.body}</p>}
        </article>
      )))}
    </>
  );
}

function SideSection({ label, count, canAdd, adding, onToggle, children }) {
  const { t } = useLocalization();
  return (
    <div className="home-side-field">
      <div className="home-side-head">
        <span className="home-side-label">{t(label)}{count > 0 && <span className="home-side-count">{count}</span>}</span>
        {canAdd && (
          <button type="button" className="app-icon-btn" aria-label={`${t(adding ? 'Закрыть' : 'Добавить')}: ${t(label)}`} aria-expanded={adding} onClick={onToggle}>
            <NavIcon name={adding ? 'close' : 'plus'} size={12} />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function LinkForm({ onSubmit }) {
  const { t } = useLocalization();
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  return (
    <form className="home-side-form" onSubmit={(e) => { e.preventDefault(); if (url.trim()) onSubmit({ url: url.trim(), title: title.trim() || null }); }}>
      <input autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" aria-label={t('Ссылка')} />
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('Название (необязательно)')} aria-label={t('Название')} />
      <button type="submit" className="app-btn app-btn-subtle" disabled={!url.trim()}>{t('Добавить')}</button>
    </form>
  );
}

export function HomeItemPage({ kind }) {
  const cfg = HOME_KINDS[kind];
  const { itemId, tab: tabParam } = useParams();
  const { t, locale } = useLocalization();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const peopleList = usePeople();
  const myTeams = useMyTeams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [composing, setComposing] = useState(() => new URLSearchParams(location.search).get('update') === '1');
  const [menuOpen, setMenuOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [iconOpen, setIconOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [adding, setAdding] = useState('');
  const [workKey, setWorkKey] = useState('');
  const [actionError, setActionError] = useState('');
  const [otherOptions, setOtherOptions] = useState([]);
  const [sameOptions, setSameOptions] = useState([]);
  const [hintHidden, setHintHidden] = useState(() => window.localStorage.getItem('canban.home.aboutHint') === '1');
  const [linkCopied, copyLink] = useClipboard();
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const menuRef = useOutsideClose(menuOpen, closeMenu);
  const closeIcon = useCallback(() => setIconOpen(false), []);
  const iconRef = useOutsideClose(iconOpen, closeIcon);

  const tabs = TABS[kind];
  const tab = tabs.some(([id]) => id === tabParam) ? tabParam : 'about';

  const load = useCallback(() => {
    homeApi.get(itemId).then((d) => { setData(d); setError(''); }).catch((e) => setError(e.message));
  }, [itemId]);
  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(() => {
    const asList = (list) => (Array.isArray(list) ? list : []);
    homeApi.list(cfg.other).then((list) => setOtherOptions(asList(list))).catch(() => setOtherOptions([]));
    homeApi.list(kind).then((list) => setSameOptions(asList(list))).catch(() => setSameOptions([]));
  }, [cfg.other, kind]);

  const run = async (action) => {
    setActionError('');
    try { await action(); load(); } catch (e) { setActionError(e.message || t('Не удалось сохранить')); }
  };
  const save = (patch) => run(() => homeApi.update(itemId, patch));
  const toggleAdding = (id) => setAdding((cur) => (cur === id ? '' : id));

  if (error) {
    return (
      <div className="settings-shell"><section className="settings-content">
        <div className="settings-breadcrumbs"><Link to={`/${kind}`}>{t(cfg.title)}</Link></div>
        <p className="settings-save-status is-error">{error}</p>
      </section></div>
    );
  }
  if (!data) return <div className="settings-shell"><section className="settings-content"><p className="settings-empty">{t('Загрузка...')}</p></section></div>;

  const item = data.item;
  const canEdit = item.canEdit;
  const isGoal = item.kind === 'goal';
  const pageLink = `${window.location.origin}/${kind}/${item.id}`;
  const contributorIds = data.contributors.map((c) => c.id);
  const followerIds = data.followers.map((f) => f.id);
  const linkedIds = data.linked.map((l) => l.id);
  const relatedIds = (data.related || []).map((r) => r.item.id);
  const aboutEmpty = !data.description && !data.why && !data.success;
  const tabLabel = (id, label) => {
    if (id === 'children') return `${t(label)} (${data.children.length})`;
    const entries = { learnings: data.learnings, risks: data.risks, decisions: data.decisions }[id];
    return entries?.length ? `${t(label)} (${entries.length})` : t(label);
  };
  const hideHint = () => { setHintHidden(true); window.localStorage.setItem('canban.home.aboutHint', '1'); };
  const aboutValue = { description: data.description, why: data.why, success: data.success };

  return (
    <div className="settings-shell">
      <section className="settings-content is-wide home-page home-item-page">
        <div className="home-item-top">
          <div className="home-item-heading">
            <div className="settings-breadcrumbs">
              <Link to={`/${kind}`}>{t(cfg.title)}</Link>
              {data.parent && <><span>/</span><Link to={`/goals/${data.parent.id}`}>{data.parent.name}</Link></>}
              <span>/</span><span>{item.key}</span>
            </div>
            <div className="home-item-head">
              <div className="home-chip-wrap" ref={iconRef}>
                {canEdit ? (
                  <button type="button" className="home-icon-button" aria-label={t('Выберите эмодзи')} aria-expanded={iconOpen} onClick={() => setIconOpen((v) => !v)}>
                    <ItemIcon item={item} size={32} />
                  </button>
                ) : <ItemIcon item={item} size={32} />}
                {iconOpen && (
                  <div className="home-popover home-icon-picker" role="dialog" aria-label={t('Выберите эмодзи')}>
                    {ICONS.map((icon) => (
                      <button key={icon || 'none'} type="button" className={`home-icon-option ${item.icon === icon ? 'is-selected' : ''}`} aria-pressed={item.icon === icon}
                        onClick={() => { setIconOpen(false); save({ icon }); }}>
                        {icon || <NavIcon name={cfg.icon} size={16} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {editingName ? (
                <input className="home-name-input" autoFocus value={nameDraft} maxLength={200} aria-label={t('Название')}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={() => { setEditingName(false); if (nameDraft.trim() && nameDraft.trim() !== item.name) save({ name: nameDraft.trim() }); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setNameDraft(item.name); setEditingName(false); } }} />
              ) : (
                <h1 className={`settings-title home-item-name ${canEdit ? 'is-editable' : ''}`}
                  onClick={canEdit ? () => { setNameDraft(item.name); setEditingName(true); } : undefined}>{item.name}</h1>
              )}
              {item.isArchived && <span className="settings-lozenge">{t('В архиве')}</span>}
              {item.isPrivate && <span className="settings-lozenge"><NavIcon name="lock" size={10} /> {t('Частный')}</span>}
            </div>
          </div>
          <div className="home-item-actions">
            <StatusMenu item={item} canEdit={canEdit && !item.isArchived} onChange={(status) => save({ status })} />
            <button type="button" className={`app-btn app-btn-subtle ${item.isFollowing ? 'is-following' : ''}`} aria-pressed={item.isFollowing}
              onClick={() => run(() => (item.isFollowing ? homeApi.unfollow(item.id) : homeApi.follow(item.id)))}>
              <NavIcon name="eye" size={14} />{t(item.isFollowing ? 'Отслеживается' : 'Отслеживать')}
            </button>
            <button type="button" className="app-btn app-btn-subtle" onClick={() => setShareOpen(true)}>
              <NavIcon name={item.isPrivate ? 'lock' : 'person'} size={14} />{t('Поделиться')}
            </button>
            <button type="button" className="app-icon-btn" aria-label={t('Копировать ссылку')} title={linkCopied ? t('Ссылка скопирована') : t('Копировать ссылку')} onClick={() => copyLink(pageLink)}>
              <NavIcon name={linkCopied ? 'check' : 'link'} size={14} />
            </button>
            <div className="home-chip-wrap" ref={menuRef}>
              <button type="button" className="app-icon-btn" aria-label={t('Ещё')} aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}><NavIcon name="more" /></button>
              {menuOpen && (
                <div className="home-popover is-right" role="menu">
                  <button type="button" role="menuitem" className="home-popover-item home-menu-item" onClick={() => { setMenuOpen(false); run(() => (item.isStarred ? homeApi.unstar(item.id) : homeApi.star(item.id))); }}>
                    <NavIcon name="star" size={14} />{t(item.isStarred ? 'Снять отметку' : 'Отметить')}
                  </button>
                  {canEdit && (
                    <button type="button" role="menuitem" className="home-popover-item home-menu-item" onClick={() => { setMenuOpen(false); run(() => homeApi.archive(item.id, !item.isArchived)); }}>
                      <NavIcon name="archive" size={14} />{t(item.isArchived ? 'Восстановить из архива' : 'Архив')}
                    </button>
                  )}
                  <button type="button" role="menuitem" className="home-popover-item home-menu-item" onClick={async () => {
                    setMenuOpen(false);
                    try { const copy = await homeApi.clone(item.id); navigate(`/${kind}/${copy.item.id}`); } catch (e) { setActionError(e.message); }
                  }}>
                    <NavIcon name="copy" size={14} />{t('Клонировать')}
                  </button>
                  {data.canDelete && (
                    <button type="button" role="menuitem" className="home-popover-item home-menu-item is-danger" onClick={async () => {
                      setMenuOpen(false);
                      if (!window.confirm(t('Удалить без возможности восстановления?'))) return;
                      try { await homeApi.delete(item.id); navigate(`/${kind}`); } catch (e) { setActionError(e.message); }
                    }}>
                      <NavIcon name="trash" size={14} />{t('Удалить')}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="home-tabs home-item-tabs" role="tablist">
          {tabs.map(([id, label]) => (
            <Link key={id} to={`/${kind}/${item.id}${id === 'about' ? '' : `/${id}`}`} role="tab" aria-selected={tab === id} className={`home-tab ${tab === id ? 'is-active' : ''}`}>
              {tabLabel(id, label)}
            </Link>
          ))}
        </div>
        {actionError && <p className="settings-save-status is-error" role="alert">{actionError}</p>}

        <div className="home-detail">
          <div className="home-main">
            {item.updateDue && canEdit && !composing && (
              <div className="home-due-banner">
                <span>{t(item.lastUpdateAt ? 'Пора написать еженедельное обновление статуса.' : 'Напишите первое обновление статуса, чтобы подписчики знали, как идут дела.')}</span>
                <Link className="app-btn app-btn-subtle" to={`/${kind}/${item.id}/updates?update=1`} onClick={() => setComposing(true)}>{t('Написать обновление')}</Link>
              </div>
            )}

            {tab === 'about' && (
              <>
                {canEdit && aboutEmpty && !hintHidden && (
                  <div className="home-about-hint">
                    <span>{t(isGoal ? 'Расскажите, в чём заключается суть цели.' : 'Расскажите, в чем заключается суть проекта.')}</span>
                    <button type="button" className="app-icon-btn" aria-label={t('Скрыть')} onClick={hideHint}><NavIcon name="close" size={12} /></button>
                  </div>
                )}
                {ABOUT_SECTIONS.map(([field, title, placeholders]) => (
                  <AboutSection key={field} title={title} placeholder={placeholders[kind]} value={aboutValue[field]} canEdit={canEdit}
                    onSave={(value) => save({ [field]: value })} />
                ))}
                <Comments itemId={item.id} ownerId={item.owner?.id} comments={data.comments || []} run={run} />
              </>
            )}

            {tab === 'updates' && (
              <>
                {canEdit && !item.isArchived && (composing
                  ? <StatusUpdateComposer item={item} onCancel={() => setComposing(false)} onPosted={() => { setComposing(false); load(); }} />
                  : (
                    <div className="home-update-prompt">
                      <span className="home-person"><Avatar user={user} size={24} /><strong>{user?.displayName}</strong></span>
                      <button type="button" className="home-comment-placeholder" onClick={() => setComposing(true)}>{t('Опубликуйте свое обновление.')}</button>
                    </div>
                  ))}
                {data.updates.map((u) => (
                  <UpdateCard key={u.id} update={u} kind={item.kind} canDelete={u.author?.id === user?.id || item.owner?.id === user?.id} onDelete={() => run(() => homeApi.deleteUpdate(item.id, u.id))} />
                ))}
                {data.updates.length === 0 && (
                  <div className="home-card home-empty is-wide">
                    <div className="home-empty-art" aria-hidden="true">🗓️</div>
                    <div>
                      <h3>{t('Обновлений пока нет')}</h3>
                      <p>{t('Раз в неделю рассказывайте, что сделано, что дальше и есть ли риски. Подписчики увидят обновление в ленте.')}</p>
                    </div>
                  </div>
                )}
              </>
            )}

            {ENTRY_TABS[tab] && (
              <EntryTab tabId={tab} itemId={item.id} canEdit={canEdit}
                entries={{ learnings: data.learnings, risks: data.risks, decisions: data.decisions }[tab] || []} run={run} />
            )}

            {tab === 'children' && (
              <div className="home-card">
                <ul className="home-list">
                  {data.children.map((c) => (
                    <li key={c.id}>
                      <Link to={`/goals/${c.id}`} className="home-name is-inline"><ItemIcon item={c} size={20} />{c.name}</Link>
                      <HomeStatus status={c.status} score={c.score} kind="goal" />
                    </li>
                  ))}
                </ul>
                {data.children.length === 0 && <p className="home-muted">{t('Подцелей нет. Укажите эту цель как родительскую при создании новой цели.')}</p>}
              </div>
            )}
          </div>

          <aside className="home-side">
            <SideSection label="Владелец" canAdd={canEdit} adding={adding === 'owner'} onToggle={() => toggleAdding('owner')}>
              <span className="home-person"><Avatar user={item.owner} />{item.owner?.displayName}</span>
              {adding === 'owner' && <PeopleSearch autoFocus people={peopleList} exclude={[item.owner?.id]} placeholder="Выберите владельца" onPick={(id) => { setAdding(''); save({ ownerUserId: id }); }} />}
            </SideSection>

            <SideSection label="Участники" count={data.contributors.length} canAdd={canEdit} adding={adding === 'contributors'} onToggle={() => toggleAdding('contributors')}>
              <ul className="home-people">
                {data.contributors.map((c) => (
                  <li key={c.id}>
                    <span className="home-person"><Avatar user={c} />{c.displayName}</span>
                    {(canEdit || c.id === user?.id) && <button type="button" className="app-icon-btn" aria-label={`${t('Убрать')} ${c.displayName}`} onClick={() => run(() => homeApi.removeContributor(item.id, c.id))}><NavIcon name="close" size={12} /></button>}
                  </li>
                ))}
              </ul>
              {adding === 'contributors' && <PeopleSearch autoFocus people={peopleList} exclude={contributorIds} placeholder="Добавить участника" onPick={(id) => run(() => homeApi.addContributor(item.id, id))} />}
            </SideSection>

            <SideSection label="Подписчики" count={data.followers.length} canAdd={canEdit} adding={adding === 'followers'} onToggle={() => toggleAdding('followers')}>
              <div className="home-side-row">
                {data.followers.length > 0
                  ? <span className="home-avatars">{data.followers.slice(0, 12).map((f) => <Avatar key={f.id} user={f} />)}</span>
                  : <span className="home-muted">{t('Добавить подписчиков')}</span>}
                <button type="button" className="app-btn app-btn-subtle home-side-link" onClick={() => setShareOpen(true)}>{t('Все')}</button>
              </div>
              {adding === 'followers' && <PeopleSearch autoFocus people={peopleList} exclude={followerIds} placeholder="Добавить подписчика" onPick={(id) => run(() => homeApi.addFollower(item.id, id))} />}
            </SideSection>

            <SideSection label={isGoal ? 'Проекты, которые работают на цель' : 'Участие в целях'} count={data.linked.length} canAdd={canEdit} adding={adding === 'linked'} onToggle={() => toggleAdding('linked')}>
              <ul className="home-people">
                {data.linked.map((l) => (
                  <li key={l.id}>
                    <Link to={`/${l.kind === 'goal' ? 'goals' : 'projects'}/${l.id}`} className="home-name is-inline"><ItemIcon item={l} size={18} />{l.name}</Link>
                    {canEdit && <button type="button" className="app-icon-btn" aria-label={t('Убрать связь')} onClick={() => run(() => homeApi.unlink(item.id, l.id))}><NavIcon name="close" size={12} /></button>}
                  </li>
                ))}
              </ul>
              {adding === 'linked' && (
                <select className="home-inline-select" autoFocus value="" aria-label={t(isGoal ? 'Связать проект' : 'Связать с целью')}
                  onChange={(e) => { if (e.target.value) { setAdding(''); run(() => homeApi.link(item.id, e.target.value)); } }}>
                  <option value="">{t(isGoal ? 'Связать проект' : 'Связать с целью')}</option>
                  {otherOptions.filter((o) => !linkedIds.includes(o.id)).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              )}
            </SideSection>

            {isGoal && (
              <SideSection label="Родительская цель" canAdd={canEdit} adding={adding === 'parent'} onToggle={() => toggleAdding('parent')}>
                {data.parent ? <Link to={`/goals/${data.parent.id}`} className="home-name is-inline"><ItemIcon item={data.parent} size={18} />{data.parent.name}</Link> : <span className="home-muted">—</span>}
                {adding === 'parent' && (
                  <select className="home-inline-select" autoFocus value={item.parentId || ''} aria-label={t('Родительская цель')}
                    onChange={(e) => { setAdding(''); save(e.target.value ? { parentId: e.target.value } : { clearParent: true }); }}>
                    <option value="">{t('Нет')}</option>
                    {sameOptions.filter((g) => g.id !== item.id).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                )}
              </SideSection>
            )}

            <SideSection label={isGoal ? 'Связанные цели' : 'Связанные проекты'} count={relatedIds.length} canAdd={canEdit} adding={adding === 'related'} onToggle={() => toggleAdding('related')}>
              <ul className="home-people">
                {(data.related || []).map((r) => (
                  <li key={r.entryId}>
                    <Link to={`/${kind}/${r.item.id}`} className="home-name is-inline"><ItemIcon item={r.item} size={18} />{r.item.name}</Link>
                    {canEdit && <button type="button" className="app-icon-btn" aria-label={t('Убрать связь')} onClick={() => run(() => homeApi.deleteEntry(item.id, r.entryId))}><NavIcon name="close" size={12} /></button>}
                  </li>
                ))}
              </ul>
              {adding === 'related' && (
                <select className="home-inline-select" autoFocus value="" aria-label={t(isGoal ? 'Связанные цели' : 'Связанные проекты')}
                  onChange={(e) => { if (e.target.value) { setAdding(''); run(() => homeApi.addEntry(item.id, { type: 'related', targetId: e.target.value })); } }}>
                  <option value="">{t('Выберите')}</option>
                  {sameOptions.filter((o) => o.id !== item.id && !relatedIds.includes(o.id)).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              )}
            </SideSection>

            <SideSection label="Задачи Jira" count={data.work.total} canAdd={canEdit} adding={adding === 'work'} onToggle={() => toggleAdding('work')}>
              {data.work.total > 0 && <Progress done={data.work.done} total={data.work.total} />}
              <ul className="home-people">
                {data.work.items.map((w) => (
                  <li key={w.id}>
                    <span className="home-side-work">
                      <IssueTypeIcon issueType={w.issueType} size={14} />
                      <Link to={`/board/${w.boardId}/issue/${w.id}`} className="home-key">{w.issueKey}</Link>
                      <span className="home-list-title" title={w.title}>{w.title}</span>
                    </span>
                    {canEdit && <button type="button" className="app-icon-btn" aria-label={t('Убрать')} onClick={() => run(() => homeApi.removeWork(item.id, w.id))}><NavIcon name="close" size={12} /></button>}
                  </li>
                ))}
              </ul>
              {data.work.items.length < data.work.total && <p className="home-muted">{t('Часть задач скрыта: у вас нет доступа к их разделам.')}</p>}
              {adding === 'work' && (
                <form className="home-side-form" onSubmit={(e) => { e.preventDefault(); if (workKey.trim()) run(async () => { await homeApi.addWork(item.id, { issueKey: workKey.trim() }); setWorkKey(''); }); }}>
                  <input autoFocus value={workKey} onChange={(e) => setWorkKey(e.target.value)} placeholder={t('Ключ задачи или эпика, например ABC-12')} aria-label={t('Ключ задачи')} />
                  <button type="submit" className="app-btn app-btn-subtle" disabled={!workKey.trim()}>{t('Добавить')}</button>
                </form>
              )}
            </SideSection>

            <SideSection label="Ссылки" count={(data.links || []).length} canAdd={canEdit} adding={adding === 'links'} onToggle={() => toggleAdding('links')}>
              <ul className="home-people">
                {(data.links || []).map((l) => (
                  <li key={l.id}>
                    <a href={l.url} target="_blank" rel="noreferrer noopener" className="home-side-url" title={l.url}><NavIcon name="link" size={12} />{l.title || l.url}</a>
                    {canEdit && <button type="button" className="app-icon-btn" aria-label={t('Убрать')} onClick={() => run(() => homeApi.deleteEntry(item.id, l.id))}><NavIcon name="close" size={12} /></button>}
                  </li>
                ))}
              </ul>
              {adding === 'links' && <LinkForm onSubmit={(values) => run(async () => { await homeApi.addEntry(item.id, { type: 'link', ...values }); setAdding(''); })} />}
            </SideSection>

            <SideSection label="Теги" count={item.tags.length} canAdd={canEdit} adding={adding === 'tags'} onToggle={() => toggleAdding('tags')}>
              {adding === 'tags'
                ? <TagInput id="home-item-tags" value={item.tags} onChange={(tags) => save({ tags })} />
                : item.tags.length > 0 && <span className="home-tags">{item.tags.map((tag) => <span key={tag} className="home-tag">{tag}</span>)}</span>}
            </SideSection>

            <SideSection label="Команда" canAdd={canEdit} adding={adding === 'team'} onToggle={() => toggleAdding('team')}>
              {adding === 'team' ? (
                <select className="home-inline-select" autoFocus value={item.team?.id || ''} aria-label={t('Команда')}
                  onChange={(e) => { setAdding(''); save(e.target.value ? { teamId: e.target.value } : { clearTeam: true }); }}>
                  <option value="">{t('Без команды')}</option>
                  {item.team && !myTeams.some((tm) => tm.id === item.team.id) && <option value={item.team.id}>{item.team.name}</option>}
                  {myTeams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              ) : item.team && <span>{item.team.name}</span>}
            </SideSection>

            {!isGoal && (
              <SideSection label="Дата начала" canAdd={canEdit} adding={adding === 'start'} onToggle={() => toggleAdding('start')}>
                {adding === 'start'
                  ? <input type="date" className="home-inline-select" autoFocus value={toInputDate(item.startDate ?? data.startDate)} aria-label={t('Дата начала')}
                      onChange={(e) => save(e.target.value ? { startDate: fromInputDate(e.target.value) } : { clearStartDate: true })} />
                  : (item.startDate ?? data.startDate) && <span>{formatDate(item.startDate ?? data.startDate, locale)}</span>}
              </SideSection>
            )}

            <SideSection label="Срок" canAdd={canEdit} adding={adding === 'target'} onToggle={() => toggleAdding('target')}>
              {adding === 'target'
                ? <input type="date" className="home-inline-select" autoFocus value={toInputDate(item.targetDate)} aria-label={t('Срок')}
                    onChange={(e) => save(e.target.value ? { targetDate: fromInputDate(e.target.value) } : { clearTargetDate: true })} />
                : item.targetDate && <span>{formatDate(item.targetDate, locale)}</span>}
            </SideSection>

            <p className="home-muted home-side-meta">{t('Создано')} {timeAgo(item.createdAt, locale)}</p>
          </aside>
        </div>
      </section>
      {shareOpen && <ShareDialog data={data} kind={kind} people={peopleList} link={pageLink} run={run} onClose={() => setShareOpen(false)} />}
    </div>
  );
}
