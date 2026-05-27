import React from 'react';

function scoreColor(score) {
  if (score >= 80) return 'green';
  if (score >= 50) return 'yellow';
  return 'red';
}

export default function DomainBreakdown({ domainScores, activeDomain, onDomainClick }) {
  if (!domainScores || Object.keys(domainScores).length === 0) return null;

  return (
    <div className="domain-breakdown">
      <span className="domain-breakdown-title">Por domínio:</span>
      {Object.entries(domainScores).map(([domain, data]) => (
        <span
          key={domain}
          className="domain-stat"
          style={{ cursor: 'pointer', borderColor: activeDomain === domain ? '#0052cc' : undefined }}
          onClick={() => onDomainClick && onDomainClick(domain)}
        >
          <span className="d-name">{domain}</span>
          <span className={`d-score ${scoreColor(data.score)}`}>{data.score}%</span>
          <span style={{ fontSize: 11, color: '#97a0af' }}>({data.answered}/{data.total})</span>
        </span>
      ))}
    </div>
  );
}
