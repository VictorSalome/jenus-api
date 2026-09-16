# Backend Architecture Baseline

## 1. Executive Summary

A API Jenus é um **Monolito Modular** construído com Express.js e TypeScript. Ela hospeda múltiplos domínios e aplicativos internos (Auth, Currículos, Promo, Finanças, Prospecção, Gmail, Notifications, System) em um único processo Node.js. A arquitetura aplica uma fronteira HTTP estrita onde todo o tráfego externo passa exclusivamente pelos *entrypoints* de cada app. O armazenamento de dados é centralizado em um banco SQLite único, otimizado para concorrência através do modo WAL e de uma fila global de transações para escritas (TxQueue). Esta abordagem entrega máxima simplicidade de deploy enquanto suporta escalabilidade e manutenibilidade robustas.

## 2. Architecture Overview

```text
[Cliente / App Mobile]
       │ (JSON + JWT)
       ▼
[ NGINX / Reverse Proxy ] (trust proxy = 1)
       │
       ▼
[ Jenus API (Express - 1 Processo) ]
       │
       ├── src/apps/ (Entrypoints HTTP / Controllers)
       │   ├── auth/         (Login, Refresh, JWT)
       │   ├── curriculos/   (Scraper, Parser, Match, PDF)
       │   ├── financas/     (Transações, Contas, Dashboards)
       │   ├── promo/        (Promo Monitor)
       │   ├── prospeccao/   (Automação Maps, Disparo)
       │   └── ... (gmail, notifications, system)
       │
       ├── src/shared/ (Infraestrutura Compartilhada)
       │   ├── auth/         (Middlewares JWT)
       │   ├── http/         (Error Handler, Async Handler)
       │   ├── middleware/   (Validação Zod)
       │   └── rate-limit/   (Proteção contra abusos)
       │
       └── src/core/ (Camada de Baixo Nível)
             ├── config.ts       (Validação de Env)
             ├── logger.ts       (Logs Centralizados)
             ├── database.ts     (Conexão DB + TxQueue)
             └── migrations/     (Runner de Migrations)
                   │
                   ▼
[ SQLite DB ] (WAL, busy_timeout=5000, foreign_keys=ON)
```

## 3. HTTP Boundary

A API segue os princípios de uma **API Pura**:
- **Apenas JSON:** O backend não serve HTML, estáticos ou visualizações (desacoplado do frontend).
- **Entrypoints Isolados:** Nenhuma lógica interna deve expor rotas HTTP. Apenas arquivos em `src/apps/*/index.ts` ou `.routes.ts` recebem tráfego externo.
- **Segurança:** Configuração avançada de CORS, `helmet` (HSTS, noSniff, xssFilter) ativado. IP de origem confia no primeiro salto de proxy configurado com `app.set("trust proxy", 1)`.
- **Validação:** Todas as entradas HTTP (Body, Params, Query) são higienizadas e validadas através de middlewares com integração ao `Zod`.

## 4. Authentication & Authorization

O sistema utiliza um modelo de **Auth Centralizado via JWT**, protegendo de forma homogênea todos os módulos montados:
- **Access Token:** Validade curta (15 minutos). Usado nas requisições via header `Authorization: Bearer <token>` ou cookies (para compatibilidade legada).
- **Refresh Token:** Validade longa (7 dias), persistido no banco de dados, permitindo revogação sob demanda e garantindo segurança caso o acesso seja comprometido.
- **Middlewares:** 
  - `requireAuth`: Bloqueia requisições sem tokens válidos (retorna HTTP 401).
  - `optionalAuth`: Injeta o usuário no contexto se houver token válido, sem bloquear acessos não logados.

## 5. Database Architecture

O armazenamento unificado simplifica o deploy e a infraestrutura, usando os drivers nativos `sqlite` + `sqlite3`:
- **PRAGMAs Otimizados:**
  - `journal_mode = WAL`: Permite leituras concorrentes simultâneas sem bloqueio mútuo de escritas.
  - `busy_timeout = 5000`: Aguarda até 5 segundos caso o banco esteja travado, reduzindo erros operacionais de concorrência.
  - `foreign_keys = ON`: Mantém a integridade referencial nativa ativada.
- **Fila Global de Transações (TxQueue):** 
  - Todas as transações de escrita (e processos atômicos) são serializadas através da função wrapper `runTransaction`. 
  - Executa `BEGIN IMMEDIATE` e enfileira requisições, resolvendo o maior gargalo de escritas concorrentes do SQLite (o erro "SQLITE_BUSY: database is locked").
- **Migrations Modulares:** Organizadas por módulo e executadas sequencialmente no `initDb()` na inicialização do servidor.

## 6. Performance Architecture

- **Proteção de Gargalo:** O uso de TxQueue garante proteção sob cargas simultâneas sem perdas de escritas, às custas de latência em picos de I/O.
- **Limitadores de Taxa (Rate Limit):** Módulo `express-rate-limit` ativo por padrão, protegendo endpoints de autenticação, scrapers e manipulações massivas contra uso abusivo (DDoS leve e força bruta).
- **Paginação / Limites:** Buscas pesadas são paginadas ou limitadas no nível do banco.

## 7. Scraper Architecture

Os módulos `curriculos` e `prospeccao` abrigam pipelines de automação, divididos em estratégias de extração:
- **HTTP Scrapers (Leves):** Serviços implementados usando Axios (`scraperBR.service.ts`), preferenciais pela baixa exigência de recursos de CPU/RAM em nuvem. Utilizam rotação de User-Agents para reduzir taxa de bloqueio.
- **Headless Scrapers (Playwright):** Processos complexos (pesquisas no LinkedIn, varreduras do Google Maps) exigem navegação real simulada. Carregam `playwright` via Node dinamicamente e requerem ambiente provisionado com browsers.
- **Resiliência de Scraping:** Timeout controlado e fallback manual.

