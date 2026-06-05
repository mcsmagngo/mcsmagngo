import React, { useState } from 'react';
import { invoke } from '@forge/bridge';

function GapExplainer({ gap, faqLinks }) {
  const [explanation, setExplanation] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleExplain = async () => {
    if (explanation) { setOpen(!open); return; }
    setLoading(true);
    try {
      const r = await invoke('rovoExplainGap', { questionId: gap.question_id });
      setExplanation(r);
      setOpen(true);
    } catch { /* non-blocking */ }
    finally { setLoading(false); }
  };

  return (
    <div>
      <button
        style={{ fontSize: 11, color: '#6554c0', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginTop: 4 }}
        onClick={handleExplain}
        disabled={loading}
      >
        {loading ? '⏳ Carregando explicação...' : open ? '▼ Ocultar explicação Rovo' : '✨ Por que isso importa? (Rovo)'}
      </button>
      {open && explanation && (
        <div className="rovo-recommendation-card" style={{ marginTop: 8, fontSize: 12 }}>
          <div style={{ marginBottom: 6, color: '#42526e' }}>{explanation.explicacao}</div>
          <div style={{ fontWeight: 700, color: '#5e6c84', marginBottom: 4 }}>Próximos passos:</div>
          {explanation.sugestao_proximos_passos.map((step, i) => (
            <div key={i} style={{ color: '#42526e', marginBottom: 2 }}>{step}</div>
          ))}
          <div style={{ marginTop: 6 }}>
            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: explanation.obrigatoria ? '#ff8b00' : '#dfe1e6', color: explanation.obrigatoria ? '#fff' : '#5e6c84', fontWeight: 600 }}>
              {explanation.risco}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function GapItem({ gap }) {
  return (
    <div className={`gap-item ${gap.obrigatoria ? 'mandatory' : 'optional'}`}>
      <div className="gap-item-header">
        <span className="gap-id">{gap.question_id}</span>
        <span style={{ fontSize: 11, color: '#5e6c84', background: '#ebecf0', padding: '1px 6px', borderRadius: 3 }}>{gap.dominio}</span>
        {gap.obrigatoria && <span className="gap-mandatory-tag">⚠ Obrigatória</span>}
        <span style={{ fontSize: 11, color: '#5e6c84' }}>Peso: {gap.peso}</span>
      </div>
      <div className="gap-question">{gap.pergunta}</div>
      {gap.link_faq && (
        <div style={{ marginTop: 4 }}>
          <a href={gap.link_faq} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: '#0052cc' }}>
            → Ver FAQ técnica
          </a>
        </div>
      )}
      <GapExplainer gap={gap} />
    </div>
  );
}

function RecommendationCard({ rec }) {
  const colors = { BLOQUEANTE: '#ff5630', MELHORIA: '#ff8b00', PROCESSO: '#6554c0', RECONHECIMENTO: '#36b37e' };
  const color = colors[rec.tipo] || '#5e6c84';
  return (
    <div style={{ padding: '12px 14px', borderRadius: 6, border: `2px solid ${color}22`, background: `${color}0a`, marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color, background: `${color}22`, padding: '2px 8px', borderRadius: 10 }}>
          {rec.tipo}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#172b4d' }}>{rec.titulo}</span>
      </div>
      <div style={{ fontSize: 13, color: '#42526e', marginBottom: 6 }}>{rec.descricao}</div>
      <div style={{ fontSize: 12, color: '#5e6c84', fontStyle: 'italic' }}>→ {rec.acao}</div>
    </div>
  );
}

