import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Missão 7 (fechamento do gap de integração) — garante que uma candidatura
 * `PENDING` no "banco de oportunidades" (promovida por
 * `reavaliarVagasHistoricoSalvo`, mas ausente do feed vivo do dia) é
 * mesclada por `gerarPreview` e se torna elegível para a reserva atômica de
 * slot — o mesmo passo que antecede o envio real no ciclo normal.
 *
 * Isolamento total do banco real: `DATABASE_PATH` é redirecionado para um
 * arquivo SQLite temporário ANTES de qualquer import de `core/database.js`
 * (mesmo padrão usado em `financas/tests/household-experience.test.ts`), e
 * só as migrations do app `curriculos` são executadas nele. Nenhum e-mail é
 * enviado nem PDF é gerado neste teste — `reservarSlotEnvioAtomico` apenas
 * transiciona o status da candidatura no banco (é o mesmo passo usado pelo
 * ciclo real antes de gerar currículo/enviar, mas parado exatamente aí).
 */

let dbPath: string;
let feedPath: string;

const JOB_ID_PENDENTE = "job-pendente-historico-missao7";
const JOB_ID_FEED_VIVO = "job-feed-vivo-missao7";
const EMAIL_PENDENTE = "contato-pendente@empresa-historico.com";
const EMAIL_FEED_VIVO = "contato-vivo@empresa-feed.com";