## 8. Error Handling & Resilience

O controle de erros é implementado no padrão *Fail-Fast, Respond-Safe*:
- **Async Handler:** Função de empacotamento em `src/shared/http/async-handler.ts` que captura promessas rejeitadas nas rotas e as envia para o middleware de erro, prevenindo derrubadas silenciosas (unhandled rejections).
- **Global Error Handler:** Em `src/shared/http/error-handler.ts`, mapeia erros não previstos e formata saídas JSON homogêneas (status HTTP, stack em dev e oculto em prod, e códigos de sistema). Tratamento específico incluso para erros de SQL (constraint fail, locked).
- **Process Event Listeners:** Logs de alerta crítico são disparados no `uncaughtException` e `unhandledRejection` do root `index.ts`.

## 9. Testing Strategy

No estado atual (Fase MVP de múltiplos módulos), a estratégia é suportada parcialmente:
- **Unidade:** Arquivos independentes (ex.: `.test.ts`) em diversos módulos (`curriculos`, `financas`, `prospeccao`) rodando via scripts nativos `tsx` do Node.
- **E2E/Integração:** Ferramenta *Playwright* está disponível e é usada para testes paralelos e automações, no entanto, não existe um conjunto completo implementado para fluxos críticos de toda API. Testes 100% integrados são considerados um alvo em escopo futuro. Validação atual suporta validação manual e ferramentas de script locais (`scripts/*.ts`).

## 10. Architectural Decisions (ADR-001 a ADR-005)

- **ADR-001:** *Modular Monolith with Express.* — Utilizar um único processo rodando um monolito modular, onde módulos de negócio possuem fronteiras isoladas em pastas mas se beneficiam de execução, memória e DB compartilhados.
- **ADR-002:** *SQLite with WAL and TxQueue.* — Adotar o SQLite com suporte otimizado à concorrência utilizando WAL Mode e uma Promessa em Fila Global (`TxQueue`) para enfileirar fluxos `BEGIN IMMEDIATE`, evitando condições de corrida em escritas intensas.
- **ADR-003:** *Centralized JWT Authentication.* — Implementação de Auth com Short-Lived Access Token e Long-Lived Refresh Token, centralizada em banco para permitir logouts seguros.
- **ADR-004:** *Global Error Middleware.* — Centralizar a formatação das falhas num único middleware `globalErrorHandler` protegido via `asyncHandler`, abolindo blocos try-catch redundantes em controllers HTTP.
- **ADR-005:** *Hybrid Scraping Execution.* — Usar Axios e manipulação DOM via strings/Regex para scrapers sensíveis a performance (leves) e reservar Playwright apenas para integrações bloqueadas por anti-bot ou renderização pesada em JS (LinkedIn/Maps).

## 11. RULES FOR FUTURE DEVELOPMENT

1. **Camadas Isoladas:** Todo controller HTTP só pode ser implementado no diretório base do domínio sob `src/apps/*/`.
2. **Separação de Express:** A lógica de negócio (`services`, `utils`) *NÃO* deve importar classes ou interfaces Express, desacoplando regras da borda HTTP.
3. **Gerenciamento de DB Seguro:** TODAS as inserções atômicas e escritas de múltiplas queries devem obrigatóriamente envolver a chamada interna em `runTransaction` de `src/core/database.ts`.
4. **Sem Arquivos de Configuração Dispersos:** Todas as chaves e ENVs devem ser registradas na schema estrita do Zod no `src/core/config.ts`.
5. **Typescript Strictness:** Manter todos os domínios 100% convertidos para TypeScript, abandonando `require` dinâmico ou retornos arbitrários de arquivos `.js` legados (fase concluída).

## 12. KNOWN TECHNICAL DEBT

- **Critical:** Ausência de uma suíte formalizada de Testes de Integração que cruzem Controllers e o Banco de Dados, criando risco de regressões caso atualizações globais ocorram.
- **High:** Apesar do `TxQueue`, o limite final da taxa de transferência de escrita I/O se tornará um bloqueio se o sistema for estendido massivamente, demandando a transição para PostgreSQL.
- **Medium:** Fragilidade intrínseca a atualizações de UI nos módulos que utilizam automação Web via Playwright (como alterações do LinkedIn ou Maps do Google).
- **Medium:** A infraestrutura e scripts de testes dependem de binários crus chamando `tsx`, carecendo de um orquestrador (ex: Vitest/Jest).
- **Low:** Atualização defasada pontual das especificações Swagger caso desenvolvedores ignorem a manutenção após novas PRs.
- **Info:** Variáveis estáticas de configuração e API Keys injetadas como arquivos CSV no banco na inicialização devem migrar permanentemente para tabelas UI em futuro breve.

## 13. OUT OF SCOPE

- **Microserviços & Scaling Horizontal:** Separação do back-end em aplicações distribuídas não é suportada nem pretendida nesta fase. O SQLite impede instâncias concorrentes da API de escreverem sem corrupção.
- **Tratamento Híbrido com Frontend:** Entrega de conteúdo HTML SSR (NextJS ou EJS) não ocorrerá no Node, devendo permanecer sendo uma API estrita focada em Mobile ou clientes SPA terceiros.
- **Banco em Memória / Redis:** Todo rate limiting e filas de estado efêmeros utilizam memórias locais do host em Node; adoção de Redis está fora de escopo no baseline atual.