import assert from "node:assert/strict";
import { generatePermanentTestToken } from "../src/shared/auth/jwt-auth.js";

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";
const TOKEN = generatePermanentTestToken("usuario-teste-contas@jenus.local");

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

async function testCenario1() {
  console.log("=======================================================================");
  console.log("🧪 TESTE PRÁTICO: CENÁRIO 1 — GESTÃO DE CONTAS BANCÁRIAS");
  console.log(`📡 Conectando em: ${BASE_URL}`);
  console.log("=======================================================================\n");

  let createdAccountId: number = 0;

  // PASSO 1: Listar contas existentes
  console.log("▶ [Passo 1] Consultando contas bancárias existentes...");
  const list1 = await api("/api/financas/accounts");
  console.log(`   Status HTTP: ${list1.status}`);
  assert.equal(list1.status, 200, "Deve retornar status 200");
  console.log(`   Total de contas atuais do usuário: ${list1.data.data.length}`);
  console.log("   ✅ Passo 1 concluído com sucesso!\n");

  // PASSO 2: Criar uma nova conta bancária
  console.log("▶ [Passo 2] Criando nova conta: 'Nubank Principal' com saldo inicial de R$ 2.500,00...");
  const createRes = await api("/api/financas/accounts", {
    method: "POST",
    body: JSON.stringify({
      name: "Nubank Principal",
      type: "checking",
      bank: "Nubank",
      balanceCents: 250000, // R$ 2.500,00
      currency: "BRL",
    }),
  });

  console.log(`   Status HTTP: ${createRes.status}`);
  assert.equal(createRes.status, 201, "Criação deve retornar status 201 (Created)");
  assert.equal(createRes.data.success, true);

  const account = createRes.data.data;
  createdAccountId = account.id;
  console.log(`   ID Gerado: ${account.id}`);
  console.log(`   Nome: ${account.name}`);
  console.log(`   Tipo: ${account.type}`);
  console.log(`   Banco: ${account.bank}`);
  console.log(`   Saldo Registrado: ${formatBRL(account.balance_cents)}`);
  assert.equal(account.balance_cents, 250000);
  console.log("   ✅ Passo 2 concluído com sucesso!\n");

  // PASSO 3: Validar que a conta recém-criada aparece na listagem
  console.log("▶ [Passo 3] Verificando se a nova conta aparece na lista geral...");
  const list2 = await api("/api/financas/accounts");
  const found = list2.data.data.find((a: any) => a.id === createdAccountId);
  assert.ok(found, "A conta recém-criada deve constar na listagem");
  console.log(`   Conta confirmada na lista: [ID ${found.id}] ${found.name} - ${formatBRL(found.balance_cents)}`);
  console.log("   ✅ Passo 3 concluído com sucesso!\n");

  // PASSO 4: Atualizar saldo e nome da conta (ex: depósito de R$ 700,00)
  console.log("▶ [Passo 4] Atualizando conta para 'Nubank Salário & Reserva' com novo saldo de R$ 3.200,00...");
  const updateRes = await api(`/api/financas/accounts/${createdAccountId}`, {
    method: "PUT",
    body: JSON.stringify({
      name: "Nubank Salário & Reserva",
      balanceCents: 320000, // R$ 3.200,00
    }),
  });

  console.log(`   Status HTTP: ${updateRes.status}`);
  assert.equal(updateRes.status, 200, "Atualização deve retornar status 200 (OK)");
  assert.equal(updateRes.data.data.name, "Nubank Salário & Reserva");
  assert.equal(updateRes.data.data.balance_cents, 320000);
  console.log(`   Nome Atualizado: ${updateRes.data.data.name}`);
  console.log(`   Novo Saldo: ${formatBRL(updateRes.data.data.balance_cents)}`);
  console.log("   ✅ Passo 4 concluído com sucesso!\n");

  // PASSO 5: Excluir a conta de teste para limpeza
  console.log("▶ [Passo 5] Limpeza: Excluindo a conta de teste...");
  const deleteRes = await api(`/api/financas/accounts/${createdAccountId}`, {
    method: "DELETE",
  });
  console.log(`   Status HTTP: ${deleteRes.status}`);
  assert.equal(deleteRes.status, 200, "Exclusão deve retornar status 200");
  assert.equal(deleteRes.data.success, true);

  // Confirmação de exclusão
  const list3 = await api("/api/financas/accounts");
  const stillExists = list3.data.data.some((a: any) => a.id === createdAccountId);
  assert.equal(stillExists, false, "A conta não deve mais constar na lista");
  console.log("   Conta removida com sucesso do banco de dados!");
  console.log("   ✅ Passo 5 concluído com sucesso!\n");

  console.log("=======================================================================");
  console.log("🎉 CENÁRIO 1 (CONTAS BANCÁRIAS) VALIDADO COM 100% DE SUCESSO!");
  console.log("=======================================================================");
}

testCenario1().catch((err) => {
  console.error("❌ Falha no teste do Cenário 1:", err);
  process.exit(1);
});
