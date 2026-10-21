import React, { useEffect, useState } from 'react';
import { ai } from '../api.js';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { MarkdownView } from '../utils/markdown.jsx';
import './AiAssist.css';

let statusPromise = null;
export const resetAiStatus = () => { statusPromise = null; };

/** Whether the server has a model configured; fetched once per page load. */
export function useAiEnabled() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let alive = true;
    statusPromise = statusPromise || ai.status().then((s) => Boolean(s?.enabled)).catch(() => false);
    statusPromise.then((value) => { if (alive) setEnabled(value); });
    return () => { alive = false; };
  }, []);
  return enabled;
}

export const SparkleIcon = ({ size = 16 }) => (
  <svg className="ai-sparkle" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
    <path fill="currentColor" d="M6.5 1.5 7.7 5a2 2 0 0 0 1.3 1.3l3.5 1.2-3.5 1.2A2 2 0 0 0 7.7 10L6.5 13.5 5.3 10A2 2 0 0 0 4 8.7L.5 7.5 4 6.3A2 2 0 0 0 5.3 5L6.5 1.5zM13 1l.5 1.5L15 3l-1.5.5L13 5l-.5-1.5L11 3l1.5-.5L13 1zm0 9 .5 1.5 1.5.5-1.5.5L13 14l-.5-1.5L11 12l1.5-.5L13 10z" />
  </svg>
);

/**
 * Jira's «Улучшить задачи типа …»: drafts or improves the description and shows it for review
 * before anything is saved.
 */
export function AiDescriptionAssist({ boardId, title, issueType, issueTypeName, description, onAccept, compact = false }) {
  const { t, language } = useLocalization();
  const enabled = useAiEnabled();
  const [state, setState] = useState({ status: 'idle', text: '', error: '' });
  if (!enabled || !boardId) return null;

  const run = async () => {
    setState({ status: 'loading', text: '', error: '' });
    try {
      const res = await ai.description({ boardId, title, issueType, issueTypeName, description, language });
      setState({ status: 'ready', text: res?.text || '', error: '' });
    } catch (e) {
      setState({ status: 'error', text: '', error: t(e?.message || 'ИИ не смог ответить.') });
    }
  };
  const label = description?.trim()
    ? t('Улучшить задачу типа «${type}»', { type: issueTypeName || t('Задача') })
    : t('Сгенерировать описание');

  return (
    <div className={`ai-assist ${compact ? 'is-compact' : ''}`}>
      {state.status !== 'ready' && (
        <button type="button" className="ai-btn" onClick={run} disabled={state.status === 'loading' || (!title?.trim() && !description?.trim())}>
          <SparkleIcon />{state.status === 'loading' ? t('ИИ пишет…') : label}
        </button>
      )}
      {state.status === 'error' && <p className="ai-error" role="alert">{state.error}</p>}
      {state.status === 'ready' && (
        <div className="ai-card" role="region" aria-label={t('Предложение ИИ')}>
          <div className="ai-card-head"><SparkleIcon /><strong>{t('Предложение ИИ')}</strong></div>
          <MarkdownView source={state.text} className="ai-card-body" />
          <p className="ai-disclaimer">{t('Проверьте текст: ИИ может ошибаться.')}</p>
          <div className="ai-card-actions">
            <button type="button" className="app-btn app-btn-primary" onClick={() => { onAccept(state.text); setState({ status: 'idle', text: '', error: '' }); }}>{t('Заменить описание')}</button>
            <button type="button" className="app-btn app-btn-subtle" onClick={run}>{t('Ещё вариант')}</button>
            <button type="button" className="app-btn app-btn-subtle" onClick={() => setState({ status: 'idle', text: '', error: '' })}>{t('Отклонить')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Atlassian Intelligence-style summary of the issue, its description and comments. */
export function AiSummary({ questId }) {
  const { t, language } = useLocalization();
  const enabled = useAiEnabled();
  const [state, setState] = useState({ status: 'idle', text: '', error: '' });
  useEffect(() => { setState({ status: 'idle', text: '', error: '' }); }, [questId]);
  if (!enabled || !questId) return null;

  const run = async () => {
    setState((s) => ({ ...s, status: 'loading', error: '' }));
    try {
      const res = await ai.summarize(questId, language);
      setState({ status: 'ready', text: res?.text || '', error: '' });
    } catch (e) {
      setState({ status: 'error', text: '', error: t(e?.message || 'ИИ не смог ответить.') });
    }
  };

  if (state.status === 'idle' || (state.status === 'loading' && !state.text) || state.status === 'error') {
    return (
      <div className="ai-assist">
        <button type="button" className="ai-btn" onClick={run} disabled={state.status === 'loading'}>
          <SparkleIcon />{state.status === 'loading' ? t('ИИ читает задачу…') : t('Краткое содержание')}
        </button>
        {state.status === 'error' && <p className="ai-error" role="alert">{state.error}</p>}
      </div>
    );
  }
  return (
    <div className="ai-card" role="region" aria-label={t('Краткое содержание')}>
      <div className="ai-card-head">
        <SparkleIcon /><strong>{t('Краткое содержание')}</strong>
        <span className="ai-spacer" />
        <button type="button" className="ai-link" onClick={run} disabled={state.status === 'loading'}>{state.status === 'loading' ? '…' : t('Обновить')}</button>
        <button type="button" className="ai-link" onClick={() => setState({ status: 'idle', text: '', error: '' })}>{t('Скрыть')}</button>
      </div>
      <MarkdownView source={state.text} className="ai-card-body" />
      <p className="ai-disclaimer">{t('Создано ИИ по описанию и комментариям. Проверяйте важные детали.')}</p>
    </div>
  );
}
