import fs from "fs/promises";
import path from "path";
import { logInfo, logError } from "../utils/logger.js";
import { calculateSimilarity } from "../utils/textUtils.js";
import { gerarResumo } from "./resumoProfissional.service.js";
import { getDb } from "../../core/database.js";

const normalizeText = (value = "") =>
  String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

const SKILL_ALIASES = {
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
  TypeScript: ["typescript", "tipagem", "tipado"],
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
  "Tailwind CSS": ["tailwind", "tailwind css"],
  GraphQL: ["graphql", "graph ql"],
  "REST API": ["api rest", "rest api", "restful", "apis robustas"],
  Docker: ["docker", "containerizacao", "container"],
  "CI/CD": ["ci/cd", "cicd", "integracao continua", "deploy automatizado"],
  AWS: ["aws", "cloud"],
  EC2: ["ec2"],
  S3: ["s3"],
  Lambda: ["lambda"],
  SQS: ["sqs"],
  PostgreSQL: ["postgresql", "postgres"],
  MongoDB: ["mongodb", "mongo"],
  Elasticsearch: [
    "elasticsearch",
    "busca",
    "search engine",
    "aplicacoes orientadas a busca",
  ],
  SonarQube: ["sonarqube", "qualidade de codigo", "quality gate"],
  "Clean Code": ["clean code", "codigo limpo", "refatoracao"],
  "Code Review": ["code review", "revisao de codigo"],
};

