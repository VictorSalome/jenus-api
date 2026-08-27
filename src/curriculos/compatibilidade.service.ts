import { getDb } from "../core/database.js";
import { logInfo } from "./shared/utils/logger.js";

// ── Category map from database ──

interface SkillCategoryMap {
  [tech: string]: string;
}

const loadSkillCategoryMap = async (): Promise<SkillCategoryMap> => {
  try {
    const db = await getDb();
    const rows = await db.all('SELECT category, tech FROM curriculo_profile_skills');
    const map: SkillCategoryMap = {};
    for (const row of rows) {
      map[row.tech.toLowerCase()] = row.category;
    }
    return map;
  } catch {
    return {};
  }
};

// ── Tech detection from free text ──

const TECH_KEYWORDS: Record<string, string> = {
  // Frontend
  react: "frameworks", "react native": "frameworks", nextjs: "frameworks", "next.js": "frameworks",
  vue: "frameworks", angular: "frameworks", svelte: "frameworks",
  html: "frameworks", css: "frameworks", "tailwind": "frameworks", "tailwind css": "frameworks",
  "styled-components": "frameworks", sass: "frameworks", scss: "frameworks", bootstrap: "frameworks",
  // Backend
  nodejs: "backEnd", "node.js": "backEnd", "node": "backEnd",
  express: "backEnd", nestjs: "backEnd", "nest": "backEnd",
  "rest api": "backEnd", rest: "backEnd", graphql: "backEnd",
  "c#": "backEnd", ".net": "backEnd", "asp.net": "backEnd",
  php: "backEnd", laravel: "backEnd", python: "backEnd", django: "backEnd", flask: "backEnd",
  java: "backEnd", spring: "backEnd", go: "backEnd", rust: "backEnd", ruby: "backEnd",
  // Databases
  postgresql: "databases", postgres: "databases", mysql: "databases",
  mongodb: "databases", mongo: "databases", redis: "databases",
  "sql server": "databases", oracle: "databases", sqlite: "databases",
  firebase: "databases", elasticsearch: "databases",
  // DevOps
  docker: "devops", kubernetes: "devops", k8s: "devops",
  aws: "devops", azure: "devops", gcp: "devops", "google cloud": "devops",
  "ci/cd": "devops", jenkins: "devops", "github actions": "devops",
  terraform: "devops", ansible: "devops", vercel: "devops", netlify: "devops",
  // Testing
  jest: "testing", cypress: "testing", playwright: "testing",
  "testing library": "testing", "react testing library": "testing",
  selenium: "testing", mocha: "testing", chai: "testing",
  // State Management
  redux: "stateManagement", zustand: "stateManagement", "context api": "stateManagement",
  "react query": "stateManagement", mobx: "stateManagement",
  // Methodologies
  agile: "methodologies", scrum: "methodologies", kanban: "methodologies",
  tdd: "methodologies", bdd: "methodologies", "clean code": "methodologies",
  solid: "methodologies", "clean architecture": "methodologies",
  // ORM / DB Tools
  prisma: "databases", typeorm: "databases", sequelize: "databases",
  drizzle: "databases", mongoose: "databases",
  // Integrations
  webhook: "integrations", webhooks: "integrations", jwt: "integrations",
  oauth: "integrations", oauth2: "integrations", salesforce: "integrations",
};

// ── Core: Get compatibilidade ──

