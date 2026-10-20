import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from '../../i18n/navigation.jsx';
import { useLocalization } from '../../i18n/LocalizationContext.jsx';
import { spaceContent } from '../../api.js';
import NavIcon from '../../components/NavIcons.jsx';
import AssigneeAvatar from '../../components/AssigneeAvatar';
import { MarkdownView } from '../../utils/markdown.jsx';
import { timeAgo } from '../../utils/timeAgo.js';
import './SpaceContent.css';

const TOOLBAR = [
  ['H1', 'Заголовок 1', '# ', ''],
  ['H2', 'Заголовок 2', '## ', ''],
  ['B', 'Жирный', '**', '**'],
  ['I', 'Курсив', '*', '*'],
  ['S', 'Зачёркнутый', '~~', '~~'],
  ['•', 'Маркированный список', '- ', ''],
  ['1.', 'Нумерованный список', '1. ', ''],
  ['☐', 'Список задач', '- [ ] ', ''],
  ['❝', 'Цитата', '> ', ''],
  ['</>', 'Код', '`', '`'],
  ['🔗', 'Ссылка', '[', '](https://)'],
  ['—', 'Разделитель', '\n---\n', ''],
];

function DocTree({ docs, parentId, activeId, boardId, depth = 0 }) {
  const children = docs.filter((d) => (d.parentId || null) === parentId);
  if (!children.length) return null;
  return (
    <ul className="sc-tree" style={{ '--depth': depth }}>
      {children.map((doc) => (
        <li key={doc.id}>
          <Link to={`/board/${boardId}/docs/${doc.id}`} className={`sc-tree-item ${doc.id === activeId ? 'is-active' : ''}`} title={doc.title}>
            <NavIcon name="docs" size={14} /><span>{doc.title}</span>
          </Link>
          <DocTree docs={docs} parentId={doc.id} activeId={activeId} boardId={boardId} depth={depth + 1} />
        </li>
      ))}
    </ul>
  );
}

function Editor({ value, onChange, t }) {
  const ref = useRef(null);
  const apply = (before, after) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: start, selectionEnd: end } = el;
    const selected = value.slice(start, end);
    const lineStart = !after && before.trim() && !before.startsWith('\n');
    const at = lineStart ? value.lastIndexOf('\n', start - 1) + 1 : start;
    const next = lineStart
      ? `${value.slice(0, at)}${before}${value.slice(at)}`
      : `${value.slice(0, start)}${before}${selected}${after}${value.slice(end)}`;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = lineStart ? end + before.length : start + before.length + selected.length;
      el.setSelectionRange(lineStart ? start + before.length : start + before.length, caret);
    });
  };
  return (
    <div className="sc-editor">
      <div className="sc-editor-toolbar" role="toolbar" aria-label={t('Форматирование')}>
        {TOOLBAR.map(([label, title, before, after]) => (
          <button key={title} type="button" title={t(title)} aria-label={t(title)} onClick={() => apply(before, after)}>{label}</button>
        ))}
      </div>
      <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={t('Начните писать или используйте Markdown: # заголовок, - список, **жирный**')} />
    </div>
  );
}

