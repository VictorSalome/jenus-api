/**
 * Constantes e Regras Heurísticas para Parsing de Vagas do LinkedIn
 */

// Domínios genéricos de e-mail (usados para distinguir e-mail corporativo na identificação de empresa)
export const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "yahoo.com.br",
  "uol.com.br",
  "bol.com.br",
  "icloud.com",
  "live.com",
  "proton.me",
  "protonmail.com",
  "terra.com.br",
  "ig.com.br",
]);

// Domínios de e-mail a ignorar (falsos positivos comuns)
export const EMAIL_IGNORE_DOMAINS = new Set([
  "linkedin.com",
  "sentry.io",
  "example.com",
  "domain.com",
  "company.com",
  "github.com",
  "w3.org",
  "schema.org",
  "google.com",
  "apple.com",
  "microsoft.com",
]);

// Extensões de arquivo a descartar caso apareçam coladas ao arroba
export const EMAIL_INVALID_SUFFIXES = [
  ".png",
  ".jpg",
  ".jpeg",
  ".svg",
  ".webp",
  ".gif",
  ".pdf",
];

// Regex de extração de e-mail robusto
export const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/gi;

// Dicionário de Skills Técnicas mapeadas
export const KNOWN_TECH_SKILLS: Record<string, string[]> = {
  "React": ["react", "react.js", "reactjs", "react native"],
  "Node.js": ["node", "node.js", "nodejs"],
  "TypeScript": ["typescript", "ts"],
  "JavaScript": ["javascript", "js", "ecmascript"],
  "Next.js": ["next.js", "nextjs", "next"],
  "Vue.js": ["vue", "vue.js", "vuejs"],
  "Angular": ["angular", "angularjs"],
  "Python": ["python", "django", "fastapi", "flask"],
  "Java": ["java", "spring", "spring boot"],
  ".NET": [".net", "dotnet", "c#", "csharp", "asp.net"],
  "PHP": ["php", "laravel", "symfony"],
  "Flutter": ["flutter", "dart"],
  "Go": ["golang", "go"],
  "Ruby": ["ruby", "rails", "ruby on rails"],
  "SQL": ["sql", "postgresql", "postgres", "mysql", "sql server", "oracle"],
  "NoSQL": ["mongodb", "redis", "dynamodb", "cassandra"],
  "AWS": ["aws", "amazon web services", "lambda", "s3", "ec2"],
  "Azure": ["azure"],
  "GCP": ["gcp", "google cloud"],
  "Docker": ["docker", "container", "containers"],
  "Kubernetes": ["kubernetes", "k8s"],
  "CI/CD": ["ci/cd", "cicd", "github actions", "gitlab ci", "jenkins"],
  "Git": ["git", "github", "gitlab"],
  "GraphQL": ["graphql"],
  "REST": ["rest", "restful", "api rest"],
  "Testes": ["jest", "cypress", "playwright", "unit tests", "testes unitários", "qa"],
};

// Indicadores Positivos de Vaga (+ peso no confidence)
export const POSITIVE_JOB_INDICATORS: Array<{ pattern: RegExp; weight: number; label: string }> = [
  {
    pattern: /\b(?:estamos\s+contratando|temos\s+vagas?|vagas?\s+abertas?|nova\s+oportunidade|oportunidade\s+para|abrimos\s+vagas?)\b/i,
    weight: 0.30,
    label: 'Termo explícito de vaga aberta',
  },
  {
    pattern: /\b(?:envi(?:e|ar)\s+(?:seu\s+)?(?:cv|curr[ií]culo)|mand(?:e|ar)\s+(?:seu\s+)?(?:cv|curr[ií]culo)|interessados(?:\s+devem)?\s+enviar|candidat(?:e|ar)-se\s+(?:por|via)\s+e-?mail)\b/i,
    weight: 0.25,
    label: 'Chamada para envio de CV por e-mail',
  },
  {
    pattern: /\b(?:requisitos|o\s+que\s+esperamos|perfil\s+desejado|principais\s+atividades|o\s+que\s+voc[eê]\s+vai\s+fazer|diferenciais?)\b/i,
    weight: 0.15,
    label: 'Estrutura típica de descrição de vaga (requisitos/atividades)',
  },
  {
    pattern: /\b(?:j[uú]nior|pleno|s[eê]nior|especialista|tech\s+lead|est[aá]gio|trainee)\b/i,
    weight: 0.10,
    label: 'Nível de senioridade especificado',
  },
  {
    pattern: /\b(?:remoto|h[ií]brido|presencial|clt|pj|contrata[cç][aã]o)\b/i,
    weight: 0.10,
    label: 'Modalidade de trabalho ou regime de contratação',
  },
  {
    pattern: /\b(?:sal[aá]rio|faixa\s+salarial|benef[ií]cios|remunera[cç][aã]o|pretens[aã]o)\b/i,
    weight: 0.05,
    label: 'Menção a remuneração ou benefícios',
  },
];

