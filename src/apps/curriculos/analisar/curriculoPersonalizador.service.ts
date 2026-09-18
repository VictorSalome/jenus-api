import fs from "fs/promises";
import path from "path";
import { logInfo, logError } from "../shared/utils/logger.js";
import { calculateSimilarity } from "../shared/utils/textUtils.js";
import { calcularAnosExperiencia } from "../shared/utils/experiencia.util.js";
import { gerarResumo } from "./resumoProfissional.service.js";
import { getDb } from "../../../core/database.js";

const normalizeText = (value = ""): string =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const SKILL_ALIASES: Record<string, string[]> = {
  React: ["react", "front-end", "frontend", "componentes", "hooks"],
  "Next.js": [
    "next.js",
    "nextjs",
    "app router",
    "ssr",
    "ssg",
    "isr",
    "server components",
  ],
  Vue: ["vue", "vue.js", "vuejs", "vue3", "vue 3"],
  Nuxt: ["nuxt", "nuxt.js", "nuxtjs", "nuxt 3"],
  Angular: ["angular", "angularjs", "angular 2+"],
  Svelte: ["svelte", "sveltekit"],
  "Node.js": [
    "node.js",
    "nodejs",
    "node",
    "api robusta",
    "api robustas",
    "api rest",
    "restful",
  ],
  NestJS: [
    "nestjs",
    "arquitetura modular",
    "modular",
    "solid",
    "separacao de camadas",
  ],
  Express: ["express", "express.js", "expressjs"],
  TypeScript: ["typescript", "tipagem", "tipado"],
  Python: ["python", "flask"],
  Django: ["django", "django rest framework", "drf"],
  FastAPI: ["fastapi", "fast api"],
  Java: ["java", "spring", "spring boot"],
  "Spring Boot": ["spring boot", "springboot", "spring-boot", "spring"],
  "C#": ["c#", "csharp", "c sharp"],
  ".NET": [".net", "dotnet", "asp.net", "aspnet", ".net core", "dotnet core"],
  Go: ["go", "golang"],
  "React Native": ["react native", "react-native", "mobile", "expo", "ios", "android"],
  Expo: ["expo", "expo go"],
  Flutter: ["flutter", "dart"],
  "iOS Nativo": ["ios nativo", "ios", "swift", "swiftui", "objective-c"],
  "Android Nativo": ["android nativo", "android", "kotlin", "java android"],
  PostgreSQL: ["postgresql", "postgres"],
  MySQL: ["mysql"],
  "SQL Server": ["sql server", "sqlserver", "mssql", "t-sql"],
  Oracle: ["oracle", "pl/sql", "plsql"],
  SQLite: ["sqlite", "sqlite3"],
  SQL: ["sql", "relacional", "queries", "banco de dados"],
  MongoDB: ["mongodb", "mongo"],
  Redis: ["redis", "cache"],
  Elasticsearch: [
    "elasticsearch",
    "busca",
    "search engine",
    "aplicacoes orientadas a busca",
  ],
  DynamoDB: ["dynamodb", "dynamo"],
  Docker: ["docker", "containerizacao", "container"],
  "Docker Compose": ["docker compose", "docker-compose"],
  Kubernetes: ["kubernetes", "k8s", "orquestracao"],
  K8s: ["k8s", "kubernetes"],
  Jest: [
    "jest",
    "testes",
    "testes unitarios",
    "qualidade",
    "cobertura de testes",
  ],
  "React Testing Library": [
    "react testing library",
    "testing library",
    "rtl",
    "acessibilidade",
    "testes de interface",
  ],
  "Testing Library": ["testing library", "rtl", "testes de interface"],
  Supertest: ["supertest"],
  Mocha: ["mocha", "chai"],
  Cypress: ["cypress", "e2e"],
  Playwright: ["playwright", "e2e"],
  JUnit: ["junit", "junit5"],
  AWS: ["aws", "cloud"],
  EC2: ["ec2"],
  S3: ["s3"],
  Lambda: ["lambda"],
  SQS: ["sqs"],
  GCP: ["gcp", "google cloud", "google cloud platform"],
  Azure: ["azure", "microsoft azure"],
  "Tailwind CSS": ["tailwind", "tailwind css"],
  GraphQL: ["graphql", "graph ql"],
  "REST API": ["api rest", "rest api", "restful", "apis robustas"],
  "CI/CD": ["ci/cd", "cicd", "integracao continua", "deploy automatizado", "github actions"],
  SonarQube: ["sonarqube", "qualidade de codigo", "quality gate"],
  "Clean Code": ["clean code", "codigo limpo", "refatoracao"],
  "Code Review": ["code review", "revisao de codigo"],
  Microservices: ["microservicos", "microservices", "arquitetura distribuida"],
  Scrum: ["scrum", "agile", "agilidade", "kanban", "sprints"],
  Git: ["git", "github", "gitlab", "versionamento", "github actions"],
};

/**
 * Modelo de match com três estados explícitos.
 *
 * IMPORTANTE — leia antes de mexer aqui:
 * "EXACT" e "ALIAS" representam a MESMA tecnologia (grafias/sinônimos diferentes
 * da mesma coisa), por isso sempre têm peso 1.0.
 *
 * "CATEGORY_EQUIVALENCE" é conceitualmente DIFERENTE: indica que duas
 * tecnologias distintas pertencem à mesma categoria funcional e representam
 * experiência CONCEITUAL parcialmente equivalente — nunca que uma tecnologia
 * substitui a outra. "Node.js ~ Java" quer dizer "o candidato tem vivência
 * em backend/APIs que é parcialmente transferível para Java", e NÃO
 * "Node.js + Express é a mesma coisa que Spring Boot". Por isso o peso de
 * CATEGORY_EQUIVALENCE nunca é 1.0 (fica entre 0.4 e 0.6) e este tipo nunca
 * deve ser somado, comparado ou tratado no código como se fosse EXACT/ALIAS.
 */
type TipoMatch = "EXACT" | "ALIAS" | "CATEGORY_EQUIVALENCE";

interface ResultadoMatch {
  tipo: TipoMatch;
  peso: number; // 1.0 para EXACT/ALIAS, 0.4-0.6 para CATEGORY_EQUIVALENCE
  categoria?: string; // só quando tipo === "CATEGORY_EQUIVALENCE"
}

interface EquivalenciaCategoria {
  categoria: string;
  membros: string[]; // nomes de skill que já existem como chaves de SKILL_ALIASES
  peso: number;
}

