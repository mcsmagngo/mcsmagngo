'use strict';

const { saveTelemetryEvent } = require('./storageService');

/**
 * Telemetry Service — Learning Layer
 *
 * Captures usage events to feed the learning pipeline:
 * - Question response times and patterns
 * - FAQ access frequency
 * - Assessment completion/abandonment
 * - Gap patterns and recurrence
 * - Recommendation acceptance
 *
 * All events are anonymized and stored for batch analytics.
 */

const EVENT_TYPES = {
  ASSESSMENT_STARTED: 'assessment_started',
  ASSESSMENT_COMPLETED: 'assessment_completed',
  ASSESSMENT_ABANDONED: 'assessment_abandoned',
  DRAFT_SAVED: 'draft_saved',
  QUESTION_ANSWERED: 'question_answered',
  FAQ_OPENED: 'faq_opened',
  FAQ_TIME_SPENT: 'faq_time_spent',
  SCORE_CALCULATED: 'score_calculated',
  REMEDIATION_CREATED: 'remediation_created',
  RECOMMENDATION_ACCEPTED: 'recommendation_accepted',
  RECOMMENDATION_IGNORED: 'recommendation_ignored',
  ASSESSMENT_PAGE_GENERATED: 'assessment_page_generated',
};

async function trackAssessmentStarted({ sessionId, serviceName, prrVersion }) {
  await saveTelemetryEvent({
    type: EVENT_TYPES.ASSESSMENT_STARTED,
    sessionId,
    serviceName: anonymize(serviceName),
    prrVersion,
  });
}

async function trackAssessmentCompleted({ sessionId, assessmentId, score, gapCount, durationMs }) {
  await saveTelemetryEvent({
    type: EVENT_TYPES.ASSESSMENT_COMPLETED,
    sessionId,
    assessmentId,
    score,
    gapCount,
    durationMs,
  });
}

async function trackQuestionAnswered({ sessionId, questionId, dominio, answer, timeSpentMs }) {
  await saveTelemetryEvent({
    type: EVENT_TYPES.QUESTION_ANSWERED,
    sessionId,
    questionId,
    dominio,
    answer,
    timeSpentMs,
  });
}

async function trackFaqOpened({ sessionId, questionId, dominio }) {
  await saveTelemetryEvent({
    type: EVENT_TYPES.FAQ_OPENED,
    sessionId,
    questionId,
    dominio,
  });
}

async function trackScoreCalculated({ assessmentId, score, classification, domainScores, gapCount }) {
  await saveTelemetryEvent({
    type: EVENT_TYPES.SCORE_CALCULATED,
    assessmentId,
    score,
    classification: classification.status,
    domainScores: Object.fromEntries(Object.entries(domainScores).map(([k, v]) => [k, v.score])),
    gapCount,
  });
}

async function trackRemediationCreated({ assessmentId, issueCount, epicKey }) {
  await saveTelemetryEvent({
    type: EVENT_TYPES.REMEDIATION_CREATED,
    assessmentId,
    issueCount,
    epicKey,
  });
}

async function trackDraftSaved({ sessionId, answeredCount, totalQuestions }) {
  await saveTelemetryEvent({
    type: EVENT_TYPES.DRAFT_SAVED,
    sessionId,
    answeredCount,
    totalQuestions,
    progressPercent: Math.round((answeredCount / totalQuestions) * 100),
  });
}

function anonymize(str) {
  if (!str) return '';
  return `svc-${str.length}-${str.charCodeAt(0)}`;
}

module.exports = {
  trackAssessmentStarted,
  trackAssessmentCompleted,
  trackQuestionAnswered,
  trackFaqOpened,
  trackScoreCalculated,
  trackRemediationCreated,
  trackDraftSaved,
  EVENT_TYPES,
};
