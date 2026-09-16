# Job Automation Flow Baseline

## 1. Executive Summary
Este documento detalha a arquitetura funcional atual do módulo "Curriculos / Vagas" no Jenus API. O sistema é responsável por realizar o web scraping de vagas no LinkedIn, qualificá-las com base em regras predefinidas, e automatizar o envio de currículos para as vagas compatíveis, respeitando limites de envio por hora e gerenciando o estado de cada candidatura.

## 2. Product Journey
A jornada do produto abrange o ciclo de vida completo de uma candidatura:
1. **Coleta**: O sistema varre periodicamente o LinkedIn em busca de novas vagas que correspondam aos perfis cadastrados.
2. **Processamento e Desduplicação**: Vagas extraídas são processadas para evitar duplicatas.
3. **Qualificação**: A vaga passa por um sistema de pontuação; se atingir a nota mínima do perfil, ela se torna elegível para candidatura.
4. **Decisão e Estado**: A vaga vai para o estado de "pendente" (ou pode ser aprovada/rejeitada manual/automaticamente).
5. **Ação**: O Worker de E-mail entra em ação, formatando o envio e disparando a candidatura, respeitando os limites horários definidos pela infraestrutura (SMTP/regras de negócio).

## 3. Functional Matrix

| Funcionalidade | Status Atual | Detalhes |
| --- | --- | --- |
| Scraping LinkedIn | **EXISTE** | Funcional (`src/apps/curriculos/scraper/linkedin/`). |
| Desduplicação | **PARCIAL** | Básica. Baseada em URL canônica, tracking id e texto (focada na coleta). |
| Qualificação de Vagas | **EXISTE** | Baseada em um `min_score` configurável por perfil. |
| Automação de Envio (Worker) | **EXISTE** | Implementado via `vagasEmailWorker.service.ts`. |
| Gestão de Estados de Candidatura | **EXISTE** | Implementado via `pendingApplications.service.ts`. |
| Limite de Envios/Hora | **EXISTE** | Restrito via lógica interna do Worker (regra dos 30/hora). |
| Integração Frontend/UX | **AUSENTE / PARCIAL** | Rotas Express existem, mas o state real no hub UI não está 100% acoplado. |
| Observabilidade Básica | **PARCIAL** | Baseia-se no registro de logs da aplicação e banco de dados. |

## 4. End-to-End Flow
1. **Cron/Gatilho de Scraping**: Aciona a busca no LinkedIn.
2. **Scraper Engine**: Extrai os dados brutos e realiza limpeza inicial.
3. **Deduplicator**: Checa existência de URL, Tracking ID ou matching de texto para impedir registros repetidos.
4. **Qualification Engine**: Verifica os dados e assinala um _score_ de compatibilidade com os perfis de usuários. Se `>= min_score`, prossegue.
5. **Pending Application Manager**: Registra a vaga com o estado `pending` (ou similar) no sistema (`pendingApplications.service.ts`).
6. **Email Worker**: Em background, busca vagas pendentes/aprovadas para enviar.
7. **Limiter/Throttler**: Confere quantos e-mails foram enviados na hora atual. Se o limite não foi atingido, despacha via SMTP.
8. **State Update**: Atualiza a aplicação para `sent` (ou `error` em caso de falha).

## 5. Scraping
Implementado dentro de `src/apps/curriculos/scraper/linkedin/`. Responsável por navegar (ou consumir APIs) na plataforma do LinkedIn. Extrai os posts/vagas buscando detalhes relevantes como descrição da vaga, cargo, informações de contato (quando aplicável) e links canônicos.

## 6. Qualification
O módulo de qualificação tem um funcionamento determinístico baseado em um score. Cada vaga analisada recebe uma pontuação em relação ao perfil configurado no sistema. Apenas as vagas que atingem ou ultrapassam a nota mínima (`min_score`) atrelada ao perfil do usuário são promovidas para a etapa de candidatura.

## 7. Deduplication
O processo de desduplicação ocorre hoje de forma primária e focado na coleta. Os critérios de unicidade são:
- **URL Canônica** da vaga;
- **Tracking ID** fornecido pela plataforma fonte (LinkedIn);
- **Matching de texto** para evitar repostagens literais ou com modificações mínimas.