// Cada categoria abaixo agrupa tecnologias que resolvem o MESMO TIPO DE
// PROBLEMA de formas diferentes (ex: "framework-backend-web"), não
// tecnologias intercambiáveis. Usado exclusivamente para reconhecer
// experiência conceitual adjacente, nunca para afirmar equivalência técnica.
const CATEGORIAS_TECNOLOGICAS_EQUIVALENTES: EquivalenciaCategoria[] = [
  {
    categoria: "framework-backend-web",
    peso: 0.55,
    membros: [
      "NestJS",
      "Node.js",
      "Express",
      "Java",
      "Spring Boot",
      "Python",
      "Django",
      "FastAPI",
      "C#",
      ".NET",
      "Go",
    ],
  },
  {
    categoria: "linguagem-tipada-backend",
    peso: 0.40,
    membros: ["TypeScript", "Java", "C#", "Go"],
  },
  {
    categoria: "framework-frontend-web",
    peso: 0.55,
    membros: [
      "React",
      "Next.js",
      "Vue",
      "Nuxt",
      "Angular",
      "Svelte",
      "TypeScript",
      "Tailwind CSS",
    ],
  },
  {
    categoria: "mobile-cross-platform",
    peso: 0.50,
    membros: [
      "React Native",
      "Expo",
      "Flutter",
      "iOS Nativo",
      "Android Nativo",
    ],
  },
  {
    categoria: "banco-relacional",
    peso: 0.60,
    membros: [
      "PostgreSQL",
      "MySQL",
      "SQL Server",
      "Oracle",
      "SQLite",
      "SQL",
    ],
  },
  {
    categoria: "banco-nosql",
    peso: 0.50,
    membros: ["MongoDB", "Redis", "Elasticsearch", "DynamoDB"],
  },
  {
    categoria: "containerizacao-orquestracao",
    peso: 0.60,
    membros: ["Docker", "Docker Compose", "Kubernetes", "K8s"],
  },
  {
    categoria: "testes-automatizados",
    peso: 0.50,
    membros: [
      "Jest",
      "React Testing Library",
      "Testing Library",
      "Supertest",
      "Mocha",
      "Cypress",
      "Playwright",
      "JUnit",
    ],
  },
  {
    categoria: "cloud-integracao",
    peso: 0.50,
    membros: ["AWS", "EC2", "S3", "Lambda", "SQS", "GCP", "Azure"],
  },
];

interface ContextRule {
  name: string;
  signals: string[];
  skills: string[];
  areas: string[];
}

const CONTEXT_RULES: ContextRule[] = [
  {
    name: "frontend-moderno",
    signals: [
      "frontend",
      "front-end",
      "react",
      "next.js",
      "nextjs",
      "app router",
      "ssr",
      "ssg",
      "isr",
      "server components",
      "interfaces rapidas",
      "interfaces acessiveis",
    ],
    skills: [
      "React",
      "Next.js",
      "TypeScript",
      "Tailwind CSS",
      "React Testing Library",
      "Testing Library",
    ],
    areas: ["Desenvolvimento Front-end com React, Next.js e TypeScript"],
  },
  {
    name: "backend-escalavel",
    signals: [
      "backend",
      "back-end",
      "node.js",
      "node",
      "nestjs",
      "api robusta",
      "api robustas",
      "apis rest",
      "restful",
      "solid",
      "arquitetura modular",
      "separacao de camadas",
    ],
    skills: [
      "Node.js",
      "NestJS",
      "TypeScript",
      "REST API",
      "GraphQL",
      "Docker",
    ],
    areas: ["Desenvolvimento Back-end com Node.js, NestJS e APIs REST/GraphQL"],
  },
  {
    name: "qualidade-e-testes",
    signals: [
      "jest",
      "testing library",
      "testes",
      "qualidade",
      "code review",
      "sonarqube",
      "saude do codigo",
    ],
    skills: [
      "Jest",
      "React Testing Library",
      "Testing Library",
      "Code Review",
      "Clean Code",
      "SonarQube",
    ],
    areas: ["Testes automatizados com Jest e Testing Library"],
  },
  {
    name: "cloud-devops",
    signals: [
      "aws",
      "ec2",
      "s3",
      "lambda",
      "sqs",
      "ci/cd",
      "docker",
      "infraestrutura",
    ],
    skills: ["AWS", "EC2", "S3", "Lambda", "SQS", "CI/CD", "Docker"],
    areas: ["Cloud, CI/CD e integrações com AWS"],
  },
  {
    name: "busca-e-dados",
    signals: [
      "elasticsearch",
      "big data",
      "analytics",
      "dados",
      "aplicacoes orientadas a busca",
      "busca",
    ],
    skills: ["Elasticsearch", "PostgreSQL", "MongoDB", "AWS"],
    areas: ["Desenvolvimento Full Stack para aplicações web escaláveis"],
  },
];

const buildJobText = (dadosVaga: Record<string, any> = {}): string =>
  normalizeText(
    [
      dadosVaga.titulo || "",
      dadosVaga.areaAtuacao || "",
      dadosVaga.descricao || "",
      ...(dadosVaga.stackTecnologica || []),
      ...(dadosVaga.responsabilidades || []),
      ...(dadosVaga.requisitosObrigatorios || []),
      ...(dadosVaga.diferenciaisDesejaveis || []),
    ].join(" "),
  );

const hasAnySignal = (text: string, signals: string[] = []): boolean =>
  signals.some((signal) => text.includes(normalizeText(signal)));

const inferContextualMatches = (text: string): { skills: string[]; areas: string[] } => {
  const inferredSkills: string[] = [];
  const inferredAreas: string[] = [];

  CONTEXT_RULES.forEach((rule) => {
    if (hasAnySignal(text, rule.signals)) {
      inferredSkills.push(...rule.skills);
      inferredAreas.push(...rule.areas);
    }
  });

  return {
    skills: [...new Set(inferredSkills)],
    areas: [...new Set(inferredAreas)],
  };
};

const isSkillSemanticallyRelevant = (skill: string, text: string): boolean => {
  const normalizedSkill = normalizeText(skill);
  const aliases = SKILL_ALIASES[skill] || [];

  if (text.includes(normalizedSkill)) {
    return true;
  }

  return aliases.some((alias) => text.includes(normalizeText(alias)));
};

/**
 * Classifica a relação entre uma habilidade do candidato e um requisito da
 * vaga em um dos três estados explícitos de ResultadoMatch (ver comentário
 * acima de TipoMatch). Retorna `null` quando não há relação alguma.
 *
 * Ordem de verificação (do mais forte para o mais fraco):
 * 1. EXACT — substring mútua entre os textos normalizados.
 * 2. ALIAS — mesma tecnologia via SKILL_ALIASES (sinônimo/grafia).
 * 3. CATEGORY_EQUIVALENCE — tecnologias diferentes, mesma categoria
 *    funcional (ver CATEGORIAS_TECNOLOGICAS_EQUIVALENTES). NUNCA é
 *    confundido com EXACT/ALIAS: é experiência conceitual adjacente, não a
 *    mesma tecnologia.
 */
