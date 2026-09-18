import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sqlite3 from "sqlite3";
import { open, type Database } from "sqlite";

import { reavaliarVagasHistoricoSalvo } from "./vagasEmailWorker.service.js";
import { curriculoMigrations } from "../migrations/index.js";
import { runMigrations } from "../../../core/migrations/runner.js";
import { notificationMigrations } from "../../../shared/notifications/migrations.js";

/**
 * Missão 7 — testes de `reavaliarVagasHistoricoSalvo`.
 *
 * Isolamento total do banco real: cria um arquivo SQLite temporário e roda
 * SOMENTE as migrations do app `curriculos` nele (via `runMigrations`, o
 * mesmo runner de produção — isso também exercita a migration nova
 * `curriculo_019_reavaliacao_historico_salvo` contra um banco limpo e
 * confirma que ela roda sem erro). Perfil e motor de score são mockados via
 * injeção de dependências (`deps`), então nenhuma tabela de perfil real
 * precisa ser populada e nenhuma lógica de scoring real é exercitada aqui
 * (isso já é coberto pelos testes de `curriculoPersonalizador`).
 */

let db: Database<sqlite3.Database, sqlite3.Statement>;
let dbPath: string;

const perfilFake = { fake: true };

// Fake determinístico: o "score" de cada vaga é decidido pelo marcador salvo
// em `dados_vaga_json.marker`, não por lógica real de matching.
const calcularScoreFake = (_perfil: any, dadosVaga: Record<string, any>): number => {
  if (dadosVaga.marker === "ALTA") return 85;
  if (dadosVaga.marker === "BAIXA") return 40;
  throw new Error(`marker desconhecido em teste: ${dadosVaga.marker}`);
};

const identificarMatchesFake = (_perfil: any, dadosVaga: Record<string, any>) => [
  { skillCandidato: "Fake", tecnologiaVaga: dadosVaga.marker, categoria: "teste", peso: 1 },
];

async function inserirCandidatura(row: {
  jobId: string;
  createdAtSqlOffset: string; // ex.: "-10 days"
  ultimaReavaliacaoSqlOffset?: string | null; // ex.: "-1 hours" ou null
  marker: "ALTA" | "BAIXA";
  status?: string;
  skipReason?: string | null;
}) {
  const dadosVaga = { marker: row.marker, titulo: `Vaga ${row.jobId}` };
  await db.run(
    `INSERT INTO curriculo_automacao_candidaturas
       (job_id, contact_email, company, vaga_title, score, dados_vaga_json, status, skip_reason, created_at, ultima_reavaliacao_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?), ${
       row.ultimaReavaliacaoSqlOffset ? "datetime('now', ?)" : "NULL"
     })`,
    ...([
      row.jobId,
      `contato-${row.jobId}@empresa.com`,
      "Empresa Teste",
      `Vaga ${row.jobId}`,
      10,
      JSON.stringify(dadosVaga),
      row.status ?? "SKIPPED",
      row.skipReason === undefined ? "LOW_SCORE" : row.skipReason,
      row.createdAtSqlOffset,
      ...(row.ultimaReavaliacaoSqlOffset ? [row.ultimaReavaliacaoSqlOffset] : []),
    ] as any[]),
  );
}

async function buscarCandidatura(jobId: string) {
  return db.get<any>(
    "SELECT * FROM curriculo_automacao_candidaturas WHERE job_id = ?",
    jobId,
  );
}

