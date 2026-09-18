# Relatório Técnico Completo de Implementação
## Sistema de Automação de Candidaturas, Envio Amplo e Adaptação Dinâmica ("Ponte de Competências")

---

### 1. Visão Geral e Propósito

Este documento descreve de ponta a ponta a arquitetura, regras de negócio, modelos de dados, componentes de frontend, rotinas de backend, mecanismos anti-spam e matrizes de adaptação tecnológica de todo o ecossistema de candidaturas automáticas do **Jenus Hub** (`jenus-api` e `jenus-hub`).

O objetivo central é a implementação do **Modo Amplo / Adaptativo** com a **Ponte de Competências (Transferable Skills)**, permitindo que o sistema converta vagas correlatas em entrevistas reais, destacando a bagagem real de engenharia de software do candidato de forma transparente, estruturada e sem declarações falsas.

---

### 2. Matriz Completa de Áreas de Atuação e Tecnologias

O motor abrange todas as áreas de tecnologia, mapeando a bagagem do candidato para as demandas do mercado:

```
                                  [ ÁREAS DE ATUAÇÃO ]
                                            │
        ┌───────────────────┬───────────────┴───────────────┬───────────────────┐
        ▼                   ▼                               ▼                   ▼
    [ BACKEND ]        [ FRONTEND ]                    [ MOBILE ]          [ DEVOPS & DADOS ]
  - Node.js / NestJS  - React / Next.js               - React Native      - Docker / CI/CD
  - Express / TS      - TypeScript / Tailwind         - Expo              - AWS / Cloud
        │                   │                               │                   │
        ▼ (Equivalência)    ▼ (Equivalência)                ▼ (Equivalência)    ▼ (Equivalência)
  - Java / Spring     - Vue / Nuxt                    - Flutter           - Kubernetes / K8s
  - Python / FastAPI  - Angular                       - Swift / iOS       - PostgreSQL / SQL
  - C# / .NET         - Svelte                        - Kotlin / Android  - MongoDB / Redis
```

#### 2.1. Tabela Completa de Equivalências Funcionais (`CATEGORY_EQUIVALENCE`)

| Categoria Funcional | Peso Ponderado | Tecnologias Mapeadas | Princípio de Transferibilidade |
| :--- | :---: | :--- | :--- |
| **`framework-backend-web`** | **0.55** | `NestJS`, `Node.js`, `Express`, `Java`, `Spring Boot`, `Python`, `Django`, `FastAPI`, `C#`, `.NET` | Arquitetura MVC/Modular, tratamento de rotas, middlewares, injeção de dependência e consumo de serviços. |
| **`linguagem-tipada-backend`** | **0.40** | `TypeScript`, `Java`, `C#`, `Go` | Programação orientada a objetos, interfaces, generics, type-safety e compilação estática. |
| **`framework-frontend-web`** | **0.55** | `React`, `Next.js`, `Vue`, `Nuxt`, `Angular`, `Svelte` | Ciclo de vida de componentes, gerenciamento de estado reativo, virtual DOM/SSR e roteamento SPA. |
| **`mobile-cross-platform`** | **0.50** | `React Native`, `Expo`, `Flutter`, `iOS Nativo`, `Android Nativo` | Consumo de APIs nativas, gerenciamento de telas, layouts responsivos, haptics e builds para lojas. |
| **`banco-relacional`** | **0.60** | `PostgreSQL`, `MySQL`, `SQL Server`, `Oracle`, `SQLite` | Modelagem relacional, ACID, chaves estrangeiras, índices, queries otimizadas e migrations. |
| **`banco-nosql`** | **0.50** | `MongoDB`, `Redis`, `Elasticsearch`, `DynamoDB` | Armazenamento de documentos JSON, caching de baixa latência, chave-valor e buscas indexadas. |
| **`containerizacao-orquestracao`**| **0.60** | `Docker`, `Docker Compose`, `Kubernetes`, `K8s` | Conteinerização de microserviços, isolamento de ambientes, Dockerfile e orquestração de pods. |
| **`testes-automatizados`** | **0.50** | `Jest`, `React Testing Library`, `Supertest`, `Mocha`, `Cypress`, `Playwright`, `JUnit` | Pirâmide de testes, cobertura unitária, testes de integração, mocks e asserções automatizadas. |
| **`cloud-integracao`** | **0.50** | `AWS`, `EC2`, `S3`, `Lambda`, `SQS`, `GCP`, `Azure` | Serviços em nuvem, computação serverless, mensageria assíncrona e armazenamento de objetos. |