export default function SpaceDocsPage() {
  const { boardId, docId } = useParams();
  const navigate = useNavigate();
  const startEditing = new URLSearchParams(useLocation().search).get('edit') === '1';
  const { t, language } = useLocalization();
  const [docs, setDocs] = useState(null);
  const [doc, setDoc] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: '', content: '' });
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadList = useCallback(() => spaceContent.listDocs(boardId).then((list) => setDocs(Array.isArray(list) ? list : [])).catch((e) => { setDocs([]); setError(e.message); }), [boardId]);
  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    setEditing(false);
    setError('');
    if (!docId) { setDoc(null); return; }
    setDoc(undefined);
    spaceContent.getDoc(boardId, docId).then((d) => {
      setDoc(d);
      setDraft({ title: d.title, content: d.content });
      setEditing(startEditing);
    }).catch((e) => { setDoc(null); setError(e.message); });
  }, [boardId, docId, startEditing]);

  const create = async (parentId = null) => {
    setError('');
    try {
      const created = await spaceContent.createDoc(boardId, { title: t('Без названия'), content: '', parentId });
      await loadList();
      navigate(`/board/${boardId}/docs/${created.id}?edit=1`);
    } catch (e) {
      setError(e.message);
    }
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const saved = await spaceContent.updateDoc(boardId, doc.id, { title: draft.title.trim() || t('Без названия'), content: draft.content, parentId: doc.parentId });
      setDoc(saved);
      setEditing(false);
      loadList();
      if (startEditing) navigate(`/board/${boardId}/docs/${saved.id}`, { replace: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`${t('Удалить документ')} «${doc.title}» ${t('и все вложенные страницы?')}`)) return;
    try {
      await spaceContent.deleteDoc(boardId, doc.id);
      await loadList();
      navigate(`/board/${boardId}/docs`);
    } catch (e) {
      setError(e.message);
    }
  };

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (docs || []).filter((d) => !needle || d.title.toLowerCase().includes(needle));
  }, [docs, query]);

  const empty = docs && docs.length === 0;

  return (
    <div className="sc-page sc-docs">
      <aside className="sc-docs-nav" aria-label={t('Документы')}>
        <div className="sc-docs-nav-head">
          <strong>{t('Документы')}</strong>
          <button type="button" className="app-icon-btn" onClick={() => create(null)} aria-label={t('Создать документ')} title={t('Создать документ')}><NavIcon name="plus" size={14} /></button>
        </div>
        <Link to={`/board/${boardId}/docs`} className={`sc-tree-item ${!docId ? 'is-active' : ''}`}><NavIcon name="list" size={14} /><span>{t('Все документы')}</span></Link>
        {docs && <DocTree docs={docs} parentId={null} activeId={docId} boardId={boardId} />}
      </aside>

      <section className="sc-docs-main">
        {error && <p className="settings-save-status is-error" role="alert">{error}</p>}

        {!docId && empty && (
          <div className="sc-empty">
            <span className="sc-empty-art" aria-hidden="true"><NavIcon name="docs" size={28} /></span>
            <h1>{t('Управляйте всем контентом раздела в одном месте')}</h1>
            <p>{t('Храните требования, заметки встреч, инструкции и решения рядом с задачами — без переключения между инструментами.')}</p>
            <button type="button" className="app-btn app-btn-primary" onClick={() => create(null)}>{t('Создать документ')}</button>
          </div>
        )}

        {!docId && docs && !empty && (
          <>
            <div className="sc-head">
              <h1>{t('Все документы')}</h1>
              <button type="button" className="app-btn app-btn-primary" onClick={() => create(null)}><NavIcon name="plus" size={14} />{t('Создать документ')}</button>
            </div>
            <label className="sc-search">
              <NavIcon name="search" size={14} />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Поиск документов')} aria-label={t('Поиск документов')} />
            </label>
            <div className="settings-table-wrap">
              <table className="settings-table">
                <thead><tr><th>{t('Название')}</th><th className="hide-mobile">{t('Автор')}</th><th>{t('Обновлено')}</th></tr></thead>
                <tbody>
                  {filtered.map((d) => (
                    <tr key={d.id}>
                      <td><Link to={`/board/${boardId}/docs/${d.id}`} className="settings-table-name"><NavIcon name="docs" size={16} />{d.title}</Link></td>
                      <td className="hide-mobile">{d.createdBy && <span className="settings-table-person"><AssigneeAvatar userId={d.createdBy.id} displayName={d.createdBy.displayName} avatarUrl={d.createdBy.avatarUrl} size={20} />{d.createdBy.displayName}</span>}</td>
                      <td>{timeAgo(d.updatedAt, language)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && <p className="settings-empty">{t('Документы не найдены.')}</p>}
            </div>
          </>
        )}

        {docId && doc === undefined && <p className="settings-empty">{t('Загрузка...')}</p>}

        {docId && doc && !editing && (
          <article className="sc-doc">
            <div className="sc-doc-actions">
              <span className="sc-muted">
                {doc.updatedBy && <>{t('Обновил(а)')} {doc.updatedBy.displayName} · </>}{timeAgo(doc.updatedAt, language)}
              </span>
              <span className="sc-doc-buttons">
                <button type="button" className="app-btn" onClick={() => { setDraft({ title: doc.title, content: doc.content }); setEditing(true); }}><NavIcon name="edit" size={14} />{t('Изменить')}</button>
                <button type="button" className="app-btn" onClick={() => create(doc.id)}><NavIcon name="plus" size={14} />{t('Вложенная страница')}</button>
                <button type="button" className="app-btn app-btn-subtle" onClick={remove}>{t('Удалить')}</button>
              </span>
            </div>
            <h1 className="sc-doc-title">{doc.title}</h1>
            {doc.content.trim()
              ? <MarkdownView source={doc.content} className="sc-doc-body" />
              : <p className="sc-muted">{t('Документ пока пуст. Нажмите «Изменить», чтобы добавить содержимое.')}</p>}
          </article>
        )}

        {docId && doc && editing && (
          <div className="sc-doc is-editing">
            <input className="sc-doc-title-input" value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} placeholder={t('Название документа')} maxLength={255} autoFocus aria-label={t('Название документа')} />
            <Editor value={draft.content} onChange={(content) => setDraft((d) => ({ ...d, content }))} t={t} />
            <div className="sc-doc-edit-actions">
              <button type="button" className="app-btn app-btn-primary" onClick={save} disabled={saving}>{saving ? t('Сохранение...') : t('Опубликовать')}</button>
              <button type="button" className="app-btn app-btn-subtle" onClick={() => { setEditing(false); if (startEditing) navigate(`/board/${boardId}/docs/${doc.id}`, { replace: true }); }} disabled={saving}>{t('Отмена')}</button>
            </div>
            {draft.content.trim() && (
              <div className="sc-preview">
                <div className="sc-muted">{t('Предпросмотр')}</div>
                <MarkdownView source={draft.content} className="sc-doc-body" />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
