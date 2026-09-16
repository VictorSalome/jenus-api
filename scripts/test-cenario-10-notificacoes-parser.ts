import assert from "node:assert/strict";
import { generatePermanentTestToken } from "../src/shared/auth/jwt-auth.js";

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";
const TOKEN = generatePermanentTestToken("usuario-teste-notificacoes@jenus.local");

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      ...(options.headers as Record<string, string> || {}),
    },
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, ok: res.ok, data };
}

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function testCenario10() {
  console.log("=======================================================================");
  console.log("📲 TESTE PRÁTICO: CENÁRIO 10 — NOTIFICAÇÕES BANCÁRIAS & PARSER IA");
  console.log(`📡 Conectando em: ${BASE_URL}`);
  console.log("=======================================================================\n");

  let eventId: number = 0;
  let importedTransactionId: number = 0;

  // PASSO 1: Enviar evento bruto simulando notificação do Nubank no Android
  console.log("▶ [Passo 1] Ingerindo notificação bancária bruta (RAW) do Nubank...");
  console.log("   Texto: 'Compra de R$ 189,90 no Posto Shell aprovada'");

  const rawNotification = {
    packageName: "com.nu.production",
    appLabel: "Nubank",
    title: "Nubank",
    text: `Compra de R$ 189,90 no Posto Shell ${Date.now()} aprovada`,
    postTime: Date.now(),
  };

  const postEventRes = await api("/api/financas/notification-events", {
    method: "POST",
    body: JSON.stringify(rawNotification),
  });

  console.log(`   Status HTTP: ${postEventRes.status}`);
  assert.equal(postEventRes.status, 201, "Ingestão de evento deve retornar 201");
  assert.equal(postEventRes.data.success, true);

  const eventResult = postEventRes.data.data;
  eventId = eventResult.event.id;

  console.log(`   ID do Evento Capturado: ${eventResult.event.id}`);
  console.log(`   Status Inicial do Evento: ${eventResult.event.status}`);
  console.log(`   Parser Reconhecido: ${eventResult.parsed ? "SIM (Nubank Parser)" : "NÃO"}`);

  assert.ok(eventResult.parsed, "O parser deve identificar e estruturar os dados da notificação");
  console.log(`   - Valor Extraído: ${formatBRL(eventResult.parsed.amountCents)}`);
  console.log(`   - Estabelecimento: ${eventResult.parsed.merchantName}`);
  console.log(`   - Data da Compra: ${eventResult.parsed.transactionDate}`);

  assert.equal(eventResult.parsed.amountCents, 18990);
  assert.ok(eventResult.parsed.merchantName.toLowerCase().includes("shell"));
  console.log("   ✅ Passo 1 concluído com sucesso!\n");

  // PASSO 2: Consultar fila de moderação de compras detectadas
  console.log("▶ [Passo 2] Consultando fila de compras detectadas (Central de Moderação)...");
  const listEventsRes = await api("/api/financas/notification-events");
  assert.equal(listEventsRes.status, 200);
  assert.ok(Array.isArray(listEventsRes.data.data));

  const foundEvent = listEventsRes.data.data.find((e: any) => e.id === eventId);
  assert.ok(foundEvent, "O evento capturado deve constar na fila de compras detectadas");
  console.log(`   Evento confirmado na fila: [ID ${foundEvent.id}] ${foundEvent.title} - Status: ${foundEvent.status}`);
  console.log("   ✅ Passo 2 concluído com sucesso!\n");

  // PASSO 3: Testar ação "Ignorar Compra" (o usuário opta por não lançar)
  console.log(`▶ [Passo 3] Testando ação 'Ignorar' no evento ID ${eventId}...`);
  const ignoreRes = await api(`/api/financas/notification-events/${eventId}/ignore`, {
    method: "POST",
  });
  console.log(`   Status HTTP: ${ignoreRes.status}`);
  assert.equal(ignoreRes.status, 200);
  assert.equal(ignoreRes.data.data.status, "ignored");
  console.log(`   Status atualizado para: ${ignoreRes.data.data.status} (Compra descartada)`);
  console.log("   ✅ Passo 3 concluído com sucesso!\n");

  // PASSO 4: Testar ação "Importar Compra" (converter evento em transação real)
  console.log(`▶ [Passo 4] Testando ação 'Importar' (converter em transação real no extrato)...`);
  // Reativa para permitir import
  const { getDb } = await import("../src/core/database.js");
  const db = await getDb();
  await db.run("UPDATE fin_notification_events SET status = 'parsed' WHERE id = ?", eventId);

  const importRes = await api(`/api/financas/notification-events/${eventId}/import`, {
    method: "POST",
  });

  console.log(`   Status HTTP: ${importRes.status}`);
  assert.equal(importRes.status, 200);
  assert.ok(importRes.data.data.transaction?.id > 0, "Deve gerar uma transação real no banco");

  const createdTx = importRes.data.data.transaction;
  importedTransactionId = createdTx.id;
  console.log(`   Transação Gerada com Sucesso no Extrato: [ID ${createdTx.id}]`);
  console.log(`   - Descrição: ${createdTx.description}`);
  console.log(`   - Valor: -${formatBRL(createdTx.amount_cents)}`);
  console.log(`   - Origem: ${createdTx.source} (capturado de notificação)`);

  assert.equal(createdTx.amount_cents, 18990);
  assert.equal(createdTx.source, "NOTIFICATION");
  console.log("   ✅ Passo 4 concluído com sucesso!\n");

  // PASSO 5: Simular Disparo de Push Notification de Compra Aprovada
  console.log("▶ [Passo 5] Testando endpoint de simulação de Push Notification (/push/test)...");
  const pushRes = await api("/api/financas/push/test", {
    method: "POST",
    body: JSON.stringify({
      title: "Nubank",
      body: "Compra de R$ 75,00 no Restaurante Italiano aprovada",
      amount: 75.0,
      merchant: "Restaurante Italiano",
    }),
  });
  console.log(`   Status HTTP: ${pushRes.status}`);
  assert.equal(pushRes.status, 200);
  assert.ok(pushRes.data.data.event?.id > 0, "Deve registrar evento correspondente no banco");
  console.log(`   Evento de teste de push registrado com sucesso! (ID ${pushRes.data.data.event.id})`);
  console.log("   ✅ Passo 5 concluído com sucesso!\n");

  // PASSO 6: Limpeza
  console.log("▶ [Passo 6] Limpeza: Excluindo evento de notificação e transação importada...");
  await api(`/api/financas/transactions/${importedTransactionId}`, { method: "DELETE" });
  await api(`/api/financas/notification-events/${eventId}`, { method: "DELETE" });
  if (pushRes.data.data.event?.id) {
    await api(`/api/financas/notification-events/${pushRes.data.data.event.id}`, { method: "DELETE" });
  }
  console.log("   Registros de teste excluídos!");
  console.log("   ✅ Passo 6 concluído com sucesso!\n");

  console.log("=======================================================================");
  console.log("🎉 CENÁRIO 10 (NOTIFICAÇÕES & PARSER) VALIDADO COM 100% DE SUCESSO!");
  console.log("=======================================================================");
}

testCenario10().catch((err) => {
  console.error("❌ Falha no teste do Cenário 10:", err);
  process.exit(1);
});