const CONTEXT_RULES = [
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

const buildJobText = (dadosVaga = {}) =>
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

const hasAnySignal = (text, signals = []) =>
  signals.some((signal) => text.includes(normalizeText(signal)));

const inferContextualMatches = (text) => {
  const inferredSkills = [];
  const inferredAreas = [];

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

const isSkillSemanticallyRelevant = (skill, text) => {
  const normalizedSkill = normalizeText(skill);
  const aliases = SKILL_ALIASES[skill] || [];

  if (text.includes(normalizedSkill)) {
    return true;
  }

  return aliases.some((alias) => text.includes(normalizeText(alias)));
};

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const inferirSenioridade = (dadosVaga = {}) => {
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

const calcularAnosExperiencia = (experiencias = []) => {
  if (!Array.isArray(experiencias) || experiencias.length === 0) return 0;

  let maiorTempo = 0;
  const agora = new Date();

  experiencias.forEach((exp) => {
    const inicio = new Date(`${exp.startDate || ""}-01`);
    const fim =
      exp.endDate === "present" ? agora : new Date(`${exp.endDate || ""}-01`);

    if (
      Number.isNaN(inicio.getTime()) ||
      Number.isNaN(fim.getTime()) ||
      fim <= inicio
    ) {
      return;
    }

    const diffAnos =
      (fim.getTime() - inicio.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    if (diffAnos > maiorTempo) {
      maiorTempo = diffAnos;
    }
  });

  return Number(maiorTempo.toFixed(1));
};

const calcularAderenciaSenioridade = (senioridade, anosExperiencia) => {
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

const calcularCoberturaLista = (itens = [], matchPredicate) => {
  if (!Array.isArray(itens) || itens.length === 0) return 1;
  const total = itens.length;
  const matched = itens.filter((item) => matchPredicate(item)).length;
  return clamp(matched / total);
};

const habilidadeCombinaComRequisito = (habilidade, requisito) => {
  const skillNorm = normalizeText(habilidade);
  const reqNorm = normalizeText(requisito);

  return (
    reqNorm.includes(skillNorm) ||
    skillNorm.includes(reqNorm) ||
    isSkillSemanticallyRelevant(habilidade, reqNorm)
  );
};

/**
 * Personaliza o currículo baseado nos dados da vaga
 * @param {Object} dadosVaga - Dados estruturados da vaga
 * @returns {Object} Currículo personalizado
 */
export const personalizarCurriculo = async (dadosVaga) => {
  try {
    logInfo("Iniciando personalização do currículo");

    // Carregar perfil do candidato
    const perfilCandidato = await carregarPerfilCandidato();

    // Gerar resumo profissional dinâmico baseado na descrição da vaga
    const descricaoCompleta = `${dadosVaga.titulo || ""} ${dadosVaga.descricao || ""} ${dadosVaga.stackTecnologica?.join(" ") || ""} ${dadosVaga.responsabilidades?.join(" ") || ""} ${dadosVaga.requisitosObrigatorios?.join(" ") || ""} ${dadosVaga.diferenciaisDesejaveis?.join(" ") || ""}`;
    const resumoDinamico = await gerarResumo(descricaoCompleta);

    // Personalizar título baseado na vaga
    const tituloPersonalizado = personalizarTitulo(
      perfilCandidato.personalInfo.title,
      dadosVaga,
    );

    // Criar currículo personalizado
    const curriculoPersonalizado = {
      personalInfo: {
        ...perfilCandidato.personalInfo,
        title: tituloPersonalizado,
      },
      summary: resumoDinamico.resumo,
      experiences: filtrarExperienciasRelevantes(
        perfilCandidato.experiences,
        dadosVaga,
      ),
      education: perfilCandidato.education,
      certifications: filtrarCertificacoesRelevantes(
        perfilCandidato.certifications,
        dadosVaga,
      ),
      skills: organizarHabilidadesRelevantes(perfilCandidato.skills, dadosVaga),
      languages: perfilCandidato.languages,
      areasAtuacao: filtrarEspecializacoesRelevantes(
        perfilCandidato.specializations || [],
        dadosVaga,
      ),
      specializations: filtrarEspecializacoesRelevantes(
        perfilCandidato.specializations || [],
        dadosVaga,
      ),
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
const carregarPerfilCandidato = async () => {
  try {
    const db = await getDb();
    
    // Carregar skills do banco
    const skillsRows = await db.all('SELECT category, tech FROM profile_skills');
    const skills = {
      programming: [],
      frameworks: [],
      databases: [],
      methodologies: [],
      testing: [],
      devops: [],
      aiAutomation: []
    };
    
    const categoryMap = {
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
      if (skills[cat]) {
        skills[cat].push(row.tech);
      }
    }
    
    // Dados estáticos do perfil (podem ser movidos para DB futuramente)
    const personalInfo = {
      name: "Victor Salomão",
      email: "vsalome41@gmail.com",
      phone: "+55 11 99999-9999",
      linkedin: "https://linkedin.com/in/victorsalome",
      github: "https://github.com/victorsalome",
      portfolio: "https://victorsalome.dev",
      title: "Desenvolvedor Full Stack | React, TypeScript, Node.js | .NET, SQL"
    };
    
    const experiences = [
      {
        company: "Tech Solutions Ltda",
        position: "Desenvolvedor Full Stack",
        startDate: "2022-01",
        endDate: "2024-01",
        technologies: ["React", "TypeScript", "Node.js", "Express", "PostgreSQL", "RESTful APIs"],
        keywords: ["api"],
        achievements: ["Desenvolvimento de APIs REST", "Implementação de autenticação JWT", "Otimização de queries PostgreSQL"]
      },
      {
        company: "Inova Digital",
        position: "Estagiário de Desenvolvimento",
        startDate: "2021-07",
        endDate: "2021-12",
        technologies: ["React", "Node.js", "Jest", "Testing Library"],
        keywords: ["teste", "refatoracao"],
        achievements: ["Testes automatizados com Jest", "Refatoração de código legado", "Implementação de testes CI/CD"]
      }
    ];
    
    const education = [
      {
        institution: "Faculdade de Tecnologia",
        degree: "Bacharelando em Sistemas da Informação",
        startDate: "2019-03",
        endDate: "2023-12",
        description: "Especialização em Desenvolvimento Web e Segurança da Informação"
      }
    ];
    
    const certifications = [
      { name: "AWS Cloud Practitioner", issuer: "Amazon Web Services" },
      { name: "Node.js Certified Developer", issuer: "OpenJS Foundation" }
    ];
    
    const languages = [
      { language: "Português", level: "Nativo" },
      { language: "Inglês", level: "Intermediário" }
    ];
    
    const specializations = [
      "Desenvolvimento Full Stack para aplicações web escaláveis",
      "Desenvolvimento Back-end com Node.js, NestJS e APIs REST/GraphQL",
      "Desenvolvimento Front-end com React, Next.js e TypeScript",
      "Testes automatizados com Jest e Testing Library",
      "Cloud, CI/CD e integrações com AWS"
    ];
    
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

/**
 * Personaliza o título do candidato baseado na vaga
 */
const personalizarTitulo = (tituloOriginal, dadosVaga) => {
  const { titulo: tituloVaga, areaAtuacao, nivel } = dadosVaga;

  // Se a vaga tem um título claro, adaptar o título do candidato
  if (tituloVaga) {
    const keywordsVaga = tituloVaga.toLowerCase();

    if (
      keywordsVaga.includes("react native") ||
      keywordsVaga.includes("mobile")
    ) {
      return tituloOriginal.replace("Full Stack", "Full Stack | Mobile");
    }
    if (
      keywordsVaga.includes("frontend") ||
      keywordsVaga.includes("front-end")
    ) {
      return "Desenvolvedor Front-end | React, Next.js, TypeScript, Tailwind | UI/UX & Performance";
    }
    if (keywordsVaga.includes("backend") || keywordsVaga.includes("back-end")) {
      return "Desenvolvedor Backend | Node.js, Express, APIs RESTful, Bancos de Dados";
    }
    if (
      keywordsVaga.includes("full stack") ||
      keywordsVaga.includes("fullstack")
    ) {
      return tituloOriginal;
    }
  }

  return tituloOriginal;
};

/**
 * Filtra especializações relevantes para a vaga
 */
const filtrarEspecializacoesRelevantes = (specializations, dadosVaga) => {
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
const filtrarExperienciasRelevantes = (experiences, dadosVaga) => {
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
    const tecnologiasComuns = tecnologiasExp.filter((tech) =>
      stackTecnologica.some(
        (stackTech) =>
          normalizeText(tech).includes(normalizeText(stackTech)) ||
          normalizeText(stackTech).includes(normalizeText(tech)),
      ),
    );
    pontuacao += tecnologiasComuns.length * 10;

    const afinidadesContextuais = tecnologiasExp.filter((tech) =>
      contextMatches.skills.some(
        (skill) => normalizeText(skill) === normalizeText(tech),
      ),
    );
    pontuacao += afinidadesContextuais.length * 6;

    // Pontuação por keywords explícitas da experiência (novo campo)
    const keywordsExp = exp.keywords || [];
    const keywordsVaga = normalizeText(
      `${stackTecnologica.join(" ")} ${responsabilidades.join(" ")} ${requisitosObrigatorios.join(" ")} ${areaAtuacao}`,
    );
    const keywordsComuns = keywordsExp.filter((keyword) =>
      keywordsVaga.includes(normalizeText(keyword)),
    );
    pontuacao += keywordsComuns.length * 8;

    // Pontuação por palavras-chave nas responsabilidades e conquistas
    const todasPalavrasChave = normalizeText(
      [...responsabilidades, ...requisitosObrigatorios].join(" "),
    );

    exp.achievements = exp.achievements || [];
    exp.achievements.forEach((achievement) => {
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

  // Ordenar por pontuação e retornar as mais relevantes
  return experienciasComPontuacao
    .sort((a, b) => b.pontuacao - a.pontuacao)
    .slice(0, 4) // Máximo 4 experiências mais relevantes
    .map(({ pontuacao, ...exp }) => exp);
};

/**
 * Filtra certificações relevantes para a vaga
 */
const filtrarCertificacoesRelevantes = (certifications, dadosVaga) => {
  const stackTecnologica = dadosVaga.stackTecnologica || [];

  return certifications.filter((cert) => {
    const nomeCert = cert.name.toLowerCase();
    const emissorCert = cert.issuer.toLowerCase();

    // Verificar se a certificação está relacionada às tecnologias da vaga
    const temTecnologiaRelevante = stackTecnologica.some((tech) =>
      nomeCert.includes(tech.toLowerCase()),
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
    ].some((keyword) => nomeCert.includes(keyword));

    return temTecnologiaRelevante || certRelevante;
  });
};

/**
 * Organiza habilidades por relevância para a vaga
 */
const organizarHabilidadesRelevantes = (skills, dadosVaga) => {
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
          (tech) =>
            normalizeText(a).includes(normalizeText(tech)) ||
            normalizeText(tech).includes(normalizeText(a)),
        );
        const bRelevante = stackTecnologica.some(
          (tech) =>
            normalizeText(b).includes(normalizeText(tech)) ||
            normalizeText(tech).includes(normalizeText(b)),
        );

        const aContextual = contextMatches.skills.some(
          (skill) => normalizeText(skill) === normalizeText(a),
        );
        const bContextual = contextMatches.skills.some(
          (skill) => normalizeText(skill) === normalizeText(b),
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
    contextMatches.skills.some((skill) =>
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

const priorizarHabilidades = (habilidades, stackTecnologica = []) => {
  return [...new Set(habilidades)].sort((a, b) => {
    const aRelevante = stackTecnologica.some(
      (tech) =>
        normalizeText(a).includes(normalizeText(tech)) ||
        normalizeText(tech).includes(normalizeText(a)),
    );
    const bRelevante = stackTecnologica.some(
      (tech) =>
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
const identificarHabilidadesCorrespondentes = (skills, dadosVaga) => {
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

  const habilidadesCorrespondentes = [];
  const textoVaga = buildJobText({
    titulo,
    areaAtuacao,
    stackTecnologica,
    requisitosObrigatorios,
    diferenciaisDesejaveis,
    responsabilidades,
  });

  // Verificar correspondência com stack tecnológica
  stackTecnologica.forEach((tech) => {
    const habilidadeCorrespondente = todasHabilidades.find(
      (skill) =>
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
    (requisito) => {
      const requisitoLower = normalizeText(requisito);
      todasHabilidades.forEach((skill) => {
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
  afinidades.forEach((skill) => {
    if (!habilidadesCorrespondentes.includes(skill)) {
      habilidadesCorrespondentes.push(skill);
    }
  });

  return habilidadesCorrespondentes;
};

const inferirHabilidadesPorAfinidade = (textoVaga) => {
  return inferContextualMatches(textoVaga).skills;
};

/**
 * Calcula pontuação geral de relevância do candidato para a vaga
 */
const calcularPontuacaoRelevancia = (perfil, dadosVaga) => {
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

  const mustHaveCoverage = calcularCoberturaLista(
    requisitosObrigatorios,
    (requisito) =>
      skillsDoCandidato.some((skill) =>
        habilidadeCombinaComRequisito(skill, requisito),
      ) ||
      habilidadesCorrespondentes.some((skill) =>
        habilidadeCombinaComRequisito(skill, requisito),
      ),
  );

  const niceToHaveCoverage = calcularCoberturaLista(
    diferenciaisDesejaveis,
    (diferencial) =>
      skillsDoCandidato.some((skill) =>
        habilidadeCombinaComRequisito(skill, diferencial),
      ) ||
      habilidadesCorrespondentes.some((skill) =>
        habilidadeCombinaComRequisito(skill, diferencial),
      ),
  );

  const stackCoverage = calcularCoberturaLista(stackTecnologica, (tech) =>
    habilidadesCorrespondentes.some(
      (skill) =>
        normalizeText(skill).includes(normalizeText(tech)) ||
        normalizeText(tech).includes(normalizeText(skill)) ||
        isSkillSemanticallyRelevant(skill, normalizeText(tech)),
    ),
  );

  const contextoCoverage = calcularCoberturaLista(
    contextMatches.skills,
    (skillContextual) =>
      habilidadesCorrespondentes.some(
        (skill) => normalizeText(skill) === normalizeText(skillContextual),
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
const extrairCompetenciasChave = (responsabilidades, skills) => {
  const competencias = [];
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
