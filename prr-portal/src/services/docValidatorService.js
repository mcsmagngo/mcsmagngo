'use strict';

const { api, route } = require('@forge/api');
const { validateTextAgainstPRR } = require('./rovoService');

/**
 * Doc Validator Service
 *
 * Valida documentos Confluence existentes contra os critérios do PRR.
 * Extrai o conteúdo textual da página, executa o PRR Validator do Rovo
 * e retorna resultado estruturado de compliance com gaps identificados.
 */

async function fetchConfluencePageContent(pageUrl) {
  // Extrai o ID da página da URL (suporta /pages/PAGEID/ e ?pageId=PAGEID)
  const idMatch = pageUrl.match(/\/pages\/(\d+)/) || pageUrl.match(/pageId=(\d+)/);
  if (!idMatch) throw new Error('URL de página Confluence inválida. Use o formato: /wiki/spaces/SPACE/pages/PAGEID');

  const pageId = idMatch[1];
  const response = await api.asApp().requestConfluence(
    route`/wiki/rest/api/content/${pageId}?expand=body.storage,version,space`
  );
  if (!response.ok) throw new Error(`Página não encontrada ou sem permissão de acesso (status ${response.status}).`);

  const data = await response.json();
  const rawHtml = data.body?.storage?.value || '';
  const plainText = stripHtml(rawHtml);

  return {
    pageId,
    title: data.title,
    spaceKey: data.space?.key,
    version: data.version?.number,
    lastUpdated: data.version?.when,
    textContent: plainText,
    wordCount: plainText.split(/\s+/).length,
  };
}

function stripHtml(html) {
  return html
    .replace(/<ac:structured-macro[^>]*>[\s\S]*?<\/ac:structured-macro>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function validateDocument({ pageUrl }) {
  const pageContent = await fetchConfluencePageContent(pageUrl);
  const validationResult = validateTextAgainstPRR(pageContent.textContent);

  // Enriquecer com metadados do documento
  const attended = validationResult.results.filter((r) => r.likely_attended);
  const notAttended = validationResult.results.filter((r) => !r.likely_attended);

  return {
    document: {
      title: pageContent.title,
      pageId: pageContent.pageId,
      spaceKey: pageContent.spaceKey,
      version: pageContent.version,
      lastUpdated: pageContent.lastUpdated,
      wordCount: pageContent.wordCount,
      url: pageUrl,
    },
    validation: {
      estimatedScore: validationResult.estimatedScore,
      attendedCount: attended.length,
      notAttendedCount: notAttended.length,
      totalQuestions: validationResult.totalQuestions,
      classification: classifyDocScore(validationResult.estimatedScore),
      domainCoverage: validationResult.domainCoverage,
      mandatoryGaps: validationResult.gaps,
    },
    details: validationResult.results,
    recommendation: buildDocRecommendation(validationResult),
  };
}

function classifyDocScore(score) {
  if (score >= 70) return { label: 'Documento bem alinhado ao PRR', color: 'green', status: 'ALIGNED' };
  if (score >= 40) return { label: 'Documento parcialmente alinhado ao PRR', color: 'yellow', status: 'PARTIAL' };
  return { label: 'Documento com baixa cobertura do PRR', color: 'red', status: 'LOW_COVERAGE' };
}

function buildDocRecommendation(validationResult) {
  const { estimatedScore, gaps } = validationResult;
  if (estimatedScore >= 70) {
    return 'O documento apresenta boa cobertura dos requisitos PRR. Complemente com o preenchimento do formulário Sim/Não para um assessment formal.';
  }
  if (gaps.length > 0) {
    return `O documento não cobre ${gaps.length} requisito(s) obrigatório(s) do PRR. Recomenda-se complementar o documento ou usar o formulário Sim/Não para um assessment completo.`;
  }
  return 'O documento tem cobertura parcial dos requisitos PRR. Use o formulário Sim/Não para um assessment formal e completo.';
}

module.exports = {
  validateDocument,
  fetchConfluencePageContent,
};
