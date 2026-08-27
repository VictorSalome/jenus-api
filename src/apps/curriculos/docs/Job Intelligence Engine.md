# Job Intelligence Engine
## Plano Técnico Completo de Desenvolvimento

**Versão:** 1.0  
**Stack:** TypeScript  
**Primeiro Provider:** Gupy  
**Backend:** Node.js + Express  
**Frontend:** Next.js  
**Automação:** Playwright + Chromium  
**Banco:** PostgreSQL + Prisma  
**Filas:** Redis + BullMQ  
**IA:** Provider abstrato de LLM  
**Objetivo:** Construir uma plataforma de inteligência e automação de candidaturas, começando pela Gupy e posteriormente adicionando outras plataformas.

---

# 1. Visão do Produto

O sistema será responsável por encontrar oportunidades profissionais, analisar a compatibilidade entre uma vaga e o perfil do usuário e, posteriormente, auxiliar ou executar o processo de candidatura quando isso for permitido pela plataforma.

O sistema deverá evoluir em etapas:

```text
Busca de vagas
      ↓
Extração
      ↓
Normalização
      ↓
Armazenamento
      ↓
Análise da vaga
      ↓
Compatibilidade
      ↓
Ranking
      ↓
Currículo personalizado
      ↓
Respostas personalizadas
      ↓
Revisão/automação
      ↓
Candidatura
      ↓
Acompanhamento
```

A primeira versão deve concentrar-se exclusivamente na Gupy.

---

# 2. Objetivos do MVP

O MVP não deve tentar resolver todas as plataformas simultaneamente.

O primeiro objetivo é construir uma implementação sólida para uma única plataforma.

## MVP obrigatório

O sistema deverá conseguir:

- cadastrar usuário;
- cadastrar perfil profissional;
- cadastrar habilidades;
- cadastrar experiência;
- cadastrar preferências de vaga;
- cadastrar currículo;
- buscar vagas;
- extrair informações das vagas;
- armazenar vagas;
- evitar duplicidade;
- analisar requisitos;
- calcular compatibilidade;
- apresentar ranking;
- permitir favoritar vaga;
- controlar status da candidatura;
- preparar currículo;
- preparar respostas;
- iniciar fluxo de candidatura;
- registrar todo o histórico da operação.

---

# 3. Stack Definitiva

## Frontend

```text
Next.js 16
React 19
TypeScript
Tailwind CSS 4
shadcn/ui
React Hook Form
Zod
TanStack Query
TanStack Table
Recharts
Lucide
```

---

## Backend

```text
Node.js
TypeScript
Express
Prisma
PostgreSQL
Zod
JWT
Pino
Swagger/OpenAPI
Multer
```

---

## Automação

```text
Playwright
Chromium
```

---

## Infraestrutura

```text
Redis
BullMQ
Docker
Docker Compose
pnpm Workspace
```

---

## IA

Criar uma abstração:

```ts
interface AIProvider {
  analyzeJob(): Promise<JobAnalysis>;
  calculateMatch(): Promise<MatchResult>;
  generateAnswer(): Promise<string>;
  generateCoverLetter(): Promise<string>;
  adaptResume(): Promise<ResumeResult>;
}
```

O primeiro provider pode ser OpenAI.

O restante do sistema não deve depender diretamente da implementação da OpenAI.

---

# 4. Arquitetura Geral

```text
                    ┌────────────────────┐
                    │      Next.js       │
                    │     Dashboard      │
                    └─────────┬──────────┘
                              │
                              ▼
                    ┌────────────────────┐
                    │      Express       │
                    │        API         │
                    └─────────┬──────────┘
                              │
              ┌───────────────┼────────────────┐
              │               │                │
              ▼               ▼                ▼
          PostgreSQL         Redis            AI
          + Prisma          + BullMQ        Provider
              │               │
              │               ▼
              │          Worker System
              │               │
              │               ▼
              │          Playwright
              │               │
              │               ▼
              │             Gupy
              │
              ▼
          Histórico
```

---

# 5. Monorepo

Utilizar pnpm Workspace.

```text
job-intelligence/
│
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── database/
│   ├── shared/
│   ├── types/
│   ├── ai/
│   ├── crawler/
│   ├── matcher/
│   ├── resume/
│   ├── email/
│   └── config/
│
├── docker/
│
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

---

# 6. Backend

Estrutura inicial:

```text
apps/api/src/

