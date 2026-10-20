import React from 'react';
import { getCustomIssueType, useIssueTypeRegistry } from '../utils/issueConfig.js';
import './IssueIcons.css';

// Original (non-Atlassian) iconography that follows familiar Jira-like conventions:
// purple bolt = Epic, green bookmark = Story, blue check = Task, red bug = Bug, grey chevrons = Subtask.
const ISSUE_TYPE_META = {
  0: { label: 'Эпик', color: '#904EE2', bg: '#F3F0FF' },
  1: { label: 'История', color: '#63BA3C', bg: '#EFFFD6' },
  2: { label: 'Задача', color: '#4BADE8', bg: '#E9F2FF' },
  3: { label: 'Ошибка', color: '#E5493A', bg: '#FFECEB' },
  4: { label: 'Подзадача', color: '#4BADE8', bg: '#E9F2FF' },
};

function Tile({ color }) {
  return <rect x="2" y="2" width="20" height="20" rx="4" fill={color} />;
}

function EpicGlyph({ color }) {
  return (
    <>
      <Tile color={color} />
      <path d="M13.4 5.5 7.6 13h3.6l-1 5.5 6.2-7.9h-3.7z" fill="#fff" />
    </>
  );
}

function StoryGlyph({ color }) {
  return (
    <>
      <Tile color={color} />
      <path d="M8 6.5h8v11.2l-4-2.6-4 2.6z" fill="#fff" />
    </>
  );
}

function TaskGlyph({ color }) {
  return (
    <>
      <Tile color={color} />
      <path d="M7.6 12.2l3 3 5.8-6.2" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  );
}

function BugGlyph({ color }) {
  return (
    <>
      <Tile color={color} />
      <circle cx="12" cy="12" r="4.2" fill="#fff" />
    </>
  );
}

function SubtaskGlyph({ color }) {
  return (
    <>
      <Tile color={color} />
      <rect x="6.5" y="6.5" width="6" height="6" rx="1.2" fill="none" stroke="#fff" strokeWidth="1.8" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1.2" fill="#fff" />
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

export function IssueTypeIcon({ issueType = 2, typeId, size = 16, className = '', title }) {
  useIssueTypeRegistry();
  const custom = getCustomIssueType(typeId);
  if (custom) {
    return (
      <span
        className={`issue-type-icon issue-type-icon-custom ${className}`.trim()}
        style={{ width: size, height: size, background: custom.color, fontSize: Math.round(size * 0.68) }}
        title={title ?? custom.name}
        aria-hidden={title ? undefined : 'true'}
      >
        {custom.icon}
      </span>
    );
  }
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
  0: { label: 'Низший', color: '#2684FF' },
  1: { label: 'Низкий', color: '#2684FF' },
  2: { label: 'Средний', color: '#FFAB00' },
  3: { label: 'Высокий', color: '#FF5630' },
  4: { label: 'Высший', color: '#FF5630' },
};

function PriorityArrows({ color, variant }) {
  const line = { fill: 'none', stroke: color, strokeWidth: 2.4, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (variant === 'up2') {
    return (
      <>
        <path d="M6 11.5 12 6l6 5.5" {...line} />
        <path d="M6 17.5 12 12l6 5.5" {...line} />
      </>
    );
  }
  if (variant === 'up1') return <path d="M6 14.5 12 9l6 5.5" {...line} />;
  if (variant === 'flat') {
    return (
      <>
        <path d="M5.5 9.5h13" {...line} />
        <path d="M5.5 14.5h13" {...line} />
      </>
    );
  }
  if (variant === 'down1') return <path d="M6 9.5 12 15l6-5.5" {...line} />;
  return (
    <>
      <path d="M6 6.5 12 12l6-5.5" {...line} />
      <path d="M6 12.5 12 18l6-5.5" {...line} />
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

// Watchers: Jira-like "eye" glyph used on cards/rows to show how many people get notified.
function EyeGlyph({ size }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path
        d="M12 5.5c-5.1 0-9.1 4.3-10.2 6.5 1.1 2.2 5.1 6.5 10.2 6.5s9.1-4.3 10.2-6.5c-1.1-2.2-5.1-6.5-10.2-6.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
    </svg>
  );
}

export function WatcherIcon({ size = 14, className = '' }) {
  return (
    <span className={`watcher-icon ${className}`.trim()} style={{ width: size, height: size }}>
      <EyeGlyph size={size} />
    </span>
  );
}

function watcherCountLabel(count) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} наблюдатель`;
  if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return `${count} наблюдателя`;
  return `${count} наблюдателей`;
}

/** Small eye + count badge; renders nothing when there are no watchers. */
export function WatcherBadge({ count = 0, size = 13, title, className = '' }) {
  if (!count) return null;
  return (
    <span className={`watcher-badge ${className}`.trim()} title={title ?? watcherCountLabel(count)}>
      <WatcherIcon size={size} />
      <span className="watcher-badge-count">{count}</span>
    </span>
  );
}

export default IssueTypeIcon;