// Indicadores Negativos (posts que geram falsos positivos -> penalidade severa)
export const NEGATIVE_INDICATORS: Array<{ pattern: RegExp; penalty: number; label: string }> = [
  {
    pattern: /\b(?:comecei\s+em\s+um\s+novo\s+cargo|novo\s+emprego|nova\s+jornada\s+na|comemorando\s+meu\s+novo|agrade[cç]o\s+a\s+todos\s+que\s+me\s+apoiaram|feliz\s+em\s+compartilhar\s+que\s+fui\s+promovido)\b/i,
    penalty: 0.60,
    label: 'Celebração de novo emprego / promoção pessoal',
  },
  {
    pattern: /\b(?:estou\s+em\s+busca\s+de\s+(?:uma\s+)?(?:nova\s+)?oportunidade|em\s+busca\s+de\s+recoloca[cç][aã]o|#opentowork|dispon[ií]vel\s+para\s+o\s+mercado|procuro\s+oportunidade|meu\s+curr[ií]culo\s+est[aá]\s+anexo)\b/i,
    penalty: 0.60,
    label: 'Candidato procurando emprego (#OpenToWork)',
  },
  {
    pattern: /\b(?:leia\s+o\s+artigo|confira\s+a\s+mat[eé]ria|link\s+nos\s+coment[aá]rios|assista\s+ao\s+v[ií]deo|newsletter\s+semanal|inscreva-se\s+no\s+canal|baixe\s+o\s+e-?book)\b/i,
    penalty: 0.35,
    label: 'Conteúdo informativo / Artigo / Divulgação de material',
  },
];

// ── Catálogo Estruturado de Palavras-Chave (Fase 3.2) ──

// Catálogo oficial de cargos (exatamente 12 termos)
export const CATALOGO_CARGOS: string[] = [
  "desenvolvedor",
  "desenvolvedora",
  "programador",
  "programadora",
  "software developer",
  "web developer",
  "frontend developer",
  "backend developer",
  "full stack developer",
  "front-end",
  "back-end",
  "full stack",
];

// Catálogo de tecnologias categorizado (foco core e expansão modular)
export const CATALOGO_TECNOLOGIAS = {
  core: [
    "React",
    "React Native",
    "Next.js",
    "Node.js",
    "Express",
    "JavaScript",
    "TypeScript",
    "SQL",
    "PostgreSQL",
    "REST",
    "API",
  ],
  expansao: [
    "Python",
    "Java",
    ".NET",
    "C#",
    "PHP",
    "Flutter",
    "Docker",
    "AWS",
    "Vue.js",
    "Angular",
    "DevOps",
    "QA",
  ],
};

// Bloco booleano canônico e conciso de sinais de contratação (compatível com o parser Lucene do LinkedIn)
export const SINAIS_CONTRATACAO = '("enviar currículo" OR "email")';

export const SINAIS_CONTRATACAO_POOL = [
  '("enviar currículo" OR "email")',
  '("enviar cv" OR "email")',
  '("envie seu cv" OR "email")',
  '("mande seu cv" OR "email")',
];

// Configuração do Motor Inteligente de Busca (Fase 3.2)
export const QUERY_ENGINE_CONFIG = {
  maxQueriesPerRun: 8,
  maxPagesPerQuery: 2,
  maxPostsPerQuery: 25,
  distribuicao: {
    tipo1Cargo: 2,
    tipo2Tecnologia: 3,
    tipo3Combinada: 3,
  },
  historyFile: "./data/scraper-history.json",
};

// Pool de Queries legadas de fallback
export const LINKEDIN_SEARCH_QUERIES: string[] = [
  '"desenvolvedor" AND ("enviar currículo" OR "envie seu cv" OR "mande seu cv")',
  '"vaga" AND "programador" AND ("enviar currículo" OR "email")',
  '("react" OR "node" OR "full stack") AND ("enviar cv" OR "envie seu currículo")',
  '("backend" OR "frontend") AND ("oportunidade" OR "vaga") AND "email"',
];

// Configurações Operacionais do Scraper (Fase 3)
export const SCRAPER_CONFIG = {
  maxSearchesPerRun: 4,
  maxPagesPerSearch: 2,
  maxPostsPerSearch: 25,
  minConfidenceScore: 0.65,
  maxPostAgeHours: 24,
  navDelayMinMs: 4000,
  navDelayMaxMs: 8000,
  searchDelayMinMs: 5000,
  searchDelayMaxMs: 10000,
  outputFile: "./data/vagas-email.json",
};