├── app.ts
├── server.ts
│
├── config/
│
├── modules/
│   │
│   ├── auth/
│   ├── users/
│   ├── profiles/
│   ├── jobs/
│   ├── applications/
│   ├── resumes/
│   ├── ai/
│   ├── matching/
│   └── providers/
│
├── shared/
│   ├── errors/
│   ├── logger/
│   ├── middleware/
│   └── utils/
│
└── routes/
```

---

# 7. Organização por Feature

Cada módulo deve manter seus arquivos próximos.

Exemplo:

```text
modules/jobs/

├── controllers/
│   ├── createJobController.ts
│   ├── listJobsController.ts
│   └── getJobController.ts
│
├── services/
│   ├── createJobService.ts
│   ├── listJobsService.ts
│   └── analyzeJobService.ts
│
├── repositories/
│   └── jobRepository.ts
│
├── schemas/
│   └── jobSchema.ts
│
├── routes/
│   └── jobRoutes.ts
│
├── types/
│   └── jobTypes.ts
│
└── index.ts
```

---

# 8. Banco de Dados

Principais entidades.

```text
User
Profile
Skill
Experience
Education
Resume
Job
Company
Recruiter
JobRequirement
JobAnalysis
MatchScore
Application
ApplicationAnswer
ApplicationEvent
Provider
Search
SearchResult
AutomationSession
AutomationStep
AIRequest
```

---

# 9. User

```text
User

id
name
email
passwordHash
createdAt
updatedAt
```

---

# 10. Profile

```text
Profile

id
userId
headline
summary
salaryExpectation
remotePreference
location
yearsExperience
englishLevel
createdAt
updatedAt
```

---

# 11. Skills

```text
Skill

id
name
category
```

Relacionamento:

```text
Profile
   │
   └── ProfileSkill
           │
           └── Skill
```

---

# 12. Experiência

```text
Experience

id
profileId
company
role
description
startDate
endDate
current
```

---

# 13. Currículos

O usuário terá um currículo principal.

```text
Resume

id
userId
name
filePath
version
isDefault
createdAt
```

Posteriormente poderão existir currículos adaptados.

```text
ResumeVersion

id
resumeId
jobId
content
filePath
createdAt
```

---

# 14. Job

```text
Job

id
provider
providerJobId
companyId
title
description
location
workModel
salaryMin
salaryMax
currency
url
publishedAt
scrapedAt
createdAt
updatedAt
```

Criar índice único:

```text
(provider, providerJobId)
```

para evitar duplicidade.

---

# 15. Company

```text
Company

id
name
website
linkedinUrl
createdAt
updatedAt
```

---

# 16. Job Requirements

Após extrair uma vaga:

```text
JobRequirement

id
jobId
type
name
importance
required
```

Exemplo:

```text
React
Node.js
TypeScript
Docker
AWS
Inglês
```

---

# 17. Busca de vagas

Criar um módulo:

```text
modules/jobs/search
```

O usuário poderá informar:

```text
Cargo:
Desenvolvedor Full Stack

Tecnologias:
React
Node
Next.js

Local:
Brasil

Modelo:
Remoto

Senioridade:
Pleno

Salário mínimo:
R$ 8.000
```

---

# 18. Provider Architecture

O sistema não pode depender diretamente da Gupy.

Criar uma abstração:

```ts
interface JobProvider {
  getName(): string;

  search(
    params: JobSearchParams
  ): Promise<JobSearchResult[]>;

  getJob(
    identifier: string
  ): Promise<ExternalJob>;

  getApplicationForm?(
    identifier: string
  ): Promise<ApplicationForm>;
}
```

A implementação inicial:

```text
providers/

└── gupy/
    ├── gupyProvider.ts
    ├── gupyBrowser.ts
    ├── gupyParser.ts
    ├── gupySearch.ts
    ├── gupyJob.ts
    └── gupyApplication.ts
```

---

# 19. Gupy Provider

Responsabilidades:

```text
GupyProvider

├── pesquisar vagas
├── abrir vaga
├── extrair dados
├── normalizar dados
└── iniciar candidatura
```

O provider não deve:

- calcular Score;
- chamar IA;
- gerar currículo;
- enviar email;
- controlar dashboard.

Essas responsabilidades pertencem a outros módulos.

---

# 20. Playwright

Criar uma camada de browser.

```text
packages/crawler/