export default function ResultPanel({ scoreSummary, executiveSummary, recommendations, onCreateRemediation, onBack, onNewPRR, remediationLoading }) {
  const { score, classification, domainScores, gaps, mandatoryCompliance, answeredCount, totalQuestions, simCount, naoCount } = scoreSummary;

  const mandatoryGaps = gaps.filter((g) => g.obrigatoria);
  const optionalGaps = gaps.filter((g) => !g.obrigatoria);
  const [activeResultTab, setActiveResultTab] = useState('resumo');

  return (
    <div className="result-panel">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <h2>Resultado do PRR Assessment</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={onBack}>← Voltar ao formulário</button>
          <button className="btn btn-secondary" onClick={onNewPRR}>+ Novo PRR</button>
        </div>
      </div>

      {/* Score Hero */}
      <div className={`score-hero ${classification.color}`}>
        <div className="score-number">{score}%</div>
        <div className="score-label">{classification.label}</div>
        <div className="score-description">{classification.description}</div>
        <div style={{ marginTop: 12, fontSize: 13, color: classification.color === 'green' ? 'rgba(0,0,0,0.5)' : '#5e6c84' }}>
          {answeredCount}/{totalQuestions} respondidas &nbsp;|&nbsp;
          <span style={{ fontWeight: 700, color: '#006644' }}>{simCount} Sim</span>
          &nbsp;&nbsp;
          <span style={{ fontWeight: 700, color: '#bf2600' }}>{naoCount} Não</span>
        </div>
      </div>

      {/* Compliance alerts */}
      {!mandatoryCompliance.compliant && (
        <div className="error-state" style={{ marginTop: 12 }}>
          <strong>⚠ Atenção:</strong> {mandatoryCompliance.failedMandatory} de {mandatoryCompliance.totalMandatory} itens obrigatórios não foram atendidos.
          O serviço não pode entrar em produção sem remediar esses itens.
        </div>
      )}
      {mandatoryCompliance.compliant && mandatoryCompliance.totalMandatory > 0 && (
        <div className="success-state" style={{ marginTop: 12 }}>
          ✅ Todos os {mandatoryCompliance.totalMandatory} itens obrigatórios foram atendidos.
        </div>
      )}

      {/* Result Tabs */}
      <div className="prr-tabs" style={{ display: 'inline-flex', margin: '16px 0 0' }}>
        {[['resumo', '✨ Resumo Rovo'], ['dominios', '📊 Por Domínio'], ['gaps', `⚠ Gaps (${gaps.length})`], ['recomendacoes', `💡 Recomendações (${(recommendations || []).length})`]].map(([tab, label]) => (
          <button key={tab} className={`prr-tab ${activeResultTab === tab ? 'active' : ''}`} onClick={() => setActiveResultTab(tab)}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab: Executive Summary (Rovo) */}
      {activeResultTab === 'resumo' && (
        <div style={{ marginTop: 16 }}>
          {executiveSummary ? (
            <div className="rovo-recommendation-card">
              <div className="rovo-rec-header">
                <span>✨</span>
                <span>Resumo Executivo — Rovo</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#97a0af' }}>Gerado automaticamente</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8, color: classification.color === 'green' ? '#006644' : classification.color === 'yellow' ? '#974f0c' : '#bf2600' }}>
                {executiveSummary.destaque}
              </div>
              <div style={{ fontSize: 13, whiteSpace: 'pre-line', lineHeight: 1.7, color: '#42526e' }}>
                {executiveSummary.texto}
              </div>
            </div>
          ) : (
            <div style={{ color: '#5e6c84', fontSize: 13, padding: 16 }}>Resumo executivo não disponível.</div>
          )}
        </div>
      )}

      {/* Tab: Domain Scores */}
      {activeResultTab === 'dominios' && (
        <div style={{ marginTop: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, background: '#fff', border: '1px solid #dfe1e6', borderRadius: 6, overflow: 'hidden' }}>
            <thead>
              <tr style={{ background: '#f4f5f7' }}>
                {['Domínio', 'Score', 'Respondidas', 'Barra'].map((h) => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: h === 'Score' || h === 'Respondidas' ? 'center' : 'left', borderBottom: '2px solid #dfe1e6', fontSize: 11, fontWeight: 700, color: '#5e6c84', textTransform: 'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.entries(domainScores).map(([domain, data]) => {
                const color = data.score >= 80 ? '#00875a' : data.score >= 50 ? '#974f0c' : '#bf2600';
                return (
                  <tr key={domain} style={{ borderBottom: '1px solid #f4f5f7' }}>
                    <td style={{ padding: '8px 12px' }}>{domain}</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color }}>{data.score}%</td>
                    <td style={{ padding: '8px 12px', textAlign: 'center', color: '#5e6c84' }}>{data.answered}/{data.total}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <div style={{ height: 6, background: '#dfe1e6', borderRadius: 3, minWidth: 80 }}>
                        <div style={{ height: '100%', width: `${data.score}%`, background: color, borderRadius: 3 }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tab: Gaps */}
      {activeResultTab === 'gaps' && (
        <div style={{ marginTop: 16 }}>
          {gaps.length === 0 ? (
            <div className="success-state">🎉 Nenhum gap identificado! Serviço totalmente aderente ao PRR.</div>
          ) : (
            <>
              {mandatoryGaps.length > 0 && (
                <>
                  <p style={{ fontSize: 12, color: '#974f0c', marginBottom: 8, fontWeight: 600 }}>⚠ Obrigatórios ({mandatoryGaps.length}):</p>
                  {mandatoryGaps.map((gap) => <GapItem key={gap.question_id} gap={gap} />)}
                </>
              )}
              {optionalGaps.length > 0 && (
                <>
                  <p style={{ fontSize: 12, color: '#5e6c84', marginBottom: 8, marginTop: 16, fontWeight: 600 }}>Opcionais ({optionalGaps.length}):</p>
                  {optionalGaps.map((gap) => <GapItem key={gap.question_id} gap={gap} />)}
                </>
              )}
            </>
          )}

          {gaps.length > 0 && (
            <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
              <button className="btn btn-warning" onClick={onCreateRemediation} disabled={remediationLoading}>
                {remediationLoading ? '⏳ Criando issues...' : '🔧 Criar Plano de Remediação no Jira'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab: Recommendations */}
      {activeResultTab === 'recomendacoes' && (
        <div style={{ marginTop: 16 }}>
          {(recommendations || []).length === 0 ? (
            <div className="success-state">✅ Nenhuma recomendação crítica. Serviço em boa forma!</div>
          ) : (
            (recommendations || []).map((rec, i) => <RecommendationCard key={i} rec={rec} />)
          )}
        </div>
      )}
    </div>
  );
}
