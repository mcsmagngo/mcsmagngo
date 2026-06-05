'use strict';

const { getAllQuestions, getDomains, getPRRVersion } = require('../services/prrStaticLoader');
const { buildScoreSummary } = require('../services/adherenceScoreEngine');
const { syncFaqHub, generateAssessmentPage } = require('../services/confluenceService');
const { createRemediationPlan } = require('../services/jiraService');
const {
  analyzeIntent,
  retrieveRelevantFaqs,
  explainGap,
  generateRecommendations,
  generateExecutiveSummary,
} = require('../services/rovoService');
const { validateDocument } = require('../services/docValidatorService');
const { searchAll, getArtifactById } = require('../services/searchService');
const {
  saveAssessment,
  getAssessment,
  saveDraft,
  getDraft,
  deleteDraft,
  getFaqLinks,
  saveFaqLinks,
  getSettings,
  saveSettings,
  generateAssessmentId,
  saveTelemetryEvent,
} = require('../services/storageService');
const {
  trackAssessmentStarted,
  trackAssessmentCompleted,
  trackQuestionAnswered,
  trackFaqOpened,
  trackScoreCalculated,
  trackRemediationCreated,
  trackDraftSaved,
} = require('../services/telemetryService');

// ─── Questionnaire ────────────────────────────────────────────────────────────

async function getQuestionnaire() {
  const questions = getAllQuestions();
  const faqLinks = await getFaqLinks();
  const settings = await getSettings();

  const enriched = questions.map((q) => ({
    ...q,
    link_faq_confluence: faqLinks[q.question_id] || q.link_faq_confluence || '',
  }));

  return {
    questions: enriched,
    domains: getDomains(),
    version: getPRRVersion(),
    prrSettings: settings,
    totalQuestions: enriched.length,
  };
}

// ─── Draft ────────────────────────────────────────────────────────────────────

async function loadDraft({ sessionId }) {
  if (!sessionId) return null;
  return getDraft(sessionId);
}

async function saveDraftResolver({ sessionId, serviceName, owner, answers, prrVersion }) {
  const questions = getAllQuestions();
  const answeredCount = Object.keys(answers || {}).length;
  await saveDraft(sessionId, { serviceName, owner, answers: answers || {}, prrVersion });
  await trackDraftSaved({ sessionId, answeredCount, totalQuestions: questions.length });
  return { saved: true, answeredCount, totalQuestions: questions.length };
}

// ─── Assessment ───────────────────────────────────────────────────────────────

async function submitAssessment({ sessionId, serviceName, owner, answers, prrVersion, projectKey, durationMs }) {
  const scoreSummary = buildScoreSummary(answers || {});
  const assessmentId = generateAssessmentId(serviceName);
  const settings = await getSettings();
  const faqLinks = await getFaqLinks();

  // Enrich score summary with Rovo recommendations and executive summary
  const recommendations = generateRecommendations(scoreSummary, faqLinks);
  const executiveSummary = generateExecutiveSummary({
    serviceName,
    owner,
    scoreSummary,
    prrVersion: prrVersion || getPRRVersion(),
  });

  const assessment = {
    assessmentId,
    sessionId,
    serviceName,
    owner,
    prrVersion: prrVersion || getPRRVersion(),
    answers: answers || {},
    score: scoreSummary.score,
    classification: scoreSummary.classification,
    domainScores: scoreSummary.domainScores,
    gaps: scoreSummary.gaps,
    mandatoryCompliance: scoreSummary.mandatoryCompliance,
    recommendations,
    executiveSummary,
    projectKey,
    submittedAt: new Date().toISOString(),
  };

  await saveAssessment(assessmentId, assessment);
  await trackAssessmentCompleted({ sessionId, assessmentId, score: scoreSummary.score, gapCount: scoreSummary.gaps.length, durationMs });
  await trackScoreCalculated({ assessmentId, score: scoreSummary.score, classification: scoreSummary.classification, domainScores: scoreSummary.domainScores, gapCount: scoreSummary.gaps.length });

  if (sessionId) await deleteDraft(sessionId).catch(() => {});

  let confluencePage = null;
  if (settings.confluenceSpaceKey && settings.confluenceSyncEnabled) {
    try {
      confluencePage = await generateAssessmentPage({ spaceKey: settings.confluenceSpaceKey, serviceName, owner, version: prrVersion || getPRRVersion(), scoreSummary, answers });
    } catch (err) {
      confluencePage = { error: err.message };
    }
  }

  return { assessmentId, scoreSummary, recommendations, executiveSummary, confluencePage, submitted: true };
}

async function calculateAdherenceScore({ answers }) {
  return buildScoreSummary(answers || {});
}

async function getAssessmentById({ assessmentId }) {
  const assessment = await getAssessment(assessmentId);
  if (!assessment) throw new Error(`Assessment ${assessmentId} não encontrado.`);
  return assessment;
}

// ─── Rovo Cognitive Layer ─────────────────────────────────────────────────────

async function rovoAnalyzeIntent({ userInput }) {
  return analyzeIntent(userInput);
}

async function rovoExplainGap({ questionId }) {
  const explanation = explainGap(questionId);
  if (!explanation) throw new Error(`Pergunta ${questionId} não encontrada.`);
  return explanation;
}