├── browser/
│   ├── browserManager.ts
│   ├── contextManager.ts
│   └── pageManager.ts
│
└── providers/
    └── gupy/
```

O browser manager será responsável por:

- iniciar Chromium;
- criar context;
- criar page;
- fechar browser;
- configurar timeouts;
- registrar logs.

---

# 21. Sessão

A sessão do usuário deve ser tratada de maneira segura.

Nunca salvar:

```text
senha em texto puro
```

Também não armazenar cookies de autenticação sem necessidade.

Quando uma sessão persistente for realmente necessária, armazenar os dados de sessão de forma segura e criptografada, seguindo as regras da plataforma.

---

# 22. Pesquisa

Fluxo:

```text
Usuário
   ↓
Dashboard
   ↓
POST /jobs/search
   ↓
SearchJobsController
   ↓
SearchJobsService
   ↓
GupyProvider
   ↓
Playwright
   ↓
Gupy
```

A resposta do provider deve ser normalizada.

---

# 23. Normalização

Nunca permitir que o restante da aplicação dependa do HTML da Gupy.

Converter:

```text
HTML Gupy

↓

GupyParser

↓

ExternalJob

↓

JobMapper

↓

Job
```

Exemplo:

```ts
interface ExternalJob {
  externalId: string;
  title: string;
  company: string;
  description: string;
  location?: string;
  url: string;
  publishedAt?: Date;
}
```

---

# 24. Parser

O parser deverá extrair:

```text
Título
Empresa
Local
Modelo
Descrição
Requisitos
Benefícios
Salário
Senioridade
URL
ID externo
```

Não depender de uma única classe CSS quando houver alternativas mais robustas.

Priorizar:

```text
semantic selectors
data attributes
labels
roles
structured data
```

e somente depois seletores visuais específicos.

---

# 25. Job Analysis

Após salvar uma vaga:

```text
Job
 ↓
AnalyzeJobJob
 ↓
AI Provider
 ↓
JobAnalysis
```

A IA deverá extrair:

```json
{
  "role": "Full Stack Developer",
  "seniority": "PLENO",
  "skills": [
    "React",
    "Node.js",
    "TypeScript"
  ],
  "languages": [
    "English"
  ],
  "cloud": [
    "AWS"
  ]
}
```

---

# 26. Match Engine

O Match Engine compara:

```text
Perfil

VS

Vaga
```

Não deixar o Score totalmente dependente da IA.

Utilizar uma combinação:

```text
Keyword Matching
+
Structured Matching
+
Semantic Matching
+
AI Evaluation
```

---

# 27. Score

Exemplo:

```text
Cargo              25%
Skills             30%
Experiência        15%
Senioridade        10%
Local/Remoto       10%
Idioma              5%
Salário              5%
```

Resultado:

```text
92%
```

Guardar o resultado.

```text
MatchScore

id
jobId
profileId
score
reason
createdAt
```

---

# 28. Explicação do Score

Nunca mostrar somente:

```text
92%
```

Mostrar:

```text
92% de compatibilidade

✓ React
✓ Node.js
✓ TypeScript
✓ Next.js
✓ PostgreSQL

⚠ AWS
⚠ Inglês avançado
```

Isso aumenta muito a utilidade do sistema.

---

# 29. Ranking

Ordenar:

```text
90-100
Excelente

80-89
Muito bom

70-79
Bom

60-69
Regular

<60
Baixa compatibilidade
```

---

# 30. Currículo Inteligente

O usuário terá um currículo master.

A IA poderá gerar uma versão específica.

```text
Currículo Master

↓

Vaga

↓

AI Resume Adapter

↓

Currículo específico
```

Exemplo:

```text
Vaga:

React
AWS
Docker

↓

Currículo adaptado:

Destacar React
Destacar Docker
Destacar Cloud
```

Não inventar experiências, tecnologias ou certificações que não existam no perfil do usuário.

---

# 31. Application Engine

Criar:

```text
modules/applications/
```

Responsabilidades:

```text
Criar candidatura
Controlar estado
Controlar respostas
Registrar eventos
Registrar erros
```

---

# 32. State Machine

A candidatura deve possuir estados.

```text
DISCOVERED
    ↓
