import React, { useState } from 'react';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import NavIcon from './NavIcons.jsx';

export const SHORTCUTS = [
  ['/', 'Поиск'],
  ['c', 'Создать задачу'],
  ['?', 'Справка'],
  ['Esc', 'Закрыть окно или панель'],
];

const TOPICS = {
  shortcuts: {
    icon: 'keyboard',
    title: 'Быстрые клавиши',
    render: (t) => (
      <dl className="app-help-shortcuts">
        {SHORTCUTS.map(([key, label]) => (
          <div key={key}><dt><kbd>{key}</kbd></dt><dd>{t(label)}</dd></div>
        ))}
      </dl>
    ),
  },
  board: {
    icon: 'board',
    title: 'Поиск на доске',
    render: (t) => (
      <ul className="app-help-list">
        <li><code>assignee:me</code> — {t('мои задачи')}</li>
        <li><code>priority:high</code> — {t('приоритет: highest, high, medium, low, lowest')}</li>
        <li><code>type:bug</code> — {t('тип: epic, story, task, bug, subtask')}</li>
        <li><code>label:…</code> — {t('задачи с меткой')}</li>
        <li><code>sprint:active</code> — {t('задачи активного спринта')}</li>
        <li>{t('Остальной текст ищется по ключу и названию задачи.')}</li>
      </ul>
    ),
  },
  jql: {
    icon: 'filters',
    title: 'Язык запросов JQL',
    render: (t) => (
      <ul className="app-help-list">
        <li><code>assignee = currentUser() AND status != Done</code></li>
        <li><code>priority IN (High, Highest) ORDER BY created DESC</code></li>
        <li><code>summary ~ "оплата" AND labels = backend</code></li>
        <li><code>sprint IN openSprints()</code></li>
        <li>{t('Поля: key, summary, description, status, type, priority, assignee, sprint, labels, component, fixVersion, storyPoints, created, duedate.')}</li>
      </ul>
    ),
  },
};

export default function HelpPanel({ open, onClose }) {
  const { t } = useLocalization();
  const [topic, setTopic] = useState(null);
  if (!open) return null;
  const current = topic ? TOPICS[topic] : null;
  return (
    <aside className="app-panel app-help" role="dialog" aria-label={t('Справка')}>
      <div className="app-panel-header app-panel-header-center">
        {current && (
          <button type="button" className="app-icon-btn" aria-label={t('Назад')} onClick={() => setTopic(null)}>
            <NavIcon name="chevronRight" className="app-flip" />
          </button>
        )}
        <h2>{t(current ? current.title : 'Справка')}</h2>
        <button type="button" className="app-icon-btn" aria-label={t('Закрыть')} onClick={onClose}><NavIcon name="close" /></button>
      </div>
      <div className="app-panel-body">
        {current ? current.render(t) : (
          <ul className="app-help-topics">
            {Object.entries(TOPICS).map(([key, value]) => (
              <li key={key}>
                <button type="button" className="app-help-topic" onClick={() => setTopic(key)}>
                  <NavIcon name={value.icon} />
                  <span>{t(value.title)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
