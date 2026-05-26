# Portal PRR de Observabilidade

Portal de self-service para Production Readiness Review (PRR) orientado a observabilidade, construído como aplicação Atlassian Forge para Jira Cloud com integração ao Confluence.

## Visão Geral

O portal implementa um modelo híbrido:
- **Núcleo estático oficial**: 42 perguntas PRR em `data/prr-questions.json`
- **Camada adaptativa**: FAQ técnica por pergunta no Confluence, score de aderência, remediação automática e telemetria

## Funcionalidades

### Formulário Sim/Não (42 perguntas)
- Lista oficial das 42 perguntas do PRR com campos de resposta `Sim` ou `Não`
- Filtro por domínio temático (Dashboards, Alertas, Runbooks, Logs, Tracing, etc.)
- Indicador de progresso e score parcial em tempo real
- Link para FAQ técnica por pergunta
- Auto-save de rascunho a cada 60 segundos

### Cálculo de Aderência
- Score ponderado por peso de cada pergunta
- Fórmula: `Σ(resposta × peso) / Σ(pesos) × 100`
- Classificação: Aderente (≥80%), Parcialmente Aderente (≥50%), Não Aderente (<50%)
- Score por domínio e verificação de obrigatoriedade

### Integração com Confluence
- Sincronização de 42 páginas FAQ técnicas (uma por pergunta, agrupadas por domínio)
- Geração automática de página de assessment após o submit
- Hub central de FAQ com estrutura hierárquica por domínio

### Plano de Remediação no Jira
- Criação de Epic de remediação para cada assessment com gaps
- Criação de Tasks por gap identificado com prioridade, labels e descrição técnica
- Link entre issues e assessment

### Telemetria e Aprendizado
- Coleta de eventos de uso (respostas, abertura de FAQ, abandono, conclusão)
- Dados anonimizados para análise de fricção e qualidade do conhecimento

## Estrutura do Projeto

```
prr-portal/
├── manifest.yml              # Configuração do app Forge
├── package.json              # Dependências do backend
├── data/
│   └── prr-questions.json    # Catálogo oficial das 42 perguntas
├── src/
│   ├── index.js              # Entry point dos resolvers Forge
│   ├── resolvers/
│   │   └── index.js          # Lógica de negócio dos resolvers
│   └── services/
│       ├── prrStaticLoader.js        # Carregamento do catálogo PRR
│       ├── adherenceScoreEngine.js   # Motor de cálculo de aderência
│       ├── confluenceService.js      # Integração com Confluence API
│       ├── jiraService.js            # Integração com Jira API
│       ├── storageService.js         # Persistência via Forge Storage
│       └── telemetryService.js       # Coleta de telemetria
└── static/
    └── prr-ui/               # Custom UI (React)
        ├── src/
        │   ├── App.jsx               # Componente raiz
        │   ├── components/
        │   │   ├── QuestionRow.jsx       # Linha de pergunta com resposta Sim/Não
        │   │   ├── ProgressBar.jsx       # Barra de progresso e score parcial
        │   │   ├── DomainBreakdown.jsx   # Score por domínio
        │   │   ├── ResultPanel.jsx       # Painel de resultado e gaps
        │   │   └── SettingsPanel.jsx     # Configurações do portal
        │   └── hooks/
        │       └── useInvoke.js          # Hook para Forge bridge
        └── styles.css
```

## Domínios do PRR

| Domínio | Qtd. Perguntas |
|---|---|
| Dashboards | 4 |
| Alertas | 4 |
| Runbooks | 3 |
| Logs | 4 |
| Tracing | 3 |
| Disponibilidade | 7 |
| Capacidade | 3 |
| Segurança | 4 |
| Deployment | 4 |
| Dependências | 3 |

## Resolvers Forge (Backend)

| Resolver | Descrição |
|---|---|
| `getQuestionnaire` | Carrega as 42 perguntas com links de FAQ |
| `loadDraft` | Recupera rascunho salvo da sessão |
| `saveDraft` | Persiste rascunho parcial |
| `submitAssessment` | Processa submission completo e calcula score |
| `calculateAdherenceScore` | Calcula score sem persistir (preview) |
| `syncFaqPages` | Sincroniza 42 páginas FAQ no Confluence |
| `generateRemediationPlan` | Cria Epic + Tasks de remediação no Jira |
| `getAssessmentById` | Recupera assessment por ID |
| `trackEvent` | Registra evento de telemetria |
| `getAdaptiveHints` | Retorna dicas contextuais para uma pergunta |
| `updateSettings` | Atualiza configurações do portal |
| `getPortalSettings` | Recupera configurações atuais |

## Instalação e Deploy

### Pré-requisitos
- [Atlassian Forge CLI](https://developer.atlassian.com/platform/forge/getting-started/) instalado e autenticado
- Node.js 18+
- Jira Cloud + Confluence Cloud com permissões de admin

### Setup

```bash
# Instalar dependências do backend
npm install

# Instalar dependências e build do frontend
cd static/prr-ui
npm install
npm run build
cd ../..

# Login no Forge
forge login

# Registrar o app (primeira vez)
forge register

# Deploy em ambiente de desenvolvimento
forge deploy --environment development

# Instalar no site Jira
forge install --site <seu-site>.atlassian.net
```

### Configuração Pós-Deploy

1. Acesse o portal PRR em qualquer projeto Jira Cloud
2. Vá em **Configurações** e informe a chave do Space do Confluence
3. Clique em **Sincronizar FAQs no Confluence** para criar as 42 páginas FAQ
4. O portal está pronto para uso

## Arquitetura

```
Experience Layer    → Custom UI React (Forge)
Domain Layer        → Score Engine, Compliance Validator, Gap Mapper
Learning Layer      → Telemetry Service, Event Processor
Knowledge Layer     → Confluence FAQ Hub (42 páginas por pergunta)
Automation Layer    → Jira Remediation Plan, Confluence Assessment Page
Governance Layer    → Static PRR catalog (nunca alterado automaticamente)
```

## Lógica de Score

**Pesos por pergunta** (definidos em `prr-questions.json`):
- Peso 3: Requisitos críticos (ex: dashboard operacional, alertas com owner, SLO)
- Peso 2: Requisitos importantes (ex: severidade de alertas, capacidade, segurança)
- Peso 1: Requisitos de maturidade (ex: chaos engineering, feature flags)

**Fórmula ponderada:**
```
Score = Σ(Sim × peso) / Σ(todos os pesos) × 100
```

**Classificações:**
- ≥ 80% → Aderente (verde)
- ≥ 50% → Parcialmente Aderente (amarelo)
- < 50% → Não Aderente (vermelho)

## Princípios de Governança

- O arquivo `prr-questions.json` é a **fonte canônica** do PRR — nunca alterado automaticamente
- Pesos, obrigatoriedade, texto das perguntas e faixas de score são governados manualmente
- FAQs, assessment pages e issues de remediação são gerados automaticamente
- Telemetria é anonimizada e usada apenas para melhorar FAQ e UX