ANALYZED
    ↓
MATCHED
    ↓
READY
    ↓
REVIEW_REQUIRED
    ↓
APPLICATION_STARTED
    ↓
APPLICATION_SUBMITTED
```

Estados alternativos:

```text
SKIPPED
FAILED
BLOCKED
WITHDRAWN
```

---

# 33. Application Form

Ao abrir uma candidatura, o sistema deve tentar identificar os campos disponíveis.

Exemplo:

```text
Nome
Email
Telefone
Currículo
LinkedIn
GitHub
Pretensão salarial
Experiência
Perguntas adicionais
```

Representar internamente:

```ts
interface ApplicationField {
  id: string;
  label: string;
  type:
    | "text"
    | "textarea"
    | "select"
    | "radio"
    | "checkbox"
    | "file";

  required: boolean;

  options?: {
    label: string;
    value: string;
  }[];
}
```

---

# 34. Perguntas da Vaga

O sistema deve detectar perguntas.

Exemplo:

```text
Você possui experiência com React?
```

O sistema consulta o perfil.

```text
Profile

skills:
React
```

Resposta:

```text
Sim
```

---

# 35. Perguntas abertas

Exemplo:

```text
Conte sobre sua experiência profissional.
```

Fluxo:

```text
Pergunta
 ↓
Perfil
 ↓
Experiências
 ↓
Vaga
 ↓
AI
 ↓
Resposta
```

A resposta deverá ser salva antes do envio.

---

# 36. Answer Repository

Criar uma biblioteca de respostas.

```text
ApplicationAnswer

id
userId
questionHash
question
answer
source
createdAt
updatedAt
```

Assim, perguntas repetidas não precisam ser processadas novamente.

---

# 37. Respostas classificadas

O sistema pode identificar categorias:

```text
SALARY
EXPERIENCE
SKILL
EDUCATION
LANGUAGE
LOCATION
AVAILABILITY
MOTIVATION
PERSONAL
OTHER
```

---

# 38. Perguntas sensíveis

O sistema não deve inventar respostas.

Para perguntas que dependam de informação pessoal, legal, declaratória ou que possam ter consequências relevantes:

```text
Pausar

↓

Solicitar confirmação do usuário
```

Exemplo:

```text
A pergunta requer confirmação do candidato.

"Você possui autorização para trabalhar no país?"

[Responder]
```

---

# 39. Human-in-the-loop

Criar uma camada de segurança:

```text
AUTO

REVIEW_REQUIRED

BLOCKED
```

O usuário define:

```text
Aplicar automaticamente:
SIM/NÃO
```

Por padrão:

```text
REVIEW_REQUIRED
```

---

# 40. Automação da candidatura

O fluxo deverá ser:

```text
Job selecionada
      ↓
Score aprovado
      ↓
Currículo preparado
      ↓
Formulário identificado
      ↓
Campos analisados
      ↓
Respostas preparadas
      ↓
Validação
      ↓
Usuário aprova
      ↓
Playwright preenche
      ↓
Validação final
      ↓
Envio
```

Para automatização completa, isso só deve ocorrer em fluxos permitidos pela plataforma e sem contornar CAPTCHA, mecanismos anti-bot, autenticação ou restrições de uso.

---

# 41. Nunca clicar cegamente

Não implementar:

```ts
await page.locator("button").nth(4).click();
```

Isso é extremamente frágil.

Preferir:

```ts
page.getByRole("button", {
  name: /candidatar/i
});
```

ou atributos semânticos estáveis.

---

# 42. Application Automation Engine

Criar:

```text
automation/

├── application/
│
├── browser/
│
├── forms/
│
├── selectors/
│
└── safety/
```

---

# 43. Application Session

Cada tentativa deve criar uma sessão.

```text
AutomationSession

id
applicationId
provider
startedAt
finishedAt
status
error
```

---

# 44. Automation Steps

Cada ação deve ser registrada.

```text
AutomationStep

id
sessionId
order
type
description
status
startedAt
finishedAt
error
```

Exemplo:

```text
1 OPEN_JOB          SUCCESS
2 OPEN_APPLICATION  SUCCESS
3 LOAD_FORM         SUCCESS
4 UPLOAD_RESUME     SUCCESS
5 ANSWER_QUESTION   SUCCESS
6 VALIDATE_FORM     SUCCESS
7 SUBMIT            SUCCESS
```

---

# 45. Screenshot e diagnóstico

Durante desenvolvimento e testes, salvar evidências das etapas quando apropriado.

Exemplo:

```text
automation/
    screenshots/
