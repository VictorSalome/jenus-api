import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { config } from './config.js';
import { promoConfig } from '../promo/config.js';
import * as logger from './logger.js';
import fs from 'fs';
import path from 'path';
import { migrations, migrationOrder, type MigrationName } from './migrations/index.js';

const dbDir = path.dirname(config.DATABASE_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db: Database<sqlite3.Database, sqlite3.Statement>;

export const getDb = async (): Promise<Database<sqlite3.Database, sqlite3.Statement>> => {
  if (!db) {
    db = await open({
      filename: config.DATABASE_PATH,
      driver: sqlite3.Database
    });
  }
  return db;
};

const createTables = async (): Promise<void> => {
  const database = await getDb();
  logger.info('Criando tabelas do banco de dados...', 'Database');

  await database.exec(`
    CREATE TABLE IF NOT EXISTS telegram_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      api_id TEXT,
      api_hash TEXT,
      phone TEXT,
      session_string TEXT,
      is_connected INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      name TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT DEFAULT '#3b82f6',
      icon TEXT DEFAULT '📁',
      sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS filters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT CHECK(type IN ('broad', 'specific')) DEFAULT 'broad',
      keywords TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      match_count INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sent_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      link TEXT,
      product TEXT,
      price REAL,
      store TEXT,
      channel TEXT NOT NULL,
      message_text TEXT NOT NULL,
      matched_filters TEXT,
      sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS price_alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_name TEXT NOT NULL,
      target_price REAL NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT CHECK(level IN ('info', 'warn', 'error')) DEFAULT 'info',
      message TEXT NOT NULL,
      feature TEXT,
      data TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS device_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      platform TEXT NOT NULL DEFAULT 'ios',
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      last_used_at TIMESTAMP
    );
  `);

  logger.info('Tabelas criadas com sucesso!', 'Database');
};

const createIndexes = async (): Promise<void> => {
  const database = await getDb();
  await database.exec(`
    CREATE INDEX IF NOT EXISTS idx_sent_link ON sent_messages(link);
    CREATE INDEX IF NOT EXISTS idx_sent_product ON sent_messages(product);
    CREATE INDEX IF NOT EXISTS idx_sent_time ON sent_messages(sent_at);
    CREATE INDEX IF NOT EXISTS idx_sent_link_price_time ON sent_messages(link, price, sent_at);
    CREATE INDEX IF NOT EXISTS idx_sent_product_price_time ON sent_messages(product, price, sent_at);
    CREATE INDEX IF NOT EXISTS idx_sent_channel_time ON sent_messages(channel, sent_at);
    CREATE INDEX IF NOT EXISTS idx_filters_category ON filters(category_id);
    CREATE INDEX IF NOT EXISTS idx_filters_active ON filters(is_active);
    CREATE INDEX IF NOT EXISTS idx_channels_active ON channels(is_active);
    CREATE INDEX IF NOT EXISTS idx_device_tokens_active ON device_tokens(is_active);
  `);
};

const runMigrations = async (): Promise<void> => {
  const database = await getDb();
  logger.info('Verificando migrations pendentes...', 'Database');

  // Garantir que a tabela schema_migrations existe antes de consultar
  await database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  for (const name of migrationOrder as readonly MigrationName[]) {
    const executed = await database.get(
      'SELECT 1 FROM schema_migrations WHERE name = ?',
      name
    );
    if (!executed) {
      logger.info(`Executando migration: ${name}`, 'Database');
      await database.exec(migrations[name]);
      await database.run(
        'INSERT INTO schema_migrations (name) VALUES (?)',
        name
      );
      logger.info(`Migration ${name} executada com sucesso`, 'Database');
    } else {
      logger.debug(`Migration ${name} já executada, pulando`, 'Database');
    }
  }
};

export const initDatabase = async (): Promise<void> => {
  try {
    await createTables();
    await createIndexes();
    logger.info('Banco de dados inicializado!', 'Database');
  } catch (err) {
    logger.error(`Erro ao inicializar banco: ${err}`, 'Database');
    throw err;
  }
};

export const seedDatabase = async (): Promise<void> => {
  const database = await getDb();
  logger.info('Verificando seed...', 'Database');

  const configRow = await database.get('SELECT COUNT(*) as count FROM telegram_config');
  if (configRow.count === 0) {
    logger.info('Inserindo configuração inicial...', 'Database');
    await database.run(`
      INSERT INTO telegram_config (id, api_id, api_hash, phone, is_connected)
      VALUES (1, ?, ?, '', 0)
    `, promoConfig.API_ID || '', promoConfig.API_HASH || '');
  } else if (promoConfig.API_ID && promoConfig.API_HASH) {
    // Preencher com valores do .env se estiverem vazios
    const existing = await database.get('SELECT api_id, api_hash FROM telegram_config WHERE id = 1');
    if (!existing?.api_id && !existing?.api_hash) {
      logger.info('Preenchendo API_ID/API_HASH do .env na config existente...', 'Database');
      await database.run(`
        UPDATE telegram_config SET api_id = ?, api_hash = ? WHERE id = 1
      `, promoConfig.API_ID, promoConfig.API_HASH);
    }
  }

  const channelCount = await database.get('SELECT COUNT(*) as count FROM channels');
  if (channelCount.count === 0) {
    logger.info('Inserindo canais padrão...', 'Database');
    const channels = [
      '@urubupromo',
      '@ofertasgamer_oficial',
      '@LaPromotion',
      '@mpromotech',
      '@ofertasthautec',
      '@iuriindica',
      '@pcdorafa'
    ];

    for (const channel of channels) {
      try {
        await database.run('INSERT INTO channels (username, is_active) VALUES (?, 1)', channel);
      } catch {
        // Ignora duplicatas
      }
    }
  }

  const categoryCount = await database.get('SELECT COUNT(*) as count FROM categories');
  if (categoryCount.count === 0) {
    logger.info('Inserindo categorias e filtros padrão...', 'Database');

    const categories = [
      { name: '📱 Celulares', color: '#3b82f6', icon: '📱' },
      { name: '🎮 Hardware', color: '#ef4444', icon: '🎮' }
    ];

    const celularesResult = await database.run(
      'INSERT INTO categories (name, color, icon, sort_order) VALUES (?, ?, ?, ?)',
      categories[0].name, categories[0].color, categories[0].icon, 0
    );
    const celularesId = celularesResult.lastID;

    const hardwareResult = await database.run(
      'INSERT INTO categories (name, color, icon, sort_order) VALUES (?, ?, ?, ?)',
      categories[1].name, categories[1].color, categories[1].icon, 1
    );
    const hardwareId = hardwareResult.lastID;

    const filters = [
      { categoryId: celularesId, name: 'Galaxy', type: 'broad', keywords: JSON.stringify(['galaxy', 'samsung', 's24', 's25', 'tab', 'watch']) },
      { categoryId: celularesId, name: 'Galaxy S22', type: 'specific', keywords: JSON.stringify(['galaxy s22', 's22 ultra', 's22 plus']) },
      { categoryId: celularesId, name: 'iPhone', type: 'broad', keywords: JSON.stringify(['iphone', 'apple', 'ios']) },
      { categoryId: hardwareId, name: 'RTX', type: 'broad', keywords: JSON.stringify(['rtx', 'nvidia', 'geforce']) },
      { categoryId: hardwareId, name: 'RTX 4060', type: 'specific', keywords: JSON.stringify(['rtx 4060', '4060 ti']) },
      { categoryId: hardwareId, name: 'AMD RX', type: 'broad', keywords: JSON.stringify(['rx', 'radeon', 'amd']) }
    ];

    for (const filter of filters) {
      await database.run(
        'INSERT INTO filters (category_id, name, type, keywords) VALUES (?, ?, ?, ?)',
        filter.categoryId, filter.name, filter.type, filter.keywords
      );
    }
  }

  logger.info('Seed concluído!', 'Database');
};

/**
 * Migra dados do candidate-profile.json para o banco de dados
 * Executa uma vez apenas se as tabelas estiverem vazias
 */
const seedProfileFromJson = async (): Promise<void> => {
  const database = await getDb();
  
  // Verificar se já existem dados
  const existing = await database.get('SELECT COUNT(*) as count FROM profile_personal');
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
      INSERT INTO profile_personal (id, name, email, phone, has_whatsapp, linkedin, github, portfolio, location, title, summary)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, pi.name, pi.email, pi.phone, pi.hasWhatsApp !== false ? 1 : 0, pi.linkedin, pi.github, pi.portfolio, pi.location, pi.title, pi.summary);
  }

  // experiences
  if (Array.isArray(profileData.experiences)) {
    for (let i = 0; i < profileData.experiences.length; i++) {
      const exp = profileData.experiences[i];
      await database.run(`
        INSERT INTO profile_experiences (id, company, position, start_date, end_date, location, description, keywords_json, achievements_json, technologies_json, sort_order)
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
        INSERT INTO profile_education (id, institution, degree, start_date, end_date, location, gpa, description, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, edu.id || `edu_${i}`, edu.institution, edu.degree, edu.startDate, edu.endDate, edu.location, edu.gpa, edu.description, i);
    }
  }

  // certifications
  if (Array.isArray(profileData.certifications)) {
    for (let i = 0; i < profileData.certifications.length; i++) {
      const cert = profileData.certifications[i];
      await database.run(`
        INSERT INTO profile_certifications (id, name, issuer, date, credential_id, url, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, cert.id || `cert_${i}`, cert.name, cert.issuer, cert.date, cert.credentialId, cert.url, i);
    }
  }

  // languages
  if (Array.isArray(profileData.languages)) {
    for (let i = 0; i < profileData.languages.length; i++) {
      const lang = profileData.languages[i];
      await database.run(`
        INSERT INTO profile_languages (language, level, sort_order)
        VALUES (?, ?, ?)
      `, lang.language, lang.level, i);
    }
  }

  // specializations
  if (Array.isArray(profileData.specializations)) {
    for (let i = 0; i < profileData.specializations.length; i++) {
      await database.run(`
        INSERT INTO profile_specializations (text, sort_order)
        VALUES (?, ?)
      `, profileData.specializations[i], i);
    }
  }

  // skills
  if (profileData.skills) {
    for (const [category, techs] of Object.entries(profileData.skills)) {
      for (const tech of techs as string[]) {
        await database.run(
          'INSERT OR IGNORE INTO profile_skills (category, tech) VALUES (?, ?)',
          category, tech
        );
      }
    }
  }

  logger.info(`Perfil migrado: ${profileData.experiences?.length || 0} experiências, ${profileData.education?.length || 0} formações, ${profileData.certifications?.length || 0} certificações`, 'Database');
};

// Inicializa ao importar
export const initDb = async (): Promise<Database<sqlite3.Database, sqlite3.Statement>> => {
  await initDatabase();
  await runMigrations();
  await seedDatabase();
  await seedProfileFromJson();
  return getDb();
};

// Exporta db já inicializado para uso síncrono (depois de initDb)
export { db };
