import React, { useState, useEffect } from 'react';
import { invoke } from '@forge/bridge';

const TYPE_LABELS = { template: '📄 Template', guia: '📖 Guia', todos: '🔎 Todos' };
const DOMAIN_COLORS = {
  Dashboards: '#0052cc', Alertas: '#ff5630', Runbooks: '#36b37e', Logs: '#6554c0',
  Tracing: '#00b8d9', Disponibilidade: '#ff8b00', Capacidade: '#57d9a3',
  'Segurança': '#ff7452', Deployment: '#998dd9', 'Dependências': '#79e2f2',
};

function RequirementCard({ req, onViewFaq }) {
  const color = DOMAIN_COLORS[req.dominio] || '#97a0af';
  return (
    <div className="search-card req-card">
      <div className="search-card-header">
        <span className="search-card-id">{req.question_id}</span>
        <span className="domain-tag" style={{ background: color + '22', color, borderColor: color + '44' }}>
          {req.dominio}
        </span>
        {req.obrigatoria && <span className="mandatory-badge">⚠ Obr.</span>}
        <span className="weight-badge" style={{ marginLeft: 'auto' }}>{req.peso}</span>
      </div>
      <div className="search-card-title">{req.titulo}</div>
      <div className="search-card-text">{req.pergunta}</div>
      <div className="search-card-footer">
        {req.faq_url ? (
          <a href={req.faq_url} target="_blank" rel="noopener noreferrer" className="faq-link">
            Ver FAQ técnica →
          </a>
        ) : (
          <span className="faq-link no-link">FAQ não disponível</span>
        )}
      </div>
    </div>
  );
}

function ArtifactCard({ artifact, onInstall, installing }) {
  return (
    <div className="search-card artifact-card">
      <div className="search-card-header">
        <span className="artifact-type-badge">{TYPE_LABELS[artifact.tipo] || artifact.tipo}</span>
        {artifact.dominios.map((d) => (
          <span key={d} className="domain-tag" style={{ fontSize: 11, background: (DOMAIN_COLORS[d] || '#97a0af') + '22', color: DOMAIN_COLORS[d] || '#97a0af' }}>
            {d}
          </span>
        ))}
      </div>
      <div className="search-card-title">{artifact.titulo}</div>
      <div className="search-card-text">{artifact.descricao}</div>
      <div className="search-card-tags">
        {artifact.tags.slice(0, 4).map((tag) => (
          <span key={tag} className="tag-chip">{tag}</span>
        ))}
      </div>
      <div className="search-card-footer">
        <button className="btn btn-secondary" style={{ fontSize: 12, padding: '4px 10px' }} onClick={() => onInstall(artifact.id)} disabled={installing === artifact.id}>
          {installing === artifact.id ? '⏳ Registrando...' : '⬇ Usar artefato'}
        </button>
        {artifact.url && (
          <a href={artifact.url} target="_blank" rel="noopener noreferrer" className="faq-link" style={{ marginLeft: 8 }}>
            Abrir →
          </a>
        )}
      </div>
    </div>
  );
}

