/**
 * Migrations simples para o módulo Currículo
 * Executadas automaticamente no startup via runMigrations()
 */

export const migrations = {
  '001_initial': `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profile_skills (
      category TEXT NOT NULL,
      tech TEXT NOT NULL,
      PRIMARY KEY (category, tech)
    );
  `,

  '002_vagas': `
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

  '003_envios': `
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

  '004_profile': `
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

  '005_add_has_whatsapp': `
    -- Adicionar coluna has_whatsapp se não existir
    ALTER TABLE profile_personal ADD COLUMN has_whatsapp INTEGER DEFAULT 1;
  `
} as const;

/**
 * Ordem de execução das migrations
 */
export const migrationOrder = [
  '001_initial',
  '002_vagas',
  '003_envios',
  '004_profile',
  '005_add_has_whatsapp'
] as const;

export type MigrationName = typeof migrationOrder[number];