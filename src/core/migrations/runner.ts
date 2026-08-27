import sqlite3 from 'sqlite3';
import { Database } from 'sqlite';
import * as logger from '../logger.js';

export interface Migration {
  id: string;
  up: string;
}

/**
 * Roda, em ordem, as migrations que ainda não estão registradas em
 * schema_migrations. Cada app fornece sua própria lista de migrations
 * (já ordenada); este runner apenas soma e executa.
 */
export const runMigrations = async (
  database: Database<sqlite3.Database, sqlite3.Statement>,
  allMigrations: Migration[],
): Promise<void> => {
  logger.info('Verificando migrations pendentes...', 'Database');

  await database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  for (const migration of allMigrations) {
    const executed = await database.get(
      'SELECT 1 FROM schema_migrations WHERE name = ?',
      migration.id,
    );
    if (!executed) {
      logger.info(`Executando migration: ${migration.id}`, 'Database');
      await database.exec(migration.up);
      await database.run(
        'INSERT INTO schema_migrations (name) VALUES (?)',
        migration.id,
      );
      logger.info(`Migration ${migration.id} executada com sucesso`, 'Database');
    } else {
      logger.debug(`Migration ${migration.id} já executada, pulando`, 'Database');
    }
  }
};