const classificarMatch = (habilidade: string, requisito: string): ResultadoMatch | null => {
  const skillNorm = normalizeText(habilidade);
  const reqNorm = normalizeText(requisito);

  if (reqNorm.includes(skillNorm) || skillNorm.includes(reqNorm)) {
    return { tipo: "EXACT", peso: 1 };
  }

  if (isSkillSemanticallyRelevant(habilidade, reqNorm)) {
    return { tipo: "ALIAS", peso: 1 };
  }

  for (const equivalencia of CATEGORIAS_TECNOLOGICAS_EQUIVALENTES) {
    if (!equivalencia.membros.includes(habilidade)) {
      continue;
    }

    const outroMembroRelevante = equivalencia.membros.some(
      (membro) =>
        membro !== habilidade && isSkillSemanticallyRelevant(membro, reqNorm),
    );

    if (outroMembroRelevante) {
      return {
        tipo: "CATEGORY_EQUIVALENCE",
        peso: equivalencia.peso,
        categoria: equivalencia.categoria,
      };
    }
  }

  return null;
};

/**
 * Wrapper de `classificarMatch` que restringe a ORIGEM de um match
 * CATEGORY_EQUIVALENCE a skills REAIS do candidato (`skillsReais`, vindas
 * de `perfil.skills`).
 *
 * Por quê: `habilidadesCorrespondentes` (calculada em
 * `identificarHabilidadesCorrespondentes`) mistura skills reais do
 * candidato com skills "fantasma" inferidas por afinidade contextual da
 * vaga (ex: `areaAtuacao: "Backend"` injeta Node.js/NestJS/Docker mesmo que
 * o candidato nunca tenha declarado essas skills). Deixar
 * CATEGORY_EQUIVALENCE rodar sobre essas skills fantasma quebraria o
 * princípio documentado em CATEGORIAS_TECNOLOGICAS_EQUIVALENTES: o
 * candidato receberia crédito de equivalência conceitual por uma
 * tecnologia que ele nunca teve, real ou adjacente.
 *
 * EXACT/ALIAS não passam por essa restrição — isso é comportamento
 * pré-existente e fora do escopo desta correção.
 */
const classificarMatchComOrigemReal = (
  skill: string,
  alvo: string,
  skillsReais: string[],
): ResultadoMatch | null => {
  const resultado = classificarMatch(skill, alvo);

  if (resultado?.tipo === "CATEGORY_EQUIVALENCE" && !skillsReais.includes(skill)) {
    return null;
  }

  return resultado;
};

const clamp = (value: number, min = 0, max = 1): number => Math.min(max, Math.max(min, value));

const inferirSenioridade = (dadosVaga: Record<string, any> = {}): string => {
  const textoVaga = buildJobText(dadosVaga);

  if (
    ["senior", "sênior", "staff", "especialista", "lead", "lider"].some(
      (termo) => textoVaga.includes(normalizeText(termo)),
    )
  ) {
    return "senior";
  }

  if (
    ["junior", "júnior", "estagio", "trainee"].some((termo) =>
      textoVaga.includes(normalizeText(termo)),
    )
  ) {
    return "junior";
  }

  if (
    ["pleno", "mid-level", "mid level"].some((termo) =>
      textoVaga.includes(normalizeText(termo)),
    )
  ) {
    return "pleno";
  }

  return "pleno";
};

const calcularAderenciaSenioridade = (senioridade: string, anosExperiencia: number): number => {
  switch (senioridade) {
    case "senior":
      if (anosExperiencia >= 5) return 1;
      if (anosExperiencia >= 3) return 0.85;
      return 0.65;
    case "junior":
      if (anosExperiencia < 2) return 1;
      if (anosExperiencia < 4) return 0.9;
      return 0.8;
    case "pleno":
    default:
      if (anosExperiencia >= 3) return 1;
      if (anosExperiencia >= 2) return 0.9;
      return 0.8;
  }
};

const calcularCoberturaLista = (itens: any[] = [], matchPredicate: (item: any) => boolean): number => {
  if (!Array.isArray(itens) || itens.length === 0) return 1;
  const total = itens.length;
  const matched = itens.filter((item) => matchPredicate(item)).length;
  return clamp(matched / total);
};

/**
 * Igual a calcularCoberturaLista, mas soma o `peso` de cada match (em vez de
 * contar binariamente 0/1). Usado para cobertura que precisa reconhecer
 * matches parciais (ex: CATEGORY_EQUIVALENCE).
 */
const calcularCoberturaListaPonderada = (
  itens: any[] = [],
  matchFn: (item: any) => ResultadoMatch | null,
): number => {
  if (!Array.isArray(itens) || itens.length === 0) return 1;
  const total = itens.length;
  const pesoSomado = itens.reduce((soma, item) => {
    const resultado = matchFn(item);
    return soma + (resultado ? resultado.peso : 0);
  }, 0);
  return clamp(pesoSomado / total);
};

const habilidadeCombinaComRequisito = (habilidade: string, requisito: string): boolean => {
  const skillNorm = normalizeText(habilidade);
  const reqNorm = normalizeText(requisito);

  return (
    reqNorm.includes(skillNorm) ||
    skillNorm.includes(reqNorm) ||
    isSkillSemanticallyRelevant(habilidade, reqNorm)
  );
};

/**
 * Varre as skills do candidato contra os requisitos/stack da vaga e retorna
 * apenas os pares que deram match por CATEGORY_EQUIVALENCE (equivalência
 * tecnológica, não a mesma tecnologia). Não é consumida ainda nesta missão —
 * fica pronta para a frase de equivalência e para a auditoria do histórico
 * (outras missões).
 */
const identificarMatchesPorCategoria = (
  perfil: any,
  dadosVaga: Record<string, any>,
): { skillCandidato: string; tecnologiaVaga: string; categoria: string; peso: number }[] => {
  const skillsDoCandidato: string[] = Object.values(perfil?.skills || {})
    .filter((categoria) => Array.isArray(categoria))
    .flat()
    .filter((skill): skill is string => typeof skill === "string" && skill.trim().length > 0);

  const tecnologiasDaVaga: string[] = [
    ...(dadosVaga.stackTecnologica || []),
    ...(dadosVaga.requisitosObrigatorios || []),
    ...(dadosVaga.diferenciaisDesejaveis || []),
  ];

  const matches: { skillCandidato: string; tecnologiaVaga: string; categoria: string; peso: number }[] = [];

  skillsDoCandidato.forEach((skillCandidato) => {
    tecnologiasDaVaga.forEach((tecnologiaVaga) => {
      const resultado = classificarMatch(skillCandidato, tecnologiaVaga);
      if (resultado?.tipo === "CATEGORY_EQUIVALENCE") {
        matches.push({
          skillCandidato,
          tecnologiaVaga,
          categoria: resultado.categoria as string,
          peso: resultado.peso,
        });
      }
    });
  });

  return matches;
};

/**
 * Gera um texto profissional e contextual de "Ponte de Competências"
 * conectando as tecnologias dominadas pelo candidato às equivalentes solicitadas pela vaga.
 */
