import type { Migration } from "../../../core/migrations/runner.js";

/**
 * Migrations do app promo. Antes desta reorganização, as tabelas eram
 * criadas via `CREATE TABLE IF NOT EXISTS` solto (sem controle de versão)
 * a cada boot. `promo_001_initial` formaliza isso como uma migration real
 * — idempotente, então é seguro mesmo rodando contra um banco que já tinha
 * essas tabelas criadas do jeito antigo.
 */
export const promoMigrations: Migration[] = [
  {
    id: "promo_001_initial",
    up: `
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
    `,
  },
  {
    id: "promo_002_rename_prefix",
    up: `
      ALTER TABLE telegram_config RENAME TO promo_telegram_config;
      ALTER TABLE channels RENAME TO promo_channels;
      ALTER TABLE categories RENAME TO promo_categories;
      ALTER TABLE filters RENAME TO promo_filters;
      ALTER TABLE sent_messages RENAME TO promo_sent_messages;
      ALTER TABLE price_alerts RENAME TO promo_price_alerts;
      ALTER TABLE device_tokens RENAME TO promo_device_tokens;
    `,
  },
  {
    id: "promo_003_monitor_state",
    up: `
      CREATE TABLE IF NOT EXISTS promo_monitor_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        is_running INTEGER DEFAULT 0,
        telegram_connected INTEGER DEFAULT 0,
        last_check_at TIMESTAMP,
        last_error TEXT,
        consecutive_errors INTEGER DEFAULT 0,
        current_interval_ms INTEGER DEFAULT 120000,
        messages_processed INTEGER DEFAULT 0,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO promo_monitor_state (id, is_running) VALUES (1, 0)
        ON CONFLICT(id) DO NOTHING;
    `,
  },
  {
    id: "promo_004_telegram_bot_config",
    up: `
      CREATE TABLE IF NOT EXISTS promo_telegram_bot_config (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        bot_token TEXT,
        group_id TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
];
