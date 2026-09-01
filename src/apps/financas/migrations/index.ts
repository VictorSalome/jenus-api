import type { Migration } from "../../../core/migrations/runner.js";

export const financasMigrations: Migration[] = [
  {
    id: "financas_001_accounts",
    up: `
      CREATE TABLE IF NOT EXISTS fin_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'checking',
        bank TEXT,
        balance_cents INTEGER NOT NULL DEFAULT 0,
        currency TEXT NOT NULL DEFAULT 'BRL',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_fin_accounts_user ON fin_accounts(user_id);
    `,
  },
  {
    id: "financas_002_cards",
    up: `
      CREATE TABLE IF NOT EXISTS fin_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        account_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        last4 TEXT,
        brand TEXT,
        closing_day INTEGER NOT NULL DEFAULT 1,
        due_day INTEGER NOT NULL DEFAULT 10,
        credit_limit_cents INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES fin_accounts(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_fin_cards_user ON fin_cards(user_id);
      CREATE INDEX IF NOT EXISTS idx_fin_cards_account ON fin_cards(account_id);
    `,
  },
  {
    id: "financas_003_categories",
    up: `
      CREATE TABLE IF NOT EXISTS fin_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        icon TEXT DEFAULT 'tag',
        color TEXT DEFAULT '#64748b',
        kind TEXT NOT NULL DEFAULT 'expense',
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_fin_categories_user ON fin_categories(user_id);
    `,
  },
  {
    id: "financas_004_merchants",
    up: `
      CREATE TABLE IF NOT EXISTS fin_merchants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        name_normalized TEXT NOT NULL,
        cnpj TEXT,
        category_id INTEGER,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, name_normalized),
        FOREIGN KEY (category_id) REFERENCES fin_categories(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_fin_merchants_user ON fin_merchants(user_id);
    `,
  },
  {
    id: "financas_005_transactions",
    up: `
      CREATE TABLE IF NOT EXISTS fin_transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        account_id INTEGER NOT NULL,
        card_id INTEGER,
        merchant_id INTEGER,
        category_id INTEGER,
        description TEXT,
        amount_cents INTEGER NOT NULL,
        type TEXT NOT NULL DEFAULT 'debit',
        transaction_date TEXT NOT NULL,
        installments_total INTEGER NOT NULL DEFAULT 1,
        installment_number INTEGER NOT NULL DEFAULT 1,
        due_date TEXT,
        paid_date TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        source TEXT NOT NULL DEFAULT 'MANUAL',
        notification_event_id INTEGER,
        dup_hash TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES fin_accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (card_id) REFERENCES fin_cards(id) ON DELETE SET NULL,
        FOREIGN KEY (merchant_id) REFERENCES fin_merchants(id) ON DELETE SET NULL,
        FOREIGN KEY (category_id) REFERENCES fin_categories(id) ON DELETE SET NULL
      );
      CREATE INDEX IF NOT EXISTS idx_fin_transactions_user ON fin_transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_fin_transactions_user_date ON fin_transactions(user_id, transaction_date);
      CREATE INDEX IF NOT EXISTS idx_fin_transactions_user_status ON fin_transactions(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_fin_transactions_user_source ON fin_transactions(user_id, source);
      CREATE INDEX IF NOT EXISTS idx_fin_transactions_user_dup ON fin_transactions(user_id, dup_hash);
    `,
  },
  {
    id: "financas_006_installment_plans",
    up: `
      CREATE TABLE IF NOT EXISTS fin_installment_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        transaction_id INTEGER NOT NULL,
        total_installments INTEGER NOT NULL,
        installment_amount_cents INTEGER NOT NULL,
        start_month TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (transaction_id),
        FOREIGN KEY (transaction_id) REFERENCES fin_transactions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_fin_plans_user ON fin_installment_plans(user_id);
      CREATE INDEX IF NOT EXISTS idx_fin_plans_transaction ON fin_installment_plans(transaction_id);
    `,
  },
  {
    id: "financas_007_installments",
    up: `
      CREATE TABLE IF NOT EXISTS fin_installments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        plan_id INTEGER NOT NULL,
        transaction_id INTEGER NOT NULL,
        number INTEGER NOT NULL,
        amount_cents INTEGER NOT NULL,
        due_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING',
        paid_date TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (plan_id) REFERENCES fin_installment_plans(id) ON DELETE CASCADE,
        FOREIGN KEY (transaction_id) REFERENCES fin_transactions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_fin_installments_user ON fin_installments(user_id);
      CREATE INDEX IF NOT EXISTS idx_fin_installments_user_due ON fin_installments(user_id, due_date);
      CREATE INDEX IF NOT EXISTS idx_fin_installments_user_status ON fin_installments(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_fin_installments_plan ON fin_installments(plan_id);
    `,
  },
  {
    id: "financas_008_notification_events",
    up: `
      CREATE TABLE IF NOT EXISTS fin_notification_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        package_name TEXT,
        app_label TEXT,
        title TEXT,
        text TEXT,
        raw_json TEXT,
        parsed_json TEXT,
        fingerprint TEXT,
        status TEXT NOT NULL DEFAULT 'raw',
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_fin_events_user ON fin_notification_events(user_id);
      CREATE INDEX IF NOT EXISTS idx_fin_events_user_status ON fin_notification_events(user_id, status);
      CREATE INDEX IF NOT EXISTS idx_fin_events_fingerprint ON fin_notification_events(user_id, fingerprint);
    `,
  },
  {
    id: "financas_009_indexes",
    up: `
      CREATE INDEX IF NOT EXISTS idx_fin_transactions_user_card ON fin_transactions(user_id, card_id);
      CREATE INDEX IF NOT EXISTS idx_fin_transactions_user_category ON fin_transactions(user_id, category_id);
      CREATE INDEX IF NOT EXISTS idx_fin_installments_user_status_due ON fin_installments(user_id, status, due_date);
    `,
  },
];