> **🔒 Regra de Ouro da Origem Real:** A equivalência de categoria só é concedida se a habilidade de origem estiver **realmente declarada no perfil oficial do candidato** (`perfil.skills`). Habilidades inferidas contextualmente nunca geram pontos de equivalência.

---

### 3. Matriz de Cenários e Exemplos Práticos da "Ponte de Competências"

Abaixo estão os exemplos reais de como o sistema adapta o pitch do candidato para cada tipo de vaga:

#### Exemplo 1: Vaga Backend Java / Spring Boot
- **Demanda da Vaga**: Desenvolvedor Backend com foco em microsserviços Java/Spring Boot e PostgreSQL.
- **Bagagem Real do Candidato**: 4 anos como Desenvolvedor Full Stack / Backend com Node.js, Express, NestJS, TypeScript, PostgreSQL e Docker.
- **Resultado da Adaptação**:
  - **Título Personalizado**: `Desenvolvedor Backend`
  - **Pitch no Resumo**: *"Engenheiro de Software com sólida atuação em desenvolvimento Backend, arquitetura de microsserviços, modelagem de dados e pipelines de CI/CD. Domínio avançado em Node.js/TypeScript e bancos relacionais (PostgreSQL/SQL), aplicando padrões SOLID, APIs RESTful e facilidade para absorção rápida de stacks corporativas equivalentes como ecossistemas Java/Spring."*
  - **Destaque de Experiências**: Prioriza projetos com APIs de alta performance, queries SQL complexas, autenticação JWT e conteinerização Docker.

#### Exemplo 2: Vaga Backend Python / FastAPI
- **Demanda da Vaga**: Engenheiro de Software Backend Python/FastAPI para APIs assíncronas e Redis.
- **Bagagem Real do Candidato**: Node.js assíncrono, TypeScript, Redis e arquitetura orientada a eventos.
- **Resultado da Adaptação**:
  - **Título Personalizado**: `Engenheiro de Software Backend`
  - **Pitch no Resumo**: *"Profissional com 4+ anos de experiência na construção de APIs REST escaláveis e de alta concorrência. Vivência em arquiteturas orientadas a eventos, filas assíncronas, estratégias de cache com Redis e bancos de dados relacionais e NoSQL."*

#### Exemplo 3: Vaga Frontend Vue.js / Angular
- **Demanda da Vaga**: Desenvolvedor Front-end para SPA corporativa em Vue ou Angular.
- **Bagagem Real do Candidato**: React, Next.js, TypeScript e Tailwind CSS.
- **Resultado da Adaptação**:
  - **Título Personalizado**: `Desenvolvedor Front-end`
  - **Pitch no Resumo**: *"Desenvolvedor especializado na criação de interfaces modernas, acessíveis e altamente performáticas. Domínio em TypeScript, gerenciamento de estado reativo, consumo de APIs REST/GraphQL e testes com Testing Library, com sólidos conceitos de componentização e arquitetura SPA."*

#### Exemplo 4: Vaga Mobile Flutter / Multiplataforma
- **Demanda da Vaga**: Desenvolvedor Mobile Flutter para aplicativo de pagamentos.
- **Bagagem Real do Candidato**: React Native, Expo, animações Reanimated e integrações nativas.
- **Resultado da Adaptação**:
  - **Título Personalizado**: `Desenvolvedor Mobile`
  - **Pitch no Resumo**: *"Desenvolvedor Mobile com histórico de entrega de aplicativos responsivos, fluidos e intuitivos. Experiência em gerenciamento de estado, ciclo de vida de apps, consumo de APIs seguras, feedback háptico e publicação nas lojas."*

