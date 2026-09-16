import assert from "node:assert/strict";
import { generatePermanentTestToken } from "../src/shared/auth/jwt-auth.js";

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";
const TOKEN = generatePermanentTestToken("usuario-teste-categorias@jenus.local");

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

async function testCenario3() {
  console.log("=======================================================================");
  console.log("🏷️  TESTE PRÁTICO: CENÁRIO 3 — CATEGORIAS DE RECEITA & DESPESA");
  console.log(`📡 Conectando em: ${BASE_URL}`);
  console.log("=======================================================================\n");

  let expenseCatId: number = 0;
  let incomeCatId: number = 0;

  // PASSO 1: Consultar categorias e validar inicialização padrão
  console.log("▶ [Passo 1] Consultando categorias existentes (garante categorias padrão)...");
  const list1 = await api("/api/financas/categories");
  console.log(`   Status HTTP: ${list1.status}`);
  assert.equal(list1.status, 200, "Consulta de categorias deve retornar 200");
  assert.equal(list1.data.success, true);
  assert.ok(Array.isArray(list1.data.data));

  const totalIniciais = list1.data.data.length;
  console.log(`   Categorias padrão ativas: ${totalIniciais}`);
  const nomesPadrao = list1.data.data.slice(0, 5).map((c: any) => `${c.name} (${c.kind})`).join(", ");
  console.log(`   Exemplos: ${nomesPadrao}...`);
  assert.ok(totalIniciais >= 8, "Devem existir ao menos 8 categorias padrão do sistema");
  console.log("   ✅ Passo 1 concluído com sucesso!\n");

  // PASSO 2: Criar categoria personalizada de DESPESA
  console.log("▶ [Passo 2] Criando categoria de DESPESA: 'Pets & Veterinário'...");
  const createExpenseRes = await api("/api/financas/categories", {
    method: "POST",
    body: JSON.stringify({
      name: "Pets & Veterinário",
      kind: "expense",
      icon: "heart",
      color: "#ec4899",
    }),
  });

  console.log(`   Status HTTP: ${createExpenseRes.status}`);
  assert.equal(createExpenseRes.status, 201, "Criação deve retornar 201");
  assert.equal(createExpenseRes.data.success, true);

  const expCat = createExpenseRes.data.data;
  expenseCatId = expCat.id;
  console.log(`   ID Gerado: ${expCat.id}`);
  console.log(`   Nome: ${expCat.name}`);
  console.log(`   Tipo: ${expCat.kind}`);
  console.log(`   Ícone: ${expCat.icon} | Cor: ${expCat.color}`);
  assert.equal(expCat.name, "Pets & Veterinário");
  assert.equal(expCat.kind, "expense");
  console.log("   ✅ Passo 2 concluído com sucesso!\n");

  // PASSO 3: Criar categoria personalizada de RECEITA
  console.log("▶ [Passo 3] Criando categoria de RECEITA: 'Dividendos & Fundos Imobiliários'...");
  const createIncomeRes = await api("/api/financas/categories", {
    method: "POST",
    body: JSON.stringify({
      name: "Dividendos & Fundos Imobiliários",
      kind: "income",
      icon: "trending-up",
      color: "#10b981",
    }),
  });

  console.log(`   Status HTTP: ${createIncomeRes.status}`);
  assert.equal(createIncomeRes.status, 201, "Criação deve retornar 201");
  assert.equal(createIncomeRes.data.success, true);

  const incCat = createIncomeRes.data.data;
  incomeCatId = incCat.id;
  console.log(`   ID Gerado: ${incCat.id}`);
  console.log(`   Nome: ${incCat.name}`);
  console.log(`   Tipo: ${incCat.kind}`);
  console.log(`   Ícone: ${incCat.icon} | Cor: ${incCat.color}`);
  assert.equal(incCat.name, "Dividendos & Fundos Imobiliários");
  assert.equal(incCat.kind, "income");
  console.log("   ✅ Passo 3 concluído com sucesso!\n");

  // PASSO 4: Validar listagem contendo as duas novas categorias
  console.log("▶ [Passo 4] Verificando se ambas as categorias constam na listagem...");
  const list2 = await api("/api/financas/categories");
  const foundExpense = list2.data.data.find((c: any) => c.id === expenseCatId);
  const foundIncome = list2.data.data.find((c: any) => c.id === incomeCatId);
  assert.ok(foundExpense, "Categoria de despesa criada deve estar na lista");
  assert.ok(foundIncome, "Categoria de receita criada deve estar na lista");
  console.log(`   Confirmado Despesa: [ID ${foundExpense.id}] ${foundExpense.name}`);
  console.log(`   Confirmado Receita: [ID ${foundIncome.id}] ${foundIncome.name}`);
  console.log("   ✅ Passo 4 concluído com sucesso!\n");

  // PASSO 5: Atualizar categoria (ex: mudar nome e cor)
  console.log("▶ [Passo 5] Atualizando categoria 'Pets & Veterinário' para 'Pets, Banho & Tosa'...");
  const updateRes = await api(`/api/financas/categories/${expenseCatId}`, {
    method: "PUT",
    body: JSON.stringify({
      name: "Pets, Banho & Tosa",
      color: "#f43f5e",
      icon: "scissors",
    }),
  });

  console.log(`   Status HTTP: ${updateRes.status}`);
  assert.equal(updateRes.status, 200, "Atualização deve retornar 200");
  assert.equal(updateRes.data.data.name, "Pets, Banho & Tosa");
  assert.equal(updateRes.data.data.color, "#f43f5e");
  assert.equal(updateRes.data.data.icon, "scissors");
  console.log(`   Nome Atualizado: ${updateRes.data.data.name}`);
  console.log(`   Nova Cor: ${updateRes.data.data.color}`);
  console.log(`   Novo Ícone: ${updateRes.data.data.icon}`);
  console.log("   ✅ Passo 5 concluído com sucesso!\n");

  // PASSO 6: Excluir as categorias criadas (limpeza)
  console.log("▶ [Passo 6] Limpeza: Excluindo categorias de teste...");
  const del1 = await api(`/api/financas/categories/${expenseCatId}`, { method: "DELETE" });
  const del2 = await api(`/api/financas/categories/${incomeCatId}`, { method: "DELETE" });
  assert.equal(del1.status, 200);
  assert.equal(del2.status, 200);

  const list3 = await api("/api/financas/categories");
  const stillExists = list3.data.data.some((c: any) => c.id === expenseCatId || c.id === incomeCatId);
  assert.equal(stillExists, false, "Categorias excluídas não devem mais existir");
  console.log("   Categorias removidas com sucesso do banco de dados!");
  console.log("   ✅ Passo 6 concluído com sucesso!\n");

  console.log("=======================================================================");
  console.log("🎉 CENÁRIO 3 (CATEGORIAS) VALIDADO COM 100% DE SUCESSO!");
  console.log("=======================================================================");
}

testCenario3().catch((err) => {
  console.error("❌ Falha no teste do Cenário 3:", err);
  process.exit(1);
});
