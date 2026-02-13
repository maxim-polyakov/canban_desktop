import React from 'react';
import './QuestCard.css';

export default function QuestCard({ quest }) {
  return (
    <div className="quest-card">
      <span className="quest-card-title">{quest.title}</span>
      {quest.assigneeName && <span className="quest-card-assignee">{quest.assigneeName}</span>}
      {quest.xpReward > 0 && <span className="quest-card-xp">+{quest.xpReward} XP</span>}
    </div>
  );
}
