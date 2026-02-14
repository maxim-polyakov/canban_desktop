import React from 'react';
import './AssigneeAvatar.css';

function getInitials(name) {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0][0] || '?').toUpperCase();
}

export default function AssigneeAvatar({ displayName, avatarUrl, size = 24 }) {
  const style = { width: size, height: size, fontSize: size * 0.45 };
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className="assignee-avatar assignee-avatar-img"
        style={style}
      />
    );
  }
  return (
    <span
      className="assignee-avatar assignee-avatar-initials"
      style={style}
      title={displayName || ''}
    >
      {getInitials(displayName)}
    </span>
  );
}
