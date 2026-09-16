import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import os from "os";
import { initDb, getDb } from "../src/core/database.js";
import { vagasEmailWorker } from "../src/apps/curriculos/automacao/vagasEmailWorker.service.js";
import type { VagaNormalizada } from "../src/apps/curriculos/automacao/types.js";
import {
  adquirirLockScraper,
  isProcessoAtivo,
} from "../src/apps/curriculos/scraper/scraper-lock.js";

function criarVagaMock(jobId: string, email: string): VagaNormalizada {
  return {
    jobId,
    title: `Engenheiro de Software ${jobId}`,
    company: "Empresa Concorrencia SA",
    contactEmail: email,
    location: "Remoto",
    salary: "R$ 15.000",
    sourceUrl: `https://linkedin.com/jobs/view/${jobId}`,
    description: "Vaga para testar concorrência e integridade de transações",
    requirements: ["TypeScript", "Node.js", "SQLite"],
    skills: ["TypeScript", "Node.js"],
    postedAt: new Date().toISOString(),
    score: 95,
    matchedSkills: ["TypeScript", "Node.js"],
    missingSkills: [],
    eligible: true,
    status: "PENDING",
    dadosVagaFormatados: {
      titulo: `Engenheiro de Software ${jobId}`,
      empresa: "Empresa Concorrencia SA",
      descricao: "Vaga para testar concorrência",
      stackTecnologica: ["TypeScript", "Node.js"],
      requisitosObrigatorios: [],
      diferenciaisDesejaveis: [],
      emailContato: email,
      localizacao: "Remoto",
      salario: "R$ 15.000",
      sourceUrl: `https://linkedin.com/jobs/view/${jobId}`,
      semIa: true,
    },
  };
}

