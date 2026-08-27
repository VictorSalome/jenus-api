import type { Migration } from "../../../core/migrations/runner.js";

/**
 * Migrations desta app. Convenção de ID: `<app>_NNN_slug` (ex.:
 * `carros_001_initial`) — precisa ser único globalmente entre TODAS as
 * apps, porque todas dividem a mesma tabela `schema_migrations`.
 *
 * Convenção de tabela: prefixe toda tabela desta app com `<app>_`
 * (ex.: `carros_veiculos`), já que é um único banco SQLite compartilhado
 * sem schemas separados — o prefixo é o que evita colisão de nomes com
 * as tabelas de outras apps.
 *
 * IDs já executados em produção NUNCA podem ser renomeados nem ter o SQL
 * alterado — para mudar o schema depois, adicione uma nova migration.
 *
 * TODO: renomeie `templateMigrations` e os IDs/tabelas para a app real.
 */
export const templateMigrations: Migration[] = [
  {
    id: "template_001_initial",
    up: `
      CREATE TABLE IF NOT EXISTS template_exemplo (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `,
  },
];