const gerarPonteCompetencias = (
  categoryMatches: Array<{
    skillCandidato: string;
    tecnologiaVaga: string;
    categoria: string;
    peso: number;
  }>,
  _perfilCandidato?: any,
  _dadosVaga?: any,
): string => {
  if (!categoryMatches || categoryMatches.length === 0) return "";

  const categoriasMap = new Map<string, { skillsCandidato: Set<string>; techsVaga: Set<string> }>();

  for (const match of categoryMatches) {
    if (!categoriasMap.has(match.categoria)) {
      categoriasMap.set(match.categoria, {
        skillsCandidato: new Set(),
        techsVaga: new Set(),
      });
    }
    const entry = categoriasMap.get(match.categoria)!;
    entry.skillsCandidato.add(match.skillCandidato);
    entry.techsVaga.add(match.tecnologiaVaga);
  }

  const frases: string[] = [];

  for (const [categoria, dados] of categoriasMap.entries()) {
    const skillsCand = Array.from(dados.skillsCandidato).join(", ");
    const techsVaga = Array.from(dados.techsVaga).join(", ");

    switch (categoria) {
      case "framework-backend-web":
      case "linguagem-tipada-backend":
        frases.push(
          `Experiência consistente em arquitetura de backend, APIs RESTful, microsserviços e padrões SOLID construída com ${skillsCand}, proporcionando sólida fundamentação técnica e rápida absorção de ecossistemas corporativos equivalentes como ${techsVaga}.`
        );
        break;
      case "framework-frontend-web":
        frases.push(
          `Domínio na construção de interfaces modernas, responsivas e orientadas a componentes com ${skillsCand}, aplicando conceitos de reatividade, gerenciamento de estado e arquitetura SPA diretamente alinhados aos requisitos de ${techsVaga}.`
        );
        break;
      case "mobile-cross-platform":
        frases.push(
          `Vivência no ciclo completo de desenvolvimento e publicação mobile utilizando ${skillsCand}, com competências em gerenciamento de estado, consumo de APIs e UX mobile plenamente aplicáveis a ${techsVaga}.`
        );
        break;
      case "banco-relacional":
        frases.push(
          `Sólida vivência em modelagem relacional, indexação, otimização de consultas e integridade transacional com ${skillsCand}, diretamente transferível para ${techsVaga}.`
        );
        break;
      case "banco-nosql":
        frases.push(
          `Prática com armazenamento não-relacional, cache e estruturas de dados de alta performance utilizando ${skillsCand}, transferível para operações com ${techsVaga}.`
        );
        break;
      case "containerizacao-orquestracao":
        frases.push(
          `Vivência em ambientes conteinerizados, isolamento de serviços e automação de deploy com ${skillsCand}, alinhada aos requisitos de ${techsVaga}.`
        );
        break;
      case "testes-automatizados":
        frases.push(
          `Cultura de qualidade com desenvolvimento orientado a testes (TDD/testes unitários e de integração) em ${skillsCand}, adaptável ao framework ${techsVaga}.`
        );
        break;
      case "cloud-integracao":
        frases.push(
          `Experiência em arquitetura cloud e integração de serviços distribuídos com ${skillsCand}, assegurando rápida familiaridade com a infraestrutura ${techsVaga}.`
        );
        break;
      default:
        frases.push(
          `Vivência prática consolidada em ${skillsCand}, fornecendo fundamentação arquitetural e técnica diretamente transferível para ${techsVaga}.`
        );
        break;
    }
  }

  return `*Ponte de Competências:* ${frases.join(" ")}`;
};

/**
 * Personaliza o currículo baseado nos dados da vaga
 * @param {Object} dadosVaga - Dados estruturados da vaga
 * @returns {Object} Currículo personalizado
 */
export const personalizarCurriculo = async (dadosVaga: Record<string, any>): Promise<any> => {
  try {
    logInfo("Iniciando personalização do currículo");

    // Carregar perfil do candidato
    const perfilCandidato = await carregarPerfilCandidato();

    // Se modo semIa estiver ativo, utiliza o perfil oficial padrão sem alterações
    const isSemIa = Boolean(dadosVaga.semIa);

    let summaryFinal = perfilCandidato.personalInfo?.summary || "";
    let tituloPersonalizado = perfilCandidato.personalInfo.title;

    if (!isSemIa) {
      // Gerar resumo profissional dinâmico baseado na descrição da vaga
      const descricaoCompleta = `${dadosVaga.titulo || ""} ${dadosVaga.descricao || ""} ${dadosVaga.stackTecnologica?.join(" ") || ""} ${dadosVaga.responsabilidades?.join(" ") || ""} ${dadosVaga.requisitosObrigatorios?.join(" ") || ""} ${dadosVaga.diferenciaisDesejaveis?.join(" ") || ""}`;
      const anosExperienciaCandidato = calcularAnosExperiencia(perfilCandidato.experiences || []);
      const resumoDinamico = await gerarResumo(descricaoCompleta, anosExperienciaCandidato);

      // Personalizar título baseado na vaga
      const skillsCandidatoFlat = Object.values(perfilCandidato.skills || {})
        .filter((categoria) => Array.isArray(categoria))
        .flat()
        .filter((skill): skill is string => typeof skill === "string" && skill.trim().length > 0);
      tituloPersonalizado = personalizarTitulo(
        perfilCandidato.personalInfo.title,
        dadosVaga,
        skillsCandidatoFlat,
      );

      summaryFinal = dadosVaga.customSummary ? dadosVaga.customSummary : resumoDinamico.resumo;
    } else if (dadosVaga.customSummary) {
      summaryFinal = dadosVaga.customSummary;
    }

    try {
      const db = await getDb();
      const configRow = await db.get(
        "SELECT habilitar_frase_equivalencia, modo_amplo FROM curriculo_automacao_config WHERE id = 1",
      );
      const isModoAmplo = dadosVaga.modoAmplo !== undefined ? Boolean(dadosVaga.modoAmplo) : (configRow?.modo_amplo ?? 1) === 1;
      const habilitarFrase = Boolean(configRow?.habilitar_frase_equivalencia);

      if (isModoAmplo || habilitarFrase) {
        const categoryMatches = identificarMatchesPorCategoria(perfilCandidato, dadosVaga);
        if (categoryMatches.length > 0) {
          const ponte = gerarPonteCompetencias(categoryMatches, perfilCandidato, dadosVaga);
          if (ponte && !summaryFinal.includes(ponte.trim())) {
            summaryFinal = summaryFinal ? `${summaryFinal}\n\n${ponte}` : ponte;
          }
        }
      }
    } catch (err) {
      logError("Erro ao processar frase de equivalência / ponte de competências", err);
    }

    // areasAtuacao e specializations sempre foram o mesmo dado — calculamos
    // uma vez só (o PDF já tem fallback pra usar um ou outro).
    const areasAtuacaoRelevantes = isSemIa
      ? (perfilCandidato.specializations || [])
      : filtrarEspecializacoesRelevantes(
          perfilCandidato.specializations || [],
          dadosVaga,
        );

    // Criar currículo
    const curriculoPersonalizado = {
      personalInfo: {
        ...perfilCandidato.personalInfo,
        title: tituloPersonalizado,
      },
      summary: summaryFinal,
      experiences: isSemIa
        ? (perfilCandidato.experiences || [])
        : filtrarExperienciasRelevantes(
            perfilCandidato.experiences,
            dadosVaga,
          ),
      education: perfilCandidato.education,
      certifications: perfilCandidato.certifications || [],
      skills: isSemIa
        ? perfilCandidato.skills
        : organizarHabilidadesRelevantes(perfilCandidato.skills, dadosVaga),
      languages: perfilCandidato.languages,
      areasAtuacao: areasAtuacaoRelevantes,
      specializations: areasAtuacaoRelevantes,
      matchingSkills: identificarHabilidadesCorrespondentes(
        perfilCandidato.skills,
        dadosVaga,
      ),
      relevanceScore: calcularPontuacaoRelevancia(perfilCandidato, dadosVaga),
    };

    logInfo("Personalização concluída", {
      experienciasRelevantes: curriculoPersonalizado.experiences.length,
      habilidadesCorrespondentes: curriculoPersonalizado.matchingSkills.length,
      pontuacaoRelevancia: curriculoPersonalizado.relevanceScore,
    });

    return curriculoPersonalizado;
  } catch (error) {
    logError("Erro na personalização do currículo", error);
    throw error;
  }
};

