import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { config } from './config.js';
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
    `, config.API_ID || '', config.API_HASH || '');
  } else if (config.API_ID && config.API_HASH) {
    // Preencher com valores do .env se estiverem vazios
    const existing = await database.get('SELECT api_id, api_hash FROM telegram_config WHERE id = 1');
    if (!existing?.api_id && !existing?.api_hash) {
      logger.info('Preenchendo API_ID/API_HASH do .env na config existente...', 'Database');
      await database.run(`
        UPDATE telegram_config SET api_id = ?, api_hash = ? WHERE id = 1
      `, config.API_ID, config.API_HASH);
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

// Inicializa ao importar
export const initDb = async (): Promise<void> => {
  await initDatabase();
  await runMigrations();
  await seedDatabase();
};

// Exporta db já inicializado para uso síncrono (depois de initDb)
export { db };
