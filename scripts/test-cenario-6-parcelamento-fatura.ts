import assert from "node:assert/strict";
import { generatePermanentTestToken } from "../src/shared/auth/jwt-auth.js";

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";
const TOKEN = generatePermanentTestToken("usuario-teste-parcelamento@jenus.local");

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

async function testCenario6() {
  console.log("=======================================================================");
  console.log("🛍️  TESTE PRÁTICO: CENÁRIO 6 — COMPRA PARCELADA & FATURAS DE CARTÃO");
  console.log(`📡 Conectando em: ${BASE_URL}`);
  console.log("=======================================================================\n");

  const today = new Date().toISOString().slice(0, 10);
  let accountId: number = 0;
  let cardId: number = 0;
  let txId: number = 0;
  let planId: number = 0;
  let firstInstallmentId: number = 0;

  // PASSO 1: Setup da Conta e do Cartão de Crédito
  console.log("▶ [Passo 1] Configurando conta e cartão de crédito com ciclo de fatura...");
  const accountsRes = await api("/api/financas/accounts");
  if (accountsRes.data.data.length > 0) {
    accountId = accountsRes.data.data[0].id;
  } else {
    const newAcc = await api("/api/financas/accounts", {
      method: "POST",
      body: JSON.stringify({
        name: "Conta Corrente Base",
        type: "checking",
        balanceCents: 100000,
      }),
    });
    accountId = newAcc.data.data.id;
  }

  // Cria cartão com fechamento dia 25 e vencimento dia 05
  const cardRes = await api("/api/financas/cards", {
    method: "POST",
    body: JSON.stringify({
      accountId,
      name: `Nubank Black Parcelas ${Date.now()}`,
      brand: "Mastercard",
      last4: "4321",
      closingDay: 25,
      dueDay: 5,
      creditLimitCents: 1000000, // R$ 10.000,00
    }),
  });
  assert.equal(cardRes.status, 201);
  cardId = cardRes.data.data.id;
  console.log(`   Cartão criado: [ID ${cardId}] ${cardRes.data.data.name}`);
  console.log(`   Ciclo: Fecha dia 25 | Vence dia 05 | Limite: R$ 10.000,00`);
  console.log("   ✅ Passo 1 concluído com sucesso!\n");

  // PASSO 2: Lançar compra de R$ 1.000,00 parcelada em 3x (divisão com centavos)
  console.log("▶ [Passo 2] Lançando compra de R$ 1.000,00 parcelada em 3x...");
  console.log("   Obs: R$ 1.000,00 / 3 parcelas = 1x R$ 333,34 + 2x R$ 333,33 (sem perda de centavos)");

  const txRes = await api("/api/financas/transactions", {
    method: "POST",
    body: JSON.stringify({
      accountId,
      cardId,
      description: "Monitor Gamer 144Hz",
      merchantName: "Kabum Tecnologia",
      amountCents: 100000, // R$ 1.000,00 total
      type: "debit",
      transactionDate: today,
      installmentsTotal: 3,
      source: "MANUAL",
    }),
  });

  console.log(`   Status HTTP: ${txRes.status}`);
  assert.equal(txRes.status, 201, "Criação da transação parcelada deve retornar 201");
  assert.equal(txRes.data.success, true);

  const txData = txRes.data.data;
  txId = txData.transaction.id;
  planId = txData.plan.id;

  console.log(`   ID da Transação Principal: ${txId}`);
  console.log(`   ID do Plano de Parcelamento: ${planId}`);
  console.log(`   Total de Parcelas: ${txData.installments.length}`);
  assert.equal(txData.installments.length, 3);
  console.log("   ✅ Passo 2 concluído com sucesso!\n");

  // PASSO 3: Validar valores e datas exatas das 3 parcelas geradas
  console.log("▶ [Passo 3] Inspecionando cronograma das parcelas geradas...");
  const instRes = await api(`/api/financas/installments?planId=${planId}`);
  assert.equal(instRes.status, 200);
  const installments = instRes.data.data;

  firstInstallmentId = installments[0].id;
  for (const inst of installments) {
    console.log(`   Parcela ${inst.number}/3: ${formatBRL(inst.amount_cents)} | Vencimento: ${inst.due_date} | Status: ${inst.status}`);
  }

  // Validação matemática de centavos:
  assert.equal(installments[0].amount_cents, 33333, "1ª parcela deve ser R$ 333,33");
  assert.equal(installments[1].amount_cents, 33333, "2ª parcela deve ser R$ 333,33");
  assert.equal(installments[2].amount_cents, 33334, "Última parcela deve absorver o centavo restante (R$ 333,34)");
  const somaCentavos = installments.reduce((acc: number, i: any) => acc + i.amount_cents, 0);
  assert.equal(somaCentavos, 100000, "A soma exata das parcelas deve ser R$ 1.000,00");
  console.log("   ✅ Passo 3 concluído com sucesso (soma matemática perfeita)!\n");

  // PASSO 4: Consultar Faturas de Cartão
  console.log("▶ [Passo 4] Consultando faturas consolidadas de cartão de crédito...");
  const invoicesRes = await api("/api/financas/invoices");
  assert.equal(invoicesRes.status, 200);
  assert.ok(Array.isArray(invoicesRes.data.data));

  const cardInvoice = invoicesRes.data.data.find((inv: any) => inv.cardId === cardId);
  assert.ok(cardInvoice, "Deve existir fatura calculada para o cartão");
  console.log(`   Fatura Encontrada para o Cartão [ID ${cardId}]:`);
  console.log(`   - Período/Vencimento da Fatura: ${cardInvoice.dueDate}`);
  console.log(`   - Valor Total da Fatura Vigente: ${formatBRL(cardInvoice.totalCents)}`);
  console.log(`   - Itens inclusos nesta fatura: ${cardInvoice.items?.length || 1}`);
  console.log("   ✅ Passo 4 concluído com sucesso!\n");

  // PASSO 5: Consultar Comprometimento Futuro (Projeção mês a mês)
  console.log("▶ [Passo 5] Consultando comprometimento futuro dos próximos meses...");
  const futureRes = await api("/api/financas/installments/future");
  assert.equal(futureRes.status, 200);
  assert.ok(Array.isArray(futureRes.data.data));
  const mesesComCompromisso = futureRes.data.data.filter((m: any) => m.totalCents > 0);
  console.log(`   Meses com comprometimento futuro detectados: ${mesesComCompromisso.length}`);
  for (const m of mesesComCompromisso.slice(0, 3)) {
    console.log(`   - Mês ${m.month}: Comprometido ${formatBRL(m.totalCents)}`);
  }
  console.log("   ✅ Passo 5 concluído com sucesso!\n");

  // PASSO 6: Quitar antecipadamente a 1ª parcela
  console.log(`▶ [Passo 6] Quitando antecipadamente a 1ª parcela (ID ${firstInstallmentId})...`);
  const payRes = await api(`/api/financas/installments/${firstInstallmentId}/pay`, {
    method: "POST",
  });
  console.log(`   Status HTTP: ${payRes.status}`);
  assert.equal(payRes.status, 200);
  assert.equal(payRes.data.data.status, "PAID");
  console.log(`   Status da Parcela 1/3 atualizado para: ${payRes.data.data.status} (Pago em ${payRes.data.data.paid_date})`);
  console.log("   ✅ Passo 6 concluído com sucesso!\n");

  // PASSO 7: Limpeza
  console.log("▶ [Passo 7] Limpeza: Excluindo parcelas, plano e cartão de teste...");
  const { getDb } = await import("../src/core/database.js");
  const db = await getDb();
  await db.run("DELETE FROM fin_installments WHERE plan_id = ?", planId);
  await db.run("DELETE FROM fin_installment_plans WHERE id = ?", planId);
  await db.run("DELETE FROM fin_transactions WHERE id = ?", txId);
  await api(`/api/financas/cards/${cardId}`, { method: "DELETE" });
  console.log("   Dados de teste removidos com sucesso!");
  console.log("   ✅ Passo 7 concluído com sucesso!\n");

  console.log("=======================================================================");
  console.log("🎉 CENÁRIO 6 (COMPRA PARCELADA & FATURAS) VALIDADO COM 100% DE SUCESSO!");
  console.log("=======================================================================");
}

testCenario6().catch((err) => {
  console.error("❌ Falha no teste do Cenário 6:", err);
  process.exit(1);
});
