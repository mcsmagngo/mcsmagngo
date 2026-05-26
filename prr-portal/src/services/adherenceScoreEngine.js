'use strict';

const { getAllQuestions, getDomains, getQuestionsByDomain, getMandatoryQuestions } = require('./prrStaticLoader');

/**
 * Adherence Score Engine
 *
 * Calculates the PRR adherence score using weighted formula:
 *   Score = Σ(answer × weight) / Σ(weights) × 100
 *
 * Also computes per-domain scores and classifies the overall result
 * according to governance thresholds.
 */

const CLASSIFICATION_THRESHOLDS = {
  ADERENTE: 80,
  PARCIALMENTE_ADERENTE: 50,
};

function calculateOverallScore(answers) {
  const questions = getAllQuestions();
  let weightedSum = 0;
  let totalWeight = 0;

  questions.forEach((q) => {
    const weight = q.peso || 1;
    totalWeight += weight;
    if (answers[q.question_id] === 'sim') {
      weightedSum += weight;
    }
  });

  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 100);
}

function calculateDomainScores(answers) {
  const domains = getDomains();
  return domains.reduce((acc, domain) => {
    const domainQuestions = getQuestionsByDomain(domain);
    let weightedSum = 0;
    let totalWeight = 0;

    domainQuestions.forEach((q) => {
      const weight = q.peso || 1;
      totalWeight += weight;
      if (answers[q.question_id] === 'sim') {
        weightedSum += weight;
      }
    });

    acc[domain] = {
      score: totalWeight > 0 ? Math.round((weightedSum / totalWeight) * 100) : 0,
      answered: domainQuestions.filter((q) => answers[q.question_id] !== undefined).length,
      total: domainQuestions.length,
    };
    return acc;
  }, {});
}

function classifyScore(score) {
  if (score >= CLASSIFICATION_THRESHOLDS.ADERENTE) {
    return {
      status: 'ADERENTE',
      label: 'Aderente',
      color: 'green',
      description: 'Serviço atende aos requisitos mínimos do PRR.',
    };
  }
  if (score >= CLASSIFICATION_THRESHOLDS.PARCIALMENTE_ADERENTE) {
    return {
      status: 'PARCIALMENTE_ADERENTE',
      label: 'Parcialmente Aderente',
      color: 'yellow',
      description: 'Serviço apresenta gaps que devem ser remediados antes do go-live.',
    };
  }
  return {
    status: 'NAO_ADERENTE',
    label: 'Não Aderente',
    color: 'red',
    description: 'Serviço possui gaps críticos que impedem o go-live seguro.',
  };
}

function identifyGaps(answers) {
  const questions = getAllQuestions();
  const gaps = [];

  questions.forEach((q) => {
    if (answers[q.question_id] === 'nao' || answers[q.question_id] === undefined) {
      gaps.push({
        question_id: q.question_id,
        dominio: q.dominio,
        pergunta: q.pergunta_oficial,
        obrigatoria: q.obrigatoria,
        peso: q.peso,
        criterio: q.criterio_avaliacao,
        evidencia_esperada: q.evidencia_esperada,
        link_faq: q.link_faq_confluence,
        unanswered: answers[q.question_id] === undefined,
      });
    }
  });

  return gaps.sort((a, b) => {
    if (a.obrigatoria !== b.obrigatoria) return a.obrigatoria ? -1 : 1;
    return b.peso - a.peso;
  });
}

function checkMandatoryCompliance(answers) {
  const mandatory = getMandatoryQuestions();
  const failed = mandatory.filter((q) => answers[q.question_id] !== 'sim');
  return {
    compliant: failed.length === 0,
    totalMandatory: mandatory.length,
    failedMandatory: failed.length,
    failedItems: failed.map((q) => ({
      question_id: q.question_id,
      dominio: q.dominio,
      pergunta: q.pergunta_oficial,
    })),
  };
}

function buildScoreSummary(answers) {
  const overallScore = calculateOverallScore(answers);
  const domainScores = calculateDomainScores(answers);
  const classification = classifyScore(overallScore);
  const gaps = identifyGaps(answers);
  const mandatoryCompliance = checkMandatoryCompliance(answers);
  const questions = getAllQuestions();
  const answeredCount = questions.filter((q) => answers[q.question_id] !== undefined).length;

  return {
    score: overallScore,
    classification,
    answeredCount,
    totalQuestions: questions.length,
    progress: Math.round((answeredCount / questions.length) * 100),
    domainScores,
    gaps,
    mandatoryCompliance,
    simCount: Object.values(answers).filter((v) => v === 'sim').length,
    naoCount: Object.values(answers).filter((v) => v === 'nao').length,
  };
}

module.exports = {
  calculateOverallScore,
  calculateDomainScores,
  classifyScore,
  identifyGaps,
  checkMandatoryCompliance,
  buildScoreSummary,
  CLASSIFICATION_THRESHOLDS,
};
