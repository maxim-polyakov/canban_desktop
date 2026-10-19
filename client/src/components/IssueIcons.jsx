import React from 'react';
import './IssueIcons.css';

// Original (non-Atlassian) iconography that follows familiar Jira-like conventions:
// purple bolt = Epic, green bookmark = Story, blue check = Task, red bug = Bug, grey chevrons = Subtask.
const ISSUE_TYPE_META = {
  0: { label: 'Эпик', color: '#8777D9', bg: '#F3F0FD' },
  1: { label: 'История', color: '#2F9E44', bg: '#EBFBEE' },
  2: { label: 'Задача', color: '#0052CC', bg: '#E9F2FF' },
  3: { label: 'Ошибка', color: '#DE350B', bg: '#FFEBE6' },
  4: { label: 'Подзадача', color: '#5E6C84', bg: '#F4F5F7' },
};

function EpicGlyph({ color }) {
  return (
    <path
      d="M13.2 2.5 5.6 13.1h4.1l-1.6 8.4 8.3-11.1h-4.4z"
      fill={color}
    />
  );
}

function StoryGlyph({ color }) {
  return (
    <path
      d="M6 3.5h12a1 1 0 0 1 1 1v15.4l-3.6-2.4a1.6 1.6 0 0 0-1.8 0L10 20.3V4.5a1 1 0 0 1 1-1h-5z"
      fill={color}
    />
  );
}

function TaskGlyph({ color }) {
  return (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.5" fill={color} />
      <path
        d="M8.3 12.4l2.5 2.5 5-5.3"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </>
  );
}

function BugGlyph({ color }) {
  return (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.5" fill={color} />
      <circle cx="12" cy="12.5" r="4" fill="#fff" />
      <circle cx="12" cy="12.5" r="2.4" fill={color} />
      <path d="M12 8.3V6.4M9 9.6 7.3 8M15 9.6 16.7 8M8 13.4H6M18 13.4h-2" stroke="#fff" strokeWidth="1.1" strokeLinecap="round" />
    </>
  );
}

function SubtaskGlyph({ color }) {
  return (
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.5" fill={color} />
      <path d="M9 9h6M9 12h6M9 15h3" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" />
    </>
  );
}

const GLYPHS = {
  0: EpicGlyph,
  1: StoryGlyph,
  2: TaskGlyph,
  3: BugGlyph,
  4: SubtaskGlyph,
};

export function getIssueTypeMeta(issueType) {
  return ISSUE_TYPE_META[issueType] ?? ISSUE_TYPE_META[2];
}

export function IssueTypeIcon({ issueType = 2, size = 16, className = '', title }) {
  const meta = getIssueTypeMeta(issueType);
  const Glyph = GLYPHS[issueType] ?? GLYPHS[2];
  return (
    <span
      className={`issue-type-icon ${className}`.trim()}
      style={{ width: size, height: size }}
      title={title ?? meta.label}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <Glyph color={meta.color} />
      </svg>
    </span>
  );
}

// Priority: 0 Lowest .. 4 Highest, double chevrons like Jira's priority glyphs.
const PRIORITY_META = {
  0: { label: 'Низший', color: '#2F9E44' },
  1: { label: 'Низкий', color: '#57A55A' },
  2: { label: 'Средний', color: '#E09B1A' },
  3: { label: 'Высокий', color: '#E2683B' },
  4: { label: 'Высший', color: '#DE350B' },
};

function PriorityArrows({ color, variant }) {
  if (variant === 'up2') {
    return (
      <>
        <path d="M12 4.5 17.5 10h-11z" fill={color} />
        <path d="M12 11 17.5 16.5h-11z" fill={color} opacity="0.55" />
      </>
    );
  }
  if (variant === 'up1') {
    return <path d="M12 7 18 14H6z" fill={color} />;
  }
  if (variant === 'flat') {
    return <rect x="6" y="11" width="12" height="2.4" rx="1.2" fill={color} />;
  }
  if (variant === 'down1') {
    return <path d="M12 17 6 10h12z" fill={color} />;
  }
  // down2
  return (
    <>
      <path d="M12 19.5 6.5 14h11z" fill={color} />
      <path d="M12 13 6.5 7.5h11z" fill={color} opacity="0.55" />
    </>
  );
}

const PRIORITY_VARIANT = {
  4: 'up2',
  3: 'up1',
  2: 'flat',
  1: 'down1',
  0: 'down2',
};

export function getPriorityMeta(priority) {
  return PRIORITY_META[priority] ?? PRIORITY_META[2];
}

export function PriorityIcon({ priority = 2, size = 16, className = '', title }) {
  const meta = getPriorityMeta(priority);
  const variant = PRIORITY_VARIANT[priority] ?? 'flat';
  return (
    <span
      className={`priority-icon ${className}`.trim()}
      style={{ width: size, height: size }}
      title={title ?? meta.label}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <PriorityArrows color={meta.color} variant={variant} />
      </svg>
    </span>
  );
}

export default IssueTypeIcon;
