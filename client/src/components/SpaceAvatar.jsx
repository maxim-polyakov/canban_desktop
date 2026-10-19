import React from 'react';

// Jira project avatars are colourful rounded tiles; pick a stable colour per space.
const COLORS = ['#1D7AFC', '#22A06B', '#E2B203', '#F87462', '#8270DB', '#2898BD', '#E774BB', '#FEA362'];

export function spaceColor(id = '') {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export default function SpaceAvatar({ id, name = '', size = 20, className = '' }) {
  const letter = (name.trim()[0] || '?').toUpperCase();
  return (
    <span
      className={`space-avatar ${className}`.trim()}
      style={{ width: size, height: size, background: spaceColor(id), fontSize: Math.round(size * 0.5), borderRadius: Math.max(3, Math.round(size / 5)) }}
      aria-hidden="true"
    >
      {letter}
    </span>
  );
}
