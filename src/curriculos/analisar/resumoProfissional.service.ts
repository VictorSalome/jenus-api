import { logInfo, logError } from "../utils/logger.js";
import { calculateSimilarity } from "../utils/textUtils.js";
import fs from "fs";
import path from "path";
import { getDb } from "../../core/database.js";

const normalizeText = (value = ""): string =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

interface ContextRule {
  signals: string[];
  inferredKeywords: string[];
}

const CONTEXT_RULES: ContextRule[] = [
  {
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
    inferredKeywords: ["react", "next.js", "typescript", "frontend"],
  },
  {
    signals: [
      "backend",
      "back-end",
      "node.js",
      "node",
      "nestjs",
      "api robusta",
      "api robustas",
      "restful",
      "arquitetura modular",
      "solid",
      "separacao de camadas",
    ],
    inferredKeywords: [
      "node.js",
      "nestjs",
      "typescript",
      "rest api",
      "backend",
    ],
  },
  {
    signals: [
      "jest",
      "testing library",
      "testes",
      "qualidade",
      "code review",
      "sonarqube",
      "saude do codigo",
    ],
    inferredKeywords: [
      "jest",
      "testing library",
      "react testing library",
      "clean code",
      "code review",
    ],
  },
  {
    signals: ["aws", "ec2", "s3", "lambda", "sqs", "ci/cd", "docker"],
    inferredKeywords: ["aws", "docker", "ci/cd"],
  },
  {
    signals: ["elasticsearch", "busca", "analytics", "big data", "dados"],
    inferredKeywords: ["elasticsearch", "postgresql", "mongodb"],
  },
];

/**
 * Carrega as skills do candidato a partir do banco de dados
 * @returns {Array} Array com todas as skills do candidato
 */
const carregarSkillsCandidato = async (): Promise<string[]> => {
  try {
    const db = await getDb();
    const skillsRows = await db.all('SELECT category, tech FROM profile_skills');
    const todasSkills: string[] = [];
    
    for (const row of skillsRows) {
      todasSkills.push(row.tech);
    }
    
    // Remove duplicatas e valores não textuais
    return [...new Set(todasSkills)].filter(
      (item) => typeof item === "string" && item.trim().length > 0,
    );
  } catch (error) {
    logError("Erro ao carregar skills do candidato do banco", error);
    // Fallback para skills básicas
    return ["JavaScript", "React", "Node.js", "HTML", "CSS"];
  }
};

// Carrega as skills do candidato (lazy loading)
let minhasSkills: string[] | null = null;

async function getMinhasSkills(): Promise<string[]> {
  if (!minhasSkills) {
    minhasSkills = await carregarSkillsCandidato();
  }
  return minhasSkills;
}

const expandirPalavrasChavePorContexto = (descricaoVaga: string, palavrasChave: string[]): string[] => {
  const descricaoNormalizada = normalizeText(descricaoVaga);
  const palavras = new Set<string>(palavrasChave.map((item) => normalizeText(item)));

  CONTEXT_RULES.forEach((rule) => {
    if (
      rule.signals.some((signal) =>
        descricaoNormalizada.includes(normalizeText(signal)),
      )
    ) {
      rule.inferredKeywords.forEach((keyword) =>
        palavras.add(normalizeText(keyword)),
      );
    }
  });

  return Array.from(palavras);
};

/**
 * Trecho fixo obrigatório do resumo
 */
const TRECHO_FIXO = "Atuo como desenvolvedor Full Stack há cerca de 3 anos.";

/**
 * Frase genérica para quando nenhuma skill é encontrada
 */
const FRASE_GENERICA =
  "Tenho experiência com tecnologias modernas aplicadas em projetos escaláveis e de alta qualidade.";

// Removido RESUMO_FALLBACK - agora sempre usa o trecho fixo + lógica dinâmica

// Função isDescricaoInsuficiente removida - agora sempre processa a descrição

/**
 * Gera resumo profissional dinâmico baseado na descrição da vaga
 * @param {string} descricaoVaga - Descrição da vaga
 * @returns {Object} Objeto com três versões do resumo: { curto, medio, longo }
 */