```

Isso facilita identificar:

```text
"o botão mudou"

"o formulário mudou"

"o campo não foi encontrado"
```

Em produção, evitar armazenar dados pessoais desnecessários nas capturas e aplicar política de retenção.

---

# 46. Erros

Exemplo:

```text
APPLICATION_BUTTON_NOT_FOUND

FORM_FIELD_NOT_FOUND

RESUME_UPLOAD_FAILED

QUESTION_NOT_SUPPORTED

SESSION_EXPIRED

LOGIN_REQUIRED

CAPTCHA_REQUIRED

PLATFORM_BLOCKED

UNKNOWN_ERROR
```

Se houver CAPTCHA:

```text
CAPTCHA_REQUIRED
```

e o processo deve parar.

Não implementar mecanismos para contorná-lo.

---

# 47. Retry

Não repetir indiscriminadamente.

Configurar:

```text
maxAttempts = 3
```

Mas somente para erros transitórios.

Exemplo:

```text
Timeout
Network Error
Temporary Server Error
```

Não fazer retry automático para:

```text
CAPTCHA
Account Blocked
Authentication Failure
Unsupported Form
```

---

# 48. Rate Limit

Criar controle de frequência.

Exemplo conceitual:

```text
Job Search

↓

Rate Limiter

↓

Provider
```

O sistema deve respeitar limites e regras da plataforma.

---

# 49. BullMQ

O scraping não deve ser executado diretamente dentro da requisição HTTP.

Errado:

```text
POST /search

↓

Express

↓

Playwright demora 2 minutos
```

Correto:

```text
POST /search

↓

Express

↓

Cria Job no BullMQ

↓

Retorna 202

↓

Worker processa
```

---

# 50. Filas

Criar filas:

```text
job-search

job-analysis

job-matching

resume-generation

answer-generation

application

email

notifications
```

---

# 51. Worker

Exemplo:

```text
SearchWorker

↓

GupyProvider

↓

Extrair vagas

↓

Salvar banco

↓

Adicionar job-analysis
```

Depois:

```text
AnalysisWorker

↓

AI

↓

Salvar análise

↓

Adicionar match job
```

---

# 52. Pipeline

O pipeline completo:

```text
SEARCH
 ↓
SCRAPE
 ↓
NORMALIZE
 ↓
SAVE
 ↓
ANALYZE
 ↓
MATCH
 ↓
RANK
 ↓
RESUME
 ↓
ANSWERS
 ↓
REVIEW
 ↓
APPLICATION
```

---

# 53. Dashboard

Dashboard inicial:

```text
┌──────────────────────────────┐
│ Vagas encontradas            │
│ 842                          │
└──────────────────────────────┘

┌──────────────────────────────┐
│ Alta compatibilidade         │
│ 47                           │
└──────────────────────────────┘

┌──────────────────────────────┐
│ Candidaturas                 │
│ 18                           │
└──────────────────────────────┘
```

---

# 54. Job List

Colunas:

```text
Empresa
Cargo
Local
Modelo
Score
Data
Status
```

Ações:

```text
Ver
Favoritar
Ignorar
Preparar candidatura
Aplicar
```

---

# 55. Job Details

Mostrar:

```text
Empresa
Cargo
Descrição
Requisitos
Benefícios
Score
Motivos do score
Tecnologias encontradas
Tecnologias ausentes
Currículo recomendado
Status
```

---

# 56. Application Preview

Antes do envio:

```text
Vaga:

Desenvolvedor Full Stack

Score:

94%

Currículo:

Victor - Full Stack - React/Node

Perguntas:

1. Possui experiência com React?
   Sim

2. Pretensão salarial?
   R$ 9.000

3. Conte sobre sua experiência.
   [resposta gerada]
```

Botões:

```text
[Editar]

[Salvar]

[Enviar candidatura]
```

---

# 57. Configuração de Automação

O usuário poderá escolher:

```text
Modo manual

Modo assistido

