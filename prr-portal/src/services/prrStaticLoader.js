'use strict';

const prrData = require('../../data/prr-questions.json');

/**
 * PRR Static Model Loader
 *
 * Loads the official PRR questionnaire from the static data file,
 * acting as the authoritative source of truth for questions, weights,
 * and domain groupings. Never mutates the base catalog.
 */

function getAllQuestions() {
  return prrData.perguntas.filter((q) => q.ativa);
}

function getQuestionById(questionId) {
  return prrData.perguntas.find((q) => q.question_id === questionId) || null;
}

function getQuestionsByDomain(dominio) {
  return getAllQuestions().filter((q) => q.dominio === dominio);
}

function getDomains() {
  const domains = [...new Set(getAllQuestions().map((q) => q.dominio))];
  return domains.sort();
}

function getMandatoryQuestions() {
  return getAllQuestions().filter((q) => q.obrigatoria);
}

function getPRRVersion() {
  return prrData.versao_prr;
}

function getTotalWeight() {
  return getAllQuestions().reduce((sum, q) => sum + (q.peso || 1), 0);
}

function getDomainWeights() {
  const domains = getDomains();
  return domains.reduce((acc, domain) => {
    const qs = getQuestionsByDomain(domain);
    acc[domain] = qs.reduce((sum, q) => sum + (q.peso || 1), 0);
    return acc;
  }, {});
}

module.exports = {
  getAllQuestions,
  getQuestionById,
  getQuestionsByDomain,
  getDomains,
  getMandatoryQuestions,
  getPRRVersion,
  getTotalWeight,
  getDomainWeights,
};
