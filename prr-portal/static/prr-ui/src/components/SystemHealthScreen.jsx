import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@forge/bridge';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  healthy:     { icon: '✅', label: 'Saudável',    bg: '#e3fcef', border: '#79f2c0', text: '#006644' },
  warning:     { icon: '⚠️', label: 'Atenção',     bg: '#fffae6', border: '#ffe380', text: '#974f0c' },
  critical:    { icon: '🔴', label: 'Crítico',     bg: '#ffebe6', border: '#ff8f73', text: '#bf2600' },
  unreachable: { icon: '⚫', label: 'Sem conexão', bg: '#f4f5f7', border: '#c1c7d0', text: '#5e6c84' },
};

const SEVERITY_CONFIG = {
  critical: { bg: '#ffebe6', text: '#bf2600', dot: '#ff5630' },
  high:     { bg: '#fff4e5', text: '#974f0c', dot: '#ff8b00' },
  warning:  { bg: '#fffae6', text: '#974f0c', dot: '#ffc400' },
  medium:   { bg: '#fffae6', text: '#974f0c', dot: '#ffc400' },
  info:     { bg: '#deebff', text: '#0052cc', dot: '#4c9aff' },
  unknown:  { bg: '#f4f5f7', text: '#5e6c84', dot: '#97a0af' },
};

function severityConfig(severity) {
  return SEVERITY_CONFIG[(severity || 'unknown').toLowerCase()] || SEVERITY_CONFIG.unknown;
}