Modo automático
```

## Manual

Nada é enviado automaticamente.

## Assistido

O sistema prepara tudo e o usuário confirma.

## Automático

Somente executar fluxos previamente aprovados e compatíveis com as regras da plataforma.

---

# 58. Segurança

Nunca armazenar:

```text
senha em texto puro
```

Utilizar:

```text
bcrypt/argon2
```

para senha.

JWT para autenticação.

Secrets somente em:

```text
.env
```

---

# 59. Dados sensíveis

Currículos, emails, telefones, respostas de candidatura e informações pessoais devem receber tratamento apropriado.

Aplicar:

```text
Encryption at rest
Access control
Retention policy
Audit logs
```

Não armazenar dados que não sejam necessários.

---

# 60. Logs

Utilizar Pino.

Exemplo:

```text
INFO
job.search.started

INFO
job.search.completed

INFO
job.analysis.completed

WARN
application.review_required

ERROR
application.form_field_not_found
```

Nunca registrar:

```text
password
JWT
cookies
tokens
```

---

# 61. Auditoria

Toda candidatura deve ter histórico.

```text
ApplicationEvent

CREATED
ANALYZED
RESUME_GENERATED
ANSWER_GENERATED
REVIEWED
STARTED
SUBMITTED
FAILED
```

---

# 62. API

Principais endpoints:

```text
POST /auth/register
POST /auth/login

GET /profile
PUT /profile

POST /jobs/search
GET /jobs
GET /jobs/:id

POST /jobs/:id/analyze
GET /jobs/:id/match

POST /jobs/:id/prepare-application
GET /applications
GET /applications/:id

POST /applications/:id/review
POST /applications/:id/start
POST /applications/:id/submit
```

---

# 63. API não executa Playwright diretamente

A API apenas cria jobs.

Exemplo:

```text
POST /jobs/search

↓

SearchJobQueue.add()

↓

202 Accepted
```

Worker:

```text
SearchJobWorker

↓

Playwright
```

---

# 64. Frontend

Estrutura:

```text
apps/web/src/

├── app/
│
├── features/
│   ├── auth/
│   ├── jobs/
│   ├── profile/
│   ├── resumes/
│   ├── applications/
│   └── dashboard/
│
├── components/
├── lib/
├── hooks/
└── providers/
```

---

# 65. Tela de Perfil

Campos:

```text
Cargo desejado

Resumo

Experiência

Skills

Formação

Idiomas

Localização

Modelo de trabalho

Pretensão salarial
```

---

# 66. Tela de Preferências

```text
Cargos

Tecnologias

Senioridade

Localização

Remoto

Híbrido

Presencial

Salário mínimo
```

---

# 67. Tela de Busca

```text
Cargo
Tecnologias
Local
Modelo
Senioridade
```

Botão:

```text
Buscar vagas
```

Ao clicar:

```text
Queue criada

↓

Status:
PROCESSING
```

---

# 68. Status da busca

```text
PENDING
PROCESSING
COMPLETED
FAILED
```

---

# 69. IA desacoplada

Criar:

```text
packages/ai/

├── contracts/
│   └── aiProvider.ts
│
├── providers/
│   └── openai/
│
├── prompts/
│   ├── jobAnalysis.ts
│   ├── match.ts
│   ├── resume.ts
│   └── applicationAnswer.ts
│
└── services/
```

---

# 70. Prompts versionados

Nunca deixar prompts espalhados pelo código.

Exemplo:

```text
prompts/job-analysis/v1
prompts/job-analysis/v2
```

Guardar:

```text
AIRequest

provider
model
promptVersion
input
output
tokens
latency
createdAt
```

---

# 71. Custos de IA

Controlar:

```text
tokens
requests
model
cost
```

Assim será possível saber quanto cada usuário está consumindo.

---

# 72. Embeddings

Não é necessário no primeiro MVP.

Adicionar posteriormente:

```text
PostgreSQL
+
pgvector
```

Fluxo:

```text
Perfil

↓

Embedding

↓

Vaga

↓

Embedding

↓

Cosine Similarity

↓

Semantic Score
```

---

# 73. LinkedIn no futuro

O LinkedIn não deve ser implementado no MVP.

Quando entrar:

```text
providers/