export const gerarResumo = async (descricaoVaga: string): Promise<{ skills: string[]; responsabilidades: string[]; resumo: string }> => {
  try {
    logInfo("Iniciando geração de resumo profissional dinâmico");

    // Identificar skills relevantes na descrição da vaga
    const skillsEncontradas = await identificarSkillsRelevantes(descricaoVaga || "");
    const responsabilidades = identificarResponsabilidades(
      descricaoVaga || "",
      skillsEncontradas,
    );

    logInfo("Skills identificadas na vaga", {
      total: skillsEncontradas.length,
      skills: skillsEncontradas,
    });

    // Gerar resumo completo e otimizado
    const resumoCompleto = gerarResumoCompleto(
      skillsEncontradas,
      responsabilidades,
    );

    logInfo("Resumo profissional gerado com sucesso");
    return {
      skills: skillsEncontradas,
      responsabilidades: responsabilidades.map((r) => r.responsabilidade),
      resumo: resumoCompleto,
    };
  } catch (error) {
    logError("Erro na geração do resumo profissional", error);
    throw error;
  }
};

/**
 * Extrai palavras-chave técnicas e comportamentais da descrição da vaga
 * @param {string} descricaoVaga - Descrição da vaga
 * @returns {Array} Array de palavras-chave identificadas
 */
