import sqlite3 from 'sqlite3';
import { Database } from 'sqlite';
import * as logger from '../../../core/logger.js';

/**
 * Migra dados do candidate-profile.json para o banco de dados
 * Executa uma vez apenas se as tabelas estiverem vazias
 */
export const seedCurriculoProfileFromJson = async (
  database: Database<sqlite3.Database, sqlite3.Statement>,
): Promise<void> => {
  // Verificar se já existem dados
  const existing = await database.get('SELECT COUNT(*) as count FROM curriculo_profile_personal');
  if (existing.count > 0) {
    logger.debug('Dados do perfil já existem no banco, pulando seed', 'Database');
    return;
  }

  // Ler candidate-profile.json
  const fs = await import('fs/promises');
  const path = await import('path');
  const configPath = path.default.join(process.cwd(), process.env.CANDIDATE_PROFILE_PATH || 'candidate-profile.json');

  let profileData: any;
  try {
    const raw = await fs.default.readFile(configPath, 'utf-8');
    profileData = JSON.parse(raw);
  } catch {
    logger.warn('candidate-profile.json não encontrado, seed do perfil pulado', 'Database');
    return;
  }

  logger.info('Migrando dados do perfil para o banco...', 'Database');

  // personalInfo
  if (profileData.personalInfo) {
    const pi = profileData.personalInfo;
    await database.run(`
      INSERT INTO curriculo_profile_personal (id, name, email, phone, has_whatsapp, linkedin, github, portfolio, location, title, summary)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, pi.name, pi.email, pi.phone, pi.hasWhatsApp !== false ? 1 : 0, pi.linkedin, pi.github, pi.portfolio, pi.location, pi.title, pi.summary);
  }

  // experiences
  if (Array.isArray(profileData.experiences)) {
    for (let i = 0; i < profileData.experiences.length; i++) {
      const exp = profileData.experiences[i];
      await database.run(`
        INSERT INTO curriculo_profile_experiences (id, company, position, start_date, end_date, location, description, keywords_json, achievements_json, technologies_json, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, exp.id || `exp_${i}`, exp.company, exp.position, exp.startDate, exp.endDate, exp.location, exp.description,
         JSON.stringify(exp.keywords || []), JSON.stringify(exp.achievements || []), JSON.stringify(exp.technologies || []), i);
    }
  }

  // education
  if (Array.isArray(profileData.education)) {
    for (let i = 0; i < profileData.education.length; i++) {
      const edu = profileData.education[i];
      await database.run(`
        INSERT INTO curriculo_profile_education (id, institution, degree, start_date, end_date, location, gpa, description, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, edu.id || `edu_${i}`, edu.institution, edu.degree, edu.startDate, edu.endDate, edu.location, edu.gpa, edu.description, i);
    }
  }

  // certifications
  if (Array.isArray(profileData.certifications)) {
    for (let i = 0; i < profileData.certifications.length; i++) {
      const cert = profileData.certifications[i];
      await database.run(`
        INSERT INTO curriculo_profile_certifications (id, name, issuer, date, credential_id, url, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, cert.id || `cert_${i}`, cert.name, cert.issuer, cert.date, cert.credentialId, cert.url, i);
    }
  }

  // languages
  if (Array.isArray(profileData.languages)) {
    for (let i = 0; i < profileData.languages.length; i++) {
      const lang = profileData.languages[i];
      await database.run(`
        INSERT INTO curriculo_profile_languages (language, level, sort_order)
        VALUES (?, ?, ?)
      `, lang.language, lang.level, i);
    }
  }

  // specializations
  if (Array.isArray(profileData.specializations)) {
    for (let i = 0; i < profileData.specializations.length; i++) {
      await database.run(`
        INSERT INTO curriculo_profile_specializations (text, sort_order)
        VALUES (?, ?)
      `, profileData.specializations[i], i);
    }
  }

  // skills
  if (profileData.skills) {
    for (const [category, techs] of Object.entries(profileData.skills)) {
      for (const tech of techs as string[]) {
        await database.run(
          'INSERT OR IGNORE INTO curriculo_profile_skills (category, tech) VALUES (?, ?)',
          category, tech
        );
      }
    }
  }

  logger.info(`Perfil migrado: ${profileData.experiences?.length || 0} experiências, ${profileData.education?.length || 0} formações, ${profileData.certifications?.length || 0} certificações`, 'Database');
};
