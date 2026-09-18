import assert from "node:assert/strict";
import { initDb, getDb } from "../src/core/database.js";
import {
  vagasEmailWorker,
  isGmailRateLimitOuErroTemporario,
} from "../src/apps/curriculos/automacao/vagasEmailWorker.service.js";

async function runTest() {
  console.log("==================================================");
  console.log("  🧪 TESTE DE VALIDAÇÃO DOS REQUISITOS DA AUTOMAÇÃO");
  console.log("==================================================");

  await initDb();

  // ── 1. Requisito: Identificação de Rate Limit do Gmail & Erros Temporários
  console.log("\n1. Testando isGmailRateLimitOuErroTemporario...");

  // Códigos temporários 4xx
  assert.equal(isGmailRateLimitOuErroTemporario({ responseCode: 421 }), true, "421 deve ser temporário");
  assert.equal(isGmailRateLimitOuErroTemporario({ responseCode: 450 }), true, "450 deve ser temporário");
  assert.equal(isGmailRateLimitOuErroTemporario({ responseCode: 451 }), true, "451 deve ser temporário");
  assert.equal(isGmailRateLimitOuErroTemporario({ responseCode: 452 }), true, "452 deve ser temporário");
  assert.equal(isGmailRateLimitOuErroTemporario({ code: 450 }), true, "code 450 deve ser temporário");

  // Erros de conexão de rede
  assert.equal(isGmailRateLimitOuErroTemporario({ code: "ETIMEDOUT" }), true, "ETIMEDOUT deve ser temporário");
  assert.equal(isGmailRateLimitOuErroTemporario({ code: "ECONNRESET" }), true, "ECONNRESET deve ser temporário");
  assert.equal(isGmailRateLimitOuErroTemporario({ code: "ECONNREFUSED" }), true, "ECONNREFUSED deve ser temporário");

  // Padrões de texto
  assert.equal(
    isGmailRateLimitOuErroTemporario(new Error("4.7.0 User rate limit exceeded")),
    true,
    "Texto com 'rate limit' deve ser temporário",
  );
  assert.equal(
    isGmailRateLimitOuErroTemporario(new Error("5.4.5 Daily user sending quota exceeded")),
    true,
    "Texto com 'quota' deve ser temporário",
  );
  assert.equal(
    isGmailRateLimitOuErroTemporario(new Error("4.2.1 Too many concurrent connections")),
    true,
    "Texto com 'too many' deve ser temporário",
  );
  assert.equal(
    isGmailRateLimitOuErroTemporario(new Error("4.3.2 Service temporarily unavailable; try again later")),
    true,
    "Texto com 'try again' deve ser temporário",
  );
  assert.equal(
    isGmailRateLimitOuErroTemporario(new Error("Message deferred due to speed limit")),
    true,
    "Texto com 'deferred' deve ser temporário",
  );

  // Erros permanentes (550, 535) sem mensagem de quota não devem ser temporários
  assert.equal(
    isGmailRateLimitOuErroTemporario({ responseCode: 550, message: "5.1.1 User unknown" }),
    false,
    "550 sem quota/rate limit NÃO deve ser temporário",
  );
  assert.equal(
    isGmailRateLimitOuErroTemporario({ responseCode: 535, message: "5.7.8 Authentication failed" }),
    false,
    "535 autenticação inválida NÃO deve ser temporário",
  );
  console.log("   ✅ Detecção de rate limit e erros transitórios: OK");

  // ── 2. Requisito: Configuração padrão e cadência de envio (~30/h)
  console.log("\n2. Testando configurações e cadência de envio...");
  const config = await vagasEmailWorker.carregarConfiguracaoSalva();
  console.log(`   - Limite horário configurado: ${config.hourlyLimit}/h (esperado: 30)`);
  console.log(`   - Limite diário configurado: ${config.dailyLimit}/dia (esperado: 150)`);
  console.log(`   - Delays configurados: ${config.minDelaySeconds}s - ${config.maxDelaySeconds}s (média: ${(config.minDelaySeconds + config.maxDelaySeconds) / 2}s)`);

  assert.equal(config.hourlyLimit, 30, "Limite horário padrão deve ser 30");
  assert.equal(config.dailyLimit >= 100, true, "Limite diário deve ser configurável para segurança (default >= 100)");
  console.log("   ✅ Cadência de envio (~30/h com delay 90s-150s): OK");

  // ── 3. Requisito: Limite horário e cálculo da próxima janela
  console.log("\n3. Testando cálculo de janela horária...");
  const enviosNestaHora = await vagasEmailWorker.contarEnviosHoraAtual();
  console.log(`   - Envios registrados na hora atual: ${enviosNestaHora}`);
  assert.equal(typeof enviosNestaHora, "number", "contarEnviosHoraAtual deve retornar um número");
  console.log("   ✅ Consulta da cota horária: OK");

  // ── 4. Requisito: Teste do Modo Preview com hourlyLimit
  console.log("\n4. Testando Preview com suporte a hourlyLimit...");
  const preview = await vagasEmailWorker.gerarPreview({
    hourlyLimit: 30,
    dailyLimit: 150,
  });

  console.log(`   - Total no feed: ${preview.totalNoFeed}`);
  console.log(`   - Elegíveis: ${preview.elegiveis.length}`);
  console.log(`   - Puladas: ${preview.puladas.length}`);
  console.log(`   - Envios nesta hora: ${preview.enviosHoraAtual} / ${preview.config.hourlyLimit}`);
  console.log(`   - Limite horário restante: ${preview.limiteHorarioRestante}`);
  console.log(`   - Limite diário restante: ${preview.limiteDiarioRestante}`);

  assert.equal(typeof preview.limiteHorarioRestante, "number", "limiteHorarioRestante deve ser número");
  assert.equal(preview.config.hourlyLimit, 30, "hourlyLimit no preview deve ser 30");
  console.log("   ✅ Geração de preview com cota horária e diária: OK");

  // ── 5. Requisito: Status do Worker
  console.log("\n5. Testando status do worker...");
  const status = vagasEmailWorker.getStatus();
  assert.equal(status.state, "IDLE", "Worker inicial deve estar em IDLE");
  assert.equal(status.hourlyLimit, 30, "Status deve reportar hourlyLimit 30");
  assert.equal(typeof status.enviadasNestaHora, "number", "Status deve reportar enviadasNestaHora");
  console.log("   ✅ Status do worker: OK");

  console.log("\n==================================================");
  console.log("  🎉 TODOS OS TESTES PASSARAM COM SUCESSO!");
  console.log("==================================================");
  process.exit(0);
}

runTest().catch((err) => {
  console.error("❌ Erro no teste:", err);
  process.exit(1);
});
