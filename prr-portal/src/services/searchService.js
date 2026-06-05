'use strict';

const { getAllQuestions, getDomains } = require('./prrStaticLoader');
const { retrieveRelevantFaqs } = require('./rovoService');

/**
 * Search Service
 *
 * Busca inteligente de requisitos PRR, FAQs técnicas e artefatos.
 * Combina busca por texto livre, filtro por domínio e sugestão de artefatos.
 */

const ARTIFACT_CATALOG = [
  {
    id: 'tpl-runbook-001',
    tipo: 'template',
    titulo: 'Template de Runbook de Incidente',
    descricao: 'Template padrão para documentação de runbooks com estrutura de sintoma, diagnóstico, remediação e escalation.',
    dominios: ['Runbooks', 'Disponibilidade'],
    tags: ['runbook', 'incidente', 'on-call', 'operação'],
    url: '',
  },
  {
    id: 'tpl-dashboard-001',
    tipo: 'template',
    titulo: 'Template de Dashboard Operacional',
    descricao: 'Template Grafana/Datadog com painéis RED (Rate, Errors, Duration) pré-configurados.',
    dominios: ['Dashboards'],
    tags: ['dashboard', 'grafana', 'datadog', 'RED', 'métricas'],
    url: '',
  },
  {
    id: 'tpl-slo-001',
    tipo: 'template',
    titulo: 'Template de Documento de SLO',
    descricao: 'Template para definição de SLO com targets de disponibilidade, latência e taxa de erros.',
    dominios: ['Disponibilidade'],
    tags: ['SLO', 'SLI', 'confiabilidade', 'availability'],
    url: '',
  },
  {
    id: 'tpl-postmortem-001',
    tipo: 'template',
    titulo: 'Template de Post-mortem Blameless',
    descricao: 'Template de post-mortem com estrutura de linha do tempo, análise de causa raiz e action items.',
    dominios: ['Disponibilidade', 'Deployment'],
    tags: ['post-mortem', 'incidente', 'RCA', 'blameless'],
    url: '',
  },
  {
    id: 'tpl-alert-rules-001',
    tipo: 'template',
    titulo: 'Regras de Alerta Padrão',
    descricao: 'Conjunto de regras de alerta padrão para serviços HTTP com thresholds recomendados.',
    dominios: ['Alertas'],
    tags: ['alertas', 'prometheus', 'alertmanager', 'regras'],
    url: '',
  },
  {
    id: 'tpl-oncall-001',
    tipo: 'template',
    titulo: 'Template de Escala de On-Call',
    descricao: 'Template para definição de escala de on-call com procedimentos de handoff e contatos.',
    dominios: ['Disponibilidade'],
    tags: ['on-call', 'escala', 'handoff', 'PagerDuty'],
    url: '',
  },
  {
    id: 'tpl-architecture-001',
    tipo: 'template',
    titulo: 'Template de Documento de Arquitetura',
    descricao: 'Template C4 para documentação de arquitetura com diagrama de contexto, containers e componentes.',
    dominios: ['Disponibilidade', 'Dependências'],
    tags: ['arquitetura', 'C4', 'diagrama', 'dependências'],
    url: '',
  },
  {
    id: 'guia-structured-logging',
    tipo: 'guia',
    titulo: 'Guia de Structured Logging',
    descricao: 'Guia prático de implementação de logs estruturados em JSON com campos obrigatórios e exemplos por linguagem.',
    dominios: ['Logs'],
    tags: ['logs', 'json', 'structured', 'winston', 'logback'],
    url: '',
  },
  {
    id: 'guia-distributed-tracing',
    tipo: 'guia',
    titulo: 'Guia de Distributed Tracing',
    descricao: 'Guia de instrumentação OpenTelemetry com exemplos de propagação de trace context.',
    dominios: ['Tracing'],
    tags: ['tracing', 'opentelemetry', 'jaeger', 'span', 'trace'],
    url: '',
  },
  {
    id: 'guia-circuit-breaker',
    tipo: 'guia',
    titulo: 'Guia de Circuit Breaker',
    descricao: 'Guia de implementação de circuit breaker com Resilience4j, Hystrix e exemplos de fallback.',
    dominios: ['Dependências'],
    tags: ['circuit-breaker', 'resiliência', 'fallback', 'resilience4j'],
    url: '',
  },
  {
    id: 'guia-health-check',
    tipo: 'guia',
    titulo: 'Guia de Health Check Endpoints',
    descricao: 'Padrões para implementação de /health, /ready e /live com critérios de liveness e readiness.',
    dominios: ['Disponibilidade'],
    tags: ['health-check', 'liveness', 'readiness', 'kubernetes'],
    url: '',
  },
  {
    id: 'guia-deployment-safety',
    tipo: 'guia',
    titulo: 'Guia de Deploy Seguro',
    descricao: 'Práticas de blue-green, canary e rolling update com exemplos de configuração.',
    dominios: ['Deployment'],
    tags: ['blue-green', 'canary', 'rolling-update', 'zero-downtime'],
    url: '',
  },
];