## 8. Curriculum Sending (SMTP, envios por hora)
O serviço responsável por efetivar as candidaturas é o Worker de Email, situado em `vagasEmailWorker.service.ts`. Ele roda continuamente (ou periodicamente) em _loop_. Lê os registros marcados para envio (ex: "pending" ou "approved"), prepara o corpo do e-mail (anexando o currículo), e se conecta à infraestrutura SMTP para disparar as mensagens aos recrutadores/plataformas. 

## 9. 30/Hour Rule
A aplicação possui um _throttler_ integrado ao worker de e-mails para evitar punições ou marcações de spam pelos provedores de e-mail (SMTP). O cálculo restringe ativamente as chamadas. A lógica calcula: `Math.max(0, (cfg.hourlyLimit || 30) - enviosHoraAtual);`. Isso garante que em uma janela de 60 minutos, não passem de 30 envios por usuário/configuração (ou conforme o configurado em `cfg.hourlyLimit`).

## 10. Frontend
Rotas na API (Express) estão expostas para permitir manipulação de perfis, visualização de candidaturas ("pending", "approved", "rejected", "sent", "error"), e afins. Contudo, o frontend/hub de UI atualmente carece de um acoplamento completo com o backend. Não há feedback visual instantâneo ou interface unificada totalmente fluida de gerenciamento dos estados da candidatura.

## 11. Backend ↔ Frontend Contract
O contrato da API existe, provendo os endpoints clássicos (CRUD) de status das aplicações gerenciadas pelo `pendingApplications.service.ts`.
- **Estados esperados no payload**: `"pending" | "approved" | "rejected" | "sent" | "error"`
O Frontend precisa ser atualizado para consumir esses contratos ativamente.

## 12. Business Rules
- **Qualificação Rígida**: Nenhuma candidatura ocorre se a vaga for inferior ao `min_score`.
- **Antispam Preventivo**: Limite hard-coded / configurável de segurança (regra dos 30 envios/hora).
- **Prevenção de Flood**: Desduplicação previne spammar a mesma empresa/vaga diversas vezes.

## 13. Observability
Hoje as candidaturas deixam rastro por meio de atualização de _estado_ no banco (`sent`, `error`). Problemas na conexão com o LinkedIn ou SMTP devem estar registrados apenas nos logs de _stdout_ ou arquivos de log locais gerados pela aplicação Node.

## 14. Functional Gaps
- **Desduplicação Estreita**: A desduplicação atua majoritariamente no momento do _scraping_. Se duas instâncias diferentes de uma vaga bypassarem a checagem de texto, não há uma validação robusta no ato do _envio real_ que impeça mandar o mesmo currículo para a mesma empresa/recrutador no mesmo dia de maneira contextual.
- **Frontend Ausente / Desconectado**: Usuários não conseguem gerenciar "pending applications" ou monitorar a saúde da sua conta e do limite dos seus e-mails facilmente.
- **Gestão de Falhas do Scraping**: Não há menção clara de retentativas ou lidar com _rate limits_ e bloqueios por parte do LinkedIn.

