'use strict';

const { getAllQuestions, getDomains, getPRRVersion } = require('../services/prrStaticLoader');
const { buildScoreSummary } = require('../services/adherenceScoreEngine');
const { syncFaqHub, generateAssessmentPage } = require('../services/confluenceService');
const { createRemediationPlan } = require('../services/jiraService');
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

/**
 * getQuestionnaire
 *
 * Returns the full static PRR questionnaire with FAQ links injected.
 */
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

/**
 * loadDraft
 *
 * Loads a previously saved draft for the given session.
 */
async function loadDraft({ sessionId }) {
  if (!sessionId) return null;
  return getDraft(sessionId);
}

/**
 * saveDraftResolver
 *
 * Persists a partial PRR form state as a draft.
 */
async function saveDraftResolver({ sessionId, serviceName, owner, answers, prrVersion }) {
  const questions = getAllQuestions();
  const answeredCount = Object.keys(answers || {}).length;

  await saveDraft(sessionId, { serviceName, owner, answers: answers || {}, prrVersion });
  await trackDraftSaved({ sessionId, answeredCount, totalQuestions: questions.length });

  return { saved: true, answeredCount, totalQuestions: questions.length };
}

/**
 * submitAssessment
 *
 * Processes a complete or partial PRR submission:
 * 1. Calculates adherence score
 * 2. Persists the assessment
 * 3. Optionally generates Confluence assessment page
 * 4. Records telemetry
 */
async function submitAssessment({ sessionId, serviceName, owner, answers, prrVersion, projectKey, durationMs }) {
  const scoreSummary = buildScoreSummary(answers || {});
  const assessmentId = generateAssessmentId(serviceName);
  const settings = await getSettings();

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
    projectKey,
    submittedAt: new Date().toISOString(),
  };

  await saveAssessment(assessmentId, assessment);
  await trackAssessmentCompleted({
    sessionId,
    assessmentId,
    score: scoreSummary.score,
    gapCount: scoreSummary.gaps.length,
    durationMs,
  });
  await trackScoreCalculated({
    assessmentId,
    score: scoreSummary.score,
    classification: scoreSummary.classification,
    domainScores: scoreSummary.domainScores,
    gapCount: scoreSummary.gaps.length,
  });

  if (sessionId) {
    await deleteDraft(sessionId).catch(() => {});
  }

  let confluencePage = null;
  if (settings.confluenceSpaceKey && settings.confluenceSyncEnabled) {
    try {
      confluencePage = await generateAssessmentPage({
        spaceKey: settings.confluenceSpaceKey,
        serviceName,
        owner,
        version: prrVersion || getPRRVersion(),
        scoreSummary,
        answers,
      });
    } catch (err) {
      confluencePage = { error: err.message };
    }
  }

  return {
    assessmentId,
    scoreSummary,
    confluencePage,
    submitted: true,
  };
}

/**
 * calculateAdherenceScore
 *
 * Calculates score without persisting, used for live preview.
 */
async function calculateAdherenceScore({ answers }) {
  return buildScoreSummary(answers || {});
}

/**
 * syncFaqPages
 *
 * Synchronizes all 42 FAQ pages to Confluence under the FAQ Hub.
 */
async function syncFaqPagesResolver({ spaceKey }) {
  const questions = getAllQuestions();
  const settings = await getSettings();
  const targetSpace = spaceKey || settings.confluenceSpaceKey;

  if (!targetSpace) {
    throw new Error('Confluence space key not configured. Update settings first.');
  }

  const result = await syncFaqHub(questions, targetSpace);
  await saveFaqLinks(result.faqLinks);

  return {
    synced: true,
    hubId: result.hubId,
    faqLinksCount: Object.keys(result.faqLinks).length,
    faqLinks: result.faqLinks,
  };
}

/**
 * generateRemediationPlan
 *
 * Creates Jira issues for all identified PRR gaps.
 */
async function generateRemediationPlan({ assessmentId, projectKey }) {
  const assessment = await getAssessment(assessmentId);
  if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);

  const result = await createRemediationPlan({
    projectKey: projectKey || assessment.projectKey,
    serviceName: assessment.serviceName,
    owner: assessment.owner,
    scoreSummary: { gaps: assessment.gaps, score: assessment.score, classification: assessment.classification },
    assessmentId,
  });

  await trackRemediationCreated({
    assessmentId,
    issueCount: result.issues.filter((i) => !i.error).length,
    epicKey: result.epicKey,
  });

  const updated = { ...assessment, remediationPlan: result, remediationCreatedAt: new Date().toISOString() };
  await saveAssessment(assessmentId, updated);

  return result;
}

/**
 * getAssessmentById
 *
 * Retrieves a persisted assessment by ID.
 */
async function getAssessmentById({ assessmentId }) {
  const assessment = await getAssessment(assessmentId);
  if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);
  return assessment;
}

/**
 * trackEvent
 *
 * Generic telemetry event tracker from the frontend.
 */
async function trackEvent({ type, payload }) {
  if (type === 'faq_opened') {
    await trackFaqOpened(payload);
  } else if (type === 'question_answered') {
    await trackQuestionAnswered(payload);
  } else if (type === 'assessment_started') {
    await trackAssessmentStarted(payload);
  }
  return { tracked: true };
}

/**
 * getAdaptiveHints
 *
 * Returns contextual hints for a question based on telemetry and FAQ quality.
 */
async function getAdaptiveHints({ questionId }) {
  const faqLinks = await getFaqLinks();
  return {
    questionId,
    faqUrl: faqLinks[questionId] || null,
    tips: [],
    examples: [],
  };
}

/**
 * updateSettings
 *
 * Updates portal settings (admin only).
 */
async function updateSettings({ settings }) {
  await saveSettings(settings);
  return { updated: true, settings };
}

/**
 * getPortalSettings
 */
async function getPortalSettings() {
  return getSettings();
}

module.exports = {
  getQuestionnaire,
  loadDraft,
  saveDraftResolver,
  submitAssessment,
  calculateAdherenceScore,
  syncFaqPagesResolver,
  generateRemediationPlan,
  getAssessmentById,
  trackEvent,
  getAdaptiveHints,
  updateSettings,
  getPortalSettings,
};
