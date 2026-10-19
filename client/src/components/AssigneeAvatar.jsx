import React from 'react';
import { Link } from '../i18n/navigation.jsx';
import './AssigneeAvatar.css';

function getInitials(name) {
  if (!name || !name.trim()) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0][0] || '?').toUpperCase();
}

function AvatarVisual({ displayName, avatarUrl, size, className = '' }) {
  const style = { width: size, height: size, fontSize: size * 0.45 };
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt=""
        className={`assignee-avatar assignee-avatar-img ${className}`.trim()}
        style={style}
      />
    );
  }
  return (
    <span
      className={`assignee-avatar assignee-avatar-initials ${className}`.trim()}
      style={style}
      title={displayName || ''}
    >
      {getInitials(displayName)}
    </span>
  );
}

/**
 * Jira-like clickable avatar: when `userId` is provided, wraps the visual avatar in a
 * link to `/profile/:userId` and stops the click from bubbling so parent drag-and-drop /
 * card-click handlers don't fire. Without `userId`, renders the plain avatar unchanged
 * (keeps backward-compatible markup for existing call sites and tests).
 */
export default function AssigneeAvatar({ displayName, avatarUrl, size = 24, userId, onClick, className }) {
  if (userId) {
    const handleClick = (event) => {
      event.stopPropagation();
      onClick?.(event, userId);
    };
    return (
      <Link
        to={`/profile/${userId}`}
        className={`assignee-avatar-link ${className || ''}`.trim()}
        onClick={handleClick}
        onPointerDown={(event) => event.stopPropagation()}
        title={displayName || ''}
      >
        <AvatarVisual displayName={displayName} avatarUrl={avatarUrl} size={size} />
      </Link>
    );
  }
  return <AvatarVisual displayName={displayName} avatarUrl={avatarUrl} size={size} className={className} />;
}
