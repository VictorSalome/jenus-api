import assert from "node:assert/strict";
import { generatePermanentTestToken } from "../src/shared/auth/jwt-auth.js";

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";
const TOKEN = generatePermanentTestToken("usuario-teste-cartoes@jenus.local");

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

async function testCenario2() {
  console.log("=======================================================================");
  console.log("💳 TESTE PRÁTICO: CENÁRIO 2 — CARTÕES DE CRÉDITO & CICLO DE FATURA");
  console.log(`📡 Conectando em: ${BASE_URL}`);
  console.log("=======================================================================\n");

  let baseAccountId: number = 0;
  let createdCardId: number = 0;

  // PASSO 1: Garantir conta bancária base para vincular ao cartão
  console.log("▶ [Passo 1] Garantindo conta bancária vinculada...");
  const accountsRes = await api("/api/financas/accounts");
  assert.equal(accountsRes.status, 200, "Consulta de contas deve retornar 200");

  if (accountsRes.data.data.length > 0) {
    baseAccountId = accountsRes.data.data[0].id;
    console.log(`   Conta existente selecionada: [ID ${baseAccountId}] ${accountsRes.data.data[0].name}`);
  } else {
    const newAcc = await api("/api/financas/accounts", {
      method: "POST",
      body: JSON.stringify({
        name: "Conta Base para Cartão",
        type: "checking",
        balanceCents: 100000,
      }),
    });
    baseAccountId = newAcc.data.data.id;
    console.log(`   Nova conta base criada: [ID ${baseAccountId}]`);
  }
  console.log("   ✅ Passo 1 concluído com sucesso!\n");

  // PASSO 2: Consultar cartões existentes
  console.log("▶ [Passo 2] Consultando lista atual de cartões de crédito...");
  const list1 = await api("/api/financas/cards");
  assert.equal(list1.status, 200);
  console.log(`   Status HTTP: ${list1.status}`);
  console.log(`   Total de cartões cadastrados atualmente: ${list1.data.data.length}`);
  console.log("   ✅ Passo 2 concluído com sucesso!\n");

  // PASSO 3: Cadastrar novo cartão de crédito
  console.log("▶ [Passo 3] Criando cartão: 'Nubank Ultravioleta Mastercard'...");
  console.log("   - Limite: R$ 15.000,00");
  console.log("   - Dia de Fechamento: 25");
  console.log("   - Dia de Vencimento: 05");
  console.log("   - Final: 8821");

  const createRes = await api("/api/financas/cards", {
    method: "POST",
    body: JSON.stringify({
      accountId: baseAccountId,
      name: "Nubank Ultravioleta Mastercard",
      brand: "Mastercard",
      last4: "8821",
      closingDay: 25,
      dueDay: 5,
      creditLimitCents: 1500000, // R$ 15.000,00
    }),
  });

  console.log(`   Status HTTP: ${createRes.status}`);
  assert.equal(createRes.status, 201, "Criação de cartão deve retornar status 201");
  assert.equal(createRes.data.success, true);

  const card = createRes.data.data;
  createdCardId = card.id;
  console.log(`   ID Gerado: ${card.id}`);
  console.log(`   Nome: ${card.name}`);
  console.log(`   Bandeira: ${card.brand}`);
  console.log(`   Final: •••• ${card.last4}`);
  console.log(`   Ciclo de Fatura: Fecha dia ${card.closing_day} / Vence dia ${card.due_day}`);
  console.log(`   Limite Total: ${formatBRL(card.credit_limit_cents)}`);

  assert.equal(card.closing_day, 25);
  assert.equal(card.due_day, 5);
  assert.equal(card.credit_limit_cents, 1500000);
  console.log("   ✅ Passo 3 concluído com sucesso!\n");

  // PASSO 4: Validar se o cartão aparece na listagem geral
  console.log("▶ [Passo 4] Verificando se o cartão aparece na lista de cartões...");
  const list2 = await api("/api/financas/cards");
  const found = list2.data.data.find((c: any) => c.id === createdCardId);
  assert.ok(found, "O cartão criado deve constar na listagem");
  console.log(`   Cartão localizado na lista: [ID ${found.id}] ${found.name} (Limite: ${formatBRL(found.credit_limit_cents)})`);
  console.log("   ✅ Passo 4 concluído com sucesso!\n");

  // PASSO 5: Atualizar limite e ciclo de fatura do cartão
  console.log("▶ [Passo 5] Atualizando limite para R$ 22.000,00 e vencimento para dia 08...");
  const updateRes = await api(`/api/financas/cards/${createdCardId}`, {
    method: "PUT",
    body: JSON.stringify({
      name: "Nubank Ultravioleta Black Vip",
      creditLimitCents: 2200000, // R$ 22.000,00
      dueDay: 8,
    }),
  });

  console.log(`   Status HTTP: ${updateRes.status}`);
  assert.equal(updateRes.status, 200, "Atualização de cartão deve retornar 200");
  assert.equal(updateRes.data.data.name, "Nubank Ultravioleta Black Vip");
  assert.equal(updateRes.data.data.credit_limit_cents, 2200000);
  assert.equal(updateRes.data.data.due_day, 8);

  console.log(`   Nome Atualizado: ${updateRes.data.data.name}`);
  console.log(`   Novo Limite: ${formatBRL(updateRes.data.data.credit_limit_cents)}`);
  console.log(`   Novo Vencimento: todo dia ${updateRes.data.data.due_day}`);
  console.log("   ✅ Passo 5 concluído com sucesso!\n");

  // PASSO 6: Excluir o cartão de teste (limpeza)
  console.log("▶ [Passo 6] Limpeza: Excluindo o cartão de teste...");
  const deleteRes = await api(`/api/financas/cards/${createdCardId}`, {
    method: "DELETE",
  });
  console.log(`   Status HTTP: ${deleteRes.status}`);
  assert.equal(deleteRes.status, 200, "Exclusão deve retornar status 200");
  assert.equal(deleteRes.data.success, true);

  // Confirmação de exclusão
  const list3 = await api("/api/financas/cards");
  const stillExists = list3.data.data.some((c: any) => c.id === createdCardId);
  assert.equal(stillExists, false, "O cartão não deve mais existir na listagem");
  console.log("   Cartão removido com sucesso do banco de dados!");
  console.log("   ✅ Passo 6 concluído com sucesso!\n");

  console.log("=======================================================================");
  console.log("🎉 CENÁRIO 2 (CARTÕES DE CRÉDITO) VALIDADO COM 100% DE SUCESSO!");
  console.log("=======================================================================");
}

testCenario2().catch((err) => {
  console.error("❌ Falha no teste do Cenário 2:", err);
  process.exit(1);
});
