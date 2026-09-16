import assert from "node:assert/strict";
import { initDb, getDb, runTransaction } from "../../../core/database.js";
import { vagasEmailWorker } from "../automacao/vagasEmailWorker.service.js";

async function runTests() {
  await initDb();
  const db = await getDb();
  
  // Limpar dados para o teste
  await db.run("DELETE FROM curriculo_envios");
  await db.run("DELETE FROM curriculo_automacao_candidaturas");
  await db.run("DELETE FROM curriculo_pending_applications");

  // Inserir 29 envios fake na ultima hora (ocupando a cota)
  for(let i=0; i<29; i++) {
    await db.run(`INSERT INTO curriculo_envios (email_destino, vaga_titulo, status) VALUES ('t${i}@t.com', 'T', 'SENT')`);
  }

  // Tentar reservar o slot 30 e 31 simultaneamente (com hourlyLimit de 30)
  const vaga30 = { jobId: "job-30", title: "T", company: "C", contactEmail: "e30@t.com", score: 80, dadosVagaFormatados: {} };
  const vaga31 = { jobId: "job-31", title: "T", company: "C", contactEmail: "e31@t.com", score: 80, dadosVagaFormatados: {} };

  const p1 = vagasEmailWorker.reservarSlotEnvioAtomico(vaga30 as any, null, 30, 0);
  const p2 = vagasEmailWorker.reservarSlotEnvioAtomico(vaga31 as any, null, 30, 0);

  const results = await Promise.all([p1, p2]);
  
  const reservou = results.filter(r => r.reservado).length;
  const falhouHora = results.filter(r => r.motivo === "HOURLY_LIMIT").length;

  assert.equal(reservou, 1, "Apenas 1 slot deve ser reservado (o 30º)");
  assert.equal(falhouHora, 1, "O outro slot deve falhar por HOURLY_LIMIT");
  
  console.log("✅ Concurrency Limit (Sliding Window) Test Passed!");

  // Inserir um envio antigo (mais de 1h atras) para garantir que nao conta
  await db.run(`INSERT INTO curriculo_envios (email_destino, vaga_titulo, status, created_at) VALUES ('t-old@t.com', 'T', 'SENT', datetime('now', '-61 minutes'))`);
  
  // Tentar reservar, deve permitir, porque um slot foi ocupado por job-30, restando 0.
  // Wait, right now we have 29 envios + 1 PROCESSING (job-30) = 30.
  // So it should fail again.
  const p3 = await vagasEmailWorker.reservarSlotEnvioAtomico(vaga31 as any, null, 30, 0);
  assert.equal(p3.motivo, "HOURLY_LIMIT", "Should still be at limit");

  process.exit(0);
}

runTests().catch(console.error);
