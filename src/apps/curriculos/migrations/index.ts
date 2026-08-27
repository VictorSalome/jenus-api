import type { Migration } from "../../../core/migrations/runner.js";

/**
 * Migrations do app curriculos. Os 5 primeiros IDs (001_initial..005_add_has_whatsapp)
 * são históricos — já executados em produção — e não podem ser renomeados ou ter seu
 * SQL alterado, senão o runner tentaria (ou deixaria de) reexecutá-los incorretamente.
 * Novas migrations a partir daqui usam o prefixo `curriculo_NNN_slug`.
 */
export const curriculoMigrations: Migration[] = [
  {
    id: "001_initial",
    up: `
      CREATE TABLE IF NOT EXISTS profile_skills (
        category TEXT NOT NULL,
        tech TEXT NOT NULL,
        PRIMARY KEY (category, tech)
      );
    `,
  },
  {
    id: "002_vagas",
    up: `
      CREATE TABLE IF NOT EXISTS vagas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        company TEXT,
        seniority TEXT,
        raw_description TEXT,
        skills_json TEXT,
        requirements_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    id: "003_envios",
    up: `
      CREATE TABLE IF NOT EXISTS envios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        vaga_id INTEGER,
        filename TEXT,
        email_destino TEXT,
        vaga_titulo TEXT,
        status TEXT CHECK(status IN ('PENDING','SENT','FAILED')) DEFAULT 'PENDING',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
  {
    id: "004_profile",
    up: `
      CREATE TABLE IF NOT EXISTS profile_personal (
        id INTEGER PRIMARY KEY DEFAULT 1,
        name TEXT,
        email TEXT,
        phone TEXT,
        has_whatsapp INTEGER DEFAULT 1,
        linkedin TEXT,
        github TEXT,
        portfolio TEXT,
        location TEXT,
        title TEXT,
        summary TEXT,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS profile_experiences (
        id TEXT PRIMARY KEY,
        company TEXT,
        position TEXT,
        start_date TEXT,
        end_date TEXT,
        location TEXT,
        description TEXT,
        keywords_json TEXT,
        achievements_json TEXT,
        technologies_json TEXT,
        sort_order INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS profile_education (
        id TEXT PRIMARY KEY,
        institution TEXT,
        degree TEXT,
        start_date TEXT,
        end_date TEXT,
        location TEXT,
        gpa TEXT,
        description TEXT,
        sort_order INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS profile_certifications (
        id TEXT PRIMARY KEY,
        name TEXT,
        issuer TEXT,
        date TEXT,
        credential_id TEXT,
        url TEXT,
        sort_order INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS profile_languages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        language TEXT,
        level TEXT,
        sort_order INTEGER DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS profile_specializations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT,
        sort_order INTEGER DEFAULT 0
      );
    `,
  },
  {
    id: "005_add_has_whatsapp",
    up: `
      -- Adicionar coluna has_whatsapp se não existir
      ALTER TABLE profile_personal ADD COLUMN has_whatsapp INTEGER DEFAULT 1;
    `,
  },
  {
    id: "curriculo_006_rename_prefix",
    up: `
      ALTER TABLE vagas RENAME TO curriculo_vagas;
      ALTER TABLE envios RENAME TO curriculo_envios;
      ALTER TABLE profile_personal RENAME TO curriculo_profile_personal;
      ALTER TABLE profile_experiences RENAME TO curriculo_profile_experiences;
      ALTER TABLE profile_education RENAME TO curriculo_profile_education;
      ALTER TABLE profile_certifications RENAME TO curriculo_profile_certifications;
      ALTER TABLE profile_languages RENAME TO curriculo_profile_languages;
      ALTER TABLE profile_specializations RENAME TO curriculo_profile_specializations;
      ALTER TABLE profile_skills RENAME TO curriculo_profile_skills;
    `,
  },
];
