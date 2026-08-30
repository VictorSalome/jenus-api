import type { Migration } from "../../../core/migrations/runner.js";

/**
 * Migrations do app gmail. Usam o prefixo `gmail_NNN_slug` desde o início
 * (o app é novo — não há histórico de produção para preservar).
 */
export const gmailMigrations: Migration[] = [
  {
    id: "gmail_001_tokens",
    up: `
      CREATE TABLE IF NOT EXISTS gmail_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        email TEXT,
        access_token_enc TEXT,
        refresh_token_enc TEXT,
        expires_at INTEGER,
        scope TEXT,
        thread_hint_json TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id)
      );
    `,
  },
  {
    id: "gmail_002_envio_message_id",
    up: `
      ALTER TABLE curriculo_envios ADD COLUMN message_id TEXT;
      ALTER TABLE curriculo_envios ADD COLUMN gmail_thread_id TEXT;
    `,
  },
];
