import React from 'react';

export default function ProgressBar({ answered, total, score, classification }) {
  const progress = total > 0 ? Math.round((answered / total) * 100) : 0;
  const badgeClass = classification ? classification.color : 'gray';

  return (
    <div className="prr-progress-bar">
      <span className="progress-text">
        {answered}/{total} respondidas
      </span>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${progress}%` }} />
      </div>
      <span className="progress-text">{progress}% completo</span>
      {answered > 0 && (
        <span className={`score-badge ${badgeClass}`}>
          Score parcial: {score}%
          {classification && ` — ${classification.label}`}
        </span>
      )}
    </div>
  );
}
