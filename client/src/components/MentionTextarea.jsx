import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import AssigneeAvatar from './AssigneeAvatar.jsx';
import { useLocalization } from '../i18n/LocalizationContext.jsx';
import { activeMention, insertMention, mentionCandidates, splitMentions } from '../utils/mentions.js';
import './MentionTextarea.css';

/** Textarea with Jira-style @mention suggestions; `onChange` receives the new text. */
const MentionTextarea = forwardRef(function MentionTextarea({ value, onChange, members, onKeyDown, className = '', ...rest }, ref) {
  const { t } = useLocalization();
  const inputRef = useRef(null);
  const [mention, setMention] = useState(null);
  const [highlight, setHighlight] = useState(0);
  useImperativeHandle(ref, () => inputRef.current);

  const candidates = mention ? mentionCandidates(members, mention.query) : [];
  const open = candidates.length > 0;

  const track = (text, caret) => {
    const next = activeMention(text, caret);
    setMention(next);
    if (next?.query !== mention?.query) setHighlight(0);
  };

  const choose = (member) => {
    const el = inputRef.current;
    const caret = el ? el.selectionStart : String(value).length;
    const result = insertMention(value, mention.start, caret, member);
    onChange(result.text);
    setMention(null);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(result.caret, result.caret);
    });
  };

  const handleKeyDown = (e) => {
    if (open) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight((i) => (i + 1) % candidates.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setHighlight((i) => (i - 1 + candidates.length) % candidates.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(candidates[Math.min(highlight, candidates.length - 1)]); return; }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setMention(null); return; }
    }
    onKeyDown?.(e);
  };

  return (
    <div className="mention-input">
      <textarea
        {...rest}
        ref={inputRef}
        className={className}
        value={value}
        onChange={(e) => { onChange(e.target.value); track(e.target.value, e.target.selectionStart); }}
        onKeyDown={handleKeyDown}
        onClick={(e) => track(e.currentTarget.value, e.currentTarget.selectionStart)}
        onBlur={(e) => { setTimeout(() => setMention(null), 150); rest.onBlur?.(e); }}
      />
      {open && (
        <ul className="mention-menu" role="listbox" aria-label={t('Упомянуть пользователя')}>
          {candidates.map((member, index) => (
            <li key={member.userId ?? member.id}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlight}
                className={index === highlight ? 'is-active' : ''}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => choose(member)}
              >
                <AssigneeAvatar userId={member.userId ?? member.id} displayName={member.displayName} avatarUrl={member.avatarUrl} size={24} />
                <span className="mention-menu-name">{member.displayName}</span>
                {member.email && <span className="mention-menu-email">{member.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

export default MentionTextarea;

/** Renders text with mentions as Jira-style name chips; your own mentions are highlighted. */
export function MentionText({ text, currentUserId }) {
  return splitMentions(text).map((part, index) => (typeof part === 'string'
    ? <React.Fragment key={index}>{part}</React.Fragment>
    : <span key={index} className={`mention-chip ${part.id === currentUserId ? 'is-me' : ''}`}>@{part.name}</span>));
}
