import React, { useState } from 'react';
import { invoke } from '@forge/bridge';

function DomainBar({ domain, data }) {
  const color = data.percent >= 70 ? '#00875a' : data.percent >= 40 ? '#974f0c' : '#bf2600';
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
        <span style={{ color: '#42526e' }}>{domain}</span>
        <span style={{ fontWeight: 700, color }}>
          {data.percent}% ({data.attended}/{data.total})
        </span>
      </div>
      <div style={{ height: 6, background: '#dfe1e6', borderRadius: 3 }}>
        <div style={{ height: '100%', width: `${data.percent}%`, background: color, borderRadius: 3, transition: 'width 0.5s' }} />
      </div>
    </div>
  );
}

export default function DocValidatorScreen({ onBack, onStartPRR }) {
  const [pageUrl, setPageUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [expandedGaps, setExpandedGaps] = useState(false);

  const handleValidate = async () => {
    if (!pageUrl.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await invoke('validateConfluenceDoc', { pageUrl: pageUrl.trim() });
      setResult(r);
    } catch (err) {
      setError(err.message || 'Erro ao validar o documento.');
    } finally {
      setLoading(false);
    }
  };

  const classification = result?.validation?.classification;

  return (
    <div className="screen-container">
      {/* Header */}
      <div className="screen-header">
        <button className="btn-back" onClick={onBack}>← Voltar</button>
        <div>
          <h2>🔍 Validar Documento Confluência</h2>
          <p className="screen-subtitle">
            Analise um documento Confluence existente e veja o quanto ele cobre os critérios do PRR.
          </p>
        </div>
      </div>

      {/* Input */}
      <div className="validator-input-card">
        <label className="input-label">URL da página Confluence</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="url"
            className="text-input"
            placeholder="https://seu-site.atlassian.net/wiki/spaces/SPACE/pages/123456/Titulo"
            value={pageUrl}
            onChange={(e) => setPageUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleValidate()}
          />
          <button className="btn btn-primary" onClick={handleValidate} disabled={loading || !pageUrl.trim()}>
            {loading ? '⏳ Analisando...' : '🔍 Validar'}
          </button>
        </div>
        <p className="input-hint">
          Cole a URL completa da página Confluence. O portal irá extrair o conteúdo e verificar a cobertura dos 42 requisitos do PRR.
        </p>
      </div>

      {error && <div className="error-state">❌ {error}</div>}

      {/* Results */}
      {result && (
        <div className="validator-results">
          {/* Document Info */}
          <div className="doc-info-card">
            <div className="doc-info-header">
              <span className="doc-icon">📄</span>
              <div>
                <div className="doc-title">{result.document.title}</div>
                <div className="doc-meta">
                  Space: {result.document.spaceKey} · Versão: {result.document.version} ·{' '}
                  {result.document.wordCount} palavras
                  {result.document.lastUpdated && ` · Atualizado: ${new Date(result.document.lastUpdated).toLocaleDateString('pt-BR')}`}
                </div>
              </div>
            </div>
          </div>

          {/* Score Hero */}
          <div className={`score-hero ${classification?.color}`} style={{ marginBottom: 16 }}>
            <div className="score-number">{result.validation.estimatedScore}%</div>
            <div className="score-label">{classification?.label}</div>
            <div className="score-description">
              {result.validation.attendedCount} de {result.validation.totalQuestions} requisitos cobertos pelo documento.
            </div>
            {result.validation.mandatoryGaps?.length > 0 && (
              <div style={{ marginTop: 10, fontSize: 13, background: 'rgba(0,0,0,0.15)', padding: '6px 12px', borderRadius: 6 }}>
                ⚠ {result.validation.mandatoryGaps.length} requisito(s) obrigatório(s) não coberto(s)
              </div>
            )}
          </div>

          {/* Domain Coverage */}
          <div className="results-section">
            <h3 className="section-title">Cobertura por Domínio</h3>
            {Object.entries(result.validation.domainCoverage).map(([domain, data]) => (
              <DomainBar key={domain} domain={domain} data={data} />
            ))}
          </div>

          {/* Recommendation */}
          <div className="rovo-recommendation-card">
            <div className="rovo-rec-header">
              <span>✨</span>
              <span>Recomendação Rovo</span>
            </div>
            <p>{result.recommendation}</p>
          </div>

          {/* Mandatory Gaps */}
          {result.validation.mandatoryGaps?.length > 0 && (
            <div className="results-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="section-title">
                  Requisitos obrigatórios não cobertos ({result.validation.mandatoryGaps.length})
                </h3>
                <button className="btn btn-secondary" style={{ fontSize: 12 }} onClick={() => setExpandedGaps(!expandedGaps)}>
                  {expandedGaps ? 'Ocultar' : 'Ver todos'}
                </button>
              </div>
              {(expandedGaps ? result.validation.mandatoryGaps : result.validation.mandatoryGaps.slice(0, 3)).map((gap) => (
                <div key={gap.question_id} className="gap-item mandatory">
                  <div className="gap-item-header">
                    <span className="gap-id">{gap.question_id}</span>
                    <span style={{ fontSize: 11, background: '#ebecf0', padding: '1px 6px', borderRadius: 3, color: '#42526e' }}>{gap.dominio}</span>
                    <span className="gap-mandatory-tag">⚠ Obrigatório</span>
                  </div>
                  <div className="gap-question">{gap.pergunta}</div>
                </div>
              ))}
            </div>
          )}

          {/* Actions */}
          <div className="action-row">
            <button className="btn btn-primary" onClick={() => onStartPRR()}>
              📋 Fazer PRR Formal (Sim/Não)
            </button>
            <button className="btn btn-secondary" onClick={() => { setResult(null); setPageUrl(''); }}>
              🔄 Validar outro documento
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {!result && !loading && !error && (
        <div className="empty-state">
          <div className="empty-icon">📄</div>
          <p>Cole a URL de um documento Confluence para começar a validação.</p>
          <p className="empty-hint">
            O portal analisa o conteúdo do documento e verifica a cobertura dos 42 requisitos do PRR automaticamente.
          </p>
        </div>
      )}
    </div>
  );
}