before(async () => {
  dbPath = path.join(
    os.tmpdir(),
    `gerar-preview-pendente-historico-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  );
  feedPath = path.join(
    os.tmpdir(),
    `feed-vivo-missao7-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
  );

  // Feed vivo do dia contém APENAS uma vaga diferente — a vaga promovida do
  // histórico não está e nunca esteve nele durante este teste.
  fs.writeFileSync(
    feedPath,
    JSON.stringify([
      {
        id: JOB_ID_FEED_VIVO,
        title: "Vaga do feed vivo",
        company: "Empresa Feed Vivo",
        description: "Vaga normal vinda do feed do dia",
        skills: [],
        requirements: [],
        contactEmail: EMAIL_FEED_VIVO,
      },
    ]),
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

describe("gerarPreview + reservarSlotEnvioAtomico — vaga PENDING do banco de oportunidades (Missão 7)", () => {
  it("mescla uma candidatura PENDING (ausente do feed vivo) e a reserva atomicamente para envio", async () => {
    const { getDb } = await import("../../../core/database.js");
    const { runMigrations } = await import("../../../core/migrations/runner.js");
    const { curriculoMigrations } = await import("../migrations/index.js");
    const { notificationMigrations } = await import("../../../shared/notifications/migrations.js");
    const db = await getDb();
    await runMigrations(db, [...notificationMigrations, ...curriculoMigrations]);

    const { vagasEmailWorker } = await import("./vagasEmailWorker.service.js");

    // Snapshot exatamente no shape produzido por `normalizarDadosVaga`
    // (dados_vaga_json já guardado quando a candidatura foi originalmente
    // marcada SKIPPED/LOW_SCORE, e depois promovida por
    // `reavaliarVagasHistoricoSalvo` para status PENDING).
    const dadosVagaSnapshot = {
      titulo: "Vaga promovida do histórico",
      empresa: "Empresa Histórico",
      descricao: "Vaga que saiu do feed vivo mas foi promovida após reavaliação",
      stackTecnologica: [],
      requisitosObrigatorios: [],
      diferenciaisDesejaveis: [],
      emailContato: EMAIL_PENDENTE,
      localizacao: "Remoto",
      salario: "",
      sourceUrl: "https://exemplo.com/vaga-historico",
      semIa: false,
    };

    await db.run(
      `INSERT INTO curriculo_automacao_candidaturas
         (job_id, contact_email, company, vaga_title, score, dados_vaga_json, status, skip_reason)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', NULL)`,
      JOB_ID_PENDENTE,
      EMAIL_PENDENTE,
      dadosVagaSnapshot.empresa,
      dadosVagaSnapshot.titulo,
      85,
      JSON.stringify(dadosVagaSnapshot),
    );

    // minScore: 0 para isolar o teste do motor de scoring real (perfil vazio
    // no banco de teste) — o que importa aqui é a INTEGRAÇÃO (a vaga PENDING
    // aparece nos elegíveis), não o valor do score em si.
    const preview = await vagasEmailWorker.gerarPreview({ minScore: 0, feedUrl: feedPath });

    assert.ok(
      preview.elegiveis.some((v) => v.jobId === JOB_ID_FEED_VIVO),
      "vaga do feed vivo deve continuar aparecendo normalmente",
    );

    const vagaPromovida = preview.elegiveis.find((v) => v.jobId === JOB_ID_PENDENTE);
    assert.ok(
      vagaPromovida,
      "vaga PENDING do banco de oportunidades (ausente do feed vivo) deveria aparecer como elegível",
    );
    assert.equal(vagaPromovida!.contactEmail, EMAIL_PENDENTE);
    assert.equal(vagaPromovida!.eligible, true);
    assert.equal(vagaPromovida!.status, "PENDING");

    // Passo seguinte real do ciclo (reserva atômica de slot) — sem gerar PDF
    // nem enviar e-mail. Confirma que o item mesclado é indistinguível, para
    // o resto do pipeline, de uma vaga normal do feed.
    const reserva = await vagasEmailWorker.reservarSlotEnvioAtomico(vagaPromovida!, null, 1000, 1000);
    assert.equal(reserva.reservado, true, `reserva deveria ter sucesso, motivo: ${reserva.motivo}`);

    const rowAposReserva = await db.get<any>(
      "SELECT status, envio_id FROM curriculo_automacao_candidaturas WHERE job_id = ?",
      JOB_ID_PENDENTE,
    );
    assert.equal(rowAposReserva.status, "PROCESSING");
    assert.equal(rowAposReserva.envio_id, null);
  });

  it("não duplica a vaga quando o mesmo job_id existe tanto no feed vivo quanto como PENDING no banco (feed vivo prevalece)", async () => {
    const { getDb } = await import("../../../core/database.js");
    const { vagasEmailWorker } = await import("./vagasEmailWorker.service.js");

    const db = await getDb();

    const jobIdDuplicado = "job-duplicado-feed-e-banco";
    const emailDuplicado = "contato-duplicado@empresa.com";

    await db.run(
      `INSERT INTO curriculo_automacao_candidaturas
         (job_id, contact_email, company, vaga_title, score, dados_vaga_json, status, skip_reason)
       VALUES (?, ?, ?, ?, ?, ?, 'PENDING', NULL)`,
      jobIdDuplicado,
      emailDuplicado,
      "Empresa Antiga (snapshot do banco)",
      "Vaga Antiga (snapshot do banco)",
      50,
      JSON.stringify({
        titulo: "Vaga Antiga (snapshot do banco)",
        empresa: "Empresa Antiga (snapshot do banco)",
        descricao: "",
        stackTecnologica: [],
        requisitosObrigatorios: [],
        diferenciaisDesejaveis: [],
        emailContato: emailDuplicado,
        localizacao: "",
        salario: "",
        sourceUrl: "",
        semIa: false,
      }),
    );

    const feedComDuplicado = path.join(
      os.tmpdir(),
      `feed-duplicado-missao7-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    fs.writeFileSync(
      feedComDuplicado,
      JSON.stringify([
        {
          id: jobIdDuplicado,
          title: "Vaga Atual (feed vivo)",
          company: "Empresa Atual (feed vivo)",
          description: "",
          skills: [],
          requirements: [],
          contactEmail: emailDuplicado,
        },
      ]),
    );

    try {
      const preview = await vagasEmailWorker.gerarPreview({ minScore: 0, feedUrl: feedComDuplicado });

      const ocorrencias = preview.elegiveis.filter((v) => v.jobId === jobIdDuplicado);
      assert.equal(ocorrencias.length, 1, "job_id duplicado não deve aparecer mais de uma vez");
      assert.equal(
        ocorrencias[0].company,
        "Empresa Atual (feed vivo)",
        "em caso de conflito, os dados do feed vivo devem prevalecer sobre o snapshot salvo",
      );
    } finally {
      fs.unlinkSync(feedComDuplicado);
    }
  });
});
