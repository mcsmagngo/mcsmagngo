'use strict';

const { storage } = require('@forge/api');

/**
 * Storage Service
 *
 * Handles Forge Storage operations for persisting:
 * - PRR assessments (answers, scores, metadata)
 * - FAQ link store (mapping question_id → Confluence URL)
 * - Telemetry events
 * - Draft versions
 */

const KEYS = {
  ASSESSMENT_PREFIX: 'assessment:',
  DRAFT_PREFIX: 'draft:',
  FAQ_LINKS: 'faq-links',
  TELEMETRY_PREFIX: 'telemetry:',
  SETTINGS: 'prr-settings',
};

async function saveAssessment(assessmentId, data) {
  const key = `${KEYS.ASSESSMENT_PREFIX}${assessmentId}`;
  await storage.set(key, { ...data, updatedAt: new Date().toISOString() });
  return key;
}

async function getAssessment(assessmentId) {
  return storage.get(`${KEYS.ASSESSMENT_PREFIX}${assessmentId}`);
}

async function saveDraft(sessionId, data) {
  const key = `${KEYS.DRAFT_PREFIX}${sessionId}`;
  await storage.set(key, { ...data, savedAt: new Date().toISOString() });
  return key;
}

async function getDraft(sessionId) {
  return storage.get(`${KEYS.DRAFT_PREFIX}${sessionId}`);
}

async function deleteDraft(sessionId) {
  return storage.delete(`${KEYS.DRAFT_PREFIX}${sessionId}`);
}

async function getFaqLinks() {
  return (await storage.get(KEYS.FAQ_LINKS)) || {};
}

async function saveFaqLinks(links) {
  await storage.set(KEYS.FAQ_LINKS, { ...links, syncedAt: new Date().toISOString() });
}

async function saveTelemetryEvent(event) {
  const key = `${KEYS.TELEMETRY_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await storage.set(key, {
    ...event,
    timestamp: new Date().toISOString(),
  });
}

async function getSettings() {
  return (await storage.get(KEYS.SETTINGS)) || {
    confluenceSpaceKey: '',
    prrVersion: '1.0',
    confluenceSyncEnabled: true,
    remediationEnabled: true,
    telemetryEnabled: true,
    grafanaUrl: '',
    grafanaApiKey: '',
    grafanaDatasourceUid: '',
    grafanaPanels: [],
    healthRefreshInterval: 60,
  };
}

async function saveSettings(settings) {
  await storage.set(KEYS.SETTINGS, { ...settings, updatedAt: new Date().toISOString() });
}

function generateAssessmentId(serviceName) {
  const slug = serviceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30);
  const ts = Date.now().toString(36);
  return `${slug}-${ts}`;
}

module.exports = {
  saveAssessment,
  getAssessment,
  saveDraft,
  getDraft,
  deleteDraft,
  getFaqLinks,
  saveFaqLinks,
  saveTelemetryEvent,
  getSettings,
  saveSettings,
  generateAssessmentId,
};
