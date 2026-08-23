import { logInfo } from "../utils/logger.js";
import { getDb } from "../../core/database.js";

let cachedProfileSkills = null;

/**
 * Carrega as skills do candidato do banco de dados
 */
async function loadProfileSkills() {
  if (cachedProfileSkills) return cachedProfileSkills;
  
  const db = await getDb();
  const rows = await db.all('SELECT category, tech FROM profile_skills');
  
  cachedProfileSkills = rows.map(r => r.tech);
  return cachedProfileSkills;
}

/**
 * Calcula score de compatibilidade entre uma vaga e o perfil
 * @param {Object} vaga - Vaga normalizada
 * @returns {Object} { score, matches, missing, requiredMissing, optionalMissing, summary }
 */
export const calcularCompatibilidade = async (vaga) => {
  const profileSkills = await loadProfileSkills();
  if (!profileSkills || profileSkills.length === 0) {
    return {
      score: 0,
      matches: [],
      missing: [],
      requiredMissing: [],
      optionalMissing: [],
      summary: "Perfil não encontrado",
    };
  }

  const vagaSkills = extrairSkillsDaVaga(vaga);

  // Separar skills obrigatórias e opcionais (heurística simples)
  const requiredSkills = vagaSkills.filter(s => 
    vaga.description?.toLowerCase().includes(`obrigatór`) || 
    vaga.description?.toLowerCase().includes(`requer`) ||
    vaga.description?.toLowerCase().includes(`mandatór`)
  );
  
  // Se não tem indicação explícita, considerar as primeiras skills como obrigatórias
  const skillsObrigatorias = requiredSkills.length > 0 ? requiredSkills : vagaSkills.slice(0, Math.ceil(vagaSkills.length * 0.6));
  const skillsOpcionais = vagaSkills.filter(s => !skillsObrigatorias.includes(s));

  // Match de skills
  const matches = [];
  const missing = [];
  const requiredMissing = [];
  const optionalMissing = [];

  for (const skill of vagaSkills) {
    const found = profileSkills.find(
      (ps) =>
        ps.toLowerCase().includes(skill.toLowerCase()) ||
        skill.toLowerCase().includes(ps.toLowerCase()),
    );
    if (found) {
      matches.push({ required: skill, found });
    } else {
      missing.push(skill);
      if (skillsObrigatorias.includes(skill)) {
        requiredMissing.push(skill);
      } else {
        optionalMissing.push(skill);
      }
    }
  }

  // Score simples baseado em skills
  const skillScore = vagaSkills.length > 0 ? (matches.length / vagaSkills.length) * 100 : 0;
  const score = Math.round(skillScore);

  const summary = gerarResumo(score, matches, missing);

  return { 
    score: Math.min(score, 100), 
    matches, 
    missing, 
    requiredMissing,
    optionalMissing,
    summary 
  };
};

/**
 * Extrai skills/tecnologias mencionadas na vaga
 */
function extrairSkillsDaVaga(vaga) {
  const skills = new Set();
  const texto =
    `${vaga.title} ${vaga.description} ${(vaga.tags || []).join(" ")}`.toLowerCase();

  // Lista de tecnologias comuns para detectar
  const tecnologias = [
    "react",
    "next.js",
    "nextjs",
    "vue",
    "angular",
    "svelte",
    "node.js",
    "nodejs",
    "node",
    "express",
    "nestjs",
    "fastify",
    "typescript",
    "javascript",
    "python",
    "java",
    "go",
    "rust",
    "php",
    "react native",
    "flutter",
    "swift",
    "kotlin",
    "postgresql",
    "mysql",
    "mongodb",
    "redis",
    "sqlite",
    "aws",
    "gcp",
    "azure",
    "docker",
    "kubernetes",
    "ci/cd",
    "graphql",
    "rest api",
    "rest",
    "api",
    "tailwind",
    "css",
    "html",
    "sass",
    "git",
    "github",
    "gitlab",
    "prisma",
    "sequelize",
    "typeorm",
    "jwt",
    "oauth",
    "auth",
    "sql",
    "nosql",
    "html",
    "css",
    "sass",
    "less",
    "figma",
    "sketch",
    "design",
    "agile",
    "scrum",
    "kanban",
    "jest",
    "cypress",
    "playwright",
    "testing",
    "linux",
    "bash",
    "shell",
    "websocket",
    "socket.io",
    "sse",
  ];

  for (const tech of tecnologias) {
    if (texto.includes(tech)) {
      skills.add(tech);
    }
  }

  // Adiciona tags da vaga diretamente
  if (vaga.tags) {
    vaga.tags.forEach((t) => skills.add(t.toLowerCase()));
  }

  return [...skills];
}

function calcularScoreLocalizacao(vaga, profile) {
  const vagaLoc = (vaga.location || "").toLowerCase();
  const profileLoc = (profile.personalInfo?.location || "").toLowerCase();

  if (vagaLoc.includes("remote") || vagaLoc.includes("remoto")) return 1;
  if (vagaLoc.includes("anywhere") || vagaLoc.includes("worldwide")) return 1;
  if (vagaLoc.includes("brasil") || vagaLoc.includes("brazil")) return 1;
  if (profileLoc && vagaLoc.includes(profileLoc.split(",")[0]?.trim()))
    return 1;

  return 0.5; // Semi-match
}

function calcularScoreNivel(vaga, profile) {
  const texto = `${vaga.title} ${vaga.description}`.toLowerCase();

  // Detectar se é pleno/senior (perfil tem ~3 anos = pleno)
  if (
    texto.includes("pleno") ||
    texto.includes("mid-level") ||
    texto.includes("mid level")
  )
    return 1;
  if (texto.includes("sênior") || texto.includes("senior")) return 0.8;
  if (
    texto.includes("júnior") ||
    texto.includes("junior") ||
    texto.includes("entry")
  )
    return 0.7;
  if (
    texto.includes("lead") ||
    texto.includes("staff") ||
    texto.includes("principal")
  )
    return 0.4;

  return 0.8; // Default
}

function gerarResumo(score, matches, missing) {
  if (score >= 80) return "Excelente compatibilidade";
  if (score >= 60) return "Boa compatibilidade";
  if (score >= 40) return "Compatibilidade moderada";
  return "Baixa compatibilidade";
}

/**
 * Ranqueia vagas por score de compatibilidade
 */
export const ranquearVagas = (vagas) => {
  return vagas
    .map((vaga) => ({
      ...vaga,
      match: calcularCompatibilidade(vaga),
    }))
    .sort((a, b) => b.match.score - a.match.score);
};