const extrairPalavrasChaveVaga = (descricaoVaga: string): string[] => {
  const descricaoLower = normalizeText(descricaoVaga);
  const palavrasChave = new Set<string>();

  // Padrões para identificar tecnologias e skills
  const padroesTecnicos = [
    // Linguagens de programação
    /\b(javascript|js|typescript|ts|python|java|php|c#|c\+\+|go|rust|kotlin|swift)\b/gi,
    // Frameworks e bibliotecas
    /\b(react|angular|vue|next\.?js|nuxt|svelte|express|fastapi|django|spring|laravel)\b/gi,
    // Bancos de dados
    /\b(mysql|postgresql|postgres|mongodb|redis|sqlite|oracle|sql\s+server|dynamodb)\b/gi,
    // Ferramentas e tecnologias
    /\b(docker|kubernetes|aws|azure|gcp|git|github|gitlab|jenkins|terraform|ansible)\b/gi,
    // Metodologias
    /\b(agile|scrum|kanban|devops|ci\/cd|tdd|bdd|clean\s+code|solid)\b/gi,
    // APIs e protocolos
    /\b(rest|restful|graphql|soap|api|microservices|websocket|grpc)\b/gi,
  ];

  // Aplica os padrões para extrair palavras-chave
  padroesTecnicos.forEach((padrao) => {
    const matches = descricaoVaga.match(padrao);
    if (matches) {
      matches.forEach((match) =>
        palavrasChave.add(normalizeText(match.trim())),
      );
    }
  });

  // Busca por termos específicos comuns em vagas
  const termosComuns = [
    "frontend",
    "backend",
    "full stack",
    "fullstack",
    "mobile",
    "web",
    "responsive",
    "responsivo",
    "ui/ux",
    "interface",
    "experiência do usuário",
    "performance",
    "otimização",
    "escalabilidade",
    "segurança",
    "testes",
    "automação",
    "integração",
    "deploy",
    "deployment",
    "versionamento",
    "colaboração",
    "equipe",
    "liderança",
    "mentoria",
    "code review",
  ];

  termosComuns.forEach((termo) => {
    if (descricaoLower.includes(termo)) {
      palavrasChave.add(termo);
    }
  });

  return expandirPalavrasChavePorContexto(
    descricaoVaga,
    Array.from(palavrasChave),
  );
};

/**
 * Identifica skills relevantes cruzando palavras-chave da vaga com skills do candidato
 * @param {string} descricaoVaga - Descrição da vaga
 * @returns {Array} Array de skills encontradas que existem tanto na vaga quanto no perfil
 */
const identificarSkillsRelevantes = async (descricaoVaga: string): Promise<string[]> => {
  const skillsEncontradas: { skill: string; relevancia: number; fonte: string }[] = [];
  const descricaoLower = normalizeText(descricaoVaga);
  const palavrasChaveVaga = extrairPalavrasChaveVaga(descricaoVaga);
  const minhasSkills = await getMinhasSkills();

  logInfo("Palavras-chave extraídas da vaga", {
    palavrasChave: palavrasChaveVaga,
  });

  // Verifica cada skill do candidato contra a descrição da vaga
  minhasSkills.forEach((skill) => {
    const skillLower = normalizeText(skill);
    let encontrada = false;
    let relevancia = 0;

    // 1. Verifica correspondência direta na descrição
    if (descricaoLower.includes(skillLower)) {
      encontrada = true;
      relevancia += 10;
    }

    // 2. Verifica correspondência com palavras-chave extraídas
    palavrasChaveVaga.forEach((palavra) => {
      if (
        palavra === skillLower ||
        skillLower.includes(palavra) ||
        palavra.includes(skillLower)
      ) {
        encontrada = true;
        relevancia += 8;
      }
    });

    // 3. Verifica correspondência parcial usando mapeamento
    if (
      !encontrada &&
      verificarCorrespondenciaParcial(descricaoLower, skillLower)
    ) {
      encontrada = true;
      relevancia += 5;
    }

    // 4. Calcula relevância adicional baseada no contexto
    if (encontrada) {
      relevancia += calcularRelevanciaSkill(descricaoVaga, skill);

      skillsEncontradas.push({
        skill: skill,
        relevancia: relevancia,
        fonte: "cruzamento_vaga_perfil",
      });
    }
  });

  // Ordena por relevância (maior para menor) e retorna apenas as skills
  const skillsOrdenadas = skillsEncontradas
    .sort((a, b) => b.relevancia - a.relevancia)
    .map((item) => item.skill);

  logInfo("Skills do candidato encontradas na vaga", {
    total: skillsOrdenadas.length,
    skills: skillsOrdenadas.slice(0, 10), // Log das 10 primeiras
  });

  return skillsOrdenadas;
};

// Nova função para identificar responsabilidades/atribuições da vaga
const identificarResponsabilidades = (descricaoVaga: string, skillsEncontradas: string[]): { responsabilidade: string; skillsRelacionadas: string[] }[] => {
  const responsabilidadesEncontradas: { responsabilidade: string; skillsRelacionadas: string[] }[] = [];
  const descricaoLower = normalizeText(descricaoVaga);

  Object.keys(mapeamentoResponsabilidades).forEach((responsabilidade) => {
    if (descricaoLower.includes(responsabilidade)) {
      const skillsCorrespondentes =
        mapeamentoResponsabilidades[responsabilidade];

      // Verifica se temos pelo menos uma skill correspondente
      const temSkillCorrespondente = skillsCorrespondentes.some((skill: string) =>
        skillsEncontradas.some(
          (minhaSkill) => normalizeText(minhaSkill) === normalizeText(skill),
        ),
      );

      if (temSkillCorrespondente) {
        responsabilidadesEncontradas.push({
          responsabilidade: responsabilidade,
          skillsRelacionadas: skillsCorrespondentes.filter((skill: string) =>
            skillsEncontradas.some(
              (minhaSkill) =>
                normalizeText(minhaSkill) === normalizeText(skill),
            ),
          ),
        });
      }
    }
  });

  return responsabilidadesEncontradas.slice(0, 5); // Limita a 5 responsabilidades
};

// Mapeamento de termos relacionados para melhor correspondência
const mapeamentoTermos: Record<string, string[]> = {
  react: ["react.js", "reactjs", "react js"],
  "node.js": ["nodejs", "node js", "node"],
  javascript: ["js", "ecmascript"],
  typescript: ["ts"],
  "next.js": ["nextjs", "next js"],
  "react native": ["react-native", "rn"],
  "styled-components": ["styled components"],
  "material-ui": ["mui", "material ui"],
  "rest api": ["rest", "api rest", "restful"],
  graphql: ["graph ql"],
  "clean code": ["código limpo", "clean coding"],
  microsserviços: ["microservices", "micro serviços"],
  "ci/cd": ["ci cd", "continuous integration", "continuous deployment"],
  gitflow: ["git flow"],
  "web development": ["desenvolvimento web"],
  "mobile development": ["desenvolvimento mobile"],
  "full stack": ["fullstack"],
};

// Mapeamento de responsabilidades/atribuições para skills correspondentes
const mapeamentoResponsabilidades: Record<string, string[]> = {
  "integração de apis": ["REST API", "APIs", "GraphQL", "Node.js", "Express"],
  "integração de api": ["REST API", "APIs", "GraphQL", "Node.js", "Express"],
  "consumo de apis": [
    "REST API",
    "APIs",
    "GraphQL",
    "JavaScript",
    "TypeScript",
  ],
  "desenvolvimento de apis": [
    "REST API",
    "APIs",
    "Node.js",
    "Express",
    "GraphQL",
  ],
  "criação de apis": ["REST API", "APIs", "Node.js", "Express", "GraphQL"],
  "testes automatizados": ["Jest", "JavaScript", "TypeScript", "React"],
  "testes unitários": ["Jest", "JavaScript", "TypeScript"],
  prototipação: ["Figma", "React", "JavaScript"],
  "prototipação no figma": ["Figma", "React", "JavaScript"],
  "design de interfaces": ["Figma", "React", "Tailwind CSS", "Material-UI"],
  "gerenciamento de estado": ["Redux", "Zustand", "Context API", "React"],
  "state management": ["Redux", "Zustand", "Context API", "React"],
  "desenvolvimento web": [
    "React",
    "Next.js",
    "JavaScript",
    "TypeScript",
    "Web Development",
  ],
  "desenvolvimento mobile": [
    "React Native",
    "JavaScript",
    "TypeScript",
    "Mobile Development",
  ],
  "desenvolvimento frontend": [
    "React",
    "Next.js",
    "JavaScript",
    "TypeScript",
    "Tailwind CSS",
  ],
  "desenvolvimento backend": [
    "Node.js",
    "Express",
    "REST API",
    "GraphQL",
    "SQL",
  ],
  "desenvolvimento full stack": [
    "React",
    "Node.js",
    "JavaScript",
    "TypeScript",
    "Full Stack",
  ],
  versionamento: ["Git", "GitHub", "GitFlow"],
  "controle de versão": ["Git", "GitHub", "GitFlow"],
  "metodologias ágeis": ["Git", "GitHub", "CI/CD"],
  "clean code": ["Clean Code", "JavaScript", "TypeScript"],
  "código limpo": ["Clean Code", "JavaScript", "TypeScript"],
  responsividade: [
    "Responsividade",
    "Tailwind CSS",
    "Styled-Components",
    "React",
  ],
  "interfaces responsivas": ["Responsividade", "Tailwind CSS", "React"],
  acessibilidade: ["Acessibilidade", "React", "JavaScript"],
  microsserviços: ["Microsserviços", "Node.js", "Docker", "REST API"],
  microservices: ["Microsserviços", "Node.js", "Docker", "REST API"],
  containerização: ["Docker", "Node.js"],
  docker: ["Docker", "Node.js"],
  "ci/cd": ["CI/CD", "Git", "GitHub"],
  "integração contínua": ["CI/CD", "Git", "GitHub"],
  deployment: ["CI/CD", "Git", "GitHub"],
  "documentação de apis": ["REST API", "Postman", "GraphQL"],
  "testes de api": ["Postman", "REST API", "Jest"],
  estilização: ["Tailwind CSS", "Styled-Components", "Material-UI", "React"],
  css: ["Tailwind CSS", "Styled-Components", "React"],
  "componentes reutilizáveis": ["React", "JavaScript", "TypeScript"],
  componentização: ["React", "JavaScript", "TypeScript"],
};

/**
 * Verifica correspondência parcial entre skill e descrição
 * @param {string} descricao - Descrição da vaga em lowercase
 * @param {string} skill - Skill em lowercase
 * @returns {boolean} True se houver correspondência parcial
 */
const verificarCorrespondenciaParcial = (descricao: string, skill: string): boolean => {
  // Mapeamento de termos relacionados
  const mapeamentos: Record<string, string[]> = {
    javascript: ["js", "ecmascript", "javascript es6"],
    typescript: ["ts"],
    react: ["reactjs", "react.js"],
    "react native": ["react-native", "reactnative"],
    "next.js": ["nextjs", "next"],
    "node.js": ["nodejs", "node"],
    nestjs: ["arquitetura modular", "modular", "solid", "separacao de camadas"],
    "rest api": ["api rest", "restful", "rest", "apis rest"],
    apis: ["api", "integração com apis", "integração de apis"],
    graphql: ["graph ql", "graph-ql"],
    redux: ["redux toolkit"],
    "context api": ["context", "react context"],
    jest: ["testing", "testes automatizados", "testes unitários"],
    "react testing library": ["testing library", "rtl"],
    "testing library": ["react testing library", "rtl"],
    "styled-components": ["styled components", "styled-component"],
    "tailwind css": ["tailwind"],
    "material-ui": ["mui", "material ui"],
    "react query": ["react-query", "tanstack query"],
    apollo: ["apollo client", "apollo graphql"],
    "react navigation": ["react-navigation", "navigation"],
    asyncstorage: ["async storage", "async-storage"],
    expo: ["expo cli", "expo sdk"],
    "react native cli": ["react-native cli", "rn cli"],
    "github actions": ["github action", "gh actions"],
    "ci/cd": [
      "continuous integration",
      "continuous deployment",
      "integração contínua",
    ],
    aws: ["ec2", "s3", "lambda", "sqs", "cloud"],
    elasticsearch: ["busca", "search", "aplicacoes orientadas a busca"],
    sonarqube: ["qualidade de codigo", "quality gate", "saude do codigo"],
    git: ["versionamento", "controle de versão"],
    yarn: ["gerenciamento de pacotes"],
    npm: ["gerenciamento de pacotes"],
    mysql: ["sql", "banco relacional"],
    mongodb: ["mongo", "nosql", "banco não relacional"],
    postgresql: ["postgres", "sql"],
    figma: ["prototipação", "design"],
    "full stack": ["fullstack", "full-stack"],
    performance: ["otimização", "otimização de performance"],
    flexbox: ["flex", "layout flexbox"],
  };

  const termosRelacionados = mapeamentos[skill] || [];
  return termosRelacionados.some((termo) =>
    descricao.includes(normalizeText(termo)),
  );
};

/**
 * Calcula relevância de uma skill na descrição
 * @param {string} descricao - Descrição da vaga
 * @param {string} skill - Skill a ser avaliada
 * @returns {number} Pontuação de relevância
 */
const calcularRelevanciaSkill = (descricao: string, skill: string): number => {
  const descricaoLower = normalizeText(descricao);
  const skillLower = normalizeText(skill);

  let pontuacao = 0;

  // Correspondência exata vale mais
  if (descricaoLower.includes(skillLower)) {
    pontuacao += 10;
  }

  // Proximidade com palavras-chave importantes
  const palavrasChave = [
    "experiência",
    "conhecimento",
    "domínio",
    "expertise",
    "avançado",
    "sênior",
  ];
  palavrasChave.forEach((palavra) => {
    if (
      descricaoLower.includes(palavra + " " + skillLower) ||
      descricaoLower.includes(skillLower + " " + palavra)
    ) {
      pontuacao += 5;
    }
  });

  return pontuacao;
};

/**
 * Gera resumo profissional personalizado baseado no cruzamento vaga-perfil
 * @param {Array} skillsEncontradas - Skills identificadas na vaga que o candidato possui
 * @param {Array} responsabilidades - Responsabilidades identificadas
 * @returns {string} Resumo personalizado de 6-7 linhas
 */
const gerarResumoCompleto = (skillsEncontradas: string[], responsabilidades: { responsibilidade: string; skillsRelacionadas: string[] }[] = []): string => {
  // Fallback caso não encontre skills relevantes
  if (skillsEncontradas.length === 0) {
    return `${TRECHO_FIXO} ${FRASE_GENERICA} Tenho familiaridade com metodologias ágeis e boas práticas de desenvolvimento, sempre focando na qualidade e escalabilidade das soluções. Busco constantemente aprimorar minhas habilidades técnicas e contribuir em projetos inovadores que gerem impacto positivo.`;
  }

  // Seleciona até 6 skills mais relevantes para manter o texto conciso
  const skillsPrincipais = skillsEncontradas.slice(0, 6);
  const listaSkills = formatarListaSkills(skillsPrincipais);

  // Identifica o tipo de desenvolvimento baseado nas skills
  const tipoDesenvolvimento = identificarTipoDesenvolvimento(skillsPrincipais);

  // Primeira frase: Trecho fixo + experiência com skills
  let resumo = `${TRECHO_FIXO} Tenho experiência com ${listaSkills}, `;

  // Contextualiza baseado no tipo de desenvolvimento
  if (tipoDesenvolvimento.includes("mobile")) {
    resumo +=
      "desenvolvendo aplicações web e mobile escaláveis e performáticas. ";
  } else if (tipoDesenvolvimento.includes("backend")) {
    resumo += "criando soluções robustas tanto no frontend quanto no backend. ";
  } else if (tipoDesenvolvimento.includes("fullstack")) {
    resumo +=
      "aplicadas no desenvolvimento full stack de soluções web modernas. ";
  } else {
    resumo += "aplicadas em projetos web modernos e responsivos. ";
  }

  // Segunda frase: Responsabilidades ou práticas gerais
  if (responsabilidades.length >= 2) {
    const responsabilidadesSelecionadas = responsabilidades.slice(0, 3);
    const listaResponsabilidades = responsibilidadesSelecionadas
      .map((r) => r.responsabilidade)
      .join(", ");

    // Evita duplicação de 'metodologias ágeis'
    const temMetodologiasAgeis =
      listaResponsabilidades.includes("metodologias ágeis");
    const praticasComplementares = temMetodologiasAgeis
      ? "sempre seguindo boas práticas de Clean Code e versionamento."
      : "sempre seguindo boas práticas de Clean Code e metodologias ágeis.";

    resumo += `Minha atuação profissional inclui ${listaResponsabilidades}, ${praticasComplementares} `;
  } else {
    resumo +=
      "Tenho familiaridade com metodologias ágeis, versionamento e boas práticas de Clean Code. ";
  }

  // Terceira frase: Objetivos e foco profissional
  resumo +=
    "Busco constantemente aprimorar minhas habilidades técnicas e contribuir em projetos inovadores que gerem valor e impacto positivo.";

  return resumo;
};

/**
 * Identifica o tipo de desenvolvimento baseado nas skills
 * @param {Array} skills - Array de skills
 * @returns {string} Tipo de desenvolvimento identificado
 */
const identificarTipoDesenvolvimento = (skills: string[]): string => {
  const skillsLower = skills.map((s) => s.toLowerCase());

  const temMobile = skillsLower.some(
    (s) =>
      s.includes("react native") ||
      s.includes("mobile") ||
      s.includes("android") ||
      s.includes("ios"),
  );

  const temBackend = skillsLower.some(
    (s) =>
      s.includes("node.js") ||
      s.includes("express") ||
      s.includes("api") ||
      s.includes("mongodb") ||
      s.includes("postgresql") ||
      s.includes("mysql"),
  );

  const temFrontend = skillsLower.some(
    (s) =>
      s.includes("react") ||
      s.includes("next.js") ||
      s.includes("angular") ||
      s.includes("vue") ||
      s.includes("tailwind") ||
      s.includes("css"),
  );

  if (temMobile && (temFrontend || temBackend)) {
    return "mobile";
  } else if (temFrontend && temBackend) {
    return "fullstack";
  } else if (temBackend) {
    return "backend";
  } else {
    return "frontend";
  }
};

/**
 * Formata lista de skills para inclusão no texto
 * @param {Array} skills - Array de skills
 * @returns {string} Skills formatadas para texto
 */
const formatarListaSkills = (skills: string[]): string => {
  if (skills.length === 0) return "";
  if (skills.length === 1) return skills[0];
  if (skills.length === 2) return `${skills[0]} e ${skills[1]}`;

  const ultimaSkill = skills.pop()!;
  return `${skills.join(", ")} e ${ultimaSkill}`;
};

/**
 * Função auxiliar para obter lista de skills disponíveis
 * @returns {Array} Array com todas as skills disponíveis
 */
export const obterSkillsDisponiveis = (): string[] => {
  return minhasSkills || [];
};

/**
 * Função auxiliar para validar se uma skill está disponível
 * @param {string} skill - Skill a ser validada
 * @returns {boolean} True se a skill estiver disponível
 */
export const validarSkill = (skill: string): boolean => {
  return (minhasSkills || []).some((s) => s.toLowerCase() === skill.toLowerCase());
};