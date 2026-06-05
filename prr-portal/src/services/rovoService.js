'use strict';

/**
 * Rovo Cognitive Layer
 *
 * Rovo atua como camada de suporte cognitivo ao fluxo principal.
 * Não é responsável por nenhuma decisão formal e não interfere no cálculo
 * do score ou na abertura de remediações. Atua em paralelo e nunca bloqueia o fluxo.
 *
 * Capacidades implementadas:
 * - Intent Analyzer: identifica a intenção do usuário
 * - PRR Validator: valida aderência de texto/doc contra critérios PRR
 * - Knowledge Retriever: recupera conteúdo relevante de FAQ
 * - Recommender: sugere próximas ações com base nos gaps
 * - Action Resolver: resolve ações recomendadas
 * - Executive Summary Generator: gera resumo executivo do assessment
 * - Gap Explainer: explica em linguagem natural por que um Não impacta o PRR
 */

const { getAllQuestions, getQuestionById, getDomains } = require('./prrStaticLoader');

// ─── Intent Analyzer ─────────────────────────────────────────────────────────

const INTENTS = {
  NOVO_PRR: 'novo_prr',
  VALIDAR_DOC: 'validar_doc',
  BUSCAR_FAQ: 'buscar_faq',
  VER_HISTORICO: 'ver_historico',
  CONFIGURAR: 'configurar',
};

function analyzeIntent(userInput) {
  const text = (userInput || '').toLowerCase();

  if (/valid|document|doc|exist|arquivo|verific/i.test(text)) {
    return { intent: INTENTS.VALIDAR_DOC, confidence: 0.85 };
  }
  if (/busca|pesquis|encontra|faq|artefato|template|requisito/i.test(text)) {
    return { intent: INTENTS.BUSCAR_FAQ, confidence: 0.85 };
  }
  if (/histor|anterior|passado|assessment|submiss/i.test(text)) {
    return { intent: INTENTS.VER_HISTORICO, confidence: 0.80 };
  }
  if (/configur|setting|space|confluenc/i.test(text)) {
    return { intent: INTENTS.CONFIGURAR, confidence: 0.80 };
  }
  return { intent: INTENTS.NOVO_PRR, confidence: 0.90 };
}

// ─── Knowledge Retriever ──────────────────────────────────────────────────────

