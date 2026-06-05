'use strict';

const Resolver = require('@forge/resolver');
const resolvers = require('./resolvers/index');

const resolver = new Resolver();

// Questionnaire & Form
resolver.define('getQuestionnaire', async () => resolvers.getQuestionnaire());
resolver.define('loadDraft', async ({ payload }) => resolvers.loadDraft(payload));
resolver.define('saveDraft', async ({ payload }) => resolvers.saveDraftResolver(payload));
resolver.define('submitAssessment', async ({ payload }) => resolvers.submitAssessment(payload));
resolver.define('calculateAdherenceScore', async ({ payload }) => resolvers.calculateAdherenceScore(payload));
resolver.define('getAssessmentById', async ({ payload }) => resolvers.getAssessmentById(payload));
resolver.define('getAssessmentHistory', async ({ payload }) => resolvers.getAssessmentHistory(payload));

// Rovo Cognitive Layer
resolver.define('rovoAnalyzeIntent', async ({ payload }) => resolvers.rovoAnalyzeIntent(payload));
resolver.define('rovoExplainGap', async ({ payload }) => resolvers.rovoExplainGap(payload));
resolver.define('rovoGetRecommendations', async ({ payload }) => resolvers.rovoGetRecommendations(payload));
resolver.define('rovoSearchFaqs', async ({ payload }) => resolvers.rovoSearchFaqs(payload));

// Document Validation
resolver.define('validateConfluenceDoc', async ({ payload }) => resolvers.validateConfluenceDoc(payload));

// Search & Artifacts
resolver.define('searchArtifacts', async ({ payload }) => resolvers.searchArtifacts(payload));
resolver.define('installArtifact', async ({ payload }) => resolvers.installArtifact(payload));

// Confluence & Jira
resolver.define('syncFaqPages', async ({ payload }) => resolvers.syncFaqPagesResolver(payload));
resolver.define('generateRemediationPlan', async ({ payload }) => resolvers.generateRemediationPlan(payload));

// Telemetry & Hints
resolver.define('trackEvent', async ({ payload }) => resolvers.trackEvent(payload));
resolver.define('getAdaptiveHints', async ({ payload }) => resolvers.getAdaptiveHints(payload));

// Settings
resolver.define('updateSettings', async ({ payload }) => resolvers.updateSettings(payload));
resolver.define('getPortalSettings', async () => resolvers.getPortalSettings());

// Grafana / System Health
resolver.define('getSystemHealth', async ({ payload }) => resolvers.getSystemHealthData(payload));
resolver.define('getGrafanaAlerts', async () => resolvers.getGrafanaAlerts());
resolver.define('queryGrafanaMetric', async ({ payload }) => resolvers.queryGrafanaMetric(payload));
resolver.define('getGrafanaDashboards', async ({ payload }) => resolvers.getGrafanaDashboards(payload));
resolver.define('testGrafanaConnection', async ({ payload }) => resolvers.testGrafanaConnection(payload));

exports.handler = resolver.getDefinitions();
