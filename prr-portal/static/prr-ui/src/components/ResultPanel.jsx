import React from 'react';

export default function ResultPanel({ scoreSummary, onCreateRemediation, onBack, remediationLoading }) {
  const { score, classification, domainScores, gaps, mandatoryCompliance, answeredCount, totalQuestions, simCount, naoCount } =
    scoreSummary;

  const mandatoryGaps = gaps.filter((g) => g.obrigatoria);
  const optionalGaps = gaps.filter((g) => !g.obrigatoria);

  return (
    <div className="result-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2>Resultado do PRR Assessment</h2>
        <button className="btn btn-secondary" onClick={onBack}>
          ← Voltar ao formulário
        </button>
      </div>

      {/* Score Hero */}
      <div className={`score-hero ${classification.color}`}>
        <div className="score-number">{score}%</div>
        <div className="score-label">{classification.label}</div>
        <div className="score-description">{classification.description}</div>
        <div style={{ marginTop: 12, fontSize: 13, color: '#5e6c84' }}>
          {answeredCount}/{totalQuestions} respondidas &nbsp;|&nbsp;
          <span style={{ color: '#006644', fontWeight: 600 }}>{simCount} Sim</span>
          &nbsp;&nbsp;
          <span style={{ color: '#bf2600', fontWeight: 600 }}>{naoCount} Não</span>
        </div>
      </div>

      {/* Mandatory Compliance */}
      {!mandatoryCompliance.compliant && (
        <div className="error-state" style={{ marginTop: 16 }}>
          <strong>⚠ Atenção:</strong> {mandatoryCompliance.failedMandatory} de {mandatoryCompliance.totalMandatory} itens obrigatórios não foram atendidos.
          O serviço não pode entrar em produção sem remediar esses itens.
        </div>
      )}
      {mandatoryCompliance.compliant && mandatoryCompliance.totalMandatory > 0 && (
        <div className="success-state" style={{ marginTop: 16 }}>
          ✅ Todos os {mandatoryCompliance.totalMandatory} itens obrigatórios foram atendidos.
        </div>
      )}

      {/* Domain Scores Table */}
      <div style={{ marginTop: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Score por Domínio</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f4f5f7' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '2px solid #dfe1e6' }}>Domínio</th>
              <th style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '2px solid #dfe1e6' }}>Score</th>
              <th style={{ padding: '8px 12px', textAlign: 'center', borderBottom: '2px solid #dfe1e6' }}>Respondidas</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', borderBottom: '2px solid #dfe1e6' }}>Barra</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(domainScores).map(([domain, data]) => {
              const color = data.score >= 80 ? '#00875a' : data.score >= 50 ? '#974f0c' : '#bf2600';
              return (
                <tr key={domain} style={{ borderBottom: '1px solid #f4f5f7' }}>
                  <td style={{ padding: '8px 12px' }}>{domain}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', fontWeight: 700, color }}>{data.score}%</td>
                  <td style={{ padding: '8px 12px', textAlign: 'center', color: '#5e6c84' }}>
                    {data.answered}/{data.total}
                  </td>
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ height: 6, background: '#dfe1e6', borderRadius: 3, overflow: 'hidden', minWidth: 80 }}>
                      <div style={{ height: '100%', width: `${data.score}%`, background: color, borderRadius: 3 }} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Gaps */}
      {gaps.length > 0 && (
        <div className="gaps-section">
          <h3>
            <span>Gaps Identificados</span>
            <span
              style={{
                background: mandatoryGaps.length > 0 ? '#ff8b00' : '#dfe1e6',
                color: mandatoryGaps.length > 0 ? '#fff' : '#5e6c84',
                borderRadius: 10,
                padding: '2px 8px',
                fontSize: 12,
              }}
            >
              {gaps.length}
            </span>
          </h3>

          {mandatoryGaps.length > 0 && (
            <>
              <p style={{ fontSize: 12, color: '#974f0c', marginBottom: 8, fontWeight: 600 }}>
                Obrigatórios ({mandatoryGaps.length}):
              </p>
              {mandatoryGaps.map((gap) => (
                <GapItem key={gap.question_id} gap={gap} />
              ))}
            </>
          )}

          {optionalGaps.length > 0 && (
            <>
              <p style={{ fontSize: 12, color: '#5e6c84', marginBottom: 8, marginTop: 12, fontWeight: 600 }}>
                Opcionais ({optionalGaps.length}):
              </p>
              {optionalGaps.slice(0, 10).map((gap) => (
                <GapItem key={gap.question_id} gap={gap} />
              ))}
              {optionalGaps.length > 10 && (
                <p style={{ fontSize: 12, color: '#97a0af', textAlign: 'center', marginTop: 8 }}>
                  ... e mais {optionalGaps.length - 10} gaps opcionais.
                </p>
              )}
            </>
          )}
        </div>
      )}

      {gaps.length === 0 && (
        <div className="success-state" style={{ marginTop: 20 }}>
          🎉 Nenhum gap identificado! O serviço atende a todos os requisitos do PRR.
        </div>
      )}

      {/* Actions */}
      {gaps.length > 0 && (
        <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn btn-warning"
            onClick={onCreateRemediation}
            disabled={remediationLoading}
          >
            {remediationLoading ? '⏳ Criando issues...' : '🔧 Criar Plano de Remediação no Jira'}
          </button>
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
        <span style={{ fontSize: 11, color: '#5e6c84', background: '#ebecf0', padding: '1px 6px', borderRadius: 3 }}>
          {gap.dominio}
        </span>
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
    </div>
  );
}
