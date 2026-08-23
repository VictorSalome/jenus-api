import { getDb } from "../core/database.js";
import { logInfo } from "./utils/logger.js";

/**
 * Calcula compatibilidade entre uma vaga (por ID) e o perfil do candidato
 * @param {number} vagaId - ID da vaga na tabela vagas
 * @returns {Object} { matchPercent, matchedSkills, missingSkills, requiredMissingSkills, optionalMissingSkills, summary }
 */
export const getCompatibilidade = async (vagaId) => {
  const db = await getDb();
  
  // Buscar vaga
  const vaga = await db.get(
    `SELECT id, title, company, seniority, skills_json, requirements_json, raw_description 
     FROM vagas WHERE id = ?`,
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
      summary: "Vaga não encontrada"
    };
  }
  
  // Buscar skills do perfil
  const profileRows = await db.all('SELECT category, tech FROM profile_skills');
  const profileSkills = profileRows.map(r => r.tech);
  
  if (profileSkills.length === 0) {
    return {
      success: true,
      matchPercent: 0,
      matchedSkills: [],
      missingSkills: [],
      requiredMissingSkills: [],
      optionalMissingSkills: [],
      summary: "Perfil vazio - adicione skills em /profile/skills"
    };
  }
  
  // Extrair skills da vaga
  const vagaSkills = new Set();
  const vagaText = `${vaga.title || ''} ${vaga.raw_description || ''}`.toLowerCase();
  
  // Skills do JSON armazenado
  try {
    if (vaga.skills_json) {
      JSON.parse(vaga.skills_json).forEach(s => vagaSkills.add(s.toLowerCase()));
    }
  } catch (e) {}
  
  // Skills do requirements_json
  try {
    if (vaga.requirements_json) {
      JSON.parse(vaga.requirements_json).forEach(s => vagaSkills.add(s.toLowerCase()));
    }
  } catch (e) {}
  
  // Detectar skills conhecidas no texto
  const knownTechs = [
    'react', 'react native', 'node', 'nodejs', 'express', 'nest', 'nestjs',
    'next', 'nextjs', 'typescript', 'javascript', 'python', 'java', 'go',
    'c#', '.net', 'php', 'ruby', 'rust', 'sql', 'postgresql', 'mysql',
    'mongodb', 'redis', 'docker', 'kubernetes', 'aws', 'azure', 'gcp',
    'git', 'graphql', 'rest', 'api', 'html', 'css', 'tailwind', 'vue',
    'angular', 'svelte', 'jest', 'cypress', 'playwright', 'prisma',
    'typeorm', 'sequelize', 'jest', 'testing library'
  ];
  
  for (const tech of knownTechs) {
    if (vagaText.includes(tech)) {
      vagaSkills.add(tech);
    }
  }
  
  // Separar obrigatórias vs opcionais (heurística)
  const requiredKeywords = ['obrigatór', 'requer', 'mandatór', 'essencial', 'necessário'];
  const isRequired = (skill) => {
    const text = vagaText;
    return requiredKeywords.some(kw => text.includes(kw + ' ' + skill) || text.includes(skill + ' ' + kw));
  };
  
  const skillsArray = Array.from(vagaSkills);
  const requiredSkills = skillsArray.filter(isRequired);
  const optionalSkills = skillsArray.filter(s => !requiredSkills.includes(s));
  
  // Se não detectou obrigatórias, considerar primeiras 60% como obrigatórias
  const finalRequired = requiredSkills.length > 0 ? requiredSkills : skillsArray.slice(0, Math.ceil(skillsArray.length * 0.6));
  const finalOptional = skillsArray.filter(s => !finalRequired.includes(s));
  
  // Calcular match
  const matched = [];
  const missing = [];
  const requiredMissing = [];
  const optionalMissing = [];
  
  for (const skill of skillsArray) {
    const found = profileSkills.find(
      ps => ps.toLowerCase().includes(skill) || skill.includes(ps.toLowerCase())
    );
    if (found) {
      matched.push({ required: skill, found });
    } else {
      missing.push(skill);
      if (finalRequired.includes(skill)) {
        requiredMissing.push(skill);
      } else {
        optionalMissing.push(skill);
      }
    }
  }
  
  const matchPercent = skillsArray.length > 0 
    ? Math.round((matched.length / skillsArray.length) * 100) 
    : 0;
  
  let summary;
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
    matchedSkills: matched.map(m => m.found),
    missingSkills: missing,
    requiredMissingSkills: requiredMissing,
    optionalMissingSkills: optionalMissing,
    summary,
    details: {
      totalRequired: finalRequired.length,
      totalOptional: finalOptional.length,
      matchedRequired: matched.filter(m => finalRequired.includes(m.required)).length,
      matchedOptional: matched.filter(m => finalOptional.includes(m.required)).length
    }
  };
};

/**
 * Lista todas as vagas com sua compatibilidade
 */
export const listarVagasComCompatibilidade = async () => {
  const db = await getDb();
  const vagas = await db.all(
    `SELECT id, title, company, seniority, created_at FROM vagas ORDER BY created_at DESC`
  );
  
  const resultados = [];
  for (const vaga of vagas) {
    const compat = await getCompatibilidade(vaga.id);
    resultados.push({
      ...vaga,
      compatibilidade: compat
    });
  }
  
  return resultados;
};