---

### 4. Comparativo Detalhado entre as Estratégias de Envio

```
                      ┌──────────────────────────────────────────────┐
                      │             ESTRATÉGIAS DE ENVIO             │
                      └──────────────────────┬───────────────────────┘
                                             │
                   ┌─────────────────────────┴─────────────────────────┐
                   ▼                                                   ▼
         🟢 MODO AMPLO (ADAPTATIVO)                           ⚪ MODO ESTRITO
  ┌──────────────────────────────────────────┐        ┌──────────────────────────────────────────┐
  │ • Corte de Score: >= 60%                 │        │ • Corte de Score: >= 75%                 │
  │ • Tipos de Match: EXACT + ALIAS +        │        │ • Tipos de Match: EXACT + ALIAS apenas   │
  │   CATEGORY_EQUIVALENCE                   │        │                                          │
  │ • Geração de Currículo: Ponte Dinâmica   │        │ • Geração de Currículo: Padrão Direto    │
  │ • Objetivo: Converter vagas correlatas    │        │ • Objetivo: Enviar somente 100% idêntico │
  │   em entrevistas                         │        │                                          │
  │ • Indicação Visual: Badge de Adaptação   │        │ • Indicação Visual: Sem badge            │
  └──────────────────────────────────────────┘        └──────────────────────────────────────────┘
```

---

### 5. Arquitetura do Worker de Automação & Ciclo de Vida (FSM)

O serviço `vagasEmailWorker.service.ts` atua como uma Máquina de Estados Finitos com máxima tolerância a falhas:

```
   ┌─────────┐         start()         ┌───────────┐
   │  IDLE   │ ──────────────────────> │  RUNNING  │
   └─────────┘                         └─────┬─────┘
        ▲                                    │
        │ stop()                             │ Pausa programada / Limite horário
        │                                    ▼
   ┌─────────┐                         ┌───────────┐
   │ STOPPED │ <────────────────────── │  PAUSED   │
   └─────────┘                         └───────────┘
```

#### 5.1. Mecanismos de Proteção e Resiliência
1. **Reserva Atômica (`BEGIN IMMEDIATE`)**:
   - Cada tentativa de envio reserva o slot no SQLite usando transação imediata. Se houver concorrência entre processos ou requisições duplicadas, apenas uma consegue obter o lock (`changes === 1`).
2. **Sliding Window de 30 Envios/Hora**:
   - Conta envios com status `SENT` nos últimos 60 minutos mais slots `PROCESSING` ativos dos últimos 10 minutos. Se atingir 30, o worker entra em pausa preventiva calculando o tempo exato para a próxima liberação.
3. **Limite Diário de Segurança (150 Envios/Dia)**:
   - Trava de proteção que impede envio excessivo nas últimas 24 horas, protegendo o IP e o domínio contra bloqueios de SPF/DKIM.
4. **Janela de Desduplicação de 72 Horas**:
   - Impede o envio para o mesmo e-mail de recrutador dentro de 3 dias, evitando incômodo ao destinatário.
5. **Humanização com Delays Aleatórios (Jitter)**:
   - Intervalos randômicos entre 90s e 150s entre os disparos.
6. **Reconciliação Automática de Processos Órfãos (`reconciliarProcessosOrfaos`)**:
   - Se o servidor reiniciar durante um envio, registros que ficaram presos em `PROCESSING` há mais de 10 minutos sem `envio_id` são revertidos para `IDLE`/`FAILED`.

---

### 6. Estrutura do Banco de Dados (SQLite) & Migrations