/**
 * Carrega o perfil do candidato do banco de dados
 */
const carregarPerfilCandidato = async (): Promise<any> => {
  try {
    const db = await getDb();
    
    // Carregar skills do banco
    const skillsRows = await db.all('SELECT category, tech FROM curriculo_profile_skills');
    const skills = {
      programming: [] as string[],
      frameworks: [] as string[],
      databases: [] as string[],
      methodologies: [] as string[],
      testing: [] as string[],
      devops: [] as string[],
      aiAutomation: [] as string[]
    };
    
    const categoryMap: Record<string, string> = {
      'programming': 'programming',
      'frameworks': 'frameworks',
      'databases': 'databases',
      'methodologies': 'methodologies',
      'testing': 'testing',
      'devops': 'devops',
      'aiAutomation': 'aiAutomation'
    };
    
    for (const row of skillsRows) {
      const cat = categoryMap[row.category] || row.category;
      if (skills[cat as keyof typeof skills]) {
        skills[cat as keyof typeof skills].push(row.tech);
      }
    }
    
    // Ler dados pessoais do banco
    const personal = await db.get('SELECT name, email, phone, linkedin, github, portfolio, location, title, summary FROM curriculo_profile_personal WHERE id = 1');
    const personalInfo = personal ? {
      name: personal.name || "",
      email: personal.email || "",
      phone: personal.phone || "",
      linkedin: personal.linkedin || "",
      github: personal.github || "",
      portfolio: personal.portfolio || "",
      location: personal.location || "",
      title: personal.title || "",
      summary: personal.summary || "",
    } : { name: "Candidato", email: "", phone: "", linkedin: "", github: "", portfolio: "", location: "", title: "", summary: "" };
    
    // Ler experiências do banco
    const expRows = await db.all("SELECT company, position, start_date, end_date, location, description, keywords_json, achievements_json, technologies_json FROM curriculo_profile_experiences ORDER BY start_date DESC");
    const experiences = expRows.map((e: any) => {
      const dataInicio = e.start_date;
      const dataFim = !e.end_date || e.end_date === "present" || e.end_date === "Atual" ? "Atual" : e.end_date;
      return {
        id: e.id,
        company: e.company,
        position: e.position,
        role: e.position,
        startDate: e.start_date,
        endDate: e.end_date,
        period: `${dataInicio} - ${dataFim}`,
        location: e.location,
        description: e.description,
        keywords: JSON.parse(e.keywords_json || "[]"),
        achievements: JSON.parse(e.achievements_json || "[]"),
        technologies: JSON.parse(e.technologies_json || "[]"),
      };
    });
    
    // Ler educação do banco
    const eduRows = await db.all('SELECT institution, degree, start_date, end_date, location, gpa, description FROM curriculo_profile_education ORDER BY sort_order');
    const education = eduRows.map((e: any) => ({
      id: e.id, institution: e.institution, degree: e.degree,
      startDate: e.start_date, endDate: e.end_date, location: e.location,
      gpa: e.gpa, description: e.description,
    }));
    
    // Ler certificações do banco
    const certRows = await db.all('SELECT type, name, description, issuer, date, credential_id, url FROM curriculo_profile_certifications ORDER BY sort_order');
    const certifications = certRows.map((c: any) => ({
      id: c.id, type: c.type || 'certificado', name: c.name,
      description: c.description, issuer: c.issuer, date: c.date,
      credentialId: c.credential_id, url: c.url,
    }));
    
    // Ler idiomas do banco
    const langRows = await db.all('SELECT language, level FROM curriculo_profile_languages ORDER BY sort_order');
    const languages = langRows.map((l: any) => ({ language: l.language, level: l.level }));
    
    // Ler especializações do banco
    const specRows = await db.all('SELECT text FROM curriculo_profile_specializations ORDER BY sort_order');
    const specializations = specRows.map((s: any) => s.text);
    
    return {
      personalInfo,
      experiences,
      education,
      certifications,
      skills,
      languages,
      specializations
    };
  } catch (error) {
    logError("Erro ao carregar perfil do candidato", error);
    throw new Error("Não foi possível carregar o perfil do candidato");
  }
};

const RULE_FRONTEND = CONTEXT_RULES.find((r) => r.name === "frontend-moderno")!;
const RULE_BACKEND = CONTEXT_RULES.find((r) => r.name === "backend-escalavel")!;
const SIGNALS_MOBILE = ["mobile", "react native", "ios", "android"];

/**
 * Personaliza o título do candidato baseado na vaga. Usa o texto completo
 * da vaga (título + área + descrição + stack + requisitos — não só o
 * campo `titulo`, que pode vir truncado) e a stack REAL do candidato, em
 * vez de strings fixas desconectadas do perfil.
 */
const personalizarTitulo = (
  tituloOriginal: string,
  dadosVaga: Record<string, any>,
  skillsCandidato: string[] = [],
): string => {
  const textoVaga = buildJobText(dadosVaga);

  const ehFrontend = hasAnySignal(textoVaga, RULE_FRONTEND.signals);
  const ehBackend = hasAnySignal(textoVaga, RULE_BACKEND.signals);
  const ehMobile = hasAnySignal(textoVaga, SIGNALS_MOBILE);

  let linha = "";
  if (ehFrontend && ehBackend) linha = "Full Stack";
  else if (ehFrontend) linha = "Front-end";
  else if (ehBackend) linha = "Back-end";

  if (ehMobile) {
    linha = linha ? `${linha} | Mobile` : "Mobile";
  }

  // Nenhum contexto reconhecido na vaga: mantém o título original em vez
  // de forçar um rótulo genérico que pode não fazer sentido pra vaga.
  if (!linha) {
    return tituloOriginal || "Desenvolvedor de Software";
  }

  const { skills: skillsContextuais } = inferContextualMatches(textoVaga);
  const skillsRelevantes = skillsContextuais.filter((skill) =>
    skillsCandidato.some((s) => normalizeText(s) === normalizeText(skill)),
  );

  const senioridade = inferirSenioridade(dadosVaga);
  const sufixoSenioridade =
    senioridade === "senior" ? " Sênior" : senioridade === "junior" ? " Júnior" : "";

  const destaqueStack =
    skillsRelevantes.length > 0 ? ` | ${skillsRelevantes.slice(0, 4).join(", ")}` : "";

  return `Desenvolvedor ${linha}${sufixoSenioridade}${destaqueStack}`;
};