async function runTests() {
  console.log("=========================================================");
  console.log("  🧪 TESTE DE CONCORRÊNCIA, LOCKS E INTEGRIDADE (FASE 3)");
  console.log("=========================================================\n");

  await initDb();
  const db = await getDb();

  // ─────────────────────────────────────────────────────────────────────────
  // BLOCO 1: Lock de Execução do Scraper
  // ─────────────────────────────────────────────────────────────────────────
  console.log("1. Testando Lock de Execução do Scraper (scraper-lock)...");

  const tempLockPath = path.join(os.tmpdir(), `test-scraper-${Date.now()}.lock`);

  try {
    // 1.1 Adquirir lock pela primeira vez
    const lock1 = adquirirLockScraper(tempLockPath);
    assert.equal(lock1.adquirido, true, "Primeira tentativa deve adquirir o lock");
    assert.equal(fs.existsSync(tempLockPath), true, "Arquivo de lock deve ter sido criado");
    console.log("   ✅ Aquisição primária do lock: OK");

    // 1.2 Segunda tentativa concorrente (mesmo processo ativo / PID vivo)
    const lock2 = adquirirLockScraper(tempLockPath);
    assert.equal(lock2.adquirido, false, "Segunda tentativa simultânea deve falhar");
    assert.equal(lock2.motivo, "LOCK_ATIVO", "Motivo deve ser LOCK_ATIVO");
    assert.equal(lock2.pidExistente, process.pid, "Deve identificar PID ativo");
    console.log("   ✅ Bloqueio de execução concorrente com PID ativo: OK");

    // 1.3 Liberação do lock
    lock1.liberar();
    assert.equal(fs.existsSync(tempLockPath), false, "Lock liberado deve remover o arquivo");
    console.log("   ✅ Liberação limpa do lock: OK");

    // 1.4 Tratar Lock Órfão (PID de processo inexistente)
    // Criamos lock artificial com PID inexistente (ex: 99999999)
    const fakePidInexistente = 99999999;
    assert.equal(isProcessoAtivo(fakePidInexistente), false, "PID falso deve estar inativo");

    fs.writeFileSync(
      tempLockPath,
      JSON.stringify({ pid: fakePidInexistente, createdAt: new Date().toISOString() }),
    );

    const lockOrfao = adquirirLockScraper(tempLockPath);
    assert.equal(lockOrfao.adquirido, true, "Lock órfão de processo morto deve ser superado e adquirido");
    assert.equal(fs.existsSync(tempLockPath), true, "Novo lock deve estar gravado");
    lockOrfao.liberar();
    console.log("   ✅ Recuperação de lock órfão (processo morto): OK");

    // 1.5 Tratar Lock corrompido (JSON inválido)
    fs.writeFileSync(tempLockPath, "{ corrupted data");
    const lockCorrompido = adquirirLockScraper(tempLockPath);
    assert.equal(lockCorrompido.adquirido, true, "Lock corrompido deve ser limpo e adquirido");
    lockCorrompido.liberar();
    console.log("   ✅ Recuperação de arquivo de lock corrompido: OK");
  } finally {
    try {
      if (fs.existsSync(tempLockPath)) fs.unlinkSync(tempLockPath);
    } catch {}
  }

  // ─────────────────────────────────────────────────────────────────────────
  // BLOCO 2: Race Condition e Reserva Atômica no Worker
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n2. Testando Reserva Atômica e Concorrência no Worker...");

  const timestamp = Date.now();
  const emailA = `teste_concorrencia_a_${timestamp}@empresa.com`;
  const emailB = `teste_concorrencia_b_${timestamp}@empresa.com`;
  const emailC = `teste_concorrencia_c_${timestamp}@empresa.com`;
  const emailD = `teste_concorrencia_d_${timestamp}@empresa.com`;

  const vagaNova = criarVagaMock(`job_novo_${timestamp}`, emailA);
  const vagaDuplicada = criarVagaMock(`job_dup_${timestamp}`, emailB);

  // 2.1 Reserva de vaga nova (não cadastrada no banco)
  const rNova = await vagasEmailWorker.reservarSlotEnvioAtomico(vagaNova, 999, 30, 150);
  assert.equal(rNova.reservado, true, "Vaga nova deve ser reservada com sucesso");

  const rowNova = await db.get<any>(
    "SELECT status, run_id FROM curriculo_automacao_candidaturas WHERE job_id = ?",
    vagaNova.jobId,
  );
  assert.equal(rowNova?.status, "PROCESSING", "Vaga reservada deve estar com status PROCESSING");
  assert.equal(rowNova?.run_id, 999, "run_id deve ser persistido");
  console.log("   ✅ Reserva de vaga nova em transação atômica: OK");

  // 2.2 Tentativa de reserva concorrente para mesma vaga em PROCESSING ativa
  const rConcorrente = await vagasEmailWorker.reservarSlotEnvioAtomico(vagaNova, 1000, 30, 150);
  assert.equal(rConcorrente.reservado, false, "Vaga já em PROCESSING não pode ser reservada por outro processo");
  assert.equal(rConcorrente.motivo, "CONCURRENCY_CONFLICT", "Motivo deve ser CONCURRENCY_CONFLICT");
  console.log("   ✅ Bloqueio de vaga em PROCESSING ativo (race condition evitada): OK");

  // 2.3 Tentativa de reserva para vaga já SENT
  await db.run(
    "UPDATE curriculo_automacao_candidaturas SET status = 'SENT', sent_at = CURRENT_TIMESTAMP WHERE job_id = ?",
    vagaNova.jobId,
  );
  const rSent = await vagasEmailWorker.reservarSlotEnvioAtomico(vagaNova, 1001, 30, 150);
  assert.equal(rSent.reservado, false, "Vaga com status SENT não pode ser re-reservada");
  assert.equal(rSent.motivo, "CONCURRENCY_CONFLICT", "Motivo deve ser CONCURRENCY_CONFLICT");
  console.log("   ✅ Bloqueio de vaga já enviada (SENT): OK");

  // 2.4 Tentativa de reserva para outro job_id com MESMO email já enviado nas últimas 72h
  const vagaMesmoEmail = criarVagaMock(`job_outro_mesmo_email_${timestamp}`, emailA);
  const rMesmoEmail = await vagasEmailWorker.reservarSlotEnvioAtomico(vagaMesmoEmail, 1002, 30, 150);
  assert.equal(rMesmoEmail.reservado, false, "Email já contatado no período de tolerância deve ser bloqueado");
  assert.equal(rMesmoEmail.motivo, "CONCURRENCY_CONFLICT", "Motivo deve ser CONCURRENCY_CONFLICT");
  console.log("   ✅ Bloqueio de email duplicado na janela de tolerância: OK");

  // 2.5 Vaga existente com status FAILED sem envio prévio (deve ser elegível para retentativa)
  const vagaFailed = criarVagaMock(`job_failed_${timestamp}`, emailC);
  await db.run(
    `INSERT INTO curriculo_automacao_candidaturas
     (job_id, contact_email, company, vaga_title, vaga_url, status, error_message, dados_vaga_json)
     VALUES (?, ?, ?, ?, ?, 'FAILED', 'Erro simulado anterior', ?)`,
    vagaFailed.jobId,
    vagaFailed.contactEmail,
    vagaFailed.company,
    vagaFailed.title,
    vagaFailed.sourceUrl,
    JSON.stringify(vagaFailed.dadosVagaFormatados),
  );

  const rFailed = await vagasEmailWorker.reservarSlotEnvioAtomico(vagaFailed, 1003, 30, 150);
  assert.equal(rFailed.reservado, true, "Vaga FAILED sem envio prévio deve ser re-tentada");
  const rowFailed = await db.get<any>(
    "SELECT status, run_id, error_message FROM curriculo_automacao_candidaturas WHERE job_id = ?",
    vagaFailed.jobId,
  );
  assert.equal(rowFailed?.status, "PROCESSING", "Vaga FAILED deve transicionar para PROCESSING");
  assert.equal(rowFailed?.error_message, null, "error_message anterior deve ser limpa");
  console.log("   ✅ Retentativa segura de vaga FAILED: OK");

  // ─────────────────────────────────────────────────────────────────────────
  // BLOCO 3: Recuperação de Crash e Reconciliação
  // ─────────────────────────────────────────────────────────────────────────
  console.log("\n3. Testando Recuperação de Crash (PROCESSING órfão)...");

  // 3.1 Job em PROCESSING órfão há >15 minutos sem envio_id (processo anterior morreu)
  const vagaOrfaSemEnvio = criarVagaMock(`job_orfa_sem_envio_${timestamp}`, emailD);
  await db.run(
    `INSERT INTO curriculo_automacao_candidaturas
     (job_id, contact_email, company, vaga_title, vaga_url, status, dados_vaga_json, updated_at)
     VALUES (?, ?, ?, ?, ?, 'PROCESSING', ?, datetime('now', '-15 minutes'))`,
    vagaOrfaSemEnvio.jobId,
    vagaOrfaSemEnvio.contactEmail,
    vagaOrfaSemEnvio.company,
    vagaOrfaSemEnvio.title,
    vagaOrfaSemEnvio.sourceUrl,
    JSON.stringify(vagaOrfaSemEnvio.dadosVagaFormatados),
  );

  // Reserva atômica deve conseguir recuperar e assumir o slot
  const rRecuperarOrfa = await vagasEmailWorker.reservarSlotEnvioAtomico(vagaOrfaSemEnvio, 1004, 30, 150);
  assert.equal(rRecuperarOrfa.reservado, true, "Slot órfão >10min deve ser recuperável atomicamente");
  console.log("   ✅ Assunção atômica de vaga PROCESSING órfã (>10 min): OK");

  // 3.2 Reconciliação defensiva via reconciliarProcessosOrfaos
  const vagaParaReconciliar = criarVagaMock(`job_reconciliar_${timestamp}`, `rec_${timestamp}@empresa.com`);
  await db.run(
    `INSERT INTO curriculo_automacao_candidaturas
     (job_id, contact_email, company, vaga_title, vaga_url, status, dados_vaga_json, updated_at)
     VALUES (?, ?, ?, ?, ?, 'PROCESSING', ?, datetime('now', '-20 minutes'))`,
    vagaParaReconciliar.jobId,
    vagaParaReconciliar.contactEmail,
    vagaParaReconciliar.company,
    vagaParaReconciliar.title,
    vagaParaReconciliar.sourceUrl,
    JSON.stringify(vagaParaReconciliar.dadosVagaFormatados),
  );

  const resReconciliacao = await vagasEmailWorker.reconciliarProcessosOrfaos();
  assert.equal(resReconciliacao.reconciliados >= 1, true, "Pelo menos um registro órfão deve ter sido reconciliado");

  const rowReconciliada = await db.get<any>(
    "SELECT status, error_message FROM curriculo_automacao_candidaturas WHERE job_id = ?",
    vagaParaReconciliar.jobId,
  );
  assert.equal(rowReconciliada?.status, "FAILED", "Registro órfão sem envio_id deve ter transicionado para FAILED");
  assert.equal(typeof rowReconciliada?.error_message, "string", "Deve registrar motivo do crash no error_message");
  console.log("   ✅ Reconciliação defensiva pós-crash (reconciliarProcessosOrfaos): OK");

  // Limpeza dos dados criados no teste
  await db.run("DELETE FROM curriculo_automacao_candidaturas WHERE job_id LIKE ?", [`%_${timestamp}`]);

  console.log("\n=========================================================");
  console.log("  🎉 TODOS OS TESTES DE CONCORRÊNCIA E LOCKS PASSARAM!");
  console.log("=========================================================");
  process.exit(0);
}

runTests().catch((err) => {
  console.error("❌ Erro no teste de concorrência:", err);
  process.exit(1);
});
