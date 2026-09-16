import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import nodemailer from "nodemailer";

// ── Isolamento de Banco de Dados ──────────────────────────────────────────────
process.env.DATABASE_PATH = "./data/test-suite.db";
process.env.NODE_ENV = "test";

const testDbPath = path.resolve(process.cwd(), "./data/test-suite.db");
const tempFilesToClean: string[] = [];

function registrarArquivoParaLimpeza(caminho: string): void {
  tempFilesToClean.push(caminho);
}

function limparArquivosTemporarios(): void {
  for (const f of tempFilesToClean) {
    try {
      if (fs.existsSync(f)) {
        const stat = fs.statSync(f);
        if (stat.isDirectory()) {
          fs.rmSync(f, { recursive: true, force: true });
        } else {
          fs.unlinkSync(f);
        }
      }
    } catch {}
  }

  // Limpar arquivos temporários do SQLite
  try {
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
    if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
  } catch {}
}

// Limpeza preventiva antes de iniciar
limparArquivosTemporarios();

// Importação dinâmica após fixação do DATABASE_PATH
const { initDb, getDb } = await import("../src/core/database.js");
const {
  vagasEmailWorker,
  isGmailRateLimitOuErroTemporario,
} = await import("../src/apps/curriculos/automacao/vagasEmailWorker.service.js");
const {
  executarScraperVagas,
  mesclarEDeduplicarVagas,
  carregarVagasExistentes,
} = await import("../src/apps/curriculos/scraper/scraper.service.js");
const {
  adquirirLockScraper,
  isProcessoAtivo,
} = await import("../src/apps/curriculos/scraper/scraper-lock.js");
const {
  verificarSessaoSalva,
} = await import("../src/apps/curriculos/scraper/linkedin/linkedin-session.service.js");
const { pathConfig } = await import("../src/apps/curriculos/config/index.js");
import type { VagaNormalizada, VagaEmailRaw } from "../src/apps/curriculos/automacao/types.js";

function resetarEstadoWorker(worker: any): void {
  worker.state = "IDLE";
  worker.pauseReason = null;
  worker.proximaJanelaTimestamp = null;
  worker.backoffAttempt = 0;
  worker.mensagem = "";
  worker.proximoEnvioTimestamp = null;
  worker.delayAtualSegundos = null;
  worker.currentRunId = null;
  worker.currentRunUuid = null;
  worker.processadas = 0;
  worker.enviadas = 0;
  worker.puladas = 0;
  worker.falhas = 0;
  worker.aguardarDelay = async () => true;
}

function criarVagaMock(jobId: string, email: string, score: number = 95): VagaNormalizada {
  return {
    jobId,
    title: `Engenheiro de Software ${jobId}`,
    company: "Empresa Teste SA",
    contactEmail: email,
    location: "Remoto",
    salary: "R$ 15.000",
    sourceUrl: `https://linkedin.com/jobs/view/${jobId}`,
    description: "Vaga para validação da suíte completa de testes automatizados",
    requirements: ["TypeScript", "Node.js", "SQLite"],
    skills: ["TypeScript", "Node.js"],
    postedAt: new Date().toISOString(),
    score,
    matchedSkills: ["TypeScript", "Node.js"],
    missingSkills: [],
    eligible: true,
    status: "PENDING",
    dadosVagaFormatados: {
      titulo: `Engenheiro de Software ${jobId}`,
      empresa: "Empresa Teste SA",
      descricao: "Vaga para validação da suíte",
      stackTecnologica: ["TypeScript", "Node.js"],
      requisitosObrigatorios: ["TypeScript"],
      diferenciaisDesejaveis: [],
      emailContato: email,
      localizacao: "Remoto",
      salario: "R$ 15.000",
      sourceUrl: `https://linkedin.com/jobs/view/${jobId}`,
      semIa: true,
    },
  };
}

