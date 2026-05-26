import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@forge/bridge';
import QuestionRow from './components/QuestionRow';
import ProgressBar from './components/ProgressBar';
import DomainBreakdown from './components/DomainBreakdown';
import ResultPanel from './components/ResultPanel';
import SettingsPanel from './components/SettingsPanel';

const SESSION_ID = 'prr-session-' + Date.now().toString(36);

function computePartialScore(answers, questions) {
  if (!questions || questions.length === 0) return { score: 0, classification: null, domainScores: {} };
  const answered = Object.keys(answers).length;
  if (answered === 0) return { score: 0, classification: null, domainScores: {} };

  let weightedSum = 0;
  let totalWeight = 0;
  questions.forEach((q) => {
    const w = q.peso || 1;
    totalWeight += w;
    if (answers[q.question_id] === 'sim') weightedSum += w;
  });

  const score = Math.round((weightedSum / totalWeight) * 100);
  const classification =
    score >= 80
      ? { status: 'ADERENTE', label: 'Aderente', color: 'green' }
      : score >= 50
      ? { status: 'PARCIALMENTE_ADERENTE', label: 'Parcialmente Aderente', color: 'yellow' }
      : { status: 'NAO_ADERENTE', label: 'Não Aderente', color: 'red' };

  const domains = [...new Set(questions.map((q) => q.dominio))];
  const domainScores = {};
  domains.forEach((d) => {
    const dqs = questions.filter((q) => q.dominio === d);
    let dw = 0, dws = 0;
    dqs.forEach((q) => {
      const w = q.peso || 1;
      dw += w;
      if (answers[q.question_id] === 'sim') dws += w;
    });
    domainScores[d] = {
      score: dw > 0 ? Math.round((dws / dw) * 100) : 0,
      answered: dqs.filter((q) => answers[q.question_id] !== undefined).length,
      total: dqs.length,
    };
  });

  return { score, classification, domainScores };
}

