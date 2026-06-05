'use strict';

const { fetch } = require('@forge/api');

/**
 * Grafana Service
 *
 * Integração server-side com a API do Grafana.
 * Todas as chamadas acontecem no backend Forge para evitar problemas de CORS
 * e proteger a API key do Grafana.
 *
 * Compatível com Grafana >= 8.x (Cloud e self-hosted).
 */

// ─── HTTP Client ──────────────────────────────────────────────────────────────

async function grafanaFetch(grafanaUrl, apiKey, path, options = {}) {
  const base = grafanaUrl.replace(/\/$/, '');
  const url = `${base}${path}`;

  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (apiKey) {
    // Suporta Bearer token (API keys novas do Grafana >= 8) e Basic auth legado
    headers['Authorization'] = apiKey.startsWith('glsa_') || apiKey.startsWith('eyJ')
      ? `Bearer ${apiKey}`
      : `Bearer ${apiKey}`;
  }

  const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Grafana API ${path} → HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  return response.json();
}

// ─── Health Check ─────────────────────────────────────────────────────────────

async function checkHealth(grafanaUrl, apiKey) {
  try {
    const data = await grafanaFetch(grafanaUrl, apiKey, '/api/health');
    return {
      ok: true,
      version: data.version || 'unknown',
      commit: data.commit || '',
      database: data.database || 'unknown',
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

/**
 * Busca alertas ativos. Tenta a API Grafana Managed Alerts (>= 8.x),
 * com fallback para a API legada.
 */
async function getAlerts(grafanaUrl, apiKey) {
  // Tenta API Unified Alerting (Grafana >= 8)
  try {
    const data = await grafanaFetch(grafanaUrl, apiKey, '/api/alertmanager/grafana/api/v2/alerts');
    return normalizeUnifiedAlerts(data);
  } catch {
    // Fallback para Legacy Alerting
    try {
      const data = await grafanaFetch(grafanaUrl, apiKey, '/api/alerts?state=alerting&limit=50');
      return normalizeLegacyAlerts(data);
    } catch (err) {
      return { ok: false, error: err.message, alerts: [] };
    }
  }
}

function normalizeUnifiedAlerts(raw) {
  const alerts = (Array.isArray(raw) ? raw : []).map((a) => ({
    id: a.fingerprint || a.labels?.alertname || String(Math.random()),
    name: a.labels?.alertname || 'Unnamed Alert',
    state: mapUnifiedState(a.status?.state),
    severity: a.labels?.severity || a.labels?.priority || 'unknown',
    service: a.labels?.service || a.labels?.job || a.labels?.instance || '',
    summary: a.annotations?.summary || a.annotations?.description || '',
    startsAt: a.startsAt || null,
    labels: a.labels || {},
    inhibited: a.status?.inhibitedBy?.length > 0,
    silenced: a.status?.silencedBy?.length > 0,
  }));

  return { ok: true, alerts, source: 'unified' };
}

function mapUnifiedState(state) {
  const map = { active: 'alerting', suppressed: 'silenced', unprocessed: 'pending' };
  return map[state] || state || 'unknown';
}

function normalizeLegacyAlerts(raw) {
  const alerts = (Array.isArray(raw) ? raw : []).map((a) => ({
    id: String(a.id),
    name: a.name || a.dashboardSlug || 'Unnamed Alert',
    state: a.state || 'unknown',
    severity: 'unknown',
    service: a.dashboardSlug || '',
    summary: a.message || '',
    startsAt: a.newStateDate || null,
    labels: {},
    inhibited: false,
    silenced: false,
  }));

  return { ok: true, alerts, source: 'legacy' };
}

// ─── Dashboards ───────────────────────────────────────────────────────────────

async function getDashboards(grafanaUrl, apiKey, query = '') {
  try {
    const path = `/api/search?type=dash-db&limit=20${query ? `&query=${encodeURIComponent(query)}` : ''}`;
    const data = await grafanaFetch(grafanaUrl, apiKey, path);
    return {
      ok: true,
      dashboards: (Array.isArray(data) ? data : []).map((d) => ({
        id: d.id,
        uid: d.uid,
        title: d.title,
        url: d.url,
        tags: d.tags || [],
        folderTitle: d.folderTitle || '',
      })),
    };
  } catch (err) {
    return { ok: false, error: err.message, dashboards: [] };
  }
}

// ─── Metrics Query (PromQL via Grafana Proxy) ─────────────────────────────────

/**
 * Executa uma query PromQL via Grafana Data Source Proxy.
 * Requer datasourceId (UID do datasource Prometheus no Grafana).
 */
async function queryMetric(grafanaUrl, apiKey, datasourceUid, promQuery) {
  try {
    // API unificada de query do Grafana >= 8
    const body = {
      queries: [
        {
          refId: 'A',
          datasource: { type: 'prometheus', uid: datasourceUid },
          expr: promQuery,
          instant: true,
          range: false,
          intervalMs: 60000,
          maxDataPoints: 1,
        },
      ],
      from: 'now-5m',
      to: 'now',
    };

    const data = await grafanaFetch(grafanaUrl, apiKey, '/api/ds/query', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const results = data?.results?.A?.frames || [];
    return { ok: true, results: parseFrames(results), rawQuery: promQuery };
  } catch (err) {
    return { ok: false, error: err.message, results: [], rawQuery: promQuery };
  }
}

function parseFrames(frames) {
  return frames.map((frame) => {
    const fields = frame.schema?.fields || [];
    const data = frame.data?.values || [];
    const labelField = fields.find((f) => f.name === '__labels' || f.name === 'instance' || f.name === 'job');
    const valueField = fields.find((f) => f.type === 'number' || f.type === 'Number');

    const labels = labelField ? data[fields.indexOf(labelField)] : [];
    const values = valueField ? data[fields.indexOf(valueField)] : [];

    return {
      name: frame.schema?.name || '',
      labels: labels[0] || {},
      value: values[0] ?? null,
    };
  });
}

// ─── Service Status from `up` metric ─────────────────────────────────────────

async function getServicesUp(grafanaUrl, apiKey, datasourceUid) {
  const result = await queryMetric(grafanaUrl, apiKey, datasourceUid, 'up');
  if (!result.ok) return result;

  const services = result.results.map((r) => ({
    job: r.labels?.job || r.labels?.service || r.name || 'unknown',
    instance: r.labels?.instance || '',
    up: r.value === 1,
    value: r.value,
  }));

  return { ok: true, services };
}

// ─── Aggregate System Health ──────────────────────────────────────────────────

async function getSystemHealth(grafanaUrl, apiKey, datasourceUid, configuredPanels) {
  const [healthCheck, alertsResult, dashboardsResult] = await Promise.all([
    checkHealth(grafanaUrl, apiKey),
    getAlerts(grafanaUrl, apiKey),
    getDashboards(grafanaUrl, apiKey),
  ]);

  let servicesUp = { ok: false, services: [] };
  if (datasourceUid && healthCheck.ok) {
    servicesUp = await getServicesUp(grafanaUrl, apiKey, datasourceUid);
  }

  const alerts = alertsResult.alerts || [];
  const activeAlerts = alerts.filter((a) => a.state === 'alerting' && !a.silenced);

  // Classify overall system status
  const criticalAlerts = activeAlerts.filter((a) => ['critical', 'high', 'error'].includes(a.severity?.toLowerCase()));
  const warningAlerts = activeAlerts.filter((a) => ['warning', 'medium', 'warn'].includes(a.severity?.toLowerCase()));

  const overallStatus =
    !healthCheck.ok ? 'unreachable'
    : criticalAlerts.length > 0 ? 'critical'
    : warningAlerts.length > 0 || activeAlerts.length > 0 ? 'warning'
    : 'healthy';

  // Build domain health based on alert labels
  const domainHealth = buildDomainHealth(activeAlerts, servicesUp.services || []);

  // Build embedded panel URLs
  const panels = buildPanelUrls(grafanaUrl, configuredPanels || [], dashboardsResult.dashboards || []);

  return {
    grafana: {
      ok: healthCheck.ok,
      version: healthCheck.version,
      database: healthCheck.database,
      error: healthCheck.error,
    },
    overall: {
      status: overallStatus,
      label: STATUS_LABELS[overallStatus],
      color: STATUS_COLORS[overallStatus],
      summary: buildStatusSummary(overallStatus, alerts, servicesUp.services || []),
    },
    alerts: {
      total: alerts.length,
      active: activeAlerts.length,
      critical: criticalAlerts.length,
      warning: warningAlerts.length,
      silenced: alerts.filter((a) => a.silenced).length,
      items: activeAlerts.slice(0, 20),
    },
    services: {
      ok: servicesUp.ok,
      total: (servicesUp.services || []).length,
      up: (servicesUp.services || []).filter((s) => s.up).length,
      down: (servicesUp.services || []).filter((s) => !s.up).length,
      items: servicesUp.services || [],
    },
    domainHealth,
    panels,
    dashboards: (dashboardsResult.dashboards || []).slice(0, 10),
    fetchedAt: new Date().toISOString(),
  };
}

const STATUS_LABELS = {
  healthy: 'Saudável',
  warning: 'Atenção',
  critical: 'Crítico',
  unreachable: 'Sem conexão',
};

const STATUS_COLORS = {
  healthy: 'green',
  warning: 'yellow',
  critical: 'red',
  unreachable: 'gray',
};

function buildStatusSummary(status, alerts, services) {
  if (status === 'unreachable') return 'Não foi possível conectar ao Grafana. Verifique a URL e a API key nas configurações.';
  if (status === 'healthy') return `Todos os sistemas operando normalmente. ${services.filter((s) => s.up).length} serviço(s) ativo(s).`;
  const active = alerts.filter((a) => a.state === 'alerting' && !a.silenced);
  return `${active.length} alerta(s) ativo(s). ${services.filter((s) => !s.up).length} serviço(s) fora do ar.`;
}

function buildDomainHealth(activeAlerts, services) {
  const PRR_DOMAINS = ['Dashboards', 'Alertas', 'Runbooks', 'Logs', 'Tracing', 'Disponibilidade', 'Capacidade', 'Segurança', 'Deployment', 'Dependências'];

  const DOMAIN_KEYWORDS = {
    Dashboards: ['dashboard', 'grafana', 'panel', 'visualization'],
    Alertas: ['alert', 'alerta', 'notification', 'pagerduty', 'oncall'],
    Logs: ['log', 'loki', 'elasticsearch', 'fluent', 'logstash'],
    Tracing: ['trace', 'jaeger', 'zipkin', 'tempo', 'span', 'otel'],
    Disponibilidade: ['up', 'down', 'availability', 'uptime', 'health', 'slo', 'sli'],
    Capacidade: ['cpu', 'memory', 'disk', 'resource', 'capacity', 'quota'],
    Segurança: ['security', 'auth', 'ssl', 'tls', 'cert', 'vulnerability'],
    Deployment: ['deploy', 'pod', 'container', 'replica', 'rollout', 'version'],
    Dependências: ['dependency', 'downstream', 'upstream', 'database', 'redis', 'kafka'],
    Runbooks: ['runbook', 'incident', 'procedure'],
  };

  return PRR_DOMAINS.reduce((acc, domain) => {
    const keywords = DOMAIN_KEYWORDS[domain] || [];
    const relevantAlerts = activeAlerts.filter((a) => {
      const text = `${a.name} ${a.summary} ${JSON.stringify(a.labels)}`.toLowerCase();
      return keywords.some((kw) => text.includes(kw));
    });
    const relevantServicesDown = services.filter((s) => {
      const text = `${s.job} ${s.instance}`.toLowerCase();
      return keywords.some((kw) => text.includes(kw)) && !s.up;
    });

    const status = relevantServicesDown.length > 0 || relevantAlerts.some((a) => ['critical', 'high'].includes(a.severity?.toLowerCase())) ? 'critical'
      : relevantAlerts.length > 0 ? 'warning'
      : 'healthy';

    acc[domain] = { status, alertCount: relevantAlerts.length, serviceDownCount: relevantServicesDown.length };
    return acc;
  }, {});
}

function buildPanelUrls(grafanaUrl, configuredPanels, dashboards) {
  const base = grafanaUrl.replace(/\/$/, '');
  return configuredPanels.map((panel) => ({
    ...panel,
    embedUrl: panel.dashboardUid && panel.panelId
      ? `${base}/d-solo/${panel.dashboardUid}/${panel.slug || 'dashboard'}?orgId=${panel.orgId || 1}&panelId=${panel.panelId}&theme=light&kiosk`
      : null,
  }));
}

module.exports = {
  checkHealth,
  getAlerts,
  getDashboards,
  queryMetric,
  getServicesUp,
  getSystemHealth,
  STATUS_LABELS,
  STATUS_COLORS,
};
