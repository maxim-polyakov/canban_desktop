import React, { useCallback, useEffect, useState } from 'react';
import { votes as votesApi } from '../api.js';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import AssigneeAvatar from './AssigneeAvatar.jsx';

/** Jira-style voting: one vote per person, not on own or resolved issues; voters are listed for people who work in the space. */
export default function IssueVotes({ questId, statusKey }) {
  const { t } = useLocalization();
  const [state, setState] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showVoters, setShowVoters] = useState(false);

  const load = useCallback(() => {
    if (!questId) return;
    votesApi.get(questId).then((value) => { setState(value); setError(''); }).catch((e) => setError(e.message || 'Не удалось загрузить голоса.'));
  }, [questId]);
  useEffect(() => { setState(null); setShowVoters(false); load(); }, [load, statusKey]);

  const toggle = async () => {
    if (!state || saving) return;
    setSaving(true);
    setError('');
    try {
      setState(await (state.hasVoted ? votesApi.unvote(questId) : votesApi.vote(questId)));
    } catch (e) {
      setError(t(e.message || 'Не удалось сохранить голос.'));
    } finally {
      setSaving(false);
    }
  };

  if (!state) return error ? <p className="issue-drawer-error" role="alert">{t(error)}</p> : null;
  const label = state.hasVoted ? t('Отменить голос') : t('Голосовать');
  return (
    <fieldset className="issue-drawer-notifications issue-votes">
      <legend>{t('Голоса')} <span className="issue-votes-count" aria-label={t('Голосов')}>{state.votes}</span></legend>
      <button type="button" className={`issue-drawer-watch-toggle ${state.hasVoted ? 'is-watching' : ''}`} onClick={toggle}
        disabled={!state.canVote || saving} aria-pressed={state.hasVoted} title={state.blockedReason ? t(state.blockedReason) : undefined}>
        {state.hasVoted ? `✓ ${label}` : `+ ${label}`}
      </button>
      {state.blockedReason && <p className="issue-drawer-notifications-hint">{t(state.blockedReason)}</p>}
      {error && <p className="issue-drawer-error" role="alert">{error}</p>}
      {state.voters && state.votes > 0 && (
        <>
          <button type="button" className="issue-votes-link" aria-expanded={showVoters} onClick={() => setShowVoters((v) => !v)}>
            {showVoters ? t('Скрыть голосовавших') : t('Посмотреть голосовавших')}
          </button>
          {showVoters && (
            <ul className="issue-votes-voters">
              {state.voters.map((v) => (
                <li key={v.userId}>
                  <AssigneeAvatar displayName={v.displayName} avatarUrl={v.avatarUrl} size={20} />
                  <span>{v.displayName}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </fieldset>
  );
}
