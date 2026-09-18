import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gerarFingerprintVaga } from "./vagaFingerprint.js";

let dbPath: string;
let feedPath: string;

const EMAIL_RECRUTADOR = "recrutamento@techcorp.com.br";
const EMPRESA = "TechCorp";

before(async () => {
  dbPath = path.join(
    os.tmpdir(),
    `worker-fingerprint-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  feedPath = path.join(
    os.tmpdir(),
    `feed-fingerprint-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );

  process.env.DATABASE_PATH = dbPath;
});

after(async () => {
  const { getDb } = await import("../../../core/database.js");
  const db = await getDb();
  await db.close();
  for (const suffix of ["", "-wal", "-shm"]) {
    if (fs.existsSync(`${dbPath}${suffix}`)) fs.unlinkSync(`${dbPath}${suffix}`);
  }
  if (fs.existsSync(feedPath)) fs.unlinkSync(feedPath);
});

describe("vagasEmailWorker — Deduplicação Canônica por Fingerprint", () => {
  it("impede reenvio de vaga republicada com novo job_id e título variante se já foi SENT", async () => {
    const { getDb } = await import("../../../core/database.js");
    const { runMigrations } = await import("../../../core/migrations/runner.js");
    const { curriculoMigrations } = await import("../migrations/index.js");
    const { notificationMigrations } = await import("../../../shared/notifications/migrations.js");
    const db = await getDb();
    await runMigrations(db, [...notificationMigrations, ...curriculoMigrations]);

    const { vagasEmailWorker } = await import("./vagasEmailWorker.service.js");

    // Inserir uma vaga enviada no passado com ID antigo
    const fpEnviado = gerarFingerprintVaga(EMAIL_RECRUTADOR, EMPRESA, "Desenvolvedor React Senior (PJ)");
    await db.run(
      `INSERT INTO curriculo_automacao_candidaturas
       (job_id, contact_email, company, vaga_title, vaga_fingerprint, status, sent_at, score, dados_vaga_json)
       VALUES (?, ?, ?, ?, ?, 'SENT', datetime('now', '-5 days'), 90, '{}')`,
      "job-antigo-react-001",
      EMAIL_RECRUTADOR,
      EMPRESA,
      "Desenvolvedor React Senior (PJ)",
      fpEnviado,
    );

    // Feed com a mesma oportunidade republicada com novo ID e título equivalente
    fs.writeFileSync(
      feedPath,
      JSON.stringify([
        {
          id: "job-novo-react-republicado-999",
          title: "Dev React Sr - Remoto 100%",
          company: EMPRESA,
          description: "Oportunidade para Dev React Senior",
          skills: ["React", "TypeScript"],
          requirements: ["React", "TypeScript"],
          contactEmail: EMAIL_RECRUTADOR,
        },
      ]),
    );

    const preview = await vagasEmailWorker.gerarPreview({
      feedUrl: feedPath,
      minScore: 0,
      windowHours: 0,
    });

    // A vaga republicada deve ser detectada como ALREADY_SENT_CANONICAL
    const vagaRepublicada = preview.puladas.find((p) => p.jobId === "job-novo-react-republicado-999");
    assert.ok(vagaRepublicada, "Vaga republicada deve estar nas puladas");
    assert.equal(vagaRepublicada.skipReason, "ALREADY_SENT_CANONICAL");
    assert.equal(preview.elegiveis.length, 0);
  });

  it("permite envio de vaga DIFERENTE para o mesmo recrutador quando windowHours = 0", async () => {
    const { vagasEmailWorker } = await import("./vagasEmailWorker.service.js");

    // Feed com vaga de Node.js para o mesmo recrutador
    fs.writeFileSync(
      feedPath,
      JSON.stringify([
        {
          id: "job-novo-node-002",
          title: "Desenvolvedor Backend Node.js Pleno",
          company: EMPRESA,
          description: "Vaga Node.js",
          skills: ["Node.js", "TypeScript", "PostgreSQL"],
          requirements: ["Node.js", "TypeScript"],
          contactEmail: EMAIL_RECRUTADOR,
        },
      ]),
    );

    const preview = await vagasEmailWorker.gerarPreview({
      feedUrl: feedPath,
      minScore: 0,
      windowHours: 0,
    });

    const vagaNode = preview.elegiveis.find((e) => e.jobId === "job-novo-node-002");
    assert.ok(vagaNode, "Vaga diferente para o mesmo recrutador deve ser elegível");
    assert.equal(vagaNode.eligible, true);
  });

  it("deduplica dentro do mesmo lote se houver duas vagas canônicas iguais com IDs diferentes", async () => {
    const { vagasEmailWorker } = await import("./vagasEmailWorker.service.js");

    fs.writeFileSync(
      feedPath,
      JSON.stringify([
        {
          id: "job-lote-python-1",
          title: "Engenheiro Python Pleno (PJ)",
          company: "DataCorp",
          description: "Python dev",
          skills: ["Python", "Django"],
          requirements: ["Python"],
          contactEmail: "rh@datacorp.com",
        },
        {
          id: "job-lote-python-2",
          title: "Desenvolvedor Python Pleno - Home Office",
          company: "DataCorp",
          description: "Python dev com mais detalhes",
          skills: ["Python", "Django", "FastAPI", "Docker"],
          requirements: ["Python", "Docker"],
          contactEmail: "rh@datacorp.com",
        },
      ]),
    );

    const preview = await vagasEmailWorker.gerarPreview({
      feedUrl: feedPath,
      minScore: 0,
      windowHours: 0,
    });

    // Uma deve ser elegível e a duplicata canônica deve ser pulada com DUPLICATE_CANONICAL_VAGA
    assert.equal(preview.elegiveis.length, 1);
    const pulada = preview.puladas.find(
      (p) => p.jobId === "job-lote-python-1" || p.jobId === "job-lote-python-2",
    );
    assert.ok(pulada, "Uma das vagas deve ser pulada");
    assert.equal(pulada.skipReason, "DUPLICATE_CANONICAL_VAGA");
  });
});
