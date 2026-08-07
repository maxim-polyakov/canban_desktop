import React from 'react';
import AssigneeAvatar from './AssigneeAvatar';
import './AssigneeSummary.css';

export default function AssigneeSummary({ assignees = [], maxNames = 2, label }) {
  if (!Array.isArray(assignees) || assignees.length === 0) return null;

  const visible = assignees.slice(0, maxNames);
  const extraCount = assignees.length - visible.length;
  const fullNames = assignees.map((assignee) => assignee.displayName).filter(Boolean).join(', ');

  return (
    <span className="assignee-summary" title={fullNames}>
      {label && <span className="assignee-summary-label">{label}</span>}
      <span className="assignee-summary-avatars">
        {visible.map((assignee) => (
          <AssigneeAvatar
            key={assignee.userId}
            displayName={assignee.displayName}
            avatarUrl={assignee.avatarUrl}
            size={22}
          />
        ))}
      </span>
      <span className="assignee-summary-names">
        {visible.map((assignee) => assignee.displayName).join(', ')}
      </span>
      {extraCount > 0 && <span className="assignee-summary-extra">+{extraCount}</span>}
    </span>
  );
}
