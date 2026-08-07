import React from 'react';
import AssigneeSummary from './AssigneeSummary';
import './QuestCard.css';

export default function QuestCard({ quest }) {
  return (
    <div className="quest-card">
      <span className="quest-card-title">{quest.title}</span>
      <AssigneeSummary assignees={quest.assignees} />
      {quest.xpReward > 0 && <span className="quest-card-xp">+{quest.xpReward} XP</span>}
    </div>
  );
}
