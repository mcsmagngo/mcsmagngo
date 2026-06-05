import React, { useState } from 'react';
import { invoke } from '@forge/bridge';

const OPTIONS = [
  {
    id: 'novo_prr',
    icon: '📋',
    titulo: 'Novo PRR',
    descricao: 'Preencha o formulário oficial Sim/Não com as 42 perguntas do PRR e calcule a aderência do seu serviço.',
    cta: 'Iniciar PRR',
    cor: '#0052cc',
    corFundo: '#deebff',
    destaque: true,
  },
  {
    id: 'validar_doc',
    icon: '🔍',
    titulo: 'Validar Documento',
    descricao: 'Valide um documento Confluence existente contra os critérios do PRR. Cole a URL e receba uma análise de cobertura.',
    cta: 'Validar Documento',
    cor: '#6554c0',
    corFundo: '#f3f0ff',
    destaque: false,
  },
  {
    id: 'buscar_faq',
    icon: '🔎',
    titulo: 'Buscar Requisitos e Artefatos',
    descricao: 'Pesquise requisitos do PRR, FAQs técnicas por domínio e artefatos como templates, guias e runbooks.',
    cta: 'Buscar',
    cor: '#00875a',
    corFundo: '#e3fcef',
    destaque: false,
  },
  {
    id: 'historico',
    icon: '📊',
    titulo: 'Histórico de Assessments',
    descricao: 'Consulte assessments anteriores, compare scores e acompanhe a evolução de aderência dos serviços ao longo do tempo.',
    cta: 'Ver Histórico',
    cor: '#ff8b00',
    corFundo: '#fff4e5',
    destaque: false,
  },
];

export default function WelcomeScreen({ onSelect, prrVersion }) {
  const [analyzingInput, setAnalyzingInput] = useState('');
  const [analyzing, setAnalyzing] = useState(false);

  const handleSmartSearch = async () => {
    if (!analyzingInput.trim()) return;
    setAnalyzing(true);
    try {
      const result = await invoke('rovoAnalyzeIntent', { userInput: analyzingInput });
      const intentMap = {
        novo_prr: 'novo_prr',
        validar_doc: 'validar_doc',
        buscar_faq: 'buscar_faq',
        ver_historico: 'historico',
        configurar: 'configurar',
      };
      onSelect(intentMap[result.intent] || 'novo_prr', analyzingInput);
    } catch {
      onSelect('buscar_faq', analyzingInput);
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="welcome-screen">
      {/* Hero */}
      <div className="welcome-hero">
        <div className="welcome-hero-content">
          <div className="welcome-logo">🔭</div>
          <h1>Portal PRR de Observabilidade</h1>
          <p>Self-service para Production Readiness Review — preencha, valide, busque e acompanhe a aderência dos seus serviços.</p>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>Versão PRR: v{prrVersion || '1.0'}</div>
        </div>
      </div>

      {/* Rovo Intent Bar */}
      <div className="rovo-intent-bar">
        <div className="rovo-icon">
          <span>✨</span>
        </div>
        <div className="rovo-input-wrapper">
          <input
            type="text"
            placeholder='O que você precisa fazer? Ex: "quero validar um documento", "buscar FAQ de alertas", "novo PRR para meu serviço"'
            value={analyzingInput}
            onChange={(e) => setAnalyzingInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSmartSearch()}
            className="rovo-input"
          />
          <button className="rovo-btn" onClick={handleSmartSearch} disabled={analyzing || !analyzingInput.trim()}>
            {analyzing ? '⏳' : 'Ir →'}
          </button>
        </div>
        <span className="rovo-label">Rovo</span>
      </div>

      {/* Options Grid */}
      <div className="welcome-options">
        {OPTIONS.map((opt) => (
          <button
            key={opt.id}
            className={`welcome-option-card ${opt.destaque ? 'destaque' : ''}`}
            style={{ '--card-cor': opt.cor, '--card-fundo': opt.corFundo }}
            onClick={() => onSelect(opt.id)}
          >
            <div className="option-icon">{opt.icon}</div>
            <div className="option-body">
              <h3>{opt.titulo}</h3>
              <p>{opt.descricao}</p>
            </div>
            <div className="option-cta" style={{ background: opt.cor }}>
              {opt.cta} →
            </div>
          </button>
        ))}
      </div>

      {/* Bottom info */}
      <div className="welcome-footer">
        <div className="welcome-footer-item">
          <span className="footer-num">42</span>
          <span className="footer-label">Perguntas oficiais</span>
        </div>
        <div className="welcome-footer-divider" />
        <div className="welcome-footer-item">
          <span className="footer-num">10</span>
          <span className="footer-label">Domínios de observabilidade</span>
        </div>
        <div className="welcome-footer-divider" />
        <div className="welcome-footer-item">
          <span className="footer-num">12</span>
          <span className="footer-label">Artefatos disponíveis</span>
        </div>
        <div className="welcome-footer-divider" />
        <div className="welcome-footer-item">
          <span className="footer-num">3</span>
          <span className="footer-label">Faixas de classificação</span>
        </div>
      </div>
    </div>
  );
}
