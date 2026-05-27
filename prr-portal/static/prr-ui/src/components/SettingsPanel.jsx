import React, { useState } from 'react';
import { useInvoke } from '../hooks/useInvoke';

export default function SettingsPanel({ settings, onSettingsSaved, onSyncFaq }) {
  const [form, setForm] = useState({
    confluenceSpaceKey: settings?.confluenceSpaceKey || '',
    prrVersion: settings?.prrVersion || '1.0',
    confluenceSyncEnabled: settings?.confluenceSyncEnabled !== false,
    remediationEnabled: settings?.remediationEnabled !== false,
    telemetryEnabled: settings?.telemetryEnabled !== false,
  });
  const [syncStatus, setSyncStatus] = useState(null);
  const { call: saveSettings, loading: savingSettings } = useInvoke('updateSettings');
  const { call: syncFaq, loading: syncingFaq } = useInvoke('syncFaqPages');

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

  return (
    <div className="settings-panel">
      <h2>⚙ Configurações do Portal PRR</h2>

      <div className="form-group">
        <label>Chave do Space do Confluence</label>
        <input
          type="text"
          placeholder="Ex: ENG ou OBS"
          value={form.confluenceSpaceKey}
          onChange={(e) => setForm({ ...form, confluenceSpaceKey: e.target.value })}
        />
        <p style={{ fontSize: 12, color: '#5e6c84', marginTop: 4 }}>
          Chave do Space do Confluence onde as FAQs e assessments serão criados.
        </p>
      </div>

      <div className="form-group">
        <label>Versão do PRR</label>
        <input
          type="text"
          placeholder="Ex: 1.0"
          value={form.prrVersion}
          onChange={(e) => setForm({ ...form, prrVersion: e.target.value })}
        />
      </div>

      <div className="form-group">
        <label className="form-toggle">
          <input
            type="checkbox"
            checked={form.confluenceSyncEnabled}
            onChange={(e) => setForm({ ...form, confluenceSyncEnabled: e.target.checked })}
          />
          Gerar página de assessment no Confluence automaticamente
        </label>
      </div>

      <div className="form-group">
        <label className="form-toggle">
          <input
            type="checkbox"
            checked={form.remediationEnabled}
            onChange={(e) => setForm({ ...form, remediationEnabled: e.target.checked })}
          />
          Habilitar criação de issues de remediação no Jira
        </label>
      </div>

      <div className="form-group">
        <label className="form-toggle">
          <input
            type="checkbox"
            checked={form.telemetryEnabled}
            onChange={(e) => setForm({ ...form, telemetryEnabled: e.target.checked })}
          />
          Coletar telemetria de uso (anonimizado)
        </label>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        <button className="btn btn-primary" onClick={handleSave} disabled={savingSettings}>
          {savingSettings ? '⏳ Salvando...' : '💾 Salvar Configurações'}
        </button>

        <button
          className="btn btn-secondary"
          onClick={handleSyncFaq}
          disabled={syncingFaq || !form.confluenceSpaceKey}
          title={!form.confluenceSpaceKey ? 'Informe a chave do Space primeiro' : 'Sincronizar FAQs com Confluence'}
        >
          {syncingFaq ? '⏳ Sincronizando FAQs...' : '🔄 Sincronizar FAQs no Confluence'}
        </button>
      </div>

      {syncStatus && (
        <div className={syncStatus.success ? 'success-state' : 'error-state'} style={{ marginTop: 12 }}>
          {syncStatus.success
            ? `✅ ${syncStatus.count} páginas FAQ sincronizadas com sucesso no Confluence.`
            : `❌ Erro ao sincronizar FAQs: ${syncStatus.error}`}
        </div>
      )}

      <div style={{ marginTop: 24, padding: 16, background: '#f4f5f7', borderRadius: 6 }}>
        <p style={{ fontSize: 12, color: '#5e6c84', fontWeight: 700, marginBottom: 8 }}>ℹ Sobre as configurações</p>
        <ul style={{ fontSize: 12, color: '#5e6c84', paddingLeft: 16 }}>
          <li>A sincronização de FAQs cria uma página por pergunta no Confluence agrupada por domínio.</li>
          <li>O assessment é gerado automaticamente no Confluence após o submit do formulário.</li>
          <li>A telemetria é anonimizada e usada apenas para melhorar o portal.</li>
          <li>As 42 perguntas oficiais do PRR nunca são alteradas por estas configurações.</li>
        </ul>
      </div>
    </div>
  );
}
