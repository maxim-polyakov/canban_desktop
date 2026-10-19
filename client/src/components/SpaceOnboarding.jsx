import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from '../i18n/navigation.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { boards as boardsApi } from '../api.js';
import NavIcon from './NavIcons.jsx';
import { markOnboardingStep, ONBOARDING_EVENT, onboardingSteps, readOnboarding, spaceFeatures, writeOnboarding } from '../utils/spaceFeatures.js';
import '../pages/spaces/SpaceTemplates.css';

const ABSOLUTE_STEPS = new Set(['team']);

export function useOnboarding(boardId) {
  const [state, setState] = useState(() => (boardId ? readOnboarding(boardId) : null));
  useEffect(() => {
    setState(boardId ? readOnboarding(boardId) : null);
    const onChange = (e) => { if (!e.detail?.boardId || e.detail.boardId === boardId) setState(readOnboarding(boardId)); };
    window.addEventListener(ONBOARDING_EVENT, onChange);
    return () => window.removeEventListener(ONBOARDING_EVENT, onChange);
  }, [boardId]);
  return state;
}

export function OnboardingChecklist({ board, boardId, onNavigate }) {
  const { t } = useLocalization();
  const navigate = useNavigate();
  const state = useOnboarding(boardId);
  const steps = onboardingSteps(spaceFeatures(board), state?.template || board?.template);
  const done = new Set(state?.done || []);
  const tracking = Boolean(state) && !done.has('issue');

  useEffect(() => {
    if (!tracking) return undefined;
    let alive = true;
    boardsApi.getById(boardId)
      .then((b) => {
        const count = (b?.columns || []).reduce((sum, c) => sum + (c.quests?.length || 0), 0);
        if (alive && count > 0) markOnboardingStep(boardId, 'issue');
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [boardId, tracking]);

  if (!state) return null;
  const completed = steps.filter(([id]) => done.has(id)).length;
  const percent = Math.round((completed / steps.length) * 100);

  const open = ([id, , , path]) => {
    markOnboardingStep(boardId, id);
    if (id === 'issue') { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', bubbles: true })); onNavigate?.(); return; }
    if (path) navigate(ABSOLUTE_STEPS.has(id) ? path : `/board/${boardId}${path}`);
    onNavigate?.();
  };

  return (
    <div className="onb-panel">
      <div className="onb-head">
        <strong>{t('Начало работы')}</strong>
        <span className="onb-count">{completed}/{steps.length}</span>
      </div>
      <div className="onb-progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <ul className="onb-steps">
        {steps.map((step) => {
          const [id, title, description] = step;
          const isDone = done.has(id);
          return (
            <li key={id}>
              <button type="button" className={`onb-step ${isDone ? 'is-done' : ''}`} onClick={() => open(step)}>
                <span className="onb-check" aria-hidden="true">{isDone && <NavIcon name="check" size={12} />}</span>
                <span className="onb-text">
                  <span className="onb-title">{t(title)}</span>
                  <span className="onb-desc">{t(description)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <button type="button" className="app-btn app-btn-subtle onb-dismiss" onClick={() => writeOnboarding(boardId, { ...state, dismissed: true, open: false })}>
        {completed === steps.length ? t('Готово') : t('Скрыть чек-лист')}
      </button>
    </div>
  );
}

export default function OnboardingButton({ board, boardId }) {
  const { t } = useLocalization();
  const state = useOnboarding(boardId);
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => {
    setOpen(false);
    const current = readOnboarding(boardId);
    if (current?.open) writeOnboarding(boardId, { ...current, open: false });
  }, [boardId]);

  useEffect(() => { setOpen(Boolean(state?.open && !state?.dismissed)); }, [state?.open, state?.dismissed]);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!ref.current?.contains(e.target)) close(); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, close]);

  if (!state || state.dismissed) return null;
  return (
    <div className="onb-anchor" ref={ref}>
      <button type="button" className="app-btn onb-button" aria-expanded={open} onClick={() => (open ? close() : setOpen(true))}>
        <NavIcon name="sparkle" size={14} />{t('Начало работы')}
      </button>
      {open && <div className="onb-popover"><OnboardingChecklist board={board} boardId={boardId} onNavigate={close} /></div>}
    </div>
  );
}