#### Histórico Completo de Migrations:
- `curriculo_001` a `curriculo_014`: Tabelas base de perfis, experiências, educação, certificações, idiomas e candidaturas.
- `curriculo_015_automacao_runs_and_snapshots`: Tabela de execuções (`curriculo_automacao_runs`), snapshots e configurações de automação.
- `curriculo_016_automacao_cadencia_30_hora`: Atualização do limite para 30 envios/hora, 150 diários e delays de 90s-150s.
- `curriculo_017_automacao_persist_running_state`: Persistência do estado ativo do worker para auto-resume após redeploy.
- `curriculo_018_automacao_categoria_e_notificacao`: Registro de `score_categoria_aplicado`, `matches_categoria_json` e `habilitar_frase_equivalencia`.
- `curriculo_019_reavaliacao_historico_salvo`: Reavaliação de vagas do banco de oportunidades.
- `curriculo_020_notificacao_diaria`: Notificação diária de novas vagas elegíveis.
- `curriculo_021_modo_amplo_estrategia`: **Coluna `modo_amplo INTEGER DEFAULT 1` em `curriculo_automacao_config`**.

```sql
-- Schema da tabela de configuração
CREATE TABLE IF NOT EXISTS curriculo_automacao_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  min_score INTEGER DEFAULT 70,
  daily_limit INTEGER DEFAULT 150,
  hourly_limit INTEGER DEFAULT 30,
  min_delay_seconds INTEGER DEFAULT 90,
  max_delay_seconds INTEGER DEFAULT 150,
  window_hours INTEGER DEFAULT 72,
  feed_url TEXT DEFAULT './data/vagas-email.json',
  sem_ia INTEGER DEFAULT 0,
  habilitar_frase_equivalencia INTEGER DEFAULT 0,
  modo_amplo INTEGER DEFAULT 1,
  ativo INTEGER DEFAULT 0,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

---

### 7. Endpoints REST da API (`jenus-api`)

| Rota | Método | Descrição |
| :--- | :---: | :--- |
| `/automacao/status` | `GET` | Retorna status do worker, vaga atual, contadores, tempos de espera e config. |
| `/automacao/preview` | `GET` | Simula a ingestão do feed, retornando vagas elegíveis e puladas no modo ativo. |
| `/automacao/config` | `POST` | Atualiza parâmetros operacionais (`modoAmplo`, limites, delays, etc.). |
| `/automacao/start` | `POST` | Inicia o ciclo de envio contínuo com verificação de travas. |
| `/automacao/stop` | `POST` | Interrompe suavemente o ciclo de envios. |
| `/automacao/candidaturas` | `GET` | Lista histórico completo de candidaturas disparadas com filtros e paginação. |
| `/automacao/vagas/:id/curriculo`| `GET` | Retorna o payload estruturado do currículo adaptado para uma vaga específica. |
| `/automacao/reavaliar-candidaturas` | `POST` | Reavalia todas as vagas arquivadas com o motor de equivalência. |

---

### 8. Frontend no Jenus Hub (`jenus-hub`)

#### 8.1. Estrutura de Telas e Abas
- **Aba 1: Vagas Elegíveis**:
  - Lista de cards com vagas que atingiram a nota de corte.
  - Badges informativas: Score %, Salário, Localização e 🏷️ *Badge de Adaptação por Categoria*.
  - Botão de "Ver Currículo Adaptado" que abre modal com visualização completa do PDF e resumo.
- **Aba 2: Histórico de Envios**:
  - Tabela com todas as candidaturas enviadas, horários, e-mail de destino e status de entrega.
- **Aba 3: Configurações**:
  - **Seletor de Estratégia**: Alternância entre 🟢 *Modo Amplo (Adaptativo)* e ⚪ *Modo Estrito*.
  - Controles de limite horário (30/h), limite diário (150/d) e delays.
  - Botões de início/parada com feedback tátil e sonoro.

---

### 9. Checklist de Entrega e Validação

- [x] Documento técnico consolidado e versionado em `docs/`.
- [ ] Migration `curriculo_021_modo_amplo_estrategia` executada no SQLite.
- [ ] Worker atualizado com suporte a `modoAmplo` no preview e no envio real.
- [ ] Resumo profissional com injeção da "Ponte de Competências" para todas as categorias.
- [ ] Seletor de estratégia implementado no frontend (`automacao.tsx`).
- [ ] Badges visuais de equivalência renderizadas nos cards de vagas elegíveis.
- [ ] Testes unitários e de integração aprovados.