function searchAll({ query, domain, type, limit = 20 }) {
  const q = (query || '').toLowerCase().trim();
  const results = {
    faqs: [],
    artifacts: [],
    requirements: [],
  };

  // Search requirements
  const allQuestions = getAllQuestions();
  const filteredQuestions = allQuestions.filter((question) => {
    const domainMatch = !domain || question.dominio === domain;
    const textMatch =
      !q ||
      question.pergunta_oficial.toLowerCase().includes(q) ||
      question.descricao_curta.toLowerCase().includes(q) ||
      question.dominio.toLowerCase().includes(q) ||
      question.criterio_avaliacao.toLowerCase().includes(q);
    return domainMatch && textMatch;
  });

  results.requirements = filteredQuestions.slice(0, limit).map((q) => ({
    question_id: q.question_id,
    dominio: q.dominio,
    titulo: q.descricao_curta,
    pergunta: q.pergunta_oficial,
    criterio: q.criterio_avaliacao,
    evidencia: q.evidencia_esperada,
    peso: q.peso,
    obrigatoria: q.obrigatoria,
    faq_url: q.link_faq_confluence || null,
  }));

  // Search artifacts
  const filteredArtifacts = ARTIFACT_CATALOG.filter((artifact) => {
    const domainMatch = !domain || artifact.dominios.includes(domain);
    const typeMatch = !type || artifact.tipo === type;
    const textMatch =
      !q ||
      artifact.titulo.toLowerCase().includes(q) ||
      artifact.descricao.toLowerCase().includes(q) ||
      artifact.tags.some((tag) => tag.toLowerCase().includes(q)) ||
      artifact.dominios.some((d) => d.toLowerCase().includes(q));
    return domainMatch && typeMatch && textMatch;
  });

  results.artifacts = filteredArtifacts.slice(0, limit);

  // Smart FAQ suggestions using rovoService Knowledge Retriever
  if (q) {
    results.faqs = retrieveRelevantFaqs(q, {}, limit);
  }

  return {
    query,
    domain: domain || null,
    type: type || null,
    counts: {
      requirements: results.requirements.length,
      artifacts: results.artifacts.length,
      faqs: results.faqs.length,
    },
    results,
    domains: getDomains(),
    artifactTypes: [...new Set(ARTIFACT_CATALOG.map((a) => a.tipo))],
  };
}

function getArtifactsByDomain(domain) {
  return ARTIFACT_CATALOG.filter((a) => a.dominios.includes(domain));
}

function getArtifactById(id) {
  return ARTIFACT_CATALOG.find((a) => a.id === id) || null;
}

module.exports = {
  searchAll,
  getArtifactsByDomain,
  getArtifactById,
  ARTIFACT_CATALOG,
};