└── linkedin/
```

Poderá existir:

```text
LinkedIn Jobs
LinkedIn Posts
Recruiters
```

A arquitetura existente não deverá ser modificada.

---

# 74. Greenhouse e Lever

Mesmo princípio:

```text
GupyProvider

GreenhouseProvider

LeverProvider
```

Todos implementam:

```ts
JobProvider
```

---

# 75. Princípio principal

O restante do sistema nunca deve fazer:

```ts
if (provider === "gupy") {
   ...
}
```

Esse tipo de código deve ser evitado.

Em vez disso:

```ts
const provider = providerRegistry.get("gupy");

await provider.search(params);
```

---

# 76. Provider Registry

```text
ProviderRegistry

Gupy
Greenhouse
Lever
LinkedIn
```

O registry resolve o provider.

---

# 77. Desenvolvimento por fases

## Fase 0 — Fundação

Criar:

```text
Monorepo
TypeScript
pnpm
Docker
PostgreSQL
Redis
Express
Next.js
Prisma
```

Resultado:

Projeto sobe localmente.

---

# Fase 1 — Auth

Implementar:

```text
Register
Login
JWT
Refresh Token
Protected Routes
```

Resultado:

Usuário consegue acessar a plataforma.

---

# Fase 2 — Profile

Implementar:

```text
Perfil
Skills
Experiência
Preferências
Currículo
```

Resultado:

O sistema conhece o candidato.

---

# Fase 3 — Job Domain

Criar:

```text
Job
Company
JobRequirement
Search
```

Resultado:

Banco preparado para vagas.

---

# Fase 4 — Gupy Search

Implementar:

```text
GupyProvider
Playwright
Search
Parser
Normalizer
```

Resultado:

Buscar vagas e armazenar.

---

# Fase 5 — Job Analysis

Implementar:

```text
AIProvider
JobAnalyzer
RequirementExtractor
```

Resultado:

Vaga interpretada.

---

# Fase 6 — Matching

Implementar:

```text
MatchEngine
KeywordMatcher
SemanticMatcher
ScoreCalculator
```

Resultado:

Vagas ranqueadas.

---

# Fase 7 — Dashboard

Implementar:

```text
JobList
JobDetails
Filters
Score
Favorites
```

Resultado:

Usuário consegue encontrar as melhores vagas.

---

# Fase 8 — Resume Engine

Implementar:

```text
ResumeParser
ResumeAdapter
ResumeGenerator
```

Resultado:

Currículo adaptado para cada vaga.

---

# Fase 9 — Application Form Analyzer

Implementar:

```text
FormDetector
FieldParser
QuestionClassifier
AnswerGenerator
```

Resultado:

Sistema consegue interpretar formulários.

---

# Fase 10 — Application Preparation

Implementar:

```text
PrepareApplication
GenerateAnswers
ValidateAnswers
GenerateResume
```

Resultado:

Sistema prepara candidatura completa sem necessariamente enviá-la.

---

# Fase 11 — Human Review

Criar:

```text
ApplicationPreview
AnswerEditor
ResumePreview
Approval
```

Resultado:

Usuário revisa tudo antes do envio.

---

# Fase 12 — Application Automation

Implementar somente após as fases anteriores estarem estáveis.

Fluxo:

```text
Application

↓

Browser Session

↓

Open Job

↓

Start Application

↓

Detect Form

↓

Map Fields

↓

Fill Safe Fields

↓

Upload Resume

↓

Fill Approved Answers

↓

Validate

↓

Review/Approval

↓

Submit
```

A implementação deve respeitar os termos da plataforma e não deve contornar CAPTCHA, antifraude, bloqueios, autenticação ou outros mecanismos de proteção.

---

# Fase 13 — Application Tracking

Depois do envio:

```text
APPLICATION_SUBMITTED
```

Registrar:

```text
Data
Hora
Vaga
Empresa
Currículo utilizado
Respostas
Score
Provider
```

---

# Fase 14 — Email

Adicionar:

```text
EmailProvider
```

Suportar:

```text
SMTP
Nodemailer
```

Posteriormente:

```text
Resend
SES
SendGrid
```

---

# Fase 15 — Recruiter Intelligence

Somente depois do MVP.

Possibilidades:

```text
Identificar recrutadores
Encontrar posts
Extrair contatos públicos
Relacionar recrutador ↔ empresa
Relacionar recrutador ↔ vaga
```

Sempre respeitando as regras e permissões da fonte.

---

# Fase 16 — Multi Provider

Adicionar:

```text
Greenhouse
Lever
Indeed
Vagas
Remotar
LinkedIn
```

Cada novo provider deve implementar a mesma interface.

---

# 78. Ordem correta de desenvolvimento

Não começar pelo Playwright.

A ordem recomendada é:

```text
1. Monorepo

