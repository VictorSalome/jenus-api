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
  `
} as const;

/**
 * Ordem de execução das migrations
 */
export const migrationOrder = [
  '001_initial',
  '002_vagas',
  '003_envios'
] as const;

export type MigrationName = typeof migrationOrder[number];