before(async () => {
  dbPath = path.join(
    os.tmpdir(),
    `reavaliacao-historico-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  db = await open({ filename: dbPath, driver: sqlite3.Database });
  await runMigrations(db, [...notificationMigrations, ...curriculoMigrations]);
});

after(async () => {
  await db.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    const p = `${dbPath}${suffix}`;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

describe("reavaliarVagasHistoricoSalvo (Missão 7)", () => {
  it("promove uma vaga SKIPPED/LOW_SCORE recente cujo novo score (com o perfil/motor atual) cruza o minScore", async () => {
    await inserirCandidatura({
      jobId: "job-promovida",
      createdAtSqlOffset: "-10 days",
      marker: "ALTA",
    });

    const resultado = await reavaliarVagasHistoricoSalvo({
      minScore: 70,
      deps: {
        getDb: async () => db,
        carregarPerfil: async () => perfilFake,
        calcularScore: calcularScoreFake as any,
        identificarMatches: identificarMatchesFake as any,
      },
    });

    assert.equal(resultado.avaliadas, 1);
    assert.equal(resultado.promovidas, 1);
    assert.equal(resultado.mantidas, 0);
    assert.equal(resultado.erros, 0);

    const row = await buscarCandidatura("job-promovida");
    assert.equal(row.status, "PENDING");
    assert.equal(row.skip_reason, null);
    assert.equal(row.score, 85);
    assert.equal(row.score_categoria_aplicado, 85);
    assert.ok(row.matches_categoria_json);
    assert.ok(row.ultima_reavaliacao_em);
  });

  it("mantém SKIPPED uma vaga cujo novo score continua abaixo do minScore", async () => {
    await inserirCandidatura({
      jobId: "job-mantida",
      createdAtSqlOffset: "-10 days",
      marker: "BAIXA",
    });

    const resultado = await reavaliarVagasHistoricoSalvo({
      minScore: 70,
      deps: {
        getDb: async () => db,
        carregarPerfil: async () => perfilFake,
        calcularScore: calcularScoreFake as any,
        identificarMatches: identificarMatchesFake as any,
      },
    });

    assert.equal(resultado.avaliadas, 1);
    assert.equal(resultado.promovidas, 0);
    assert.equal(resultado.mantidas, 1);

    const row = await buscarCandidatura("job-mantida");
    assert.equal(row.status, "SKIPPED");
    assert.equal(row.skip_reason, "LOW_SCORE");
    assert.equal(row.score_categoria_aplicado, 40);
    assert.ok(row.ultima_reavaliacao_em, "deve marcar ultima_reavaliacao_em mesmo quando não promove");
  });

  it("não reavalia uma vaga SKIPPED/LOW_SCORE com mais de 45 dias", async () => {
    await inserirCandidatura({
      jobId: "job-antiga",
      createdAtSqlOffset: "-50 days",
      marker: "ALTA",
    });

    const resultado = await reavaliarVagasHistoricoSalvo({
      minScore: 70,
      deps: {
        getDb: async () => db,
        carregarPerfil: async () => perfilFake,
        calcularScore: calcularScoreFake as any,
        identificarMatches: identificarMatchesFake as any,
      },
    });

    // Nenhuma das candidaturas elegíveis nesta chamada deve incluir a antiga
    const row = await buscarCandidatura("job-antiga");
    assert.equal(row.status, "SKIPPED");
    assert.equal(row.skip_reason, "LOW_SCORE");
    assert.equal(row.ultima_reavaliacao_em, null);
    // avaliadas não deve contar a vaga antiga (só pode ter contado outras
    // candidaturas elegíveis já reavaliadas/promovidas em testes anteriores,
    // nunca esta)
    assert.equal(resultado.avaliadas, 0);
  });

  it("não reavalia de novo, na mesma janela de proteção, uma vaga já reavaliada recentemente", async () => {
    await inserirCandidatura({
      jobId: "job-protegida",
      createdAtSqlOffset: "-10 days",
      ultimaReavaliacaoSqlOffset: "-1 hours",
      marker: "ALTA",
    });

    const resultado = await reavaliarVagasHistoricoSalvo({
      minScore: 70,
      protecaoHoras: 24,
      deps: {
        getDb: async () => db,
        carregarPerfil: async () => perfilFake,
        calcularScore: calcularScoreFake as any,
        identificarMatches: identificarMatchesFake as any,
      },
    });

    assert.equal(resultado.avaliadas, 0);

    const row = await buscarCandidatura("job-protegida");
    // Continua SKIPPED e não foi promovida, mesmo tendo marker "ALTA" (que
    // teria sido promovida se não estivesse protegida pela janela de 24h).
    assert.equal(row.status, "SKIPPED");
    assert.equal(row.score, 10);
  });

  it("retorna zerado e não lança quando não há candidaturas elegíveis para reavaliação", async () => {
    const resultado = await reavaliarVagasHistoricoSalvo({
      minScore: 70,
      deps: {
        getDb: async () => {
          const dbVazio = await open({ filename: ":memory:", driver: sqlite3.Database });
          await runMigrations(dbVazio, curriculoMigrations);
          return dbVazio;
        },
        carregarPerfil: async () => perfilFake,
        calcularScore: calcularScoreFake as any,
        identificarMatches: identificarMatchesFake as any,
      },
    });

    assert.deepEqual(resultado, { avaliadas: 0, promovidas: 0, mantidas: 0, erros: 0 });
  });
});
