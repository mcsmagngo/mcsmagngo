'use strict';

const Resolver = require('@forge/resolver');
const resolvers = require('./resolvers/index');

const resolver = new Resolver();

resolver.define('getQuestionnaire', async () => {
  return resolvers.getQuestionnaire();
});

resolver.define('loadDraft', async ({ payload }) => {
  return resolvers.loadDraft(payload);
});

resolver.define('saveDraft', async ({ payload }) => {
  return resolvers.saveDraftResolver(payload);
});

resolver.define('submitAssessment', async ({ payload }) => {
  return resolvers.submitAssessment(payload);
});

resolver.define('calculateAdherenceScore', async ({ payload }) => {
  return resolvers.calculateAdherenceScore(payload);
});

resolver.define('syncFaqPages', async ({ payload }) => {
  return resolvers.syncFaqPagesResolver(payload);
});

resolver.define('generateRemediationPlan', async ({ payload }) => {
  return resolvers.generateRemediationPlan(payload);
});

resolver.define('getAssessmentById', async ({ payload }) => {
  return resolvers.getAssessmentById(payload);
});

resolver.define('trackEvent', async ({ payload }) => {
  return resolvers.trackEvent(payload);
});

resolver.define('getAdaptiveHints', async ({ payload }) => {
  return resolvers.getAdaptiveHints(payload);
});

resolver.define('updateSettings', async ({ payload }) => {
  return resolvers.updateSettings(payload);
});

resolver.define('getPortalSettings', async () => {
  return resolvers.getPortalSettings();
});

exports.handler = resolver.getDefinitions();
