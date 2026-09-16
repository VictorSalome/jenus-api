import assert from "node:assert/strict";
import { generatePermanentTestToken } from "../src/shared/auth/jwt-auth.js";

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";
const TOKEN = generatePermanentTestToken("usuario-teste-transacoes@jenus.local");

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

async function testCenario4() {
  console.log("=======================================================================");
  console.log("💵 TESTE PRÁTICO: CENÁRIO 4 — RECEITAS E DESPESAS À VISTA");
  console.log(`📡 Conectando em: ${BASE_URL}`);
  console.log("=======================================================================\n");

  const today = new Date().toISOString().slice(0, 10);
  let accountId: number = 0;
  let categoryId: number = 0;
  let incomeTxId: number = 0;
  let expenseTxId: number = 0;

  // PASSO 1: Garantir conta bancária para as transações
  console.log("▶ [Passo 1] Garantindo conta bancária e categorias base...");
  const accountsRes = await api("/api/financas/accounts");
  if (accountsRes.data.data.length > 0) {
    accountId = accountsRes.data.data[0].id;
  } else {
    const newAcc = await api("/api/financas/accounts", {
      method: "POST",
      body: JSON.stringify({
        name: "Conta Corrente Teste",
        type: "checking",
        balanceCents: 100000,
      }),
    });
    accountId = newAcc.data.data.id;
  }
  console.log(`   Conta vinculada: [ID ${accountId}]`);

  const catRes = await api("/api/financas/categories");
  const cat = catRes.data.data.find((c: any) => c.kind === "expense") || catRes.data.data[0];
  categoryId = cat?.id || 1;
  console.log(`   Categoria vinculada: [ID ${categoryId}] ${cat?.name || "Geral"}`);
  console.log("   ✅ Passo 1 concluído com sucesso!\n");

  // PASSO 2: Lançar RECEITA à vista (Entrada / Salário)
  console.log("▶ [Passo 2] Lançando RECEITA à vista de R$ 5.000,00 (Salário)...");
  const incomeRes = await api("/api/financas/transactions", {
    method: "POST",
    body: JSON.stringify({
      accountId,
      description: "Salário Mensal Empresa X",
      amountCents: 500000, // R$ 5.000,00
      type: "credit", // Entrada
      transactionDate: today,
      source: "MANUAL",
    }),
  });

  console.log(`   Status HTTP: ${incomeRes.status}`);
  assert.equal(incomeRes.status, 201, "Criação de receita deve retornar 201");
  assert.equal(incomeRes.data.success, true);

  const incomeTx = incomeRes.data.data.transaction;
  incomeTxId = incomeTx.id;
  console.log(`   ID da Transação: ${incomeTx.id}`);
  console.log(`   Descrição: ${incomeTx.description}`);
  console.log(`   Tipo: ${incomeTx.type.toUpperCase()} (Entrada/Crédito)`);
  console.log(`   Valor: +${formatBRL(incomeTx.amount_cents)}`);
  console.log(`   Data: ${incomeTx.transaction_date}`);
  assert.equal(incomeTx.type, "credit");
  assert.equal(incomeTx.amount_cents, 500000);
  console.log("   ✅ Passo 2 concluído com sucesso!\n");

  // PASSO 3: Lançar DESPESA à vista (Saída imediata da conta)
  console.log("▶ [Passo 3] Lançando DESPESA à vista de R$ 135,50 (Supermercado)...");
  const expenseRes = await api("/api/financas/transactions", {
    method: "POST",
    body: JSON.stringify({
      accountId,
      description: "Compras Semanais",
      merchantName: "Supermercado Pão de Açúcar",
      categoryId,
      amountCents: 13550, // R$ 135,50
      type: "debit", // Saída
      transactionDate: today,
      source: "MANUAL",
    }),
  });

  console.log(`   Status HTTP: ${expenseRes.status}`);
  assert.equal(expenseRes.status, 201, "Criação de despesa deve retornar 201");
  assert.equal(expenseRes.data.success, true);

  const expenseTx = expenseRes.data.data.transaction;
  expenseTxId = expenseTx.id;
  console.log(`   ID da Transação: ${expenseTx.id}`);
  console.log(`   Descrição: ${expenseTx.description}`);
  console.log(`   Tipo: ${expenseTx.type.toUpperCase()} (Saída/Débito)`);
  console.log(`   Valor: -${formatBRL(expenseTx.amount_cents)}`);
  console.log(`   Data: ${expenseTx.transaction_date}`);
  assert.equal(expenseTx.type, "debit");
  assert.equal(expenseTx.amount_cents, 13550);
  console.log("   ✅ Passo 3 concluído com sucesso!\n");

  // PASSO 4: Consultar Extrato de Transações com filtros
  console.log("▶ [Passo 4] Consultando extrato de transações com filtro por mês...");
  const currentMonth = today.slice(0, 7);
  const listRes = await api(`/api/financas/transactions?month=${currentMonth}`);
  assert.equal(listRes.status, 200);

  const foundIncome = listRes.data.data.find((t: any) => t.id === incomeTxId);
  const foundExpense = listRes.data.data.find((t: any) => t.id === expenseTxId);
  assert.ok(foundIncome, "Receita deve constar no extrato");
  assert.ok(foundExpense, "Despesa deve constar no extrato");
  console.log(`   Localizada Receita no extrato: [ID ${foundIncome.id}] ${foundIncome.description} (+${formatBRL(foundIncome.amount_cents)})`);
  console.log(`   Localizada Despesa no extrato: [ID ${foundExpense.id}] ${foundExpense.description} (-${formatBRL(foundExpense.amount_cents)})`);
  console.log("   ✅ Passo 4 concluído com sucesso!\n");

  // PASSO 5: Editar transação (ex: atualizar descrição/categoria)
  console.log("▶ [Passo 5] Editando descrição da despesa...");
  const updateRes = await api(`/api/financas/transactions/${expenseTxId}`, {
    method: "PUT",
    body: JSON.stringify({
      description: "Compras Semanais - Frutas & Bebidas",
      categoryId,
    }),
  });

  console.log(`   Status HTTP: ${updateRes.status}`);
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.data.data.description, "Compras Semanais - Frutas & Bebidas");
  console.log(`   Nova Descrição salva: "${updateRes.data.data.description}"`);
  console.log("   ✅ Passo 5 concluído com sucesso!\n");

  // PASSO 6: Limpeza: Excluir as transações criadas
  console.log("▶ [Passo 6] Limpeza: Excluindo transações de teste...");
  const delIncome = await api(`/api/financas/transactions/${incomeTxId}`, { method: "DELETE" });
  const delExpense = await api(`/api/financas/transactions/${expenseTxId}`, { method: "DELETE" });
  assert.equal(delIncome.status, 200);
  assert.equal(delExpense.status, 200);

  const listAfter = await api(`/api/financas/transactions?month=${currentMonth}`);
  const stillExists = listAfter.data.data.some((t: any) => t.id === incomeTxId || t.id === expenseTxId);
  assert.equal(stillExists, false, "Transações de teste não devem mais existir");
  console.log("   Transações removidas com sucesso do extrato!");
  console.log("   ✅ Passo 6 concluído com sucesso!\n");

  console.log("=======================================================================");
  console.log("🎉 CENÁRIO 4 (RECEITAS E DESPESAS À VISTA) VALIDADO COM 100% DE SUCESSO!");
  console.log("=======================================================================");
}

testCenario4().catch((err) => {
  console.error("❌ Falha no teste do Cenário 4:", err);
  process.exit(1);
});