## 15. Candidatos para Missão #8
Com base nos gaps e análise do estado atual, propõem-se os seguintes itens para o próximo ciclo de desenvolvimento (Missão #8):
1. **Implementação do Acoplamento Frontend/Backend**: Criação ou finalização das interfaces no Hub UI para permitir que o usuário gerencie as candidaturas pendentes e visualize relatórios de envios (sucessos e erros).
2. **Evolução da Desduplicação (Camada de Envio)**: Adicionar um verificador preventivo de redundância antes da etapa SMTP (ex: bloquear envios subsequentes para o mesmo e-mail destino nas últimas 48h).
3. **Mecanismos de Resiliência de Scraping**: Implementação de rotação de proxies e lógicas de backoff exponencial no `src/apps/curriculos/scraper/linkedin/` para mitigar bloqueios de sessão do LinkedIn.
4. **Monitoramento e Alertas (Observabilidade)**: Exportar métricas do `vagasEmailWorker` (erros de SMTP, total enviados vs limit) e do status do _scraper_ para notificar os administradores/usuário sobre gargalos.

---

## 16. JOB-002 — Idempotência e prevenção de duplicidade (Implementado)

Para mitigar os riscos críticos de envios duplicados, a arquitetura de estado foi consolidada em torno do conceito de idempotência estrita tanto na aprovação manual quanto na automação em background.

### Identidade da Candidatura
- A identidade na automação utiliza o `job_id` (hasheado deterministicamente pelo scraper).
- A proteção extra de flood via e-mail utiliza a verificação cruzada de `contact_email` num período de 72h, englobando envios manuais e automáticos.

### Estados e Claims
- **Claim Atômico (Fluxo Automático)**: A reserva de vagas no worker passou a utilizar a `txQueue` (via `runTransaction`) encapsulando a transação `BEGIN IMMEDIATE`. Isso previne crashes no SQLite (evitando `SQLITE_BUSY` `cannot start a transaction within a transaction`) que ocorriam ao rodar instâncias paralelas do worker.
- **Claim Atômico (Fluxo Manual)**: Na rota `/pending-applications/:id/aprovar`, a transição utiliza um bloqueio de status (`UPDATE ... SET status = 'approved' WHERE status = 'pending'`). Requisições HTTP concorrentes (ex: duplo-clique no Frontend) causarão falha imediata na segunda requisição, prevenindo múltiplos envios para a mesma vaga.

### Recovery e Crash Windows
- A janela crítica de "crash pós-envio SMTP" foi fechada. Ao iniciar o disparo, o id do envio (`envio_id`) é atualizado atomicamente atrelado à tabela `curriculo_automacao_candidaturas` *antes* do envio do e-mail.
- Caso o processo Node sofra Crash durante o transporte, a rotina de *Reconciliação* espelhará exatamente a resposta do e-mail retida no registro de envios, evitando reenvios cegos (Retries indevidos) e duplicatas no destino. Se ocorreu timeout real de processamento, a vaga volta a ficar elegível após ser mapeada para `FAILED`.
- O limite de *30/hora* agora engloba fluxos manuais com base na verificação do rate limit de sliding window, protegendo a conta real de e-mail.

---

## 17. JOB-001 — Regra de 30 envios/hora (Implementado)

O controle de envios horários, essencial para preservar a saúde e reputação de contas SMTP (como o limite severo de apps integrados ao Gmail), foi reestruturado de um mecanismo rudimentar para uma política de _Rate Limit_ transacional.

### Semântica da Regra
- **De Fixed Bucket para Sliding Window:** Ao invés de zerar o relógio na "virada da hora" (permitindo 60 envios em 2 minutos via _Fixed Window_), agora a aplicação lê estritamente: "Qual a quantidade de e-mails despachados ou processando nos últimos 60 minutos rotativos?".

### Fonte de Verdade e Atomicidade
- Nenhuma variável em memória conta cota. A fonte da verdade são os registros do banco de dados, mapeados numa query unificada em `rateLimit.service.ts` que engloba:
  1. O total de logs em `curriculo_envios` (`created_at >= -60m`).
  2. As candidaturas atualmente em reserva no fluxo autônomo (`status = PROCESSING`).
  3. As aprovações manuais gerando PDF (`status = approved`).
- **Mutex Atômico:** Toda essa query é disparada estritamente encapsulada pelo `runTransaction` (SQLite BEGIN IMMEDIATE), impossibilitando "Race Conditions" mesmo sob stress de Dezenas de Workers Paralelos.

### Comportamentos Validados
- **Restart-Proof:** A cota é imune a _deploys_ e _crashes_ de container. Quando o backend sobe, o _Sliding Window_ reflete 100% da realidade histórica dos últimos 60 min.
- **Fail e Retry:** Se o disparo SMTP for rejeitado em definitivo, a vaga entra em FAILED. A tentativa falha consumiu a rede SMTP e, por consequência, um _slot_ na cota da última hora, evitando bloqueios na provedora de e-mail por excesso de falhas repetidas.
- **Integração Automático/Manual:** A interface HTTP de aprovação manual agora é submetida à validação da Cota no `pendingApplications.service.ts`. Clicar freneticamente para exceder os 30/hora não comprometerá mais o remetente nativo.