export default function App() {
  const [tab, setTab] = useState('form');
  const [questionnaire, setQuestionnaire] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [serviceName, setServiceName] = useState('');
  const [owner, setOwner] = useState('');
  const [answers, setAnswers] = useState({});
  const [activeDomain, setActiveDomain] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [scoreSummary, setScoreSummary] = useState(null);
  const [assessmentId, setAssessmentId] = useState(null);
  const [remediationLoading, setRemediationLoading] = useState(false);
  const [remediationResult, setRemediationResult] = useState(null);

  const [settings, setSettings] = useState(null);
  const [toast, setToast] = useState(null);

  const startTimeRef = useRef(Date.now());
  const autosaveRef = useRef(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const [q, s] = await Promise.all([
          invoke('getQuestionnaire'),
          invoke('getPortalSettings'),
        ]);
        setQuestionnaire(q);
        setSettings(s);
        const draft = await invoke('loadDraft', { sessionId: SESSION_ID }).catch(() => null);
        if (draft) {
          setServiceName(draft.serviceName || '');
          setOwner(draft.owner || '');
          setAnswers(draft.answers || {});
          showToast('Rascunho anterior restaurado.', 'info');
        }
        await invoke('trackEvent', {
          type: 'assessment_started',
          payload: { sessionId: SESSION_ID, prrVersion: q.version },
        });
      } catch (err) {
        setLoadError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [showToast]);

  // Auto-save draft every 60 seconds
  useEffect(() => {
    if (autosaveRef.current) clearInterval(autosaveRef.current);
    if (!questionnaire) return;
    autosaveRef.current = setInterval(async () => {
      if (Object.keys(answers).length > 0) {
        await invoke('saveDraft', { sessionId: SESSION_ID, serviceName, owner, answers, prrVersion: questionnaire.version }).catch(() => {});
      }
    }, 60000);
    return () => clearInterval(autosaveRef.current);
  }, [questionnaire, answers, serviceName, owner]);

  const handleAnswer = useCallback(
    (questionId, value) => {
      setAnswers((prev) => ({ ...prev, [questionId]: value }));
      if (questionnaire) {
        const q = questionnaire.questions.find((q) => q.question_id === questionId);
        invoke('trackEvent', {
          type: 'question_answered',
          payload: { sessionId: SESSION_ID, questionId, dominio: q?.dominio, answer: value },
        }).catch(() => {});
      }
    },
    [questionnaire]
  );

  const handleFaqClick = useCallback(
    (question) => {
      if (question.link_faq_confluence) {
        window.open(question.link_faq_confluence, '_blank', 'noopener');
      }
      invoke('trackEvent', {
        type: 'faq_opened',
        payload: { sessionId: SESSION_ID, questionId: question.question_id, dominio: question.dominio },
      }).catch(() => {});
    },
    []
  );

  const handleSaveDraft = async () => {
    try {
      await invoke('saveDraft', { sessionId: SESSION_ID, serviceName, owner, answers, prrVersion: questionnaire?.version });
      showToast('Rascunho salvo com sucesso.', 'success');
    } catch {
      showToast('Erro ao salvar rascunho.', 'error');
    }
  };

  const handleCalculate = () => {
    if (!questionnaire) return;
    const durationMs = Date.now() - startTimeRef.current;
    setSubmitting(true);
    invoke('submitAssessment', {
      sessionId: SESSION_ID,
      serviceName: serviceName || 'Sem nome',
      owner: owner || 'Não definido',
      answers,
      prrVersion: questionnaire.version,
      durationMs,
    })
      .then((result) => {
        setScoreSummary(result.scoreSummary);
        setAssessmentId(result.assessmentId);
        setTab('result');
        if (result.confluencePage && !result.confluencePage.error) {
          showToast('Página de assessment gerada no Confluence.', 'success');
        }
      })
      .catch((err) => showToast('Erro ao calcular aderência: ' + err.message, 'error'))
      .finally(() => setSubmitting(false));
  };

  const handleCreateRemediation = async () => {
    if (!assessmentId) return;
    setRemediationLoading(true);
    try {
      const result = await invoke('generateRemediationPlan', { assessmentId });
      setRemediationResult(result);
      const created = result.issues?.filter((i) => !i.error).length || 0;
      showToast(`${created} issues de remediação criadas no Jira.`, 'success');
    } catch (err) {
      showToast('Erro ao criar remediação: ' + err.message, 'error');
    } finally {
      setRemediationLoading(false);
    }
  };

  const { questions = [], version = '1.0', domains = [] } = questionnaire || {};

  const filteredQuestions = useMemo(() => {
    if (!activeDomain) return questions;
    return questions.filter((q) => q.dominio === activeDomain);
  }, [questions, activeDomain]);

  const partial = useMemo(() => computePartialScore(answers, questions), [answers, questions]);
  const answeredCount = Object.keys(answers).length;

  if (loading) {
    return (
      <div className="prr-portal">
        <div className="loading-state">
          <div className="spinner" />
          <span>Carregando Portal PRR...</span>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="prr-portal">
        <div className="error-state">
          <strong>Erro ao carregar o Portal PRR:</strong> {loadError}
          <br />
          <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => window.location.reload()}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="prr-portal">
      {/* Header */}
      <div className="prr-header">
        <h1>Portal PRR de Observabilidade</h1>
        <div className="prr-header-meta">
          <div>
            <label>Serviço / Sistema:</label>
            <input
              type="text"
              placeholder="Nome do serviço"
              value={serviceName}
              onChange={(e) => setServiceName(e.target.value)}
            />
          </div>
          <div>
            <label>Owner:</label>
            <input
              type="text"
              placeholder="Nome ou time"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            />
          </div>
          <div>
            <label>Versão PRR:</label>
            <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>v{version}</span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div style={{ background: '#fff', padding: '10px 20px', borderLeft: '1px solid #dfe1e6', borderRight: '1px solid #dfe1e6' }}>
        <div className="prr-tabs" style={{ display: 'inline-flex' }}>
          <button className={`prr-tab ${tab === 'form' ? 'active' : ''}`} onClick={() => setTab('form')}>
            📋 Formulário PRR
          </button>
          {scoreSummary && (
            <button className={`prr-tab ${tab === 'result' ? 'active' : ''}`} onClick={() => setTab('result')}>
              📊 Resultado
            </button>
          )}
          <button className={`prr-tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
            ⚙ Configurações
          </button>
        </div>
      </div>

      {/* Form Tab */}
      {tab === 'form' && (
        <>
          <ProgressBar
            answered={answeredCount}
            total={questions.length}
            score={partial.score}
            classification={partial.classification}
          />

          {/* Domain Filter */}
          <div className="domain-filter-bar">
            <span>Filtrar:</span>
            <button
              className={`domain-chip ${!activeDomain ? 'active' : ''}`}
              onClick={() => setActiveDomain(null)}
            >
              Todos ({questions.length})
            </button>
            {domains.map((d) => {
              const ds = partial.domainScores[d];
              return (
                <button
                  key={d}
                  className={`domain-chip ${activeDomain === d ? 'active' : ''}`}
                  onClick={() => setActiveDomain(activeDomain === d ? null : d)}
                >
                  {d}
                  {ds && <span className="domain-score"> {ds.score}%</span>}
                </button>
              );
            })}
          </div>

          {/* Questions Table */}
          <div className="prr-questions-container">
            <table className="prr-table">
              <thead>
                <tr>
                  <th className="col-id">ID</th>
                  <th className="col-domain">Domínio</th>
                  <th className="col-question">Pergunta Oficial</th>
                  <th className="col-faq">FAQ</th>
                  <th className="col-weight">Peso</th>
                  <th className="col-mandatory">Obrig.</th>
                  <th className="col-answer">Resposta</th>
                </tr>
              </thead>
              <tbody>
                {filteredQuestions.map((q) => (
                  <QuestionRow
                    key={q.question_id}
                    question={q}
                    answer={answers[q.question_id]}
                    onAnswer={handleAnswer}
                    onFaqClick={handleFaqClick}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Domain Breakdown */}
          <DomainBreakdown
            domainScores={partial.domainScores}
            activeDomain={activeDomain}
            onDomainClick={(d) => setActiveDomain(activeDomain === d ? null : d)}
          />

          {/* Action Bar */}
          <div className="prr-action-bar">
            <button className="btn btn-secondary" onClick={handleSaveDraft}>
              💾 Salvar rascunho
            </button>
            <button
              className="btn btn-primary"
              onClick={handleCalculate}
              disabled={submitting || answeredCount === 0}
              title={answeredCount === 0 ? 'Responda pelo menos uma pergunta' : 'Calcular aderência ao PRR'}
            >
              {submitting ? '⏳ Calculando...' : '📊 Calcular aderência'}
            </button>
            {scoreSummary && (
              <button className="btn btn-success" onClick={() => setTab('result')}>
                📋 Ver resultado ({scoreSummary.score}%)
              </button>
            )}
            {answeredCount > 0 && (
              <span style={{ fontSize: 12, color: '#5e6c84', marginLeft: 'auto' }}>
                {answeredCount}/{questions.length} respondidas
              </span>
            )}
          </div>
        </>
      )}

      {/* Result Tab */}
      {tab === 'result' && scoreSummary && (
        <ResultPanel
          scoreSummary={scoreSummary}
          onCreateRemediation={handleCreateRemediation}
          onBack={() => setTab('form')}
          remediationLoading={remediationLoading}
        />
      )}

      {/* Settings Tab */}
      {tab === 'settings' && (
        <SettingsPanel
          settings={settings}
          onSettingsSaved={(s) => {
            setSettings(s);
            showToast('Configurações salvas.', 'success');
          }}
          onSyncFaq={() => showToast('FAQs sincronizadas com sucesso!', 'success')}
        />
      )}

      {/* Remediation Result */}
      {remediationResult && tab === 'result' && (
        <div className="success-state" style={{ margin: '0 0 16px' }}>
          <strong>Plano de remediação criado:</strong>{' '}
          {remediationResult.epicKey && <span>Epic: {remediationResult.epicKey} | </span>}
          {remediationResult.issues?.filter((i) => !i.error).length || 0} issues criadas.
          {remediationResult.issues?.some((i) => i.error) && (
            <span style={{ color: '#974f0c' }}>
              {' '}
              ({remediationResult.issues.filter((i) => i.error).length} falharam)
            </span>
          )}
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <div className={`toast ${toast.type}`}>{toast.message}</div>
      )}
    </div>
  );
}