function timeAgo(isoString) {
  if (!isoString) return '—';
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff}s atrás`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min atrás`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h atrás`;
  return `${Math.floor(diff / 86400)}d atrás`;
}

// ─── Status Card ──────────────────────────────────────────────────────────────

function StatusCard({ title, status, value, subtitle, icon }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.unreachable;
  return (
    <div className="health-card" style={{ background: cfg.bg, borderColor: cfg.border }}>
      <div className="health-card-header">
        <span className="health-card-icon">{icon || cfg.icon}</span>
        <span className="health-card-title">{title}</span>
      </div>
      <div className="health-card-value" style={{ color: cfg.text }}>{value}</div>
      {subtitle && <div className="health-card-subtitle">{subtitle}</div>}
    </div>
  );
}

// ─── Domain Health Grid ───────────────────────────────────────────────────────

function DomainHealthGrid({ domainHealth }) {
  if (!domainHealth) return null;
  return (
    <div className="domain-health-grid">
      {Object.entries(domainHealth).map(([domain, info]) => {
        const cfg = STATUS_CONFIG[info.status] || STATUS_CONFIG.unreachable;
        return (
          <div key={domain} className="domain-health-chip" style={{ background: cfg.bg, borderColor: cfg.border }}>
            <span style={{ fontSize: 14 }}>{cfg.icon}</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: cfg.text }}>{domain}</div>
              {info.alertCount > 0 && (
                <div style={{ fontSize: 11, color: cfg.text }}>{info.alertCount} alerta(s)</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Alert Row ────────────────────────────────────────────────────────────────

function AlertRow({ alert }) {
  const sev = severityConfig(alert.severity);
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="alert-row" style={{ borderLeftColor: sev.dot }}>
      <div className="alert-row-main" onClick={() => setExpanded(!expanded)} style={{ cursor: 'pointer' }}>
        <span className="alert-dot" style={{ background: sev.dot }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="alert-name">{alert.name}</div>
          {alert.service && <div className="alert-service">{alert.service}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span className="severity-badge" style={{ background: sev.bg, color: sev.text }}>
            {alert.severity || 'unknown'}
          </span>
          {alert.silenced && <span className="silenced-badge">silenciado</span>}
          <span className="alert-time">{timeAgo(alert.startsAt)}</span>
          <span style={{ fontSize: 11, color: '#97a0af' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>
      {expanded && (
        <div className="alert-detail">
          {alert.summary && <p style={{ margin: '0 0 6px', fontSize: 12, color: '#42526e' }}>{alert.summary}</p>}
          {Object.keys(alert.labels || {}).length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {Object.entries(alert.labels).slice(0, 8).map(([k, v]) => (
                <span key={k} className="tag-chip" style={{ fontSize: 11 }}>{k}=<strong>{v}</strong></span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Services Table ───────────────────────────────────────────────────────────

function ServicesTable({ services }) {
  if (!services || services.length === 0) return <p style={{ fontSize: 13, color: '#97a0af', padding: '12px 0' }}>Nenhum serviço encontrado. Configure o UID do datasource Prometheus nas Configurações.</p>;
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ background: '#f4f5f7' }}>
          {['Job / Serviço', 'Instância', 'Status'].map((h) => (
            <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: '#5e6c84', fontWeight: 700, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.4px', borderBottom: '1px solid #dfe1e6' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {services.map((svc, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #f4f5f7' }}>
            <td style={{ padding: '6px 10px', fontWeight: 600, color: '#172b4d' }}>{svc.job}</td>
            <td style={{ padding: '6px 10px', color: '#5e6c84', fontFamily: 'monospace', fontSize: 11 }}>{svc.instance || '—'}</td>
            <td style={{ padding: '6px 10px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 10, background: svc.up ? '#e3fcef' : '#ffebe6', color: svc.up ? '#006644' : '#bf2600', fontSize: 11, fontWeight: 700 }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: svc.up ? '#00875a' : '#ff5630', display: 'inline-block' }} />
                {svc.up ? 'UP' : 'DOWN'}
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Grafana Panel Embed ──────────────────────────────────────────────────────

function PanelEmbed({ panel }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (!panel.embedUrl) {
    return (
      <div className="panel-placeholder">
        <div style={{ fontSize: 13, color: '#97a0af' }}>
          Configure o Dashboard UID e Panel ID nas Configurações para exibir este painel.
        </div>
        <div style={{ fontSize: 11, color: '#c1c7d0', marginTop: 4 }}>{panel.title}</div>
      </div>
    );
  }

  return (
    <div className="panel-embed-wrapper">
      <div className="panel-embed-title">{panel.title || 'Painel Grafana'}</div>
      {!loaded && !error && (
        <div className="panel-loading">
          <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
          <span style={{ fontSize: 12, color: '#97a0af' }}>Carregando painel...</span>
        </div>
      )}
      {error && (
        <div className="panel-error">
          ⚠ Não foi possível carregar o painel. Verifique se o Grafana permite embed (allow_embedding = true).
        </div>
      )}
      <iframe
        src={panel.embedUrl}
        className="panel-iframe"
        style={{ display: loaded && !error ? 'block' : 'none' }}
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        title={panel.title || 'Grafana Panel'}
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

const REFRESH_OPTIONS = [
  { value: 0, label: 'Manual' },
  { value: 30, label: '30s' },
  { value: 60, label: '1min' },
  { value: 300, label: '5min' },
];

export default function SystemHealthScreen({ onBack, onOpenSettings }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [refreshInterval, setRefreshInterval] = useState(60);
  const [activeTab, setActiveTab] = useState('overview');
  const timerRef = useRef(null);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const data = await invoke('getSystemHealth', {});
      setHealth(data);
      setLastUpdated(new Date());
    } catch (err) {
      setHealth({ configured: true, overall: { status: 'unreachable', label: 'Erro', color: 'gray', summary: err.message } });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (refreshInterval > 0) {
      timerRef.current = setInterval(fetchHealth, refreshInterval * 1000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refreshInterval, fetchHealth]);

  const grafana = health?.grafana || {};
  const overall = health?.overall || {};
  const alerts = health?.alerts || {};
  const services = health?.services || {};
  const panels = health?.panels || [];
  const domainHealth = health?.domainHealth || {};
  const dashboards = health?.dashboards || [];

  const overallCfg = STATUS_CONFIG[overall.status] || STATUS_CONFIG.unreachable;

  return (
    <div className="screen-container health-screen">
      {/* Header */}
      <div className="health-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-back" onClick={onBack}>← Voltar</button>
          <div>
            <h2>🔭 Saúde do Sistema em Tempo Real</h2>
            <p className="screen-subtitle">
              Integrado ao Grafana
              {grafana.ok && <span className="grafana-version-badge">v{grafana.version}</span>}
              {grafana.database && grafana.ok && <span className="grafana-db-badge">{grafana.database}</span>}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="health-controls">
          <div className="refresh-selector">
            <span style={{ fontSize: 12, color: '#5e6c84' }}>Atualizar:</span>
            {REFRESH_OPTIONS.map((opt) => (
              <button key={opt.value} className={`refresh-btn ${refreshInterval === opt.value ? 'active' : ''}`} onClick={() => setRefreshInterval(opt.value)}>
                {opt.label}
              </button>
            ))}
          </div>
          <button className="btn btn-secondary" onClick={fetchHealth} disabled={loading} style={{ fontSize: 12 }}>
            {loading ? '⏳' : '🔄'} Atualizar
          </button>
          {lastUpdated && (
            <span style={{ fontSize: 11, color: '#97a0af' }}>
              {lastUpdated.toLocaleTimeString('pt-BR')}
            </span>
          )}
        </div>
      </div>

      {/* Not configured */}
      {health && !health.configured && (
        <div className="health-not-configured">
          <div style={{ fontSize: 32, marginBottom: 12 }}>📊</div>
          <h3>Grafana não configurado</h3>
          <p>Configure a URL do Grafana e a API key para visualizar a saúde do sistema em tempo real.</p>
          <button className="btn btn-primary" onClick={onOpenSettings} style={{ marginTop: 12 }}>
            ⚙ Abrir Configurações
          </button>
        </div>
      )}

      {health && health.configured && (
        <>
          {/* Overall Status Banner */}
          <div className="overall-status-banner" style={{ background: overallCfg.bg, borderColor: overallCfg.border }}>
            <span className="overall-status-icon">{overallCfg.icon}</span>
            <div>
              <div className="overall-status-label" style={{ color: overallCfg.text }}>{overall.label || 'Verificando...'}</div>
              <div className="overall-status-summary">{overall.summary}</div>
            </div>
            {loading && <div className="spinner" style={{ marginLeft: 'auto', width: 20, height: 20, borderWidth: 2 }} />}
          </div>

          {/* Summary Cards */}
          <div className="health-cards-row">
            <StatusCard
              title="Alertas Ativos"
              status={alerts.critical > 0 ? 'critical' : alerts.active > 0 ? 'warning' : 'healthy'}
              value={alerts.active ?? '—'}
              subtitle={`${alerts.critical ?? 0} críticos · ${alerts.warning ?? 0} avisos · ${alerts.silenced ?? 0} silenciados`}
              icon="🔔"
            />
            <StatusCard
              title="Serviços UP"
              status={services.down > 0 ? 'critical' : 'healthy'}
              value={services.total > 0 ? `${services.up}/${services.total}` : '—'}
              subtitle={services.down > 0 ? `${services.down} fora do ar` : 'Todos operando'}
              icon="🖥"
            />
            <StatusCard
              title="Grafana"
              status={grafana.ok ? 'healthy' : 'critical'}
              value={grafana.ok ? 'Conectado' : 'Erro'}
              subtitle={grafana.ok ? `v${grafana.version}` : (grafana.error || 'Sem conexão')}
              icon="📊"
            />
            <StatusCard
              title="Dashboards"
              status={dashboards.length > 0 ? 'healthy' : 'unreachable'}
              value={dashboards.length}
              subtitle={dashboards.length > 0 ? 'disponíveis' : 'Configure para listar'}
              icon="📈"
            />
          </div>

          {/* Tabs */}
          <div className="prr-tabs" style={{ display: 'inline-flex', margin: '16px 0 0' }}>
            {[
              ['overview', '🗺 Visão Geral'],
              ['alerts', `🔔 Alertas (${alerts.active ?? 0})`],
              ['services', `🖥 Serviços (${services.total ?? 0})`],
              ['panels', `📊 Painéis (${panels.length})`],
              ['dashboards', `📈 Dashboards`],
            ].map(([tab, label]) => (
              <button key={tab} className={`prr-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                {label}
              </button>
            ))}
          </div>

          {/* Tab: Overview */}
          {activeTab === 'overview' && (
            <div style={{ marginTop: 16 }}>
              <h3 className="section-title">Saúde por Domínio PRR</h3>
              <p style={{ fontSize: 12, color: '#5e6c84', marginBottom: 12 }}>
                Correlação automática entre alertas do Grafana e os 10 domínios do PRR.
              </p>
              <DomainHealthGrid domainHealth={domainHealth} />

              {alerts.items && alerts.items.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <h3 className="section-title">Alertas Críticos Recentes</h3>
                  {alerts.items.filter((a) => ['critical', 'high'].includes((a.severity || '').toLowerCase())).slice(0, 5).map((a) => (
                    <AlertRow key={a.id} alert={a} />
                  ))}
                  {alerts.active > 5 && (
                    <button className="btn btn-secondary" style={{ marginTop: 8, fontSize: 12 }} onClick={() => setActiveTab('alerts')}>
                      Ver todos os {alerts.active} alertas →
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Tab: Alerts */}
          {activeTab === 'alerts' && (
            <div style={{ marginTop: 16 }}>
              {alerts.active === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">✅</div>
                  <p>Nenhum alerta ativo no momento.</p>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    {[
                      { label: `🔴 Críticos (${alerts.critical})`, color: '#bf2600', bg: '#ffebe6' },
                      { label: `⚠️ Avisos (${alerts.warning})`, color: '#974f0c', bg: '#fffae6' },
                      { label: `🔕 Silenciados (${alerts.silenced})`, color: '#5e6c84', bg: '#f4f5f7' },
                    ].map((badge) => (
                      <span key={badge.label} style={{ padding: '4px 10px', borderRadius: 12, background: badge.bg, color: badge.color, fontSize: 12, fontWeight: 600 }}>
                        {badge.label}
                      </span>
                    ))}
                  </div>
                  {(alerts.items || []).map((a) => <AlertRow key={a.id} alert={a} />)}
                </>
              )}
            </div>
          )}

          {/* Tab: Services */}
          {activeTab === 'services' && (
            <div style={{ marginTop: 16 }}>
              {services.down > 0 && (
                <div className="error-state" style={{ marginBottom: 12 }}>
                  ⚠ <strong>{services.down} serviço(s) fora do ar.</strong> Verifique os alertas e runbooks correspondentes.
                </div>
              )}
              <ServicesTable services={services.items || []} />
            </div>
          )}

          {/* Tab: Panels */}
          {activeTab === 'panels' && (
            <div style={{ marginTop: 16 }}>
              {panels.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📊</div>
                  <p>Nenhum painel configurado.</p>
                  <p className="empty-hint">Adicione painéis do Grafana nas Configurações informando o Dashboard UID e Panel ID.</p>
                  <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={onOpenSettings}>
                    ⚙ Configurar Painéis
                  </button>
                </div>
              ) : (
                <div className="panels-grid">
                  {panels.map((panel, i) => <PanelEmbed key={i} panel={panel} />)}
                </div>
              )}
            </div>
          )}

          {/* Tab: Dashboards */}
          {activeTab === 'dashboards' && (
            <div style={{ marginTop: 16 }}>
              {dashboards.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">📈</div>
                  <p>Nenhum dashboard encontrado.</p>
                </div>
              ) : (
                <div className="dashboard-list">
                  {dashboards.map((d) => (
                    <a key={d.uid} href={health?.grafana?.ok ? `${health?.grafana?.url || ''}${d.url}` : '#'} target="_blank" rel="noopener noreferrer" className="dashboard-item">
                      <div>
                        <div className="dashboard-item-title">{d.title}</div>
                        {d.folderTitle && <div className="dashboard-item-folder">📁 {d.folderTitle}</div>}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {d.tags.slice(0, 3).map((tag) => <span key={tag} className="tag-chip">{tag}</span>)}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