/**
 * Filtra especializações relevantes para a vaga
 */
const filtrarEspecializacoesRelevantes = (specializations: string[], dadosVaga: Record<string, any>): string[] => {
  const textoVaga = buildJobText(dadosVaga);
  const contextMatches = inferContextualMatches(textoVaga);

  return specializations.filter((spec) => {
    const specLower = normalizeText(spec);
    return (
      contextMatches.areas.some((area) => specLower === normalizeText(area)) ||
      contextMatches.skills.some((skill) =>
        specLower.includes(normalizeText(skill)),
      ) ||
      (specLower.includes("mobile") && textoVaga.includes("mobile")) ||
      (specLower.includes("automacao") && textoVaga.includes("automacao")) ||
      (specLower.includes("ia") &&
        (textoVaga.includes("ia") || textoVaga.includes("ai")))
    );
  });
};

/**
 * Filtra experiências mais relevantes para a vaga
 */
const filtrarExperienciasRelevantes = (experiences: any[], dadosVaga: Record<string, any>): any[] => {
  const stackTecnologica = dadosVaga.stackTecnologica || [];
  const responsabilidades = dadosVaga.responsabilidades || [];
  const requisitosObrigatorios = dadosVaga.requisitosObrigatorios || [];
  const areaAtuacao = dadosVaga.areaAtuacao || "";
  const textoVaga = buildJobText(dadosVaga);
  const contextMatches = inferContextualMatches(textoVaga);

  // Calcular pontuação de relevância para cada experiência
  const experienciasComPontuacao = experiences.map((exp) => {
    let pontuacao = 0;

    // Pontuação por tecnologias em comum (peso alto)
    const tecnologiasExp = exp.technologies || [];
    const tecnologiasComuns = tecnologiasExp.filter((tech: string) =>
      stackTecnologica.some(
        (stackTech: string) =>
          normalizeText(tech).includes(normalizeText(stackTech)) ||
          normalizeText(stackTech).includes(normalizeText(tech)),
      ),
    );
    pontuacao += tecnologiasComuns.length * 10;

    const afinidadesContextuais = tecnologiasExp.filter((tech: string) =>
      contextMatches.skills.some(
        (skill: string) => normalizeText(skill) === normalizeText(tech),
      ),
    );
    pontuacao += afinidadesContextuais.length * 6;

    // Pontuação por keywords explícitas da experiência (novo campo)
    const keywordsExp = exp.keywords || [];
    const keywordsVaga = normalizeText(
      `${stackTecnologica.join(" ")} ${responsabilidades.join(" ")} ${requisitosObrigatorios.join(" ")} ${areaAtuacao}`,
    );
    const keywordsComuns = keywordsExp.filter((keyword: string) =>
      keywordsVaga.includes(normalizeText(keyword)),
    );
    pontuacao += keywordsComuns.length * 8;

    // Pontuação por palavras-chave nas responsabilidades e conquistas
    const todasPalavrasChave = normalizeText(
      [...responsabilidades, ...requisitosObrigatorios].join(" "),
    );

    exp.achievements = exp.achievements || [];
    exp.achievements.forEach((achievement: string) => {
      const achievementLower = normalizeText(achievement);
      if (
        todasPalavrasChave.includes("api") &&
        achievementLower.includes("api")
      )
        pontuacao += 5;
      if (
        todasPalavrasChave.includes("frontend") &&
        achievementLower.includes("frontend")
      )
        pontuacao += 5;
      if (
        todasPalavrasChave.includes("backend") &&
        achievementLower.includes("backend")
      )
        pontuacao += 5;
      if (
        todasPalavrasChave.includes("mobile") &&
        achievementLower.includes("mobile")
      )
        pontuacao += 5;
      if (
        todasPalavrasChave.includes("react native") &&
        achievementLower.includes("react native")
      )
        pontuacao += 8;
      if (
        todasPalavrasChave.includes("database") &&
        achievementLower.includes("banco")
      )
        pontuacao += 5;
      if (
        todasPalavrasChave.includes("automacao") &&
        achievementLower.includes("automacao")
      )
        pontuacao += 5;
      if (
        (todasPalavrasChave.includes("microsservico") ||
          todasPalavrasChave.includes("arquitetura modular")) &&
        (achievementLower.includes("microsservico") ||
          achievementLower.includes("arquitetura"))
      )
        pontuacao += 5;
      if (
        todasPalavrasChave.includes("integracao") &&
        achievementLower.includes("integracao")
      )
        pontuacao += 5;
      if (
        (todasPalavrasChave.includes("teste") ||
          todasPalavrasChave.includes("qualidade")) &&
        (achievementLower.includes("jest") ||
          achievementLower.includes("testing library") ||
          achievementLower.includes("teste"))
      )
        pontuacao += 6;
    });

    // Pontuação por recência (experiências mais recentes têm maior peso)
    const anoInicio = parseInt(exp.startDate.split("-")[0]);
    const anoAtual = new Date().getFullYear();
    if (anoAtual - anoInicio <= 2) pontuacao += 15;
    else if (anoAtual - anoInicio <= 4) pontuacao += 10;
    else pontuacao += 5;

    return { ...exp, pontuacao };
  });

  // Seleciona as experiências mais relevantes pela pontuação, mas a ordem de
  // EXIBIÇÃO no currículo/email precisa ser cronológica (mais recente primeiro)
  // — senão uma experiência antiga com stack mais aderente pode aparecer antes
  // de uma mais recente, o que é sempre errado num currículo.
  return experienciasComPontuacao
    .sort((a, b) => b.pontuacao - a.pontuacao)
    .slice(0, 4) // Máximo 4 experiências mais relevantes
    .sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0))
    .map(({ pontuacao, ...exp }) => exp);
};

/**
 * Filtra certificações relevantes para a vaga
 */
const filtrarCertificacoesRelevantes = (certifications: any[], dadosVaga: Record<string, any>): any[] => {
  const stackTecnologica = dadosVaga.stackTecnologica || [];

  return certifications.filter((cert) => {
    const nomeCert = cert.name.toLowerCase();
    const emissorCert = (cert.issuer || '').toLowerCase();
    const descCert = (cert.description || '').toLowerCase();

    // Verificar se a certificação está relacionada às tecnologias da vaga
    const temTecnologiaRelevante = stackTecnologica.some((tech: string) =>
      nomeCert.includes(tech.toLowerCase()) ||
      descCert.includes(tech.toLowerCase()) ||
      emissorCert.includes(tech.toLowerCase()),
    );

    // Verificar se é uma certificação geral de desenvolvimento
    const certRelevante = [
      "javascript",
      "typescript",
      "react",
      "node",
      "frontend",
      "backend",
      "full stack",
      "desenvolvimento",
      "programação",
      "software",
    ].some((keyword) => nomeCert.includes(keyword) || descCert.includes(keyword));

    return temTecnologiaRelevante || certRelevante;
  });
};