export const getCompatibilidade = async (vagaId: number) => {
  const db = await getDb();

  const vaga = await db.get(
    `SELECT id, title, company, seniority, skills_json, requirements_json, raw_description 
     FROM curriculo_vagas WHERE id = ?`,
    vagaId
  );

  if (!vaga) {
    return {
      success: false,
      error: "Vaga não encontrada",
      matchPercent: 0,
      matchedSkills: [],
      missingSkills: [],
      requiredMissingSkills: [],
      optionalMissingSkills: [],
      summary: "Vaga não encontrada",
    };
  }

  // Load profile skills from DB + category map from JSON
  const profileRows = await db.all("SELECT category, tech FROM curriculo_profile_skills");
  const profileTechs = profileRows.map((r) => r.tech.toLowerCase());
  const categoryMap = await loadSkillCategoryMap();

  if (profileTechs.length === 0) {
    return {
      success: true,
      matchPercent: 0,
      matchedSkills: [],
      missingSkills: [],
      requiredMissingSkills: [],
      optionalMissingSkills: [],
      summary: "Perfil vazio - adicione skills em /profile/skills",
    };
  }

  // Extract skills from vaga
  const vagaText = `${vaga.title || ""} ${vaga.raw_description || ""}`.toLowerCase();
  const vagaSkillsMap: Record<string, { required: boolean; category: string }> = {};

  const addVagaSkill = (skill: string, forcedCategory?: string) => {
    const key = skill.toLowerCase().trim();
    if (!key || key.length < 2) return;
    if (vagaSkillsMap[key]) return;

    const category = forcedCategory || categoryMap[key] || TECH_KEYWORDS[key] || detectCategory(key, vagaText);
    vagaSkillsMap[key] = { required: false, category };
  };

  // Parse skills from JSON
  try {
    if (vaga.skills_json) {
      JSON.parse(vaga.skills_json).forEach((s: string) => addVagaSkill(s));
    }
  } catch {}

  try {
    if (vaga.requirements_json) {
      JSON.parse(vaga.requirements_json).forEach((s: string) => addVagaSkill(s));
    }
  } catch {}

  // Scan text for known techs
  for (const [tech, cat] of Object.entries(TECH_KEYWORDS)) {
    if (vagaText.includes(tech)) {
      addVagaSkill(tech, cat);
    }
  }

  // Detect required vs optional
  const requiredKeywords = ["obrigatór", "requer", "mandatór", "essencial", "necessário", "desejável", "plus"];
  const isRequired = (skill: string) => {
    for (const kw of requiredKeywords) {
      if (vagaText.includes(kw + " " + skill) || vagaText.includes(skill + " " + kw)) return true;
    }
    return false;
  };

  const skillsArray = Object.keys(vagaSkillsMap);

  // Mark required
  for (const skill of skillsArray) {
    if (isRequired(skill)) {
      vagaSkillsMap[skill].required = true;
    }
  }

  // If no required detected, first 60% = required
  const hasRequired = skillsArray.some((s) => vagaSkillsMap[s].required);
  if (!hasRequired && skillsArray.length > 0) {
    const cutoff = Math.ceil(skillsArray.length * 0.6);
    skillsArray.slice(0, cutoff).forEach((s) => {
      vagaSkillsMap[s].required = true;
    });
  }

  // Match against profile
  const matched: Array<{ skill: string; found: string; category: string; required: boolean }> = [];
  const missing: Array<{ skill: string; category: string; required: boolean }> = [];

  for (const skill of skillsArray) {
    const found = profileTechs.find(
      (ps) => ps.includes(skill) || skill.includes(ps)
    );
    if (found) {
      matched.push({
        skill,
        found: profileRows.find((r) => r.tech.toLowerCase() === found)?.tech || found,
        category: vagaSkillsMap[skill].category,
        required: vagaSkillsMap[skill].required,
      });
    } else {
      missing.push({
        skill,
        category: vagaSkillsMap[skill].category,
        required: vagaSkillsMap[skill].required,
      });
    }
  }

  const requiredMissing = missing.filter((m) => m.required);
  const optionalMissing = missing.filter((m) => !m.required);

  const matchPercent = skillsArray.length > 0
    ? Math.round((matched.length / skillsArray.length) * 100)
    : 0;

  let summary: string;
  if (matchPercent >= 80) summary = "Excelente compatibilidade";
  else if (matchPercent >= 60) summary = "Boa compatibilidade";
  else if (matchPercent >= 40) summary = "Compatibilidade moderada";
  else summary = "Baixa compatibilidade";

  if (requiredMissing.length > 0) {
    summary += ` ⚠ ${requiredMissing.length} skill(s) obrigatória(s) ausente(s)`;
  }

  return {
    success: true,
    vaga: { id: vaga.id, title: vaga.title, company: vaga.company, seniority: vaga.seniority },
    matchPercent,
    matchedSkills: matched.map((m) => m.found),
    missingSkills: missing.map((m) => m.skill),
    requiredMissingSkills: requiredMissing.map((m) => m.skill),
    optionalMissingSkills: optionalMissing.map((m) => m.skill),
    // NEW: category-aware data
    missingWithCategory: missing,
    requiredMissingWithCategory: requiredMissing,
    optionalMissingWithCategory: optionalMissing,
    matchedWithCategory: matched,
    summary,
    details: {
      totalRequired: skillsArray.filter((s) => vagaSkillsMap[s].required).length,
      totalOptional: skillsArray.filter((s) => !vagaSkillsMap[s].required).length,
      matchedRequired: matched.filter((m) => m.required).length,
      matchedOptional: matched.filter((m) => !m.required).length,
    },
  };
};

// ── Helper: guess category from context ──

function detectCategory(skill: string, context: string): string {
  const lowerSkill = skill.toLowerCase();
  const lowerContext = context.toLowerCase();

  // Frontend indicators
  if (["react", "vue", "angular", "svelte", "next", "nuxt", "html", "css", "tailwind", "sass", "bootstrap", "frontend", "front-end"].some((k) => lowerSkill.includes(k) || lowerContext.includes("front-end") || lowerContext.includes("frontend"))) {
    return "frameworks";
  }

  // Backend indicators
  if (["node", "express", "nest", "django", "flask", "spring", "laravel", "php", "ruby", "go", "java", "python", "c#", ".net", "backend", "back-end", "api"].some((k) => lowerSkill.includes(k) || lowerContext.includes("back-end") || lowerContext.includes("backend"))) {
    return "backEnd";
  }

  // Database indicators
  if (["sql", "mysql", "postgres", "mongo", "redis", "oracle", "database", "banco de dados"].some((k) => lowerSkill.includes(k))) {
    return "databases";
  }

  // DevOps indicators
  if (["docker", "kubernetes", "aws", "azure", "gcp", "ci/cd", "jenkins", "terraform", "cloud", "devops", "infra"].some((k) => lowerSkill.includes(k))) {
    return "devops";
  }

  // Testing indicators
  if (["test", "jest", "cypress", "playwright", "selenium", "qa", "quality"].some((k) => lowerSkill.includes(k))) {
    return "testing";
  }

  return "programming";
}

// ── List vagas with compatibilidade ──

export const listarVagasComCompatibilidade = async () => {
  const db = await getDb();
  const vagas = await db.all(
    `SELECT id, title, company, seniority, created_at FROM curriculo_vagas ORDER BY created_at DESC`
  );

  const resultados = [];
  for (const vaga of vagas) {
    const compat = await getCompatibilidade(vaga.id);
    resultados.push({ ...vaga, compatibilidade: compat });
  }

  return resultados;
};
