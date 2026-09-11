import type { Migration } from "../../../core/migrations/runner.js";

export const prospeccaoMigrations: Migration[] = [
  {
    id: "prospeccao_001_initial",
    up: `
      CREATE TABLE IF NOT EXISTS prospeccao_empresas (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        segmento TEXT,
        cidade TEXT,
        bairro TEXT,
        endereco TEXT,
        telefone TEXT,
        whatsapp TEXT,
        email TEXT,
        maps_url TEXT,
        avaliacao REAL,
        total_avaliacoes INTEGER,
        fotos TEXT DEFAULT '[]',
        status TEXT DEFAULT 'PENDENTE' CHECK(status IN ('PENDENTE', 'APROVADA', 'REJEITADA', 'ENVIADA', 'CONVERTIDA')),
        motivo_rejeicao TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_prospeccao_empresas_slug ON prospeccao_empresas(slug);
      CREATE INDEX IF NOT EXISTS idx_prospeccao_empresas_status ON prospeccao_empresas(status);
      CREATE INDEX IF NOT EXISTS idx_prospeccao_empresas_telefone ON prospeccao_empresas(telefone);

      CREATE TRIGGER IF NOT EXISTS trg_prospeccao_empresas_updated_at
      AFTER UPDATE ON prospeccao_empresas
      FOR EACH ROW
      WHEN NEW.updated_at = OLD.updated_at
      BEGIN
        UPDATE prospeccao_empresas SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;
    `,
  },
  {
    id: "prospeccao_002_esteira_aprovacao_snapshots",
    up: `
      CREATE TABLE IF NOT EXISTS prospeccao_empresas_v2 (
        id TEXT PRIMARY KEY,
        nome TEXT NOT NULL,
        slug TEXT UNIQUE NOT NULL,
        segmento TEXT,
        cidade TEXT,
        bairro TEXT,
        endereco TEXT,
        telefone TEXT,
        whatsapp TEXT,
        email TEXT,
        maps_url TEXT,
        avaliacao REAL,
        total_avaliacoes INTEGER,
        fotos TEXT DEFAULT '[]',
        landing_page_url TEXT,
        landing_page_snapshot TEXT,
        snapshot_version INTEGER DEFAULT 1,
        status TEXT DEFAULT 'PENDING_REVIEW' CHECK(status IN (
          'PENDING_REVIEW', 'APPROVED', 'SENT', 'REPLIED', 'CONVERTED', 'REJECTED', 'FAILED',
          'PENDENTE', 'APROVADA', 'ENVIADA', 'CONVERTIDA', 'REJEITADA'
        )),
        motivo_rejeicao TEXT,
        approved_at TIMESTAMP,
        approved_by TEXT,
        rejected_at TIMESTAMP,
        rejected_by TEXT,
        rejection_reason TEXT,
        sent_at TIMESTAMP,
        message_id TEXT,
        reply_to TEXT,
        replied_at TIMESTAMP,
        converted_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      INSERT INTO prospeccao_empresas_v2 (
        id, nome, slug, segmento, cidade, bairro, endereco, telefone, whatsapp, email,
        maps_url, avaliacao, total_avaliacoes, fotos, status, motivo_rejeicao, created_at, updated_at
      )
      SELECT
        id, nome, slug, segmento, cidade, bairro, endereco, telefone, whatsapp, email,
        maps_url, avaliacao, total_avaliacoes, fotos,
        CASE
          WHEN status = 'PENDENTE' THEN 'PENDING_REVIEW'
          WHEN status = 'APROVADA' THEN 'APPROVED'
          WHEN status = 'ENVIADA' THEN 'SENT'
          WHEN status = 'CONVERTIDA' THEN 'CONVERTED'
          WHEN status = 'REJEITADA' THEN 'REJECTED'
          ELSE status
        END,
        motivo_rejeicao, created_at, updated_at
      FROM prospeccao_empresas;

      DROP TABLE prospeccao_empresas;
      ALTER TABLE prospeccao_empresas_v2 RENAME TO prospeccao_empresas;

      CREATE INDEX IF NOT EXISTS idx_prospeccao_empresas_slug ON prospeccao_empresas(slug);
      CREATE INDEX IF NOT EXISTS idx_prospeccao_empresas_status ON prospeccao_empresas(status);
      CREATE INDEX IF NOT EXISTS idx_prospeccao_empresas_telefone ON prospeccao_empresas(telefone);

      CREATE TRIGGER IF NOT EXISTS trg_prospeccao_empresas_updated_at
      AFTER UPDATE ON prospeccao_empresas
      FOR EACH ROW
      WHEN NEW.updated_at = OLD.updated_at
      BEGIN
        UPDATE prospeccao_empresas SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
      END;

      CREATE TABLE IF NOT EXISTS prospeccao_disparos (
        id TEXT PRIMARY KEY,
        lead_id TEXT NOT NULL REFERENCES prospeccao_empresas(id),
        canal TEXT NOT NULL CHECK(canal IN ('EMAIL', 'WHATSAPP')),
        tipo_disparo TEXT NOT NULL DEFAULT 'PRIMEIRO_CONTATO',
        recipient TEXT NOT NULL,
        reply_to TEXT,
        landing_page_url TEXT NOT NULL,
        message_id TEXT,
        status TEXT NOT NULL CHECK(status IN ('PROCESSING', 'SENT', 'FAILED')),
        error TEXT,
        sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_prospeccao_disparos_lead ON prospeccao_disparos(lead_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_prospeccao_disparos_unique_active 
      ON prospeccao_disparos(lead_id, canal, tipo_disparo) 
      WHERE status IN ('PROCESSING', 'SENT');
    `,
  },
];