async function rovoGetRecommendations({ assessmentId }) {
  const assessment = await getAssessment(assessmentId);
  if (!assessment) throw new Error(`Assessment ${assessmentId} não encontrado.`);
  const faqLinks = await getFaqLinks();
  return {
    recommendations: generateRecommendations({ gaps: assessment.gaps, score: assessment.score, classification: assessment.classification, domainScores: assessment.domainScores }, faqLinks),
    executiveSummary: assessment.executiveSummary || generateExecutiveSummary({ serviceName: assessment.serviceName, owner: assessment.owner, scoreSummary: { score: assessment.score, classification: assessment.classification, gaps: assessment.gaps, domainScores: assessment.domainScores, answeredCount: Object.keys(assessment.answers).length, totalQuestions: 42, mandatoryCompliance: assessment.mandatoryCompliance }, prrVersion: assessment.prrVersion }),
  };
}

async function rovoSearchFaqs({ query, limit }) {
  const faqLinks = await getFaqLinks();
  return retrieveRelevantFaqs(query, faqLinks, limit || 5);
}

// ─── Document Validation ──────────────────────────────────────────────────────

async function validateConfluenceDoc({ pageUrl }) {
  if (!pageUrl) throw new Error('URL da página Confluence é obrigatória.');
  return validateDocument({ pageUrl });
}

// ─── Search ───────────────────────────────────────────────────────────────────

async function searchArtifacts({ query, domain, type, limit }) {
  return searchAll({ query, domain, type, limit });
}

async function installArtifact({ artifactId, projectKey }) {
  const artifact = getArtifactById(artifactId);
  if (!artifact) throw new Error(`Artefato ${artifactId} não encontrado.`);
  await saveTelemetryEvent({ type: 'artifact_installed', artifactId, projectKey, timestamp: new Date().toISOString() });
  return { installed: true, artifact, message: `Artefato "${artifact.titulo}" registrado. Acesse o link para download ou criação no Confluence.` };
}

// ─── History ─────────────────────────────────────────────────────────────────

async function getAssessmentHistory({ limit }) {
  // Forge Storage does not support native listing — we track a history index
  const historyIndex = (await getAssessment('__history_index__')) || { assessments: [] };
  const ids = (historyIndex.assessments || []).slice(0, limit || 20);
  const items = await Promise.all(ids.map((id) => getAssessment(id).catch(() => null)));
  return {
    total: ids.length,
    assessments: items.filter(Boolean).map((a) => ({
      assessmentId: a.assessmentId,
      serviceName: a.serviceName,
      owner: a.owner,
      score: a.score,
      classification: a.classification,
      gapCount: a.gaps?.length || 0,
      prrVersion: a.prrVersion,
      submittedAt: a.submittedAt,
    })),
  };
}

// ─── FAQ Sync ─────────────────────────────────────────────────────────────────

async function syncFaqPagesResolver({ spaceKey }) {
  const questions = getAllQuestions();
  const settings = await getSettings();
  const targetSpace = spaceKey || settings.confluenceSpaceKey;
  if (!targetSpace) throw new Error('Chave do Space do Confluence não configurada. Atualize as configurações primeiro.');

  const result = await syncFaqHub(questions, targetSpace);
  await saveFaqLinks(result.faqLinks);

  return { synced: true, hubId: result.hubId, faqLinksCount: Object.keys(result.faqLinks).length, faqLinks: result.faqLinks };
}

// ─── Remediation ──────────────────────────────────────────────────────────────

async function generateRemediationPlan({ assessmentId, projectKey }) {
  const assessment = await getAssessment(assessmentId);
  if (!assessment) throw new Error(`Assessment ${assessmentId} não encontrado.`);

  const result = await createRemediationPlan({
    projectKey: projectKey || assessment.projectKey,
    serviceName: assessment.serviceName,
    owner: assessment.owner,
    scoreSummary: { gaps: assessment.gaps, score: assessment.score, classification: assessment.classification },
    assessmentId,
  });

  await trackRemediationCreated({ assessmentId, issueCount: result.issues.filter((i) => !i.error).length, epicKey: result.epicKey });

  const updated = { ...assessment, remediationPlan: result, remediationCreatedAt: new Date().toISOString() };
  await saveAssessment(assessmentId, updated);

  return result;
}

// ─── Telemetry ────────────────────────────────────────────────────────────────

async function trackEvent({ type, payload }) {
  if (type === 'faq_opened') await trackFaqOpened(payload);
  else if (type === 'question_answered') await trackQuestionAnswered(payload);
  else if (type === 'assessment_started') await trackAssessmentStarted(payload);
  return { tracked: true };
}

// ─── Adaptive Hints ───────────────────────────────────────────────────────────

async function getAdaptiveHints({ questionId }) {
  const faqLinks = await getFaqLinks();
  const explanation = explainGap(questionId);
  return {
    questionId,
    faqUrl: faqLinks[questionId] || null,
    explanation: explanation?.explicacao || null,
    nextSteps: explanation?.sugestao_proximos_passos || [],
    risco: explanation?.risco || null,
  };
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function updateSettings({ settings }) {
  await saveSettings(settings);
  return { updated: true, settings };
}

async function getPortalSettings() {
  return getSettings();
}

module.exports = {
  getQuestionnaire,
  loadDraft,
  saveDraftResolver,
  submitAssessment,
  calculateAdherenceScore,
  getAssessmentById,
  rovoAnalyzeIntent,
  rovoExplainGap,
  rovoGetRecommendations,
  rovoSearchFaqs,
  validateConfluenceDoc,
  searchArtifacts,
  installArtifact,
  getAssessmentHistory,
  syncFaqPagesResolver,
  generateRemediationPlan,
  trackEvent,
  getAdaptiveHints,
  updateSettings,
  getPortalSettings,
};