2. Infraestrutura

3. Banco

4. Auth

5. Profile

6. Job Domain

7. Provider Interface

8. Gupy Provider

9. Parser

10. Job Analysis

11. Match Engine

12. Dashboard

13. Resume Engine

14. Application Form Analyzer

15. Application Preparation

16. Human Review

17. Automation Engine

18. Application Tracking

19. Email

20. Novos Providers
```

---

# 79. Critério de conclusão do MVP

O MVP será considerado funcional quando:

```text
Usuário
 ↓
Cadastra perfil
 ↓
Configura preferências
 ↓
Executa busca
 ↓
Gupy retorna vagas
 ↓
Vagas são armazenadas
 ↓
IA analisa
 ↓
Score é calculado
 ↓
Dashboard mostra ranking
 ↓
Usuário abre vaga
 ↓
Sistema explica compatibilidade
 ↓
Sistema prepara candidatura
 ↓
Usuário revisa
```

A automação de envio será uma etapa posterior e separada.

---

# 80. Critérios de qualidade

O sistema deve:

- utilizar TypeScript strict;
- evitar `any`;
- validar entradas com Zod;
- separar Controller de Service;
- separar Provider de domínio;
- não acoplar domínio à Gupy;
- utilizar filas para processos demorados;
- possuir logs estruturados;
- possuir tratamento de erros;
- possuir testes unitários;
- possuir testes de integração;
- possuir testes E2E;
- possuir migrations;
- possuir seed;
- possuir Docker para desenvolvimento;
- possuir `.env.example`.

---

# 81. Testes

## Unitários

Testar:

```text
ScoreCalculator
KeywordMatcher
QuestionClassifier
AnswerValidator
JobNormalizer
```

---

## Integração

Testar:

```text
API
Prisma
PostgreSQL
Redis
Queues
```

---

## E2E

Testar:

```text
Login

Perfil

Busca

Listagem

Detalhes

Matching

Application Preview
```

Para automação de browser, utilizar ambientes controlados e dados de teste sempre que possível.

---

# 82. Definition of Done

Uma feature somente será considerada pronta quando possuir:

```text
Código
↓

TypeScript

↓

Validação

↓

Tratamento de erro

↓

Logs

↓

Teste

↓

Documentação

↓

Integração

↓

Review
```

---

# 83. Regra arquitetural principal

O sistema deve ser construído para que:

```text
Gupy
```

seja apenas o primeiro provider.

Não construir:

```text
"Um sistema de automação da Gupy"
```

Construir:

```text
"Um Job Intelligence Engine
com Gupy como primeiro provider."
```

Essa diferença deve orientar toda a arquitetura.

---

# 84. Resultado final esperado

A plataforma deverá evoluir para:

```text
                    JOB INTELLIGENCE ENGINE
                              │
             ┌────────────────┼────────────────┐
             │                │                │
             ▼                ▼                ▼
        JOB SOURCES          AI             PROFILE
             │                │                │
      ┌──────┼──────┐         │                │
      │      │      │         │                │
     Gupy  LinkedIn Greenhouse │                │
      │      │      │         │                │
      └──────┼──────┘         │                │
             │                │                │
             ▼                ▼                ▼
          NORMALIZER ─────► MATCH ENGINE ◄──── PROFILE
                              │
                              ▼
                           RANKING
                              │
                 ┌────────────┼────────────┐
                 │            │            │
                 ▼            ▼            ▼
             RESUME        ANSWERS      COVER LETTER
                 │            │            │
                 └────────────┼────────────┘
                              │
                              ▼
                       APPLICATION
                              │
                              ▼
                         TRACKING
                              │
                              ▼
                         ANALYTICS
```

O produto final deverá ser capaz de transformar o processo de procura de emprego de uma atividade manual e repetitiva em um fluxo orientado por dados, no qual o usuário possui controle sobre seu perfil, suas preferências, suas candidaturas e sobre qualquer ação automatizada.