/**
 * Organiza habilidades por relevância para a vaga
 */
const organizarHabilidadesRelevantes = (skills: Record<string, string[]>, dadosVaga: Record<string, any>): Record<string, string[]> => {
  const stackTecnologica = dadosVaga.stackTecnologica || [];
  const areaAtuacao = dadosVaga.areaAtuacao || "";
  const textoVaga = buildJobText(dadosVaga);
  const contextMatches = inferContextualMatches(textoVaga);

  const habilidadesOrganizadas = { ...skills };

  if (!habilidadesOrganizadas.testing) {
    habilidadesOrganizadas.testing = [];
  }

  // Reorganizar cada categoria por relevância
  Object.keys(habilidadesOrganizadas).forEach((categoria) => {
    if (Array.isArray(habilidadesOrganizadas[categoria])) {
      habilidadesOrganizadas[categoria] = habilidadesOrganizadas[
        categoria
      ].sort((a, b) => {
        const aRelevante = stackTecnologica.some(
          (tech: string) =>
            normalizeText(a).includes(normalizeText(tech)) ||
            normalizeText(tech).includes(normalizeText(a)),
        );
        const bRelevante = stackTecnologica.some(
          (tech: string) =>
            normalizeText(b).includes(normalizeText(tech)) ||
            normalizeText(tech).includes(normalizeText(b)),
        );

        const aContextual = contextMatches.skills.some(
          (skill: string) => normalizeText(skill) === normalizeText(a),
        );
        const bContextual = contextMatches.skills.some(
          (skill: string) => normalizeText(skill) === normalizeText(b),
        );

        if (aContextual && !bContextual) return -1;
        if (!aContextual && bContextual) return 1;

        if (aRelevante && !bRelevante) return -1;
        if (!aRelevante && bRelevante) return 1;
        return 0;
      });
    }
  });

  // Adicionar categoria de IA/Automação se relevante para a vaga
  if (skills.aiAutomation && areaAtuacao) {
    if (
      textoVaga.includes("ia") ||
      textoVaga.includes("ai") ||
      textoVaga.includes("automacao") ||
      textoVaga.includes("agente") ||
      textoVaga.includes("bot")
    ) {
      habilidadesOrganizadas.aiAutomation = skills.aiAutomation;
    }
  }

  if (
    contextMatches.skills.some((skill: string) =>
      ["Jest", "React Testing Library", "Testing Library"].includes(skill),
    )
  ) {
    habilidadesOrganizadas.testing = priorizarHabilidades(
      [
        ...(skills.testing || []),
        "Jest",
        "React Testing Library",
        "Testing Library",
      ],
      stackTecnologica,
    );
  }

  return habilidadesOrganizadas;
};

const priorizarHabilidades = (habilidades: string[], stackTecnologica: string[] = []): string[] => {
  return [...new Set(habilidades)].sort((a, b) => {
    const aRelevante = stackTecnologica.some(
      (tech: string) =>
        normalizeText(a).includes(normalizeText(tech)) ||
        normalizeText(tech).includes(normalizeText(a)),
    );
    const bRelevante = stackTecnologica.some(
      (tech: string) =>
        normalizeText(b).includes(normalizeText(tech)) ||
        normalizeText(tech).includes(normalizeText(b)),
    );

    if (aRelevante && !bRelevante) return -1;
    if (!aRelevante && bRelevante) return 1;
    return 0;
  });
};

/**
 * Identifica habilidades que correspondem diretamente à vaga
 */
const identificarHabilidadesCorrespondentes = (skills: Record<string, string[]>, dadosVaga: Record<string, any>): string[] => {
  const stackTecnologica = dadosVaga.stackTecnologica || [];
  const requisitosObrigatorios = dadosVaga.requisitosObrigatorios || [];
  const diferenciaisDesejaveis = dadosVaga.diferenciaisDesejaveis || [];
  const titulo = dadosVaga.titulo || "";
  const responsabilidades = dadosVaga.responsabilidades || [];
  const areaAtuacao = dadosVaga.areaAtuacao || "";

  const todasHabilidades = Object.values(skills || {})
    .filter((categoria) => Array.isArray(categoria))
    .flat()
    .filter((skill) => typeof skill === "string" && skill.trim().length > 0);

  const habilidadesCorrespondentes: string[] = [];
  const textoVaga = buildJobText({
    titulo,
    areaAtuacao,
    stackTecnologica,
    requisitosObrigatorios,
    diferenciaisDesejaveis,
    responsabilidades,
  });

  // Verificar correspondência com stack tecnológica
  stackTecnologica.forEach((tech: string) => {
    const habilidadeCorrespondente = todasHabilidades.find(
      (skill: string) =>
        normalizeText(skill).includes(normalizeText(tech)) ||
        normalizeText(tech).includes(normalizeText(skill)) ||
        isSkillSemanticallyRelevant(skill, normalizeText(tech)),
    );

    if (
      habilidadeCorrespondente &&
      !habilidadesCorrespondentes.includes(habilidadeCorrespondente)
    ) {
      habilidadesCorrespondentes.push(habilidadeCorrespondente);
    }
  });

  // Verificar correspondência com requisitos
  [...requisitosObrigatorios, ...(diferenciaisDesejaveis || [])].forEach(
    (requisito: string) => {
      const requisitoLower = normalizeText(requisito);
      todasHabilidades.forEach((skill: string) => {
        if (
          (requisitoLower.includes(normalizeText(skill)) ||
            isSkillSemanticallyRelevant(skill, requisitoLower)) &&
          !habilidadesCorrespondentes.includes(skill)
        ) {
          habilidadesCorrespondentes.push(skill);
        }
      });
    },
  );

  const afinidades = inferirHabilidadesPorAfinidade(textoVaga);
  afinidades.forEach((skill: string) => {
    if (!habilidadesCorrespondentes.includes(skill)) {
      habilidadesCorrespondentes.push(skill);
    }
  });

  return habilidadesCorrespondentes;
};

const inferirHabilidadesPorAfinidade = (textoVaga: string): string[] => {
  return inferContextualMatches(textoVaga).skills;
};

/**
 * Calcula pontuação geral de relevância do candidato para a vaga
 */
