import React, { useState, useEffect } from 'react';
import { invoke } from '@forge/bridge';

function ScoreBadge({ score, classification }) {
  const color = classification?.color || (score >= 80 ? 'green' : score >= 50 ? 'yellow' : 'red');
  return <span className={`score-badge ${color}`}>{score}%</span>;
}

function AssessmentRow({ assessment, onView }) {
  const date = assessment.submittedAt ? new Date(assessment.submittedAt).toLocaleDateString('pt-BR') : '—';
  return (
    <tr style={{ borderBottom: '1px solid #f4f5f7', cursor: 'pointer' }} onClick={() => onView(assessment.assessmentId)}>
      <td style={{ padding: '10px 12px', fontSize: 13, color: '#172b4d', fontWeight: 600 }}>{assessment.serviceName}</td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: '#5e6c84' }}>{assessment.owner}</td>
      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
        <ScoreBadge score={assessment.score} classification={assessment.classification} />
      </td>
      <td style={{ padding: '10px 12px', fontSize: 12, textAlign: 'center', color: assessment.gapCount > 0 ? '#bf2600' : '#006644' }}>
        {assessment.gapCount === 0 ? '✅ 0' : `⚠ ${assessment.gapCount}`}
      </td>
      <td style={{ padding: '10px 12px', fontSize: 11, color: '#5e6c84', fontFamily: 'monospace' }}>{assessment.prrVersion}</td>
      <td style={{ padding: '10px 12px', fontSize: 12, color: '#5e6c84' }}>{date}</td>
      <td style={{ padding: '10px 12px' }}>
        <button className="faq-link" onClick={(e) => { e.stopPropagation(); onView(assessment.assessmentId); }}>
          Ver →
        </button>
      </td>
    </tr>
  );
}

function AssessmentDetail({ assessmentId, onBack }) {
  const [assessment, setAssessment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    invoke('getAssessmentById', { assessmentId })
      .then(setAssessment)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [assessmentId]);

  if (loading) return <div className="loading-state"><div className="spinner" /><span>Carregando assessment...</span></div>;
  if (error) return <div className="error-state">❌ {error}</div>;
  if (!assessment) return null;

  const { score, classification, domainScores, gaps, executiveSummary, submittedAt, serviceName, owner, prrVersion } = assessment;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button className="btn-back" onClick={onBack}>← Voltar ao histórico</button>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
          {serviceName} — {new Date(submittedAt).toLocaleDateString('pt-BR')}
        </h3>
        <ScoreBadge score={score} classification={classification} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{ background: '#f4f5f7', padding: 16, borderRadius: 6 }}>
          <div style={{ fontSize: 12, color: '#5e6c84', marginBottom: 4 }}>SERVIÇO</div>
          <div style={{ fontWeight: 700 }}>{serviceName}</div>
          <div style={{ fontSize: 12, color: '#5e6c84', marginTop: 8 }}>Owner: {owner}</div>
          <div style={{ fontSize: 12, color: '#5e6c84' }}>Versão PRR: {prrVersion}</div>
        </div>
        <div className={`score-hero ${classification?.color}`} style={{ padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 36, fontWeight: 900 }}>{score}%</div>
          <div style={{ fontWeight: 700 }}>{classification?.label}</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>{gaps.length} gaps · {new Date(submittedAt).toLocaleDateString('pt-BR')}</div>
        </div>
      </div>

      {/* Executive Summary */}
      {executiveSummary && (
        <div className="rovo-recommendation-card" style={{ marginBottom: 16 }}>
          <div className="rovo-rec-header"><span>✨</span><span>Resumo Executivo — Rovo</span></div>
          <div style={{ fontSize: 13, whiteSpace: 'pre-line', lineHeight: 1.6 }}>{executiveSummary.texto}</div>
        </div>
      )}

      {/* Domain scores */}
      <div className="results-section">
        <h4 className="section-title">Score por Domínio</h4>
        {Object.entries(domainScores || {}).map(([domain, data]) => {
          const color = data.score >= 80 ? '#00875a' : data.score >= 50 ? '#974f0c' : '#bf2600';
          return (
            <div key={domain} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ minWidth: 120, fontSize: 12, color: '#42526e' }}>{domain}</span>
              <div style={{ flex: 1, height: 6, background: '#dfe1e6', borderRadius: 3 }}>
                <div style={{ height: '100%', width: `${data.score}%`, background: color, borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 40, textAlign: 'right' }}>{data.score}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function HistoryScreen({ onBack }) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    invoke('getAssessmentHistory', { limit: 20 })
      .then(setHistory)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (selectedId) {
    return (
      <div className="screen-container">
        <AssessmentDetail assessmentId={selectedId} onBack={() => setSelectedId(null)} />
      </div>
    );
  }

  return (
    <div className="screen-container">
      <div className="screen-header">
        <button className="btn-back" onClick={onBack}>← Voltar</button>
        <div>
          <h2>📊 Histórico de Assessments</h2>
          <p className="screen-subtitle">Assessments PRR realizados. Clique em um item para ver detalhes.</p>
        </div>
      </div>

      {loading && <div className="loading-state"><div className="spinner" /><span>Carregando histórico...</span></div>}
      {error && <div className="error-state">❌ {error}</div>}

      {history && history.assessments.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <p>Nenhum assessment encontrado ainda.</p>
          <p className="empty-hint">Preencha o formulário PRR para criar o primeiro assessment.</p>
        </div>
      )}

      {history && history.assessments.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #dfe1e6', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead style={{ background: '#f4f5f7' }}>
              <tr>
                {['Serviço', 'Owner', 'Score', 'Gaps', 'Versão PRR', 'Data', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', fontSize: 11, fontWeight: 700, color: '#5e6c84', textAlign: h === 'Score' || h === 'Gaps' ? 'center' : 'left', textTransform: 'uppercase', letterSpacing: '0.5px', borderBottom: '2px solid #dfe1e6' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.assessments.map((a) => (
                <AssessmentRow key={a.assessmentId} assessment={a} onView={setSelectedId} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
