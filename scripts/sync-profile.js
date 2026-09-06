import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

dotenv.config();

const dbPath = process.env.DATABASE_PATH || './data/promo-monitor.db';
const profilePath = process.env.CANDIDATE_PROFILE_PATH || './candidate-profile.json';

async function syncProfile() {
  if (!fs.existsSync(profilePath)) {
    console.log('⚠️ candidate-profile.json não encontrado. Pulando sincronização.');
    return;
  }

  const profileData = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
  const db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  console.log('🔄 Sincronizando candidate-profile.json com o banco:', dbPath);

  // 1. Personal Info
  if (profileData.personalInfo) {
    const pi = profileData.personalInfo;
    await db.run('DELETE FROM curriculo_profile_personal');
    await db.run(
      'INSERT INTO curriculo_profile_personal (id, name, email, phone, has_whatsapp, linkedin, github, portfolio, location, title, summary) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      pi.name, pi.email, pi.phone, pi.hasWhatsApp !== false ? 1 : 0, pi.linkedin, pi.github, pi.portfolio, pi.location, pi.title, pi.summary
    );
  }

  // 2. Experiences
  if (Array.isArray(profileData.experiences)) {
    await db.run('DELETE FROM curriculo_profile_experiences');
    for (let i = 0; i < profileData.experiences.length; i++) {
      const exp = profileData.experiences[i];
      await db.run(
        'INSERT INTO curriculo_profile_experiences (id, company, position, start_date, end_date, location, description, keywords_json, achievements_json, technologies_json, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        exp.id || `exp_${i}`, exp.company, exp.position, exp.startDate, exp.endDate, exp.location, exp.description,
        JSON.stringify(exp.keywords || []), JSON.stringify(exp.achievements || []), JSON.stringify(exp.technologies || []), i
      );
    }
  }

  // 3. Education
  if (Array.isArray(profileData.education)) {
    await db.run('DELETE FROM curriculo_profile_education');
    for (let i = 0; i < profileData.education.length; i++) {
      const edu = profileData.education[i];
      await db.run(
        'INSERT INTO curriculo_profile_education (id, institution, degree, start_date, end_date, location, gpa, description, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        edu.id || `edu_${i}`, edu.institution, edu.degree, edu.startDate, edu.endDate, edu.location, edu.gpa, edu.description, i
      );
    }
  }

  // 4. Skills
  if (profileData.skills) {
    await db.run('DELETE FROM curriculo_profile_skills');
    for (const [category, techs] of Object.entries(profileData.skills)) {
      for (const tech of techs) {
        await db.run(
          'INSERT OR IGNORE INTO curriculo_profile_skills (category, tech) VALUES (?, ?)',
          category, tech
        );
      }
    }
  }

  // 5. Specializations
  if (Array.isArray(profileData.specializations)) {
    await db.run('DELETE FROM curriculo_profile_specializations');
    for (let i = 0; i < profileData.specializations.length; i++) {
      await db.run(
        'INSERT INTO curriculo_profile_specializations (text, sort_order) VALUES (?, ?)',
        profileData.specializations[i], i
      );
    }
  }

  // 6. Languages
  if (Array.isArray(profileData.languages)) {
    await db.run('DELETE FROM curriculo_profile_languages');
    for (let i = 0; i < profileData.languages.length; i++) {
      const lang = profileData.languages[i];
      await db.run(
        'INSERT INTO curriculo_profile_languages (language, level, sort_order) VALUES (?, ?, ?)',
        lang.language, lang.level, i
      );
    }
  }

  // 7. Certifications
  if (Array.isArray(profileData.certifications) && profileData.certifications.length > 0) {
    await db.run('DELETE FROM curriculo_profile_certifications');
    for (let i = 0; i < profileData.certifications.length; i++) {
      const cert = profileData.certifications[i];
      await db.run(
        'INSERT INTO curriculo_profile_certifications (id, name, issuer, date, sort_order) VALUES (?, ?, ?, ?, ?)',
        cert.id || `cert_${i}`, cert.name, cert.issuer, cert.date || null, i
      );
    }
  }

  console.log('✅ Banco SQLite sincronizado com candidate-profile.json com sucesso!');
}

syncProfile().catch((err) => {
  console.error('❌ Erro ao sincronizar perfil com banco:', err);
  process.exit(1);
});
