import assert from "node:assert/strict";
import { generatePermanentTestToken } from "../src/shared/auth/jwt-auth.js";

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";
const TOKEN = generatePermanentTestToken("usuario-teste-dividas@jenus.local");

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

async function testCenario9() {
  console.log("=======================================================================");
  console.log("📑 TESTE PRÁTICO: CENÁRIO 9 — DÍVIDAS RECORRENTES / CONTAS FIXAS");
  console.log(`📡 Conectando em: ${BASE_URL}`);
  console.log("=======================================================================");

  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);

  let debtId: number = 0;
  let occurrenceId: number = 0;
  let payment1Id: number = 0;
  let payment2Id: number = 0;

  // PASSO 1: Criar Dívida Recorrente (Aluguel Apartamento - R$ 2.400,00 todo dia 10)
  console.log("\n▶ [Passo 1] Cadastrando nova Dívida Fixa Mensal...");
  console.log("   - Nome: Aluguel & Condomínio");
  console.log("   - Valor: R$ 2.400,00");
  console.log("   - Dia do Vencimento: Todo dia 10");

  const createRes = await api("/api/financas/debts", {
    method: "POST",
    body: JSON.stringify({
      name: `Aluguel & Condomínio ${Date.now()}`,
      amountCents: 240000, // R$ 2.400,00
      dueDay: 10,
      startMonth: currentMonth,
      notes: "Contrato de locação com imobiliária",
    }),
  });

  console.log(`   Status HTTP: ${createRes.status}`);
  assert.equal(createRes.status, 201, "Criação de dívida deve retornar 201");
  assert.equal(createRes.data.success, true);

  const debt = createRes.data.data;
  debtId = debt.id;
  console.log(`   ID da Dívida Gerada: ${debt.id}`);
  console.log(`   Nome: ${debt.name}`);
  console.log(`   Valor Previsto: ${formatBRL(debt.amount_cents)}`);
  console.log(`   Dia de Vencimento: Todo dia ${debt.due_day}`);
  assert.equal(debt.amount_cents, 240000);
  assert.equal(debt.due_day, 10);
  console.log("   ✅ Passo 1 concluído com sucesso!\n");

  // PASSO 2: Consultar detalhes da dívida
  console.log("▶ [Passo 2] Consultando detalhes da dívida por ID...");
  const getRes = await api(`/api/financas/debts/${debtId}`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.data.data.id, debtId);
  console.log(`   Dívida confirmada no banco: [ID ${getRes.data.data.id}] ${getRes.data.data.name}`);
  console.log("   ✅ Passo 2 concluído com sucesso!\n");

  // PASSO 3: Listar ocorrências do mês (com auto-geração)
  console.log(`▶ [Passo 3] Consultando ocorrências do mês (${currentMonth}) com auto-geração...`);
  const occRes = await api(`/api/financas/debts/occurrences?month=${currentMonth}`);
  assert.equal(occRes.status, 200);
  assert.ok(occRes.data.data.occurrences, "Deve conter array de ocorrências");

  const occurrence = occRes.data.data.occurrences.find((o: any) => o.debt_id === debtId);
  assert.ok(occurrence, "A ocorrência mensal da dívida deve ter sido gerada automaticamente");
  occurrenceId = occurrence.id;

  console.log(`   Ocorrência do Mês [ID ${occurrence.id}]:`);
  console.log(`   - Data de Vencimento: ${occurrence.due_date}`);
  console.log(`   - Valor Esperado: ${formatBRL(occurrence.expected_amount_cents)}`);
  console.log(`   - Valor Já Pago: ${formatBRL(occurrence.paid_amount_cents)}`);
  console.log(`   - Status Inicial: ${occurrence.status}`);
  assert.equal(occurrence.status, "PENDING");
  assert.equal(occurrence.expected_amount_cents, 240000);
  assert.equal(occurrence.paid_amount_cents, 0);
  console.log("   ✅ Passo 3 concluído com sucesso!\n");

  // PASSO 4: Registrar Pagamento Parcial de R$ 1.000,00
  console.log("▶ [Passo 4] Testando PAGAMENTO PARCIAL de R$ 1.000,00...");
  const pay1Res = await api(`/api/financas/debts/occurrences/${occurrenceId}/pay`, {
    method: "POST",
    body: JSON.stringify({
      amountCents: 100000, // R$ 1.000,00
      paidDate: today,
      notes: "Primeira parte paga via PIX",
    }),
  });

  console.log(`   Status HTTP: ${pay1Res.status}`);
  assert.equal(pay1Res.status, 201);
  const occAfterPay1 = pay1Res.data.data;
  payment1Id = occAfterPay1.payments[0].id;

  console.log(`   Status da Ocorrência: ${occAfterPay1.status} (esperado: PARTIAL)`);
  console.log(`   Total Pago: ${formatBRL(occAfterPay1.paid_amount_cents)}`);
  console.log(`   Restante: ${formatBRL(occAfterPay1.expected_amount_cents - occAfterPay1.paid_amount_cents)}`);
  assert.equal(occAfterPay1.status, "PARTIAL");
  assert.equal(occAfterPay1.paid_amount_cents, 100000);
  console.log("   ✅ Passo 4 concluído com sucesso!\n");

  // PASSO 5: Registrar Quitação Total (pagar os R$ 1.400,00 restantes)
  console.log("▶ [Passo 5] Testando QUITAÇÃO TOTAL (pagamento do saldo restante de R$ 1.400,00)...");
  const pay2Res = await api(`/api/financas/debts/occurrences/${occurrenceId}/pay`, {
    method: "POST",
    body: JSON.stringify({
      amountCents: 140000, // R$ 1.400,00
      paidDate: today,
      notes: "Saldo restante pago via Transferência",
    }),
  });

  console.log(`   Status HTTP: ${pay2Res.status}`);
  assert.equal(pay2Res.status, 201);
  const occAfterPay2 = pay2Res.data.data;
  payment2Id = occAfterPay2.payments[0].id;

  console.log(`   Status da Ocorrência: ${occAfterPay2.status} (esperado: PAID)`);
  console.log(`   Total Pago: ${formatBRL(occAfterPay2.paid_amount_cents)} de ${formatBRL(occAfterPay2.expected_amount_cents)}`);
  console.log(`   Total de pagamentos parciais registrados: ${occAfterPay2.payments.length}`);
  assert.equal(occAfterPay2.status, "PAID");
  assert.equal(occAfterPay2.paid_amount_cents, 240000);
  assert.equal(occAfterPay2.payments.length, 2);
  console.log("   ✅ Passo 5 concluído com sucesso!\n");

  // PASSO 6: Estorno de Pagamento (excluir o 2º pagamento de R$ 1.400,00)
  console.log(`▶ [Passo 6] Testando ESTORNO de pagamento (removendo pagamento ID ${payment2Id})...`);
  const delPayRes = await api(`/api/financas/debts/payments/${payment2Id}`, {
    method: "DELETE",
  });

  console.log(`   Status HTTP: ${delPayRes.status}`);
  assert.equal(delPayRes.status, 200);
  console.log(`   Status após estorno: ${delPayRes.data.data.status} (revertido para PARTIAL)`);
  console.log(`   Total pago recalculado: ${formatBRL(delPayRes.data.data.totalPaid)}`);
  assert.equal(delPayRes.data.data.status, "PARTIAL");
  assert.equal(delPayRes.data.data.totalPaid, 100000);
  console.log("   ✅ Passo 6 concluído com sucesso!\n");

  // PASSO 7: Checagem de Lembretes e Notificações Push de Vencimento
  console.log("▶ [Passo 7] Executando rotina de checagem de lembretes de vencimento...");
  const remindersRes = await api("/api/financas/debts/check-reminders", { method: "POST" });
  console.log(`   Status HTTP: ${remindersRes.status}`);
  assert.equal(remindersRes.status, 200);
  console.log(`   Data verificada: ${remindersRes.data.data.checkedDate}`);
  console.log(`   Dívidas encontradas a vencer: ${remindersRes.data.data.totalFound}`);
  console.log(`   Notificações push despachadas: ${remindersRes.data.data.notifiedCount}`);
  console.log("   ✅ Passo 7 concluído com sucesso!\n");

  // PASSO 8: Atualizar a dívida recorrente
  console.log("▶ [Passo 8] Atualizando valor da dívida para R$ 2.600,00 e vencimento para dia 12...");
  const updateRes = await api(`/api/financas/debts/${debtId}`, {
    method: "PUT",
    body: JSON.stringify({
      name: "Aluguel, Condomínio & IPTU",
      amountCents: 260000,
      dueDay: 12,
    }),
  });
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.data.data.amount_cents, 260000);
  assert.equal(updateRes.data.data.due_day, 12);
  console.log(`   Nome atualizado: ${updateRes.data.data.name}`);
  console.log(`   Novo valor fixo: ${formatBRL(updateRes.data.data.amount_cents)}`);
  console.log("   ✅ Passo 8 concluído com sucesso!\n");

  // PASSO 9: Limpeza
  console.log("▶ [Passo 9] Limpeza: Excluindo dívida de teste e ocorrências vinculadas...");
  const { getDb } = await import("../src/core/database.js");
  const db = await getDb();
  await db.run("DELETE FROM fin_debt_payments WHERE occurrence_id = ?", occurrenceId);
  await db.run("DELETE FROM fin_debt_occurrences WHERE debt_id = ?", debtId);
  await db.run("DELETE FROM fin_debts WHERE id = ?", debtId);
  console.log("   Dívida e ocorrências removidas com sucesso!");
  console.log("   ✅ Passo 9 concluído com sucesso!\n");

  console.log("=======================================================================");
  console.log("🎉 CENÁRIO 9 (DÍVIDAS RECORRENTES & PAGAMENTOS) VALIDADO COM 100%!");
  console.log("=======================================================================");
}

testCenario9().catch((err) => {
  console.error("❌ Falha no teste do Cenário 9:", err);
  process.exit(1);
});
