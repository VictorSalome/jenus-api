import type { Migration } from "../../core/migrations/runner.js";

/**
 * Refresh tokens PRECISAM sobreviver a restarts do processo (deploy, crash,
 * pm2 reload) — antes ficavam num Map em memória e qualquer restart do PM2
 * derrubava todas as sessões ativas mesmo com "lembrar-me" marcado.
 */
export const authMigrations: Migration[] = [
  {
    id: "auth_001_refresh_tokens",
    up: `
      CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
        token_id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        is_revoked INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user ON auth_refresh_tokens(user_id);
    `,
  },
];
