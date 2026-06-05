import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke } from '@forge/bridge';
import WelcomeScreen from './components/WelcomeScreen';
import QuestionRow from './components/QuestionRow';
import ProgressBar from './components/ProgressBar';
import DomainBreakdown from './components/DomainBreakdown';
import ResultPanel from './components/ResultPanel';
import SettingsPanel from './components/SettingsPanel';
import DocValidatorScreen from './components/DocValidatorScreen';
import SearchScreen from './components/SearchScreen';
import HistoryScreen from './components/HistoryScreen';
import SystemHealthScreen from './components/SystemHealthScreen';

const SESSION_ID = 'prr-session-' + Date.now().toString(36);

// Lightweight client-side score calculation for real-time preview
function computePartialScore(answers, questions) {
  if (!questions || questions.length === 0) return { score: 0, classification: null, domainScores: {} };
  if (Object.keys(answers).length === 0) return { score: 0, classification: null, domainScores: {} };

  let weightedSum = 0, totalWeight = 0;
  questions.forEach((q) => {
    const w = q.peso || 1;
    totalWeight += w;
    if (answers[q.question_id] === 'sim') weightedSum += w;
  });
  const score = Math.round((weightedSum / totalWeight) * 100);
  const classification =
    score >= 80 ? { status: 'ADERENTE', label: 'Aderente', color: 'green' }
    : score >= 50 ? { status: 'PARCIALMENTE_ADERENTE', label: 'Parcialmente Aderente', color: 'yellow' }
    : { status: 'NAO_ADERENTE', label: 'Não Aderente', color: 'red' };

  const domains = [...new Set(questions.map((q) => q.dominio))];
  const domainScores = {};
  domains.forEach((d) => {
    const dqs = questions.filter((q) => q.dominio === d);
    let dw = 0, dws = 0;
    dqs.forEach((q) => { const w = q.peso || 1; dw += w; if (answers[q.question_id] === 'sim') dws += w; });
    domainScores[d] = { score: dw > 0 ? Math.round((dws / dw) * 100) : 0, answered: dqs.filter((q) => answers[q.question_id] !== undefined).length, total: dqs.length };
  });
  return { score, classification, domainScores };
}

// ─── SCREEN NAMES ─────────────────────────────────────────────────────────────
const SCREENS = {
  WELCOME: 'welcome',
  FORM: 'form',
  RESULT: 'result',
  VALIDATE_DOC: 'validate_doc',
  SEARCH: 'search',
  HISTORY: 'history',
  HEALTH: 'health',
  SETTINGS: 'settings',
};