function retrieveRelevantFaqs(query, faqLinks, limit = 5) {
  const questions = getAllQuestions();
  const q = (query || '').toLowerCase();

  const scored = questions
    .map((question) => {
      let score = 0;
      const text = `${question.dominio} ${question.pergunta_oficial} ${question.descricao_curta} ${question.criterio_avaliacao}`.toLowerCase();
      const words = q.split(/\s+/).filter((w) => w.length > 2);
      words.forEach((word) => {
        if (text.includes(word)) score += 1;
      });
      return { question, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map(({ question }) => ({
    question_id: question.question_id,
    dominio: question.dominio,
    titulo: question.descricao_curta,
    pergunta: question.pergunta_oficial,
    criterio: question.criterio_avaliacao,
    evidencia: question.evidencia_esperada,
    faq_url: faqLinks[question.question_id] || null,
    peso: question.peso,
    obrigatoria: question.obrigatoria,
  }));
}

// ─── PRR Validator (text/document analysis) ───────────────────────────────────

function validateTextAgainstPRR(text) {
  const questions = getAllQuestions();
  const t = (text || '').toLowerCase();
  const results = [];

  questions.forEach((q) => {
    const keywords = extractKeywords(q);
    const found = keywords.filter((kw) => t.includes(kw));
    const coverage = keywords.length > 0 ? Math.round((found.length / keywords.length) * 100) : 0;

    results.push({
      question_id: q.question_id,
      dominio: q.dominio,
      pergunta: q.pergunta_oficial,
      obrigatoria: q.obrigatoria,
      peso: q.peso,
      evidence_found: found,
      coverage_percent: coverage,
      likely_attended: coverage >= 40,
    });
  });

  const attended = results.filter((r) => r.likely_attended);
  const estimatedScore = Math.round((attended.reduce((s, r) => s + (r.peso || 1), 0) / questions.reduce((s, q) => s + (q.peso || 1), 0)) * 100);

  const domainCoverage = {};
  getDomains().forEach((domain) => {
    const dqs = results.filter((r) => r.dominio === domain);
    const dAttended = dqs.filter((r) => r.likely_attended).length;
    domainCoverage[domain] = {
      attended: dAttended,
      total: dqs.length,
      percent: dqs.length > 0 ? Math.round((dAttended / dqs.length) * 100) : 0,
    };
  });

  return {
    totalQuestions: questions.length,
    attendedCount: attended.length,
    estimatedScore,
    domainCoverage,
    results,
    gaps: results
      .filter((r) => !r.likely_attended && r.obrigatoria)
      .map((r) => ({ question_id: r.question_id, dominio: r.dominio, pergunta: r.pergunta })),
  };
}

function extractKeywords(question) {
  const allText = `${question.criterio_avaliacao} ${question.evidencia_esperada} ${question.descricao_curta}`;
  const stopwords = new Set(['que', 'para', 'com', 'uma', 'são', 'está', 'deve', 'ser', 'não', 'por', 'em', 'de', 'do', 'da', 'ou', 'e', 'a', 'o', 'os', 'as', 'no', 'na']);
  return allText
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3 && !stopwords.has(w));
}

// ─── Gap Explainer ────────────────────────────────────────────────────────────

function explainGap(questionId) {
  const q = getQuestionById(questionId);
  if (!q) return null;

  const impactDescription = getImpactDescription(q);

  return {
    question_id: q.question_id,
    dominio: q.dominio,
    pergunta: q.pergunta_oficial,
    explicacao: `A resposta "Não" para este requisito impacta negativamente a aderência do PRR no domínio **${q.dominio}**. ${impactDescription}`,
    criterio: q.criterio_avaliacao,
    evidencia_sugerida: q.evidencia_esperada,
    sugestao_proximos_passos: buildNextSteps(q),
    peso_impacto: q.peso,
    obrigatoria: q.obrigatoria,
    risco: q.obrigatoria ? 'ALTO — item obrigatório que impede go-live' : q.peso >= 3 ? 'MÉDIO — item de alto peso' : 'BAIXO — item de maturidade',
  };
}

function getImpactDescription(q) {
  const descriptions = {
    Dashboards: 'Sem visibilidade operacional, o time não consegue identificar degradações em tempo real, aumentando o MTTR em incidentes.',
    Alertas: 'Sem alertas acionáveis, falhas passam despercebidas até que o impacto ao usuário seja visível, aumentando o tempo de detecção.',
    Runbooks: 'Sem runbook atualizado, o tempo de resposta em incidentes aumenta por falta de procedimento estruturado.',
    Logs: 'Sem logs estruturados e centralizados, o diagnóstico de falhas depende de acesso direto ao ambiente, inviabilizando a operação remota.',
    Tracing: 'Sem distributed tracing, a identificação da causa raiz em arquiteturas distribuídas se torna exponencialmente mais difícil.',
    Disponibilidade: 'Sem SLO/SLI definidos ou health check, o serviço não tem baseline de disponibilidade e não pode ser gerenciado por confiabilidade.',
    Capacidade: 'Sem limites de recursos e auto-scaling, o serviço está exposto a falhas por esgotamento de recursos em picos de carga.',
    'Segurança': 'Gaps de segurança podem expor dados sensíveis ou abrir vetores de ataque, gerando riscos regulatórios e de reputação.',
    Deployment: 'Sem pipeline seguro e processo de rollback, o risco de falhas em deploy aumenta significativamente.',
    'Dependências': 'Dependências não mapeadas ou sem circuit breaker podem propagar falhas em cascata para todo o sistema.',
  };
  return descriptions[q.dominio] || 'Este requisito é essencial para a confiabilidade e operabilidade do serviço em produção.';
}

function buildNextSteps(q) {
  const steps = [
    `1. Consulte a FAQ técnica do requisito ${q.question_id} para entender o critério de avaliação.`,
    `2. Implemente ou documente: ${q.evidencia_esperada}`,
    `3. Registre a evidência e marque "Sim" no próximo PRR.`,
  ];
  if (q.obrigatoria) {
    steps.unshift('⚠ PRIORIDADE ALTA: Este item é obrigatório e deve ser resolvido antes do go-live.');
  }
  return steps;
}

// ─── Recommender ─────────────────────────────────────────────────────────────

function generateRecommendations(scoreSummary, faqLinks) {
  const { gaps, score, classification, domainScores } = scoreSummary;

  const recommendations = [];

  // High priority: mandatory gaps
  const mandatoryGaps = gaps.filter((g) => g.obrigatoria);
  if (mandatoryGaps.length > 0) {
    recommendations.push({
      tipo: 'BLOQUEANTE',
      prioridade: 1,
      titulo: `${mandatoryGaps.length} item(ns) obrigatório(s) sem atendimento`,
      descricao: 'Estes itens impedem o go-live. Resolva-os antes de prosseguir.',
      acao: 'Criar plano de remediação no Jira para todos os itens obrigatórios.',
      items: mandatoryGaps.map((g) => g.question_id),
    });
  }

  // Weakest domain
  const weakestDomain = Object.entries(domainScores)
    .filter(([, d]) => d.total > 0)
    .sort(([, a], [, b]) => a.score - b.score)[0];

  if (weakestDomain && weakestDomain[1].score < 60) {
    recommendations.push({
      tipo: 'MELHORIA',
      prioridade: 2,
      titulo: `Domínio mais crítico: ${weakestDomain[0]} (${weakestDomain[1].score}%)`,
      descricao: `O domínio ${weakestDomain[0]} apresenta o menor score. Foque aqui para maior impacto.`,
      acao: `Consulte as FAQs técnicas do domínio ${weakestDomain[0]} e implemente os requisitos faltantes.`,
      items: gaps.filter((g) => g.dominio === weakestDomain[0]).map((g) => g.question_id),
    });
  }

  // General recommendations based on score
  if (score < 50) {
    recommendations.push({
      tipo: 'PROCESSO',
      prioridade: 3,
      titulo: 'Agendar revisão técnica com o time de SRE',
      descricao: 'Score abaixo de 50% indica que o serviço precisa de suporte estruturado para atingir a maturidade mínima.',
      acao: 'Abrir chamado para o time de Platform Engineering / SRE para priorização do roadmap de confiabilidade.',
      items: [],
    });
  } else if (score >= 80) {
    recommendations.push({
      tipo: 'RECONHECIMENTO',
      prioridade: 4,
      titulo: 'Serviço aderente ao PRR — considere evoluir para maturidade avançada',
      descricao: 'Com score ≥ 80%, o serviço está pronto para produção. Considere implementar os itens opcionais restantes para aumentar a resiliência.',
      acao: 'Consulte o catálogo de boas práticas avançadas de SRE.',
      items: gaps.filter((g) => !g.obrigatoria).map((g) => g.question_id).slice(0, 5),
    });
  }

  return recommendations;
}

// ─── Executive Summary Generator ─────────────────────────────────────────────

function generateExecutiveSummary({ serviceName, owner, scoreSummary, prrVersion }) {
  const { score, classification, gaps, domainScores, answeredCount, totalQuestions, mandatoryCompliance } = scoreSummary;
  const mandatoryGaps = gaps.filter((g) => g.obrigatoria);
  const topWeakDomains = Object.entries(domainScores)
    .filter(([, d]) => d.score < 70 && d.total > 0)
    .sort(([, a], [, b]) => a.score - b.score)
    .slice(0, 3)
    .map(([name, d]) => `${name} (${d.score}%)`);

  const date = new Date().toLocaleDateString('pt-BR');

  return {
    titulo: `Resumo Executivo — PRR ${serviceName} (${date})`,
    status: classification.label,
    cor: classification.color,
    texto: buildSummaryText({
      serviceName, owner, score, classification, gaps, mandatoryGaps,
      topWeakDomains, answeredCount, totalQuestions, mandatoryCompliance, prrVersion, date,
    }),
    destaque: score >= 80
      ? `✅ ${serviceName} está aderente ao PRR com score de ${score}%.`
      : mandatoryGaps.length > 0
      ? `⚠ ${serviceName} possui ${mandatoryGaps.length} item(ns) obrigatório(s) sem atendimento — go-live bloqueado.`
      : `🔶 ${serviceName} está parcialmente aderente ao PRR (${score}%) — remediação recomendada antes do go-live.`,
  };
}

function buildSummaryText({ serviceName, owner, score, classification, gaps, mandatoryGaps, topWeakDomains, answeredCount, totalQuestions, prrVersion, date }) {
  const lines = [
    `O serviço **${serviceName}** (owner: ${owner}) passou pelo PRR de Observabilidade versão ${prrVersion} em ${date}.`,
    '',
    `**Resultado:** ${classification.label} — Score de aderência: **${score}%**`,
    `Perguntas respondidas: ${answeredCount}/${totalQuestions}`,
    '',
  ];

  if (mandatoryGaps.length > 0) {
    lines.push(`**⚠ Itens obrigatórios não atendidos (${mandatoryGaps.length}):**`);
    mandatoryGaps.slice(0, 5).forEach((g) => lines.push(`- ${g.question_id}: ${g.pergunta}`));
    if (mandatoryGaps.length > 5) lines.push(`- ... e mais ${mandatoryGaps.length - 5} itens.`);
    lines.push('');
  }

  if (topWeakDomains.length > 0) {
    lines.push(`**Domínios com maior oportunidade de melhoria:** ${topWeakDomains.join(', ')}`);
    lines.push('');
  }

  if (gaps.length === 0) {
    lines.push('✅ Todos os requisitos do PRR foram atendidos. Serviço aprovado para produção.');
  } else {
    lines.push(`Total de gaps: **${gaps.length}** (${mandatoryGaps.length} obrigatórios, ${gaps.length - mandatoryGaps.length} opcionais)`);
    lines.push('');
    lines.push('**Próximos passos:**');
    lines.push('1. Criar plano de remediação no Jira para os gaps obrigatórios.');
    lines.push('2. Agendar revisão técnica com o time de SRE para os domínios críticos.');
    lines.push('3. Realizar novo PRR após a remediação dos itens obrigatórios.');
  }

  return lines.join('\n');
}

module.exports = {
  INTENTS,
  analyzeIntent,
  retrieveRelevantFaqs,
  validateTextAgainstPRR,
  explainGap,
  generateRecommendations,
  generateExecutiveSummary,
};
