'use strict';

const { api, route } = require('@forge/api');

/**
 * Jira Service
 *
 * Handles Jira REST API interactions:
 * - Creating remediation issues for PRR gaps
 * - Linking assessment pages to Jira items
 * - Fetching project metadata
 */

async function getCurrentProject(context) {
  return context?.extension?.project?.key || null;
}

async function createRemediationIssue({ projectKey, gap, serviceName, assessmentId }) {
  const summary = `[PRR] Remediar gap: ${gap.question_id} — ${gap.dominio}`;
  const description = buildRemediationDescription(gap, serviceName, assessmentId);

  const payload = {
    fields: {
      project: { key: projectKey },
      summary,
      description: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: description }],
          },
        ],
      },
      issuetype: { name: 'Task' },
      labels: ['prr-gap', `prr-domain-${gap.dominio.toLowerCase().replace(/\s+/g, '-')}`, gap.obrigatoria ? 'prr-mandatory' : 'prr-optional'],
      priority: { name: gap.obrigatoria ? 'High' : 'Medium' },
    },
  };

  const response = await api.asApp().requestJira(route`/rest/api/3/issue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Failed to create Jira issue: ${response.status} — ${err}`);
  }

  return response.json();
}

async function createRemediationPlan({ projectKey, serviceName, owner, scoreSummary, assessmentId }) {
  const { gaps } = scoreSummary;
  const mandatory = gaps.filter((g) => g.obrigatoria);
  const optional = gaps.filter((g) => !g.obrigatoria);

  const epicKey = await createRemediationEpic({ projectKey, serviceName, scoreSummary, assessmentId });

  const createdIssues = [];
  for (const gap of [...mandatory, ...optional]) {
    try {
      const issue = await createRemediationIssue({ projectKey, gap, serviceName, assessmentId });
      if (epicKey) {
        await linkIssueToEpic(issue.key, epicKey, projectKey);
      }
      createdIssues.push({ gapId: gap.question_id, issueKey: issue.key, url: issue.self });
    } catch (err) {
      createdIssues.push({ gapId: gap.question_id, error: err.message });
    }
  }

  return { epicKey, issues: createdIssues };
}

async function createRemediationEpic({ projectKey, serviceName, scoreSummary, assessmentId }) {
  const { score, classification, gaps } = scoreSummary;
  const summary = `[PRR Epic] Remediação PRR — ${serviceName} (Score: ${score}%)`;

  const payload = {
    fields: {
      project: { key: projectKey },
      summary,
      description: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: `Epic de remediação do PRR para ${serviceName}. Score atual: ${score}% (${classification.label}). ${gaps.length} gaps identificados, sendo ${gaps.filter((g) => g.obrigatoria).length} obrigatórios. Assessment ID: ${assessmentId || 'N/A'}.`,
              },
            ],
          },
        ],
      },
      issuetype: { name: 'Epic' },
      labels: ['prr-remediation', 'prr-epic'],
      priority: { name: classification.status === 'NAO_ADERENTE' ? 'Critical' : 'High' },
    },
  };

  try {
    const response = await api.asApp().requestJira(route`/rest/api/3/issue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.key;
  } catch {
    return null;
  }
}

async function linkIssueToEpic(issueKey, epicKey, projectKey) {
  try {
    await api.asApp().requestJira(route`/rest/api/3/issueLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: { name: 'Epic-Story Link' },
        inwardIssue: { key: issueKey },
        outwardIssue: { key: epicKey },
      }),
    });
  } catch {
    // Epic-Story link may not be available in all Jira configurations; skip silently
  }
}

function buildRemediationDescription(gap, serviceName, assessmentId) {
  return `PRR Gap Remediation Task

Serviço: ${serviceName}
Assessment ID: ${assessmentId || 'N/A'}

Pergunta PRR: ${gap.question_id}
Domínio: ${gap.dominio}
Obrigatória: ${gap.obrigatoria ? 'Sim' : 'Não'}
Peso: ${gap.peso}

Pergunta Oficial:
${gap.pergunta}

Critério de Avaliação:
${gap.criterio}

Evidência Esperada:
${gap.evidencia_esperada}

${gap.link_faq ? `FAQ Técnica: ${gap.link_faq}` : ''}

Instruções:
1. Consultar a FAQ técnica correspondente para orientação de implementação.
2. Implementar ou documentar a evidência esperada.
3. Registrar a evidência como comentário nesta issue antes de fechar.
4. Reagendar o PRR após a remediação.`;
}

async function addCommentToIssue(issueKey, comment) {
  const response = await api.asApp().requestJira(route`/rest/api/3/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      body: {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: comment }],
          },
        ],
      },
    }),
  });
  if (!response.ok) throw new Error(`Failed to add comment: ${response.status}`);
  return response.json();
}

module.exports = {
  getCurrentProject,
  createRemediationIssue,
  createRemediationPlan,
  addCommentToIssue,
};