const calcularPontuacaoRelevancia = (
  perfil: any,
  dadosVaga: Record<string, any>,
  usarEquivalenciaCategoria: boolean = false,
): number => {
  const habilidadesCorrespondentes = identificarHabilidadesCorrespondentes(
    perfil.skills,
    dadosVaga,
  );
  const experienciasRelevantes = filtrarExperienciasRelevantes(
    perfil.experiences,
    dadosVaga,
  );
  const certificacoesRelevantes = filtrarCertificacoesRelevantes(
    perfil.certifications,
    dadosVaga,
  );

  const stackTecnologica = dadosVaga.stackTecnologica || [];
  const requisitosObrigatorios = dadosVaga.requisitosObrigatorios || [];
  const diferenciaisDesejaveis = dadosVaga.diferenciaisDesejaveis || [];
  const textoVaga = buildJobText(dadosVaga);
  const contextMatches = inferContextualMatches(textoVaga);
  const senioridadeDesejada = inferirSenioridade(dadosVaga);
  const anosExperiencia = calcularAnosExperiencia(perfil.experiences || []);

  const skillsDoCandidato = Object.values(perfil.skills || {})
    .filter((categoria) => Array.isArray(categoria))
    .flat()
    .filter((skill) => typeof skill === "string" && skill.trim().length > 0);

  // Só populado quando usarEquivalenciaCategoria === true, para observabilidade
  // (ver logInfo "Matches por tipo (modo equivalência)" no final da função).
  const matchesEncontrados: ResultadoMatch[] = [];

  const mustHaveCoverage = usarEquivalenciaCategoria
    ? calcularCoberturaListaPonderada(requisitosObrigatorios, (requisito: string) => {
        const candidatas = [...skillsDoCandidato, ...habilidadesCorrespondentes];
        let melhorMatch: ResultadoMatch | null = null;
        candidatas.forEach((skill: string) => {
          // CATEGORY_EQUIVALENCE só conta se `skill` for uma skill REAL do
          // candidato — nunca uma skill "fantasma" inferida por afinidade
          // contextual da vaga (ver classificarMatchComOrigemReal).
          const resultado = classificarMatchComOrigemReal(skill, requisito, skillsDoCandidato);
          if (resultado && (!melhorMatch || resultado.peso > melhorMatch.peso)) {
            melhorMatch = resultado;
          }
        });
        if (melhorMatch) matchesEncontrados.push(melhorMatch);
        return melhorMatch;
      })
    : calcularCoberturaLista(
        requisitosObrigatorios,
        (requisito: string) =>
          skillsDoCandidato.some((skill: string) =>
            habilidadeCombinaComRequisito(skill, requisito),
          ) ||
          habilidadesCorrespondentes.some((skill: string) =>
            habilidadeCombinaComRequisito(skill, requisito),
          ),
      );

  const niceToHaveCoverage = calcularCoberturaLista(
    diferenciaisDesejaveis,
    (diferencial: string) =>
      skillsDoCandidato.some((skill: string) =>
        habilidadeCombinaComRequisito(skill, diferencial),
      ) ||
      habilidadesCorrespondentes.some((skill: string) =>
        habilidadeCombinaComRequisito(skill, diferencial),
      ),
  );

  const stackCoverage = usarEquivalenciaCategoria
    ? calcularCoberturaListaPonderada(stackTecnologica, (tech: string) => {
        let melhorMatch: ResultadoMatch | null = null;
        habilidadesCorrespondentes.forEach((skill: string) => {
          // Mesma restrição de origem aplicada em mustHaveCoverage: só skill
          // real do candidato pode disparar CATEGORY_EQUIVALENCE.
          const resultado = classificarMatchComOrigemReal(skill, tech, skillsDoCandidato);
          if (resultado && (!melhorMatch || resultado.peso > melhorMatch.peso)) {
            melhorMatch = resultado;
          }
        });
        if (melhorMatch) matchesEncontrados.push(melhorMatch);
        return melhorMatch;
      })
    : calcularCoberturaLista(stackTecnologica, (tech: string) =>
        habilidadesCorrespondentes.some(
          (skill: string) =>
            normalizeText(skill).includes(normalizeText(tech)) ||
            normalizeText(tech).includes(normalizeText(skill)) ||
            isSkillSemanticallyRelevant(skill, normalizeText(tech)),
        ),
      );

  const contextoCoverage = calcularCoberturaLista(
    contextMatches.skills,
    (skillContextual: string) =>
      habilidadesCorrespondentes.some(
        (skill: string) => normalizeText(skill) === normalizeText(skillContextual),
      ),
  );

  const senioridadeCoverage = calcularAderenciaSenioridade(
    senioridadeDesejada,
    anosExperiencia,
  );

  const densidadeExperiencia = clamp(experienciasRelevantes.length / 4);
  const densidadeCertificacoes = clamp(certificacoesRelevantes.length / 5);

  const scoreNormalizado =
    mustHaveCoverage * 0.4 +
    niceToHaveCoverage * 0.15 +
    stackCoverage * 0.2 +
    contextoCoverage * 0.1 +
    senioridadeCoverage * 0.1 +
    densidadeExperiencia * 0.04 +
    densidadeCertificacoes * 0.01;

  const pontuacaoFinal = Math.round(clamp(scoreNormalizado) * 100);

  if (usarEquivalenciaCategoria) {
    const categoriasUsadas = [
      ...new Set(
        matchesEncontrados
          .filter((match) => match.tipo === "CATEGORY_EQUIVALENCE")
          .map((match) => match.categoria as string),
      ),
    ];

    logInfo("Matches por tipo (modo equivalência)", {
      exact: matchesEncontrados.filter((match) => match.tipo === "EXACT").length,
      alias: matchesEncontrados.filter((match) => match.tipo === "ALIAS").length,
      categoryEquivalence: matchesEncontrados.filter(
        (match) => match.tipo === "CATEGORY_EQUIVALENCE",
      ).length,
      categorias: categoriasUsadas,
    });
  }

  logInfo("Pontuação de relevância calculada", {
    senioridadeDesejada,
    anosExperiencia,
    mustHaveCoverage,
    niceToHaveCoverage,
    stackCoverage,
    contextoCoverage,
    senioridadeCoverage,
    pontuacaoFinal,
  });

  return pontuacaoFinal;
};

/**
 * Extrai competências-chave das responsabilidades da vaga
 */
const extrairCompetenciasChave = (responsabilidades: string[], skills: Record<string, string[]>): string[] => {
  const competencias: string[] = [];
  const todasHabilidades = [
    ...skills.programming,
    ...skills.frameworks,
    ...skills.methodologies,
  ];

  const responsabilidadesTexto = responsabilidades.join(" ").toLowerCase();

  todasHabilidades.forEach((skill) => {
    if (responsabilidadesTexto.includes(skill.toLowerCase())) {
      competencias.push(skill);
    }
  });

  return [...new Set(competencias)];
};

export {
  carregarPerfilCandidato,
  calcularPontuacaoRelevancia,
  classificarMatch,
  calcularCoberturaListaPonderada,
  identificarMatchesPorCategoria,
  gerarPonteCompetencias,
  CATEGORIAS_TECNOLOGICAS_EQUIVALENTES,
};
export type { TipoMatch, ResultadoMatch, EquivalenciaCategoria };
