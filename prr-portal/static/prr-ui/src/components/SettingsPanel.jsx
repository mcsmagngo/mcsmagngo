import React, { useState } from 'react';
import { invoke } from '@forge/bridge';
import { useInvoke } from '../hooks/useInvoke';

export default function SettingsPanel({ settings, onSettingsSaved, onSyncFaq }) {
  const [form, setForm] = useState({
    confluenceSpaceKey: settings?.confluenceSpaceKey || '',
    prrVersion: settings?.prrVersion || '1.0',
    confluenceSyncEnabled: settings?.confluenceSyncEnabled !== false,
    remediationEnabled: settings?.remediationEnabled !== false,
    telemetryEnabled: settings?.telemetryEnabled !== false,
    grafanaUrl: settings?.grafanaUrl || '',
    grafanaApiKey: settings?.grafanaApiKey || '',
    grafanaDatasourceUid: settings?.grafanaDatasourceUid || '',
    grafanaPanels: settings?.grafanaPanels || [],
    healthRefreshInterval: settings?.healthRefreshInterval || 60,
  });

  const [syncStatus, setSyncStatus] = useState(null);
  const [grafanaTestResult, setGrafanaTestResult] = useState(null);
  const [grafanaTesting, setGrafanaTesting] = useState(false);

  const { call: saveSettings, loading: savingSettings } = useInvoke('updateSettings');
  const { call: syncFaq, loading: syncingFaq } = useInvoke('syncFaqPages');

  const [newPanel, setNewPanel] = useState({ title: '', dashboardUid: '', panelId: '', slug: '', orgId: 1 });

  const handleSave = async () => {
    try {
      await saveSettings({ settings: form });
      onSettingsSaved && onSettingsSaved(form);
    } catch (err) {
      alert('Erro ao salvar configurações: ' + err.message);
    }
  };

  const handleSyncFaq = async () => {
    setSyncStatus(null);
    try {
      const result = await syncFaq({ spaceKey: form.confluenceSpaceKey });
      setSyncStatus({ success: true, count: result.faqLinksCount });
      onSyncFaq && onSyncFaq(result);
    } catch (err) {
      setSyncStatus({ success: false, error: err.message });
    }
  };

  const handleTestGrafana = async () => {
    setGrafanaTesting(true);
    setGrafanaTestResult(null);
    try {
      const result = await invoke('testGrafanaConnection', { grafanaUrl: form.grafanaUrl, grafanaApiKey: form.grafanaApiKey });
      setGrafanaTestResult(result);
    } catch (err) {
      setGrafanaTestResult({ ok: false, error: err.message });
    } finally {
      setGrafanaTesting(false);
    }
  };

  const addPanel = () => {
    if (!newPanel.title || !newPanel.dashboardUid || !newPanel.panelId) return;
    setForm((f) => ({ ...f, grafanaPanels: [...f.grafanaPanels, { ...newPanel, panelId: Number(newPanel.panelId) }] }));
    setNewPanel({ title: '', dashboardUid: '', panelId: '', slug: '', orgId: 1 });
  };

  const removePanel = (i) => {
    setForm((f) => ({ ...f, grafanaPanels: f.grafanaPanels.filter((_, idx) => idx !== i) }));
  };

  return (
    <div className="settings-panel">
      <h2>⚙ Configurações do Portal PRR</h2>

      {/* ── Confluence ──────────────────────────────────────────────────────── */}
      <div className="settings-section">
        <h3 className="settings-section-title">📄 Confluence</h3>

        <div className="form-group">
          <label>Chave do Space do Confluence</label>
          <input type="text" placeholder="Ex: ENG ou OBS" value={form.confluenceSpaceKey}
            onChange={(e) => setForm({ ...form, confluenceSpaceKey: e.target.value })} />
          <p className="input-hint">Chave do Space onde as FAQs e assessments serão criados.</p>
        </div>

        <div className="form-group">
          <label>Versão do PRR</label>
          <input type="text" placeholder="Ex: 1.0" value={form.prrVersion}
            onChange={(e) => setForm({ ...form, prrVersion: e.target.value })} />
        </div>

        <div className="form-group">
          <label className="form-toggle">
            <input type="checkbox" checked={form.confluenceSyncEnabled}
              onChange={(e) => setForm({ ...form, confluenceSyncEnabled: e.target.checked })} />
            Gerar página de assessment no Confluence automaticamente
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={handleSyncFaq} disabled={syncingFaq || !form.confluenceSpaceKey}>
            {syncingFaq ? '⏳ Sincronizando...' : '🔄 Sincronizar FAQs no Confluence'}
          </button>
        </div>

        {syncStatus && (
          <div className={syncStatus.success ? 'success-state' : 'error-state'} style={{ marginTop: 10 }}>
            {syncStatus.success ? `✅ ${syncStatus.count} páginas FAQ sincronizadas.` : `❌ ${syncStatus.error}`}
          </div>
        )}
      </div>

      {/* ── Grafana ─────────────────────────────────────────────────────────── */}
      <div className="settings-section">
        <h3 className="settings-section-title">📊 Grafana — Saúde do Sistema</h3>

        <div className="form-group">
          <label>URL do Grafana</label>
          <input type="url" placeholder="https://grafana.meu-dominio.com.br"
            value={form.grafanaUrl} onChange={(e) => setForm({ ...form, grafanaUrl: e.target.value })} />
          <p className="input-hint">URL base do seu Grafana (Cloud ou self-hosted). Ex: https://meutime.grafana.net</p>
        </div>

        <div className="form-group">
          <label>API Key / Service Account Token</label>
          <input type="password" placeholder="glsa_xxxxxxxxxxxxxxxxxxxx"
            value={form.grafanaApiKey} onChange={(e) => setForm({ ...form, grafanaApiKey: e.target.value })} />
          <p className="input-hint">Crie em Grafana → Administration → Service Accounts (permissão Viewer é suficiente).</p>
        </div>

        <div className="form-group">
          <label>UID do Datasource Prometheus</label>
          <input type="text" placeholder="Ex: prometheus ou P1809F7CD0C75ACF3"
            value={form.grafanaDatasourceUid} onChange={(e) => setForm({ ...form, grafanaDatasourceUid: e.target.value })} />
          <p className="input-hint">Encontre em Grafana → Connections → Data Sources → seu Prometheus → UID na URL.</p>
        </div>

        <div className="form-group">
          <label>Intervalo de atualização automática (segundos)</label>
          <select value={form.healthRefreshInterval} onChange={(e) => setForm({ ...form, healthRefreshInterval: Number(e.target.value) })}>
            <option value={0}>Manual</option>
            <option value={30}>30 segundos</option>
            <option value={60}>1 minuto</option>
            <option value={300}>5 minutos</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={handleTestGrafana} disabled={grafanaTesting || !form.grafanaUrl}>
            {grafanaTesting ? '⏳ Testando...' : '🔌 Testar Conexão'}
          </button>
          {grafanaTestResult && (
            <span className={grafanaTestResult.ok ? 'success-state' : 'error-state'} style={{ margin: 0, padding: '6px 12px', display: 'inline-block' }}>
              {grafanaTestResult.ok
                ? `✅ Conectado — Grafana v${grafanaTestResult.version} (DB: ${grafanaTestResult.database})`
                : `❌ ${grafanaTestResult.error}`}
            </span>
          )}
        </div>
      </div>

      {/* ── Grafana Panels ──────────────────────────────────────────────────── */}
      <div className="settings-section">
        <h3 className="settings-section-title">📊 Painéis do Grafana para exibir na tela de Saúde</h3>

        {form.grafanaPanels.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            {form.grafanaPanels.map((panel, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#f4f5f7', borderRadius: 4, marginBottom: 6 }}>
                <span style={{ fontSize: 13, flex: 1, color: '#172b4d' }}>{panel.title}</span>
                <span style={{ fontSize: 11, color: '#5e6c84', fontFamily: 'monospace' }}>uid={panel.dashboardUid} panel={panel.panelId}</span>
                <button onClick={() => removePanel(i)} style={{ background: 'none', border: 'none', color: '#bf2600', cursor: 'pointer', fontSize: 14 }}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px', gap: 8, marginBottom: 8 }}>
          <input type="text" className="text-input" placeholder="Título do painel" value={newPanel.title}
            onChange={(e) => setNewPanel({ ...newPanel, title: e.target.value })} />
          <input type="text" className="text-input" placeholder="Dashboard UID" value={newPanel.dashboardUid}
            onChange={(e) => setNewPanel({ ...newPanel, dashboardUid: e.target.value })} />
          <input type="number" className="text-input" placeholder="Panel ID" value={newPanel.panelId}
            onChange={(e) => setNewPanel({ ...newPanel, panelId: e.target.value })} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 120px', gap: 8, marginBottom: 8 }}>
          <input type="text" className="text-input" placeholder="Slug do dashboard (opcional)" value={newPanel.slug}
            onChange={(e) => setNewPanel({ ...newPanel, slug: e.target.value })} />
          <input type="number" className="text-input" placeholder="Org ID" value={newPanel.orgId}
            onChange={(e) => setNewPanel({ ...newPanel, orgId: Number(e.target.value) })} />
          <button className="btn btn-secondary" onClick={addPanel} disabled={!newPanel.title || !newPanel.dashboardUid || !newPanel.panelId}>
            + Adicionar
          </button>
        </div>
        <p className="input-hint">
          Encontre o Dashboard UID e Panel ID em: Grafana → Dashboard → Share → Link. O Panel ID aparece na URL ao clicar em "Edit" de um painel.
        </p>
      </div>

      {/* ── Jira & Telemetria ───────────────────────────────────────────────── */}
      <div className="settings-section">
        <h3 className="settings-section-title">🔧 Jira e Telemetria</h3>

        <div className="form-group">
          <label className="form-toggle">
            <input type="checkbox" checked={form.remediationEnabled}
              onChange={(e) => setForm({ ...form, remediationEnabled: e.target.checked })} />
            Habilitar criação de issues de remediação no Jira
          </label>
        </div>

        <div className="form-group">
          <label className="form-toggle">
            <input type="checkbox" checked={form.telemetryEnabled}
              onChange={(e) => setForm({ ...form, telemetryEnabled: e.target.checked })} />
            Coletar telemetria de uso (anonimizado)
          </label>
        </div>
      </div>

      <button className="btn btn-primary" onClick={handleSave} disabled={savingSettings}>
        {savingSettings ? '⏳ Salvando...' : '💾 Salvar todas as configurações'}
      </button>

      <div style={{ marginTop: 20, padding: 14, background: '#f4f5f7', borderRadius: 6 }}>
        <p style={{ fontSize: 12, color: '#5e6c84', fontWeight: 700, marginBottom: 6 }}>ℹ Sobre a integração com o Grafana</p>
        <ul style={{ fontSize: 12, color: '#5e6c84', paddingLeft: 16, lineHeight: 1.8 }}>
          <li>Todas as chamadas à API do Grafana acontecem no backend Forge (sua API key nunca fica exposta no browser).</li>
          <li>Compatível com Grafana Cloud e Grafana self-hosted (>= 8.x).</li>
          <li>Para embed de painéis, o Grafana precisa ter <code>allow_embedding = true</code> no grafana.ini.</li>
          <li>O datasource UID é necessário apenas para a query de serviços UP (métrica <code>up</code> do Prometheus).</li>
          <li>As 42 perguntas do PRR nunca são alteradas por estas configurações.</li>
        </ul>
      </div>
    </div>
  );
}
