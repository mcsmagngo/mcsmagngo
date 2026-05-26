import React from 'react';

const WEIGHT_CLASS = { 1: '', 2: 'medium', 3: 'high' };

function getDomainColor(domain) {
  const colors = {
    Dashboards: '#0052cc',
    Alertas: '#ff5630',
    Runbooks: '#36b37e',
    Logs: '#6554c0',
    Tracing: '#00b8d9',
    Disponibilidade: '#ff8b00',
    Capacidade: '#57d9a3',
    'Segurança': '#ff7452',
    Deployment: '#998dd9',
    'Dependências': '#79e2f2',
  };
  return colors[domain] || '#97a0af';
}

export default function QuestionRow({ question, answer, onAnswer, onFaqClick }) {
  const rowClass = [
    answer === 'sim' ? 'answered-sim' : '',
    answer === 'nao' ? 'answered-nao' : '',
    question.obrigatoria && !answer ? 'mandatory-unanswered' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const domainColor = getDomainColor(question.dominio);

  return (
    <tr className={rowClass}>
      <td className="col-id">
        <span className="question-id">{question.question_id}</span>
      </td>
      <td className="col-domain">
        <span
          className="domain-tag"
          style={{ background: domainColor + '22', color: domainColor, borderColor: domainColor + '44' }}
        >
          {question.dominio}
        </span>
      </td>
      <td className="col-question">
        <span className="question-text">{question.pergunta_oficial}</span>
      </td>
      <td className="col-faq">
        <button
          className={`faq-link ${!question.link_faq_confluence ? 'no-link' : ''}`}
          onClick={() => question.link_faq_confluence && onFaqClick(question)}
          title={question.link_faq_confluence ? 'Ver FAQ técnica' : 'FAQ não disponível'}
          disabled={!question.link_faq_confluence}
        >
          FAQ
        </button>
      </td>
      <td className="col-weight">
        <span className={`weight-badge ${WEIGHT_CLASS[question.peso] || ''}`}>{question.peso}</span>
      </td>
      <td className="col-mandatory">
        {question.obrigatoria && <span className="mandatory-badge">⚠ Obr.</span>}
      </td>
      <td className="col-answer">
        <div className="answer-group">
          <button
            className={`answer-btn sim ${answer === 'sim' ? 'selected' : ''}`}
            onClick={() => onAnswer(question.question_id, 'sim')}
          >
            Sim
          </button>
          <button
            className={`answer-btn nao ${answer === 'nao' ? 'selected' : ''}`}
            onClick={() => onAnswer(question.question_id, 'nao')}
          >
            Não
          </button>
        </div>
      </td>
    </tr>
  );
}