export default function App() {
  const [screen, setScreen] = useState(SCREENS.WELCOME);
  const [questionnaire, setQuestionnaire] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  // Form state
  const [serviceName, setServiceName] = useState('');
  const [owner, setOwner] = useState('');
  const [answers, setAnswers] = useState({});
  const [activeDomain, setActiveDomain] = useState(null);

  // Result state
  const [submitting, setSubmitting] = useState(false);
  const [scoreSummary, setScoreSummary] = useState(null);
  const [executiveSummary, setExecutiveSummary] = useState(null);
  const [recommendations, setRecommendations] = useState(null);
  const [assessmentId, setAssessmentId] = useState(null);
  const [remediationLoading, setRemediationLoading] = useState(false);
  const [remediationResult, setRemediationResult] = useState(null);

  // Search state
  const [searchInitialQuery, setSearchInitialQuery] = useState('');

  // Settings & UI
  const [settings, setSettings] = useState(null);
  const [toast, setToast] = useState(null);

  const startTimeRef = useRef(Date.now());
  const autosaveRef = useRef(null);

  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Load questionnaire and settings on mount
  useEffect(() => {
    async function load() {
      try {
        const [q, s] = await Promise.all([invoke('getQuestionnaire'), invoke('getPortalSettings')]);
        setQuestionnaire(q);
        setSettings(s);
        const draft = await invoke('loadDraft', { sessionId: SESSION_ID }).catch(() => null);
        if (draft && draft.answers && Object.keys(draft.answers).length > 0) {
          setServiceName(draft.serviceName || '');
          setOwner(draft.owner || '');
          setAnswers(draft.answers || {});
          showToast('Rascunho anterior restaurado. Clique em "Novo PRR" para retomar.', 'info');
        }
        await invoke('trackEvent', { type: 'assessment_started', payload: { sessionId: SESSION_ID, prrVersion: q.version } });
      } catch (err) {
        setLoadError(err.message || String(err));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [showToast]);

  // Auto-save draft every 60s
  useEffect(() => {
    if (autosaveRef.current) clearInterval(autosaveRef.current);
    if (!questionnaire || screen !== SCREENS.FORM) return;
    autosaveRef.current = setInterval(() => {
      if (Object.keys(answers).length > 0) {
        invoke('saveDraft', { sessionId: SESSION_ID, serviceName, owner, answers, prrVersion: questionnaire.version }).catch(() => {});
      }
    }, 60000);
    return () => clearInterval(autosaveRef.current);
  }, [questionnaire, answers, serviceName, owner, screen]);

  const handleAnswer = useCallback((questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    if (questionnaire) {
      const q = questionnaire.questions.find((q) => q.question_id === questionId);
      invoke('trackEvent', { type: 'question_answered', payload: { sessionId: SESSION_ID, questionId, dominio: q?.dominio, answer: value } }).catch(() => {});
    }
  }, [questionnaire]);

  const handleFaqClick = useCallback((question) => {
    if (question.link_faq_confluence) window.open(question.link_faq_confluence, '_blank', 'noopener');
    invoke('trackEvent', { type: 'faq_opened', payload: { sessionId: SESSION_ID, questionId: question.question_id, dominio: question.dominio } }).catch(() => {});
  }, []);

  const handleSaveDraft = async () => {
    try {
      await invoke('saveDraft', { sessionId: SESSION_ID, serviceName, owner, answers, prrVersion: questionnaire?.version });
      showToast('Rascunho salvo com sucesso.', 'success');
    } catch { showToast('Erro ao salvar rascunho.', 'error'); }
  };

  const handleCalculate = () => {
    if (!questionnaire || Object.keys(answers).length === 0) return;
    const durationMs = Date.now() - startTimeRef.current;
    setSubmitting(true);
    invoke('submitAssessment', { sessionId: SESSION_ID, serviceName: serviceName || 'Sem nome', owner: owner || 'Não definido', answers, prrVersion: questionnaire.version, durationMs })
      .then((result) => {
        setScoreSummary(result.scoreSummary);
        setExecutiveSummary(result.executiveSummary);
        setRecommendations(result.recommendations);
        setAssessmentId(result.assessmentId);
        setScreen(SCREENS.RESULT);
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
    } finally { setRemediationLoading(false); }
  };

  const handleWelcomeSelect = (option, query) => {
    if (option === 'novo_prr') { setScreen(SCREENS.FORM); startTimeRef.current = Date.now(); }
    else if (option === 'validar_doc') setScreen(SCREENS.VALIDATE_DOC);
    else if (option === 'buscar_faq') { setSearchInitialQuery(query || ''); setScreen(SCREENS.SEARCH); }
    else if (option === 'historico') setScreen(SCREENS.HISTORY);
    else if (option === 'saude') setScreen(SCREENS.HEALTH);
    else if (option === 'configurar') setScreen(SCREENS.SETTINGS);
  };

  const handleNewPRR = () => {
    setAnswers({});
    setScoreSummary(null);
    setExecutiveSummary(null);
    setRecommendations(null);
    setAssessmentId(null);
    setRemediationResult(null);
    setScreen(SCREENS.WELCOME);
  };

  const { questions = [], version = '1.0', domains = [] } = questionnaire || {};
  const filteredQuestions = useMemo(() => !activeDomain ? questions : questions.filter((q) => q.dominio === activeDomain), [questions, activeDomain]);
  const partial = useMemo(() => computePartialScore(answers, questions), [answers, questions]);
  const answeredCount = Object.keys(answers).length;

  // ─── Loading / Error ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="prr-portal">
        <div className="loading-state"><div className="spinner" /><span>Carregando Portal PRR...</span></div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="prr-portal">
        <div className="error-state">
          <strong>Erro ao carregar o Portal PRR:</strong> {loadError}
          <br />
          <button className="btn btn-secondary" style={{ marginTop: 8 }} onClick={() => window.location.reload()}>Tentar novamente</button>
        </div>
      </div>
    );
  }

  // ─── Persistent Header (shown on all screens except welcome) ───────────────
  const showHeader = screen !== SCREENS.WELCOME;

  return (
    <div className="prr-portal">
      {/* App Header (non-welcome screens) */}
      {showHeader && (
        <div className="app-topbar">
          <button className="topbar-logo" onClick={() => setScreen(SCREENS.WELCOME)}>
            🔭 Portal PRR
          </button>
          <nav className="topbar-nav">
            <button className={`topbar-nav-btn ${screen === SCREENS.FORM ? 'active' : ''}`} onClick={() => setScreen(SCREENS.FORM)}>📋 Formulário</button>
            {scoreSummary && <button className={`topbar-nav-btn ${screen === SCREENS.RESULT ? 'active' : ''}`} onClick={() => setScreen(SCREENS.RESULT)}>📊 Resultado</button>}
            <button className={`topbar-nav-btn ${screen === SCREENS.VALIDATE_DOC ? 'active' : ''}`} onClick={() => setScreen(SCREENS.VALIDATE_DOC)}>🔍 Validar Doc</button>
            <button className={`topbar-nav-btn ${screen === SCREENS.SEARCH ? 'active' : ''}`} onClick={() => setScreen(SCREENS.SEARCH)}>🔎 Buscar</button>
            <button className={`topbar-nav-btn ${screen === SCREENS.HEALTH ? 'active' : ''}`} onClick={() => setScreen(SCREENS.HEALTH)}>🔭 Saúde</button>
            <button className={`topbar-nav-btn ${screen === SCREENS.HISTORY ? 'active' : ''}`} onClick={() => setScreen(SCREENS.HISTORY)}>📈 Histórico</button>
            <button className={`topbar-nav-btn ${screen === SCREENS.SETTINGS ? 'active' : ''}`} onClick={() => setScreen(SCREENS.SETTINGS)}>⚙</button>
          </nav>
          <span className="topbar-version">PRR v{version}</span>
        </div>
      )}

      {/* ── Welcome Screen ───────────────────────────────────────────────────── */}
      {screen === SCREENS.WELCOME && (
        <WelcomeScreen onSelect={handleWelcomeSelect} prrVersion={version} />
      )}

      {/* ── PRR Form ─────────────────────────────────────────────────────────── */}
      {screen === SCREENS.FORM && (
        <>
          {/* Form Header */}
          <div className="prr-header">
            <h1>Formulário PRR — Sim / Não</h1>
            <div className="prr-header-meta">
              <div>
                <label>Serviço / Sistema:</label>
                <input type="text" placeholder="Nome do serviço" value={serviceName} onChange={(e) => setServiceName(e.target.value)} />
              </div>
              <div>
                <label>Owner:</label>
                <input type="text" placeholder="Nome ou time" value={owner} onChange={(e) => setOwner(e.target.value)} />
              </div>
              <div>
                <label>Versão PRR:</label>
                <span style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>v{version}</span>
              </div>
            </div>
          </div>

          <ProgressBar answered={answeredCount} total={questions.length} score={partial.score} classification={partial.classification} />

          {/* Domain Filter */}
          <div className="domain-filter-bar">
            <span>Filtrar:</span>
            <button className={`domain-chip ${!activeDomain ? 'active' : ''}`} onClick={() => setActiveDomain(null)}>Todos ({questions.length})</button>
            {domains.map((d) => {
              const ds = partial.domainScores[d];
              return (
                <button key={d} className={`domain-chip ${activeDomain === d ? 'active' : ''}`} onClick={() => setActiveDomain(activeDomain === d ? null : d)}>
                  {d}{ds && <span className="domain-score"> {ds.score}%</span>}
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
                  <QuestionRow key={q.question_id} question={q} answer={answers[q.question_id]} onAnswer={handleAnswer} onFaqClick={handleFaqClick} />
                ))}
              </tbody>
            </table>
          </div>

          <DomainBreakdown domainScores={partial.domainScores} activeDomain={activeDomain} onDomainClick={(d) => setActiveDomain(activeDomain === d ? null : d)} />

          {/* Action Bar */}
          <div className="prr-action-bar">
            <button className="btn btn-secondary" onClick={handleSaveDraft}>💾 Salvar rascunho</button>
            <button className="btn btn-primary" onClick={handleCalculate} disabled={submitting || answeredCount === 0} title={answeredCount === 0 ? 'Responda pelo menos uma pergunta' : undefined}>
              {submitting ? '⏳ Calculando...' : '📊 Calcular aderência'}
            </button>
            {scoreSummary && (
              <button className="btn btn-success" onClick={() => setScreen(SCREENS.RESULT)}>📋 Ver resultado ({scoreSummary.score}%)</button>
            )}
            {answeredCount > 0 && (
              <span style={{ fontSize: 12, color: '#5e6c84', marginLeft: 'auto' }}>{answeredCount}/{questions.length} respondidas</span>
            )}
          </div>
        </>
      )}

      {/* ── Result Screen ─────────────────────────────────────────────────────── */}
      {screen === SCREENS.RESULT && scoreSummary && (
        <>
          <div style={{ padding: '0 0 16px' }}>
            {remediationResult && (
              <div className="success-state">
                <strong>Plano de remediação criado:</strong>{' '}
                {remediationResult.epicKey && <span>Epic: {remediationResult.epicKey} | </span>}
                {remediationResult.issues?.filter((i) => !i.error).length || 0} issues criadas.
              </div>
            )}
          </div>
          <ResultPanel
            scoreSummary={scoreSummary}
            executiveSummary={executiveSummary}
            recommendations={recommendations}
            onCreateRemediation={handleCreateRemediation}
            onBack={() => setScreen(SCREENS.FORM)}
            onNewPRR={handleNewPRR}
            remediationLoading={remediationLoading}
          />
        </>
      )}

      {/* ── Document Validator ────────────────────────────────────────────────── */}
      {screen === SCREENS.VALIDATE_DOC && (
        <DocValidatorScreen onBack={() => setScreen(SCREENS.WELCOME)} onStartPRR={() => setScreen(SCREENS.FORM)} />
      )}

      {/* ── Search ───────────────────────────────────────────────────────────── */}
      {screen === SCREENS.SEARCH && (
        <SearchScreen onBack={() => setScreen(SCREENS.WELCOME)} initialQuery={searchInitialQuery} />
      )}

      {/* ── System Health ────────────────────────────────────────────────────── */}
      {screen === SCREENS.HEALTH && (
        <SystemHealthScreen
          onBack={() => setScreen(SCREENS.WELCOME)}
          onOpenSettings={() => setScreen(SCREENS.SETTINGS)}
        />
      )}

      {/* ── History ──────────────────────────────────────────────────────────── */}
      {screen === SCREENS.HISTORY && (
        <HistoryScreen onBack={() => setScreen(SCREENS.WELCOME)} />
      )}

      {/* ── Settings ─────────────────────────────────────────────────────────── */}
      {screen === SCREENS.SETTINGS && (
        <div style={{ padding: '16px 0' }}>
          <SettingsPanel
            settings={settings}
            onSettingsSaved={(s) => { setSettings(s); showToast('Configurações salvas.', 'success'); }}
            onSyncFaq={() => showToast('FAQs sincronizadas com sucesso!', 'success')}
          />
        </div>
      )}

      {/* Toast */}
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  );
}