export default function SearchScreen({ onBack, initialQuery }) {
  const [query, setQuery] = useState(initialQuery || '');
  const [domain, setDomain] = useState('');
  const [type, setType] = useState('');
  const [activeTab, setActiveTab] = useState('todos');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(null);
  const [installMsg, setInstallMsg] = useState(null);

  useEffect(() => {
    if (initialQuery) handleSearch();
  }, []); // eslint-disable-line

  const handleSearch = async () => {
    setLoading(true);
    try {
      const r = await invoke('searchArtifacts', { query: query.trim(), domain: domain || undefined, type: type || undefined });
      setResults(r);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (artifactId) => {
    setInstalling(artifactId);
    try {
      const r = await invoke('installArtifact', { artifactId });
      setInstallMsg(r.message);
      setTimeout(() => setInstallMsg(null), 5000);
    } catch {
      setInstallMsg('Erro ao registrar artefato.');
    } finally {
      setInstalling(null);
    }
  };

  const domains = results?.domains || [];
  const reqs = results?.results?.requirements || [];
  const artifacts = results?.results?.artifacts || [];
  const faqs = results?.results?.faqs || [];

  const tabCounts = { todos: reqs.length + artifacts.length, requisitos: reqs.length, artefatos: artifacts.length, faqs: faqs.length };

  return (
    <div className="screen-container">
      <div className="screen-header">
        <button className="btn-back" onClick={onBack}>← Voltar</button>
        <div>
          <h2>🔎 Buscar Requisitos e Artefatos</h2>
          <p className="screen-subtitle">Encontre requisitos do PRR, FAQs técnicas e artefatos como templates e guias.</p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="search-bar-card">
        <div className="search-bar-row">
          <input
            type="text"
            className="text-input search-main-input"
            placeholder='Buscar... Ex: "dashboard", "alertas", "runbook", "tracing"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <button className="btn btn-primary" onClick={handleSearch} disabled={loading}>
            {loading ? '⏳' : '🔍 Buscar'}
          </button>
        </div>
        <div className="search-filters-row">
          <select className="filter-select" value={domain} onChange={(e) => setDomain(e.target.value)}>
            <option value="">Todos os domínios</option>
            {(domains.length > 0 ? domains : ['Dashboards', 'Alertas', 'Runbooks', 'Logs', 'Tracing', 'Disponibilidade', 'Capacidade', 'Segurança', 'Deployment', 'Dependências']).map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select className="filter-select" value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">Todos os tipos de artefato</option>
            <option value="template">📄 Templates</option>
            <option value="guia">📖 Guias</option>
          </select>
        </div>
      </div>

      {installMsg && <div className="success-state">{installMsg}</div>}

      {/* Results */}
      {results && (
        <>
          {/* Tabs */}
          <div className="prr-tabs" style={{ display: 'inline-flex', margin: '0 0 16px' }}>
            {[['todos', 'Todos'], ['requisitos', 'Requisitos PRR'], ['artefatos', 'Artefatos'], ['faqs', 'FAQs Relacionadas']].map(([tab, label]) => (
              <button key={tab} className={`prr-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                {label} <span style={{ fontSize: 11, opacity: 0.8 }}>({tabCounts[tab]})</span>
              </button>
            ))}
          </div>

          {/* Requirement cards */}
          {(activeTab === 'todos' || activeTab === 'requisitos') && reqs.length > 0 && (
            <div className="results-section">
              {activeTab === 'todos' && <h3 className="section-title">Requisitos PRR ({reqs.length})</h3>}
              <div className="search-grid">
                {reqs.map((req) => <RequirementCard key={req.question_id} req={req} />)}
              </div>
            </div>
          )}

          {/* Artifact cards */}
          {(activeTab === 'todos' || activeTab === 'artefatos') && artifacts.length > 0 && (
            <div className="results-section">
              {activeTab === 'todos' && <h3 className="section-title">Artefatos ({artifacts.length})</h3>}
              <div className="search-grid">
                {artifacts.map((a) => <ArtifactCard key={a.id} artifact={a} onInstall={handleInstall} installing={installing} />)}
              </div>
            </div>
          )}

          {/* FAQ suggestions */}
          {(activeTab === 'todos' || activeTab === 'faqs') && faqs.length > 0 && (
            <div className="results-section">
              {activeTab === 'todos' && <h3 className="section-title">FAQs Relacionadas ({faqs.length})</h3>}
              <div className="search-grid">
                {faqs.map((faq) => <RequirementCard key={faq.question_id} req={faq} />)}
              </div>
            </div>
          )}

          {reqs.length === 0 && artifacts.length === 0 && faqs.length === 0 && (
            <div className="empty-state">
              <div className="empty-icon">🔎</div>
              <p>Nenhum resultado encontrado para "{query}".</p>
              <p className="empty-hint">Tente outros termos como: dashboard, alertas, runbook, SLO, tracing, logs, deploy.</p>
            </div>
          )}
        </>
      )}

      {!results && !loading && (
        <div className="empty-state">
          <div className="empty-icon">🔎</div>
          <p>Digite um termo para buscar requisitos, FAQs e artefatos do PRR.</p>
          <div className="quick-searches">
            {['dashboard', 'alertas', 'runbook', 'SLO', 'tracing', 'logs', 'deploy', 'segurança'].map((term) => (
              <button key={term} className="quick-search-chip" onClick={() => { setQuery(term); handleSearch(); }}>
                {term}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
