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
];