async function runTestSuite() {
  console.log("===================================================================");
  console.log("  🧪 SUÍTE DE TESTES OBRIGATÓRIOS — CANDIDATURAS AUTOMATIZADAS");
  console.log("===================================================================\n");

  await initDb();
  const db = await getDb();

  const originalCreateTransport = nodemailer.createTransport;
  let emailsEnviadosMock: any[] = [];
  let pdfsAnexadosVerificados: string[] = [];

  try {
    // ─────────────────────────────────────────────────────────────────────────
    // TESTE 1: Nova Vaga (Fluxo Completo)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("▶ TESTE 1 — Nova vaga (Feed → Validação → Worker → Currículo → PDF → Envio → SENT)");

    const testFeedPath1 = path.resolve(process.cwd(), "./data/test-feed-c1.json");
    registrarArquivoParaLimpeza(testFeedPath1);

    const timestamp1 = Date.now();
    const jobId1 = `job_c1_novo_${timestamp1}`;
    const emailDestino1 = `recrutamento_c1_${timestamp1}@empresa.com`;

    const feedData1: VagaEmailRaw[] = [
      {
        id: jobId1,
        title: "Engenheiro de Software Pleno/Sênior TypeScript",
        company: "Empresa Cenario 1 LTDA",
        description: "Buscamos Engenheiro de Software pleno com domínio em TypeScript, Node.js e banco de dados SQLite. Trabalho 100% remoto.",
        requirements: ["TypeScript", "Node.js", "SQLite"],
        skills: ["TypeScript", "Node.js", "SQLite"],
        benefits: ["Vale refeição", "Plano de saúde"],
        contactEmail: emailDestino1,
        location: "Remoto",
        salary: "R$ 16.000",
        sourceUrl: `https://linkedin.com/jobs/view/${jobId1}`,
        postedAt: new Date().toISOString(),
      },
    ];

    fs.writeFileSync(testFeedPath1, JSON.stringify(feedData1, null, 2), "utf-8");

    // Mock nodemailer para envio bem-sucedido
    emailsEnviadosMock = [];
    pdfsAnexadosVerificados = [];

    nodemailer.createTransport = () => ({
      sendMail: async (mailOptions: any) => {
        emailsEnviadosMock.push(mailOptions);
        if (mailOptions.attachments && mailOptions.attachments[0]) {
          const pdfPath = mailOptions.attachments[0].path;
          assert.equal(fs.existsSync(pdfPath), true, "PDF temporário deve existir no disco no momento do envio");
          pdfsAnexadosVerificados.push(pdfPath);
        }
        return { messageId: `<mock-c1-${Date.now()}@test.com>` };
      },
      close: () => {},
      verify: async () => true,
    } as any);

    resetarEstadoWorker(vagasEmailWorker);

    // Inicia worker com o feed de teste
    await vagasEmailWorker.iniciar({
      feedUrl: testFeedPath1,
      minScore: 70,
      minDelaySeconds: 1,
      maxDelaySeconds: 2,
      semIa: true,
    });

    // Aguarda conclusão do ciclo
    while (true) {
      await new Promise((r) => setTimeout(r, 50));
      const s = vagasEmailWorker.getStatus();
      if (s.state === "COMPLETED" || s.state === "STOPPED" || s.state === "FAILED") break;
    }

    // Asserções Teste 1
    assert.equal(emailsEnviadosMock.length, 1, "Exatamente um e-mail deve ter sido disparado");
    assert.equal(emailsEnviadosMock[0].to, emailDestino1, "E-mail de destino deve corresponder à vaga");
    assert.ok(emailsEnviadosMock[0].subject.includes("Candidatura"), "Assunto deve indicar candidatura");
    assert.equal(pdfsAnexadosVerificados.length, 1, "PDF temporário deve ter sido gerado e anexado");

    // Limpeza de PDF temporário
    assert.equal(fs.existsSync(pdfsAnexadosVerificados[0]), false, "PDF temporário deve ser removido após envio");

    // Validação no banco de dados SQLite
    const candRow1 = await db.get<any>(
      "SELECT status, envio_id, sent_at FROM curriculo_automacao_candidaturas WHERE job_id = ?",
      jobId1,
    );
    assert.ok(candRow1, "Registro da candidatura deve existir no banco");
    assert.equal(candRow1.status, "SENT", "Status da candidatura deve ser SENT");
    assert.ok(candRow1.sent_at, "sent_at deve estar preenchido");
    assert.ok(candRow1.envio_id, "envio_id deve estar associado");

    const envioRow1 = await db.get<any>(
      "SELECT id, status, message_id FROM curriculo_envios WHERE id = ?",
      candRow1.envio_id,
    );
    assert.ok(envioRow1, "Registro de curriculo_envios deve existir");
    assert.equal(envioRow1.status, "SENT", "Status em curriculo_envios deve ser SENT");
    assert.ok(envioRow1.message_id, "message_id deve estar registrado");

    console.log("   ✅ Vaga ingerida, validada, currículo calibrado, PDF gerado e status SENT confirmado no banco.\n");

    // ─────────────────────────────────────────────────────────────────────────
    // TESTE 2: Vaga Duplicada (Mesmo job_id em lote subsequente)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("▶ TESTE 2 — Vaga duplicada (Mesmo job_id reaparece no feed → ALREADY_SENT, sem disparo)");

    // O mesmo feedData1 contém o jobId1 já enviado
    emailsEnviadosMock = [];
    resetarEstadoWorker(vagasEmailWorker);

    // 2.1 Validação no Preview
    const previewDup = await vagasEmailWorker.gerarPreview({ feedUrl: testFeedPath1 });
    const vagaPulada = previewDup.puladas.find((p) => p.jobId === jobId1);
    assert.ok(vagaPulada, "Vaga já enviada deve constar na lista de puladas do preview");
    assert.equal(vagaPulada.skipReason, "ALREADY_SENT", "skipReason deve ser ALREADY_SENT");
    assert.equal(previewDup.elegiveis.filter((e) => e.jobId === jobId1).length, 0, "Vaga já enviada não deve ser elegível");

    // 2.2 Execução do worker no feed duplicado
    await vagasEmailWorker.iniciar({ feedUrl: testFeedPath1 });
    while (true) {
      await new Promise((r) => setTimeout(r, 50));
      const s = vagasEmailWorker.getStatus();
      if (s.state === "COMPLETED" || s.state === "STOPPED" || s.state === "FAILED") break;
    }

    assert.equal(emailsEnviadosMock.length, 0, "Nenhum novo e-mail deve ser disparado para vaga já enviada");

    // 2.3 Tentativa direta de reserva de slot atômica
    const vagaNormalizadaDup = criarVagaMock(jobId1, emailDestino1);
    const rReservaDup = await vagasEmailWorker.reservarSlotEnvioAtomico(vagaNormalizadaDup, 999, 30, 150);
    assert.equal(rReservaDup.reservado, false, "Slot para vaga já SENT não pode ser reservado");
    assert.equal(rReservaDup.motivo, "CONCURRENCY_CONFLICT", "Motivo deve ser CONCURRENCY_CONFLICT");

    console.log("   ✅ Vaga duplicada descartada como ALREADY_SENT e nenhum disparo realizado.\n");

    // ─────────────────────────────────────────────────────────────────────────
    // TESTE 3: Execução Concorrente (Race Condition em reserva de slot)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("▶ TESTE 3 — Execução concorrente (Duas instâncias tentam reservar o mesmo slot → changes===1 e CONCURRENCY_CONFLICT)");

    const jobId3 = `job_c3_conc_${Date.now()}`;
    const vagaConcorrente = criarVagaMock(jobId3, `conc_${Date.now()}@empresa.com`);

    // 3.1 Instância 1 executa reserva atômica do slot
    const resA = await vagasEmailWorker.reservarSlotEnvioAtomico(vagaConcorrente, 301, 30, 150);
    assert.equal(resA.reservado, true, "Primeira instância deve reservar o slot com sucesso (changes === 1)");

    const rowConc1 = await db.get<any>(
      "SELECT status, run_id FROM curriculo_automacao_candidaturas WHERE job_id = ?",
      jobId3,
    );
    assert.equal(rowConc1.status, "PROCESSING", "Vaga deve transicionar para PROCESSING");
    assert.equal(rowConc1.run_id, 301, "run_id deve ser da primeira instância");

    // 3.2 Instância 2 tenta reservar a mesma vaga enquanto está em PROCESSING ativo
    const resB = await vagasEmailWorker.reservarSlotEnvioAtomico(vagaConcorrente, 302, 30, 150);
    assert.equal(resB.reservado, false, "Segunda instância não pode reservar vaga já em PROCESSING");
    assert.equal(resB.motivo, "CONCURRENCY_CONFLICT", "Segunda instância deve receber CONCURRENCY_CONFLICT (changes === 0)");

    // 3.3 Garante que o slot permaneceu intacto com a primeira instância
    const rowConc2 = await db.get<any>(
      "SELECT status, run_id FROM curriculo_automacao_candidaturas WHERE job_id = ?",
      jobId3,
    );
    assert.equal(rowConc2.status, "PROCESSING");
    assert.equal(rowConc2.run_id, 301, "run_id não pode ser sobrescrito pelo segundo processo");

    // 3.4 Teste concorrente de Scraper Lock (arquivo de lock em disco)
    const tempLockPath = path.join(os.tmpdir(), `test-lock-${Date.now()}.lock`);
    registrarArquivoParaLimpeza(tempLockPath);

    const lockPrimario = adquirirLockScraper(tempLockPath);
    assert.equal(lockPrimario.adquirido, true, "Lock primário deve ser adquirido");

    const lockSecundario = adquirirLockScraper(tempLockPath);
    assert.equal(lockSecundario.adquirido, false, "Segundo processo deve ser bloqueado");
    assert.equal(lockSecundario.motivo, "LOCK_ATIVO", "Motivo deve ser LOCK_ATIVO");

    lockPrimario.liberar();
    assert.equal(fs.existsSync(tempLockPath), false, "Lock liberado deve remover arquivo");

    console.log("   ✅ Concorrência bloqueada com sucesso: 1 slot concedido (changes===1), segundo rejeitado com CONCURRENCY_CONFLICT.\n");

    // ─────────────────────────────────────────────────────────────────────────
    // TESTE 4: Scraper Sem Vagas (Preservação de Histórico)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("▶ TESTE 4 — Scraper sem vagas (Zero vagas qualificadas → Base prévia permanece intacta)");

    const testVagasHistPath = path.resolve(process.cwd(), "./data/test-vagas-hist.json");
    registrarArquivoParaLimpeza(testVagasHistPath);

    const vagasHistoricas: VagaEmailRaw[] = [
      {
        id: "hist_vaga_1",
        title: "Engenheiro Backend Go",
        company: "Tech Go LTDA",
        contactEmail: "recrutamento@techgo.com",
        sourceUrl: "https://linkedin.com/jobs/view/hist_vaga_1",
        description: "Desenvolvedor Backend com Go e PostgreSQL",
        skills: ["Go", "PostgreSQL"],
      },
      {
        id: "hist_vaga_2",
        title: "Engenheiro Frontend React",
        company: "Web React SA",
        contactEmail: "vagas@webreact.com",
        sourceUrl: "https://linkedin.com/jobs/view/hist_vaga_2",
        description: "Desenvolvedor Frontend React e TypeScript",
        skills: ["React", "TypeScript"],
      },
    ];

    fs.writeFileSync(testVagasHistPath, JSON.stringify(vagasHistoricas, null, 2), "utf-8");

    // Executa scraper com zero posts
    const relatorioScraperSemVagas = await executarScraperVagas({
      postsMockados: [],
      arquivoSaida: "./data/test-vagas-hist.json",
      caminhoHistorico: "./data/test-scraper-telemetria.json",
    });
    registrarArquivoParaLimpeza(path.resolve(process.cwd(), "./data/test-scraper-telemetria.json"));

    assert.equal(relatorioScraperSemVagas.vagasFinais, 0, "Scraper deve reportar 0 vagas novas nesta execução");

    // Valida que o arquivo em disco foi preservado
    const vagasAposScraperVazio = carregarVagasExistentes(testVagasHistPath);
    assert.equal(vagasAposScraperVazio.length, 2, "Arquivo histórico deve manter exatamente as 2 vagas prévias");
    assert.equal(vagasAposScraperVazio[0].id, "hist_vaga_1", "Primeira vaga deve permanecer intacta");
    assert.equal(vagasAposScraperVazio[1].id, "hist_vaga_2", "Segunda vaga deve permanecer intacta");

    // Validação direta da função de merge
    const resultadoMerge = mesclarEDeduplicarVagas([], vagasHistoricas);
    assert.equal(resultadoMerge.length, 2, "Merge com array vazio de novas vagas deve retornar todas as existentes");

    console.log("   ✅ Scraper com 0 vagas preservou integralmente o histórico prévio em disco.\n");

    // ─────────────────────────────────────────────────────────────────────────
    // TESTE 5: Falha SMTP Transitória & Backoff Exponencial
    // ─────────────────────────────────────────────────────────────────────────
    console.log("▶ TESTE 5 — Falha SMTP (Erro 421/450/Rate limit → Backoff progressivo sem erro permanente)");

    // 5.1 Validação do classificador de erros SMTP
    assert.equal(isGmailRateLimitOuErroTemporario({ responseCode: 421 }), true, "421 deve ser erro temporário");
    assert.equal(isGmailRateLimitOuErroTemporario({ responseCode: 450 }), true, "450 deve ser erro temporário");
    assert.equal(isGmailRateLimitOuErroTemporario({ responseCode: 451 }), true, "451 deve ser erro temporário");
    assert.equal(isGmailRateLimitOuErroTemporario({ responseCode: 452 }), true, "452 deve ser erro temporário");
    assert.equal(isGmailRateLimitOuErroTemporario({ code: "ETIMEDOUT" }), true, "ETIMEDOUT deve ser erro temporário");
    assert.equal(isGmailRateLimitOuErroTemporario({ code: "ECONNRESET" }), true, "ECONNRESET deve ser erro temporário");
    assert.equal(
      isGmailRateLimitOuErroTemporario(new Error("4.7.0 User rate limit exceeded")),
      true,
      "Texto rate limit deve ser erro temporário",
    );
    assert.equal(
      isGmailRateLimitOuErroTemporario(new Error("5.4.5 Daily user sending quota exceeded")),
      true,
      "Texto quota exceeded deve ser erro temporário",
    );
    assert.equal(
      isGmailRateLimitOuErroTemporario({ responseCode: 550, message: "5.1.1 User unknown" }),
      false,
      "550 sem quota NÃO deve ser temporário (erro permanente)",
    );
    assert.equal(
      isGmailRateLimitOuErroTemporario({ responseCode: 535, message: "Authentication failed" }),
      false,
      "535 autenticação inválida NÃO deve ser temporário",
    );

    // 5.2 Simulação de erro SMTP 421 no Worker acionando política de backoff
    const testFeedPath5 = path.resolve(process.cwd(), "./data/test-feed-c5.json");
    registrarArquivoParaLimpeza(testFeedPath5);

    const jobId5 = `job_c5_smtp_rate_${Date.now()}`;
    const feedData5: VagaEmailRaw[] = [
      {
        id: jobId5,
        title: "Engenheiro Backend Node.js",
        company: "Empresa SMTP Fail LTDA",
        contactEmail: `smtp_fail_${Date.now()}@empresa.com`,
        description: "Engenheiro Backend com TypeScript e Node.js",
        requirements: ["TypeScript", "Node.js"],
        skills: ["TypeScript", "Node.js"],
        sourceUrl: `https://linkedin.com/jobs/view/${jobId5}`,
        postedAt: new Date().toISOString(),
      },
    ];
    fs.writeFileSync(testFeedPath5, JSON.stringify(feedData5, null, 2), "utf-8");

    // Mock nodemailer que dispara erro 421 temporário
    nodemailer.createTransport = () => ({
      sendMail: async () => {
        const smtpErr: any = new Error("4.2.1 Service temporarily unavailable; rate limit exceeded");
        smtpErr.responseCode = 421;
        smtpErr.code = 421;
        throw smtpErr;
      },
      close: () => {},
      verify: async () => true,
    } as any);

    resetarEstadoWorker(vagasEmailWorker);

    let backoffDelayCapturado: number | null = null;
    (vagasEmailWorker as any).aguardarDelay = async (segundos: number) => {
      backoffDelayCapturado = segundos;
      // Cancela execução após capturar o primeiro backoff para não travar o teste
      vagasEmailWorker.parar("Teste de backoff concluído");
      return false;
    };

    await vagasEmailWorker.iniciar({
      feedUrl: testFeedPath5,
      minScore: 70,
      semIa: true,
    });

    while (true) {
      await new Promise((r) => setTimeout(r, 50));
      const s = vagasEmailWorker.getStatus();
      if (s.state === "COMPLETED" || s.state === "STOPPED" || s.state === "FAILED" || s.state === "IDLE") break;
    }

    // Asserção: backoff exponencial de 600 segundos (10 minutos) para a 1ª tentativa
    assert.equal(backoffDelayCapturado, 600, "1ª tentativa de erro temporário deve aplicar delay de backoff de 600s");

    // Registro NÃO foi gravado como FAILED permanente antes de esgotar as tentativas
    const candRow5 = await db.get<any>(
      "SELECT status FROM curriculo_automacao_candidaturas WHERE job_id = ?",
      jobId5,
    );
    assert.ok(candRow5, "Registro deve existir no banco");
    assert.notEqual(candRow5.status, "SENT", "Vaga com erro SMTP não deve ser marcada como SENT");
    // Permanece em PROCESSING para re-tentativa após a janela de backoff
    assert.equal(candRow5.status, "PROCESSING", "Vaga deve permanecer em PROCESSING durante backoff");

    console.log("   ✅ Erro transitório 421 interceptado e política de backoff exponencial (600s) acionada.\n");

    // ─────────────────────────────────────────────────────────────────────────
    // TESTE 6: Crash Pós-Reserva / Interrupção e Reconciliação
    // ─────────────────────────────────────────────────────────────────────────
    console.log("▶ TESTE 6 — Crash pós-reserva (Recuperação de PROCESSING órfão sem envio duplo)");

    const timestamp6 = Date.now();

    // 6.1 Cenário A: Crash antes do envio (envio_id IS NULL e atualizado há >10 minutos)
    const jobId6A = `job_c6_crash_sem_envio_${timestamp6}`;
    await db.run(
      `INSERT INTO curriculo_automacao_candidaturas
       (job_id, contact_email, company, vaga_title, vaga_url, status, dados_vaga_json, updated_at)
       VALUES (?, 'crash_a@empresa.com', 'Empresa Crash A', 'Vaga Crash A', 'https://vaga.a', 'PROCESSING', '{}', datetime('now', '-15 minutes'))`,
      jobId6A,
    );

    // 6.2 Cenário B: Crash após envio de e-mail (envio_id preenchido com status SENT em curriculo_envios)
    const jobId6B = `job_c6_crash_com_envio_${timestamp6}`;
    const insertEnvio6B = await db.run(
      `INSERT INTO curriculo_envios (filename, email_destino, vaga_titulo, status)
       VALUES ('curriculo_teste.pdf', 'crash_b@empresa.com', 'Vaga Crash B', 'SENT')`,
    );
    const envioId6B = insertEnvio6B.lastID;

    await db.run(
      `INSERT INTO curriculo_automacao_candidaturas
       (job_id, contact_email, company, vaga_title, vaga_url, status, envio_id, dados_vaga_json, updated_at)
       VALUES (?, 'crash_b@empresa.com', 'Empresa Crash B', 'Vaga Crash B', 'https://vaga.b', 'PROCESSING', ?, '{}', datetime('now', '-15 minutes'))`,
      jobId6B,
      envioId6B,
    );

    // Executa reconciliação pós-crash
    const resultadoReconciliacao = await vagasEmailWorker.reconciliarProcessosOrfaos();
    assert.ok(resultadoReconciliacao.reconciliados >= 1, "Pelo menos um registro órfão deve ter sido reconciliado");

    // Verificação Cenário A: órfão sem envio transiciona para FAILED (seguro para reanálise)
    const row6A = await db.get<any>(
      "SELECT status, error_message FROM curriculo_automacao_candidaturas WHERE job_id = ?",
      jobId6A,
    );
    assert.equal(row6A.status, "FAILED", "Órfão sem envio deve transicionar para FAILED");
    assert.ok(row6A.error_message.includes("timeout"), "Mensagem de erro deve indicar interrupção");

    // Verificação Cenário B: órfão com envio_id SENT transiciona para SENT (evita reenvio duplo)
    const row6B = await db.get<any>(
      "SELECT status, sent_at FROM curriculo_automacao_candidaturas WHERE job_id = ?",
      jobId6B,
    );
    assert.equal(row6B.status, "SENT", "Órfão que já teve e-mail enviado deve transicionar para SENT");

    // Validação de não-reenvio: vaga 6B deve ser bloqueada em nova execução
    const vagaB = criarVagaMock(jobId6B, "crash_b@empresa.com");
    const rReserva6B = await vagasEmailWorker.reservarSlotEnvioAtomico(vagaB, 601, 30, 150);
    assert.equal(rReserva6B.reservado, false, "Vaga já enviada pós-crash não pode ser re-enviada");
    assert.equal(rReserva6B.motivo, "CONCURRENCY_CONFLICT", "Motivo deve ser CONCURRENCY_CONFLICT");

    console.log("   ✅ Reconciliação pós-crash tratou slots órfãos com segurança absoluta contra duplicatas.\n");

    // ─────────────────────────────────────────────────────────────────────────
    // TESTE 7: Limite Horário de Envio (30/h) e Cálculo da Próxima Janela
    // ─────────────────────────────────────────────────────────────────────────
    console.log("▶ TESTE 7 — Limite de envio (30/h atingido → Bloqueio e cálculo de espera UTC)");

    const timestamp7 = Date.now();

    // Inserir 30 envios com timestamp na hora corrente
    for (let i = 0; i < 30; i++) {
      await db.run(
        `INSERT INTO curriculo_automacao_candidaturas
         (job_id, contact_email, company, vaga_title, status, sent_at, dados_vaga_json)
         VALUES (?, ?, 'Empresa Cota', 'Dev', 'SENT', CURRENT_TIMESTAMP, '{}')`,
        `job_quota_c7_${timestamp7}_${i}`,
        `cota_${timestamp7}_${i}@empresa.com`,
      );
    }

    const enviosHoraAtual = await vagasEmailWorker.contarEnviosHoraAtual();
    assert.ok(enviosHoraAtual >= 30, "Contagem na hora atual deve ser >= 30");

    // Tentativa de reservar novo slot com hourlyLimit = 30
    const vagaExcedente = criarVagaMock(`job_excedente_${timestamp7}`, `excedente_${timestamp7}@empresa.com`);
    const rExcedente = await vagasEmailWorker.reservarSlotEnvioAtomico(vagaExcedente, 701, 30, 150);

    assert.equal(rExcedente.reservado, false, "Reserva deve ser recusada após atingir limite de 30/h");
    assert.equal(rExcedente.motivo, "HOURLY_LIMIT", "Motivo deve ser HOURLY_LIMIT");

    // Cálculo da próxima janela horária UTC
    const segundosAteProximaHora = vagasEmailWorker.calcularSegundosAteProximaHora();
    assert.ok(segundosAteProximaHora >= 5, "Segundos até a próxima hora deve ser >= 5");
    assert.ok(segundosAteProximaHora <= 3662, "Segundos até a próxima hora deve ser <= 3662");

    // Validação no Preview com limite excedido
    const previewCota = await vagasEmailWorker.gerarPreview({
      feedUrl: testFeedPath1,
      hourlyLimit: 30,
    });
    assert.equal(previewCota.limiteHorarioRestante, 0, "Cota horária restante no preview deve ser 0");

    console.log(`   ✅ Limite de 30/h bloqueou novos envios; espera até próxima hora UTC: ${segundosAteProximaHora}s.\n`);

    // ─────────────────────────────────────────────────────────────────────────
    // TESTE 8: Pipeline Completo End-to-End (Orquestrador)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("▶ TESTE 8 — Pipeline completo End-to-End (Sessão → Ingestão → Preview → Validações → Conclusão)");

    // 8.1 Validação de Sessão LinkedIn (Arquivo válido vs inválido)
    const tempDirSession = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-test-session-"));
    registrarArquivoParaLimpeza(tempDirSession);

    const sessionInvalida = path.join(tempDirSession, "invalid.json");
    fs.writeFileSync(sessionInvalida, JSON.stringify({ cookies: [] }), "utf-8");
    const checkInv = verificarSessaoSalva(sessionInvalida);
    assert.equal(checkInv.valida, false, "Sessão sem li_at deve ser inválida");
    assert.ok(checkInv.motivo?.includes("li_at"), "Motivo deve apontar ausência de li_at");

    const sessionValida = path.join(tempDirSession, "valid.json");
    fs.writeFileSync(
      sessionValida,
      JSON.stringify({
        cookies: [
          {
            name: "li_at",
            value: "AQEDAT0K_sample_valid_linkedin_session_cookie_token_12345",
            expires: Math.floor(Date.now() / 1000) + 86400 * 30,
          },
        ],
      }),
      "utf-8",
    );
    const checkVal = verificarSessaoSalva(sessionValida);
    assert.equal(checkVal.valida, true, "Sessão com cookie li_at ativo deve ser válida");

    // 8.2 Execução do orquestrador via CLI com flags de validação
    const cwd = path.resolve(process.cwd());
    const outputPipeline = execSync(
      "npx tsx scripts/pipeline-curriculo.ts --skip-scrape --preview --override-email=teste@sandbox.com",
      { cwd, encoding: "utf-8", env: { ...process.env, DATABASE_PATH: testDbPath } },
    );

    assert.ok(outputPipeline.includes("PREVIEW (somente leitura - sem disparos)"), "Deve acusar modo preview");
    assert.ok(outputPipeline.includes("teste@sandbox.com"), "Deve acusar override de email");
    assert.ok(outputPipeline.includes("ETAPA 5: Inicializando banco de dados"), "Etapa 5 deve ser executada");
    assert.ok(outputPipeline.includes("ETAPA 6: Gerando preview e analisando elegibilidade"), "Etapa 6 deve ser executada");
    assert.ok(outputPipeline.includes("ETAPA 12: Garantindo limpeza de arquivos residuais"), "Etapa 12 deve ser executada");
    assert.ok(outputPipeline.includes("RELATÓRIO CONSOLIDADO DO PIPELINE"), "Etapa 13 deve consolidar relatório");

    // 8.3 Limpeza de arquivos residuais na pasta temp/
    const residualPdf = path.join(pathConfig.temp, `test_leak_${Date.now()}.pdf`);
    const residualTmp = path.join(pathConfig.temp, `test_leak_${Date.now()}.tmp`);
    fs.writeFileSync(residualPdf, "dummy leak pdf");
    fs.writeFileSync(residualTmp, "dummy leak tmp");
    assert.equal(fs.existsSync(residualPdf), true, "Arquivo dummy deve existir antes da limpeza");

    // Executa etapa de limpeza
    execSync("npx tsx scripts/pipeline-curriculo.ts --skip-scrape --preview", {
      cwd,
      encoding: "utf-8",
      env: { ...process.env, DATABASE_PATH: testDbPath },
    });

    assert.equal(fs.existsSync(residualPdf), false, "Arquivo residual .pdf deve ser limpo pelo pipeline");
    assert.equal(fs.existsSync(residualTmp), false, "Arquivo residual .tmp deve ser limpo pelo pipeline");

    console.log("   ✅ Orquestrador executou fluxo completo ponta a ponta com telemetria e limpeza perfeitas.\n");

    console.log("===================================================================");
    console.log("  🎉 100% DOS 8 CENÁRIOS OBRIGATÓRIOS FORAM VALIDADOS COM SUCESSO!");
    console.log("===================================================================\n");
  } finally {
    nodemailer.createTransport = originalCreateTransport;
    limparArquivosTemporarios();
  }
}

runTestSuite().catch((err) => {
  console.error("\n❌ ERRO NA SUÍTE DE TESTES:", err);
  limparArquivosTemporarios();
  process.exit(1);
});
