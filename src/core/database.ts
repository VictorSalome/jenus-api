import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import { config } from './config.js';
import * as logger from './logger.js';
import fs from 'fs';
import path from 'path';
import { runMigrations } from './migrations/runner.js';
import { curriculoMigrations } from '../apps/curriculos/migrations/index.js';
import { seedCurriculoProfileFromJson } from '../apps/curriculos/migrations/seed.js';
import { promoMigrations } from '../apps/promo/migrations/index.js';
import { gmailMigrations } from '../apps/gmail/migrations/index.js';
import { seedPromoDatabase } from '../apps/promo/migrations/seed.js';

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

// Inicializa ao importar: roda as migrations de todos os apps registrados
// (na ordem em que aparecem aqui) e depois os seeds de cada um.
export const initDb = async (): Promise<Database<sqlite3.Database, sqlite3.Statement>> => {
  const database = await getDb();

  await runMigrations(database, [...curriculoMigrations, ...promoMigrations, ...gmailMigrations]);

  await seedPromoDatabase(database);
  await seedCurriculoProfileFromJson(database);

  logger.info('Banco de dados inicializado!', 'Database');
  return database;
};

// Exporta db já inicializado para uso síncrono (depois de initDb)
export { db };
