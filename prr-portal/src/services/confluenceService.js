'use strict';

const { api, route } = require('@forge/api');

/**
 * Confluence Service
 *
 * Handles all Confluence REST API interactions:
 * - FAQ Hub and per-question FAQ page creation/sync
 * - Assessment page generation from PRR submission
 * - Document validation and content extraction
 */

async function getSpaceKey() {
  const response = await api.asApp().requestConfluence(route`/wiki/rest/api/space?limit=1&type=global`);
  if (!response.ok) throw new Error(`Failed to fetch spaces: ${response.status}`);
  const data = await response.json();
  if (!data.results || data.results.length === 0) throw new Error('No Confluence space found');
  return data.results[0].key;
}

async function findPageByTitle(spaceKey, title) {
  const response = await api.asApp().requestConfluence(
    route`/wiki/rest/api/content?spaceKey=${spaceKey}&title=${encodeURIComponent(title)}&expand=version`
  );
  if (!response.ok) return null;
  const data = await response.json();
  return data.results && data.results.length > 0 ? data.results[0] : null;
}

async function createOrUpdatePage({ spaceKey, title, body, parentId }) {
  const existing = await findPageByTitle(spaceKey, title);

  if (existing) {
    const newVersion = existing.version.number + 1;
    const response = await api.asApp().requestConfluence(
      route`/wiki/rest/api/content/${existing.id}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          version: { number: newVersion },
          title,
          type: 'page',
          body: { storage: { value: body, representation: 'storage' } },
        }),
      }
    );
    if (!response.ok) throw new Error(`Failed to update page: ${response.status}`);
    return response.json();
  }

  const payload = {
    type: 'page',
    title,
    space: { key: spaceKey },
    body: { storage: { value: body, representation: 'storage' } },
  };
  if (parentId) {
    payload.ancestors = [{ id: parentId }];
  }

  const response = await api.asApp().requestConfluence(route`/wiki/rest/api/content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`Failed to create page: ${response.status}`);
  return response.json();
}

function buildFaqPageBody(question) {
  return `
<ac:structured-macro ac:name="info">
  <ac:parameter ac:name="title">Pergunta Oficial PRR ${question.question_id}</ac:parameter>
  <ac:rich-text-body>
    <p><strong>${question.pergunta_oficial}</strong></p>
    <p><em>Domínio: ${question.dominio} | Peso: ${question.peso} | Obrigatória: ${question.obrigatoria ? 'Sim' : 'Não'} | Versão PRR: ${question.versao_prr}</em></p>
  </ac:rich-text-body>
</ac:structured-macro>

<h2>Objetivo do Requisito</h2>
<p>${question.descricao_curta}</p>

<h2>Explicação Técnica</h2>
<p>${question.criterio_avaliacao}</p>

<h2>Por que isso importa</h2>
<p>Este requisito é parte do processo de Production Readiness Review (PRR) para o domínio <strong>${question.dominio}</strong>.
Garantir a conformidade com este item reduz riscos operacionais e aumenta a confiabilidade do serviço em produção.</p>

<h2>Como Validar</h2>
<p>${question.criterio_avaliacao}</p>

<h2>Evidências Aceitas</h2>
<p>${question.evidencia_esperada}</p>

<h2>Exemplos de Atendimento</h2>
<ac:structured-macro ac:name="tip">
  <ac:rich-text-body>
    <p>Consulte o time de SRE ou o owner do domínio <strong>${question.dominio}</strong> para exemplos de implementações aprovadas no PRR.</p>
  </ac:rich-text-body>
</ac:structured-macro>

<h2>Erros Comuns</h2>
<ul>
  <li>Não manter a documentação atualizada após mudanças de arquitetura.</li>
  <li>Apontar evidências que não correspondem ao ambiente de produção.</li>
  <li>Confundir o requisito com itens de outros domínios do PRR.</li>
</ul>

<h2>Dependências</h2>
<p>Verifique se as dependências relacionadas ao domínio <strong>${question.dominio}</strong> estão atendidas antes de marcar este item como concluído.</p>

<h2>Links Relacionados e Artefatos Recomendados</h2>
<ul>
  <li><a href="#">Hub de FAQ do PRR</a></li>
  <li><a href="#">Catálogo de Serviços</a></li>
  <li><a href="#">Template de Runbook</a></li>
</ul>

<h2>Owner do Requisito</h2>
<p>Time de Platform Engineering / SRE</p>

<h2>Versão do Requisito</h2>
<p>${question.versao_prr} — Revisar a cada novo release do PRR.</p>

<ac:structured-macro ac:name="note">
  <ac:parameter ac:name="title">Atualização desta FAQ</ac:parameter>
  <ac:rich-text-body>
    <p>Esta página é gerada e sincronizada automaticamente pelo Portal PRR de Observabilidade.
    Alterações manuais podem ser sobrescritas na próxima sincronização.</p>
  </ac:rich-text-body>
</ac:structured-macro>
`;
}

async function syncFaqHub(questions, spaceKey) {
  const hubTitle = 'FAQ Hub — PRR de Observabilidade';
  const hubBody = buildFaqHubBody(questions);
  const hub = await createOrUpdatePage({ spaceKey, title: hubTitle, body: hubBody });
  const hubId = hub.id;

  const domains = [...new Set(questions.map((q) => q.dominio))].sort();
  const domainPages = {};

  for (const domain of domains) {
    const domainTitle = `PRR FAQ — Domínio: ${domain}`;
    const domainQuestions = questions.filter((q) => q.dominio === domain);
    const domainBody = buildDomainPageBody(domain, domainQuestions);
    const domainPage = await createOrUpdatePage({ spaceKey, title: domainTitle, body: domainBody, parentId: hubId });
    domainPages[domain] = domainPage.id;
  }

  const faqLinks = {};
  for (const question of questions) {
    const faqTitle = `PRR FAQ — ${question.question_id}: ${question.descricao_curta}`;
    const faqBody = buildFaqPageBody(question);
    const parentId = domainPages[question.dominio] || hubId;
    const faqPage = await createOrUpdatePage({ spaceKey, title: faqTitle, body: faqBody, parentId });
    faqLinks[question.question_id] = `/wiki/spaces/${spaceKey}/pages/${faqPage.id}`;
  }

  return { hubId, domainPages, faqLinks };
}

function buildFaqHubBody(questions) {
  const domains = [...new Set(questions.map((q) => q.dominio))].sort();
  const domainList = domains.map((d) => `<li><strong>${d}</strong> — ${questions.filter((q) => q.dominio === d).length} requisitos</li>`).join('\n');

  return `
<ac:structured-macro ac:name="info">
  <ac:parameter ac:name="title">Portal PRR de Observabilidade — FAQ Hub</ac:parameter>
  <ac:rich-text-body>
    <p>Este hub centraliza toda a documentação técnica das <strong>${questions.length} perguntas oficiais do PRR</strong>.
    Cada domínio possui uma subpágina dedicada com FAQ técnica por requisito.</p>
  </ac:rich-text-body>
</ac:structured-macro>

<h2>Domínios do PRR</h2>
<ul>
${domainList}
</ul>

<h2>Como usar este Hub</h2>
<ol>
  <li>Acesse o Portal PRR no Jira Cloud para iniciar um assessment.</li>
  <li>Para cada pergunta do formulário, clique em "Ver FAQ" para abrir a página técnica correspondente.</li>
  <li>Use os critérios de avaliação e evidências aceitas para validar o atendimento do requisito.</li>
  <li>Registre a evidência antes de marcar "Sim" no formulário.</li>
</ol>
`;
}

function buildDomainPageBody(domain, questions) {
  const questionList = questions
    .map(
      (q) => `
<tr>
  <td>${q.question_id}</td>
  <td>${q.pergunta_oficial}</td>
  <td>${q.peso}</td>
  <td>${q.obrigatoria ? '✅ Sim' : 'Não'}</td>
</tr>`
    )
    .join('\n');

  return `
<h1>Domínio: ${domain}</h1>
<p>Este domínio contém <strong>${questions.length} requisitos</strong> do PRR de Observabilidade.</p>

<table>
  <thead>
    <tr>
      <th>ID</th>
      <th>Pergunta Oficial</th>
      <th>Peso</th>
      <th>Obrigatória</th>
    </tr>
  </thead>
  <tbody>
    ${questionList}
  </tbody>
</table>
`;
}

async function generateAssessmentPage({ spaceKey, serviceName, owner, version, scoreSummary, answers }) {
  const title = `PRR Assessment — ${serviceName} (${new Date().toISOString().split('T')[0]})`;
  const body = buildAssessmentPageBody({ serviceName, owner, version, scoreSummary, answers });
  return createOrUpdatePage({ spaceKey, title, body });
}

function buildAssessmentPageBody({ serviceName, owner, version, scoreSummary }) {
  const { score, classification, domainScores, gaps, answeredCount, totalQuestions } = scoreSummary;
  const statusColor = classification.color === 'green' ? 'Green' : classification.color === 'yellow' ? 'Yellow' : 'Red';

  const domainTable = Object.entries(domainScores)
    .map(
      ([domain, data]) =>
        `<tr><td>${domain}</td><td>${data.score}%</td><td>${data.answered}/${data.total}</td></tr>`
    )
    .join('\n');

  const gapList = gaps
    .slice(0, 20)
    .map(
      (g) =>
        `<tr>
          <td>${g.question_id}</td>
          <td>${g.dominio}</td>
          <td>${g.pergunta}</td>
          <td>${g.obrigatoria ? '⚠️ Obrigatória' : 'Opcional'}</td>
          <td>${g.peso}</td>
        </tr>`
    )
    .join('\n');

  return `
<ac:structured-macro ac:name="status">
  <ac:parameter ac:name="colour">${statusColor}</ac:parameter>
  <ac:parameter ac:name="title">${classification.label}</ac:parameter>
</ac:structured-macro>

<h1>PRR Assessment: ${serviceName}</h1>
<p><strong>Owner:</strong> ${owner} | <strong>Versão PRR:</strong> ${version} | <strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>

<h2>Resultado Geral</h2>
<ac:structured-macro ac:name="panel">
  <ac:parameter ac:name="title">Score de Aderência</ac:parameter>
  <ac:rich-text-body>
    <p><strong>Score: ${score}%</strong> — ${classification.label}</p>
    <p>${classification.description}</p>
    <p>${answeredCount}/${totalQuestions} perguntas respondidas.</p>
  </ac:rich-text-body>
</ac:structured-macro>

<h2>Score por Domínio</h2>
<table>
  <thead><tr><th>Domínio</th><th>Score</th><th>Respondidas</th></tr></thead>
  <tbody>${domainTable}</tbody>
</table>

<h2>Gaps Identificados (${gaps.length})</h2>
${
  gaps.length === 0
    ? '<p>✅ Nenhum gap identificado. Serviço totalmente aderente ao PRR.</p>'
    : `<table>
  <thead><tr><th>ID</th><th>Domínio</th><th>Pergunta</th><th>Obrigatoriedade</th><th>Peso</th></tr></thead>
  <tbody>${gapList}</tbody>
</table>`
}

<h2>Próximos Passos</h2>
<ol>
  <li>Criar issues de remediação no Jira para os gaps obrigatórios.</li>
  <li>Consultar a FAQ técnica de cada pergunta com gap para orientação de implementação.</li>
  <li>Reagendar novo PRR após a remediação dos gaps críticos.</li>
</ol>

<ac:structured-macro ac:name="note">
  <ac:parameter ac:name="title">Gerado pelo Portal PRR de Observabilidade</ac:parameter>
  <ac:rich-text-body>
    <p>Este documento foi gerado automaticamente pelo Portal PRR. Não edite manualmente os dados de score e gaps.</p>
  </ac:rich-text-body>
</ac:structured-macro>
`;
}

module.exports = {
  syncFaqHub,
  generateAssessmentPage,
  findPageByTitle,
  createOrUpdatePage,
  buildFaqPageBody,
};
