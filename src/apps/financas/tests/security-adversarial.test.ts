import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import jwt from "jsonwebtoken";
import { initDb, getDb } from "../../../core/database.js";
import { config } from "../../../core/config.js";
import authApp from "../../../apps/auth/index.js";
import financasRouter from "../routes/financas.routes.js";
import { globalErrorHandler } from "../../../shared/http/index.js";
import { verifyAccessToken } from "../../../shared/auth/jwt-auth.js";
import { seedHouseholdDatabase } from "../migrations/index.js";

interface TestStats {
  passed: number;
  failed: number;
  steps: { name: string; status: "OK" | "FAIL"; error?: string }[];
}

const stats: TestStats = {
  passed: 0,
  failed: 0,
  steps: [],
};

async function runStep(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  ⏳ ${name}... `);
  try {
    await fn();
    stats.passed++;
    stats.steps.push({ name, status: "OK" });
    console.log("✅ OK");
  } catch (err: any) {
    stats.failed++;
    const errMsg = err?.message || String(err);
    stats.steps.push({ name, status: "FAIL", error: errMsg });
    console.log(`❌ FALHOU: ${errMsg}`);
    throw err;
  }
}

export async function runSecurityAdversarialTests() {
  console.log("=======================================================================");
  console.log("🛡️  SUÍTE DE TESTES ADVERSARIAIS DE SEGURANÇA E ISOLAMENTO MULTI-TENANT");
  console.log("=======================================================================\n");

  await initDb();
  const db = await getDb();
  await seedHouseholdDatabase(db);

  // Servidor Express efêmero para testes HTTP ponta a ponta
  const app = express();
  app.use(express.json());
  app.use("/api/auth", authApp);
  app.use("/api/financas", financasRouter);
  app.use(globalErrorHandler);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as any;
  const BASE_URL = `http://127.0.0.1:${address.port}`;
  console.log(`📡 Servidor de teste ouvindo em: ${BASE_URL}\n`);

  async function api(path: string, options: RequestInit = {}, token?: string) {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    });

    const contentType = res.headers.get("content-type") || "";
    let data: any = null;
    if (contentType.includes("application/json")) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    return { status: res.status, ok: res.ok, data, headers: res.headers };
  }

  // Tokens e IDs de teste
  let victorToken = "";
  let victorUserId = "";
  let victorHouseholdId = "";

  let rebecaToken = "";
  let rebecaUserId = "";
  let rebecaHouseholdId = "";
  let rachelToken = "";
  let rachelUserId = "";
  let rachelHouseholdId = "";

  let attackerToken = "";
  const attackerUserId = "hacker-bob";
  const attackerHouseholdId = "household-hacker";

  // Recursos do household-principal
  let vicAccountId = 0;
  let vicCardId = 0;
  let vicCategoryId = 0;
  let vicDebtId = 0;
  let vicTxId = 0;
  let rebecaTxId = 0;
  let rachelTxId = 0;

  // Recursos do household-hacker
  let hackerAccountId = 0;
  let hackerCardId = 0;
  let hackerCategoryId = 0;
  let hackerDebtId = 0;
  let hackerTxId = 0;

  try {
    // Limpar dados residuais do atacante de execuções anteriores para garantir idempotência
    await db.run("DELETE FROM fin_transactions WHERE household_id = ?", attackerHouseholdId);
    await db.run("DELETE FROM fin_debt_payments WHERE user_id = ?", attackerUserId);
    await db.run("DELETE FROM fin_debt_occurrences WHERE user_id = ?", attackerUserId);
    await db.run("DELETE FROM fin_debts WHERE household_id = ?", attackerHouseholdId);
    await db.run("DELETE FROM fin_cards WHERE household_id = ?", attackerHouseholdId);
    await db.run("DELETE FROM fin_accounts WHERE household_id = ?", attackerHouseholdId);
    await db.run("DELETE FROM fin_categories WHERE household_id = ?", attackerHouseholdId);

    // -------------------------------------------------------------------------
    // SETUP: Autenticação de Victor, Rebeca e Atacante
    // -------------------------------------------------------------------------
    console.log("📌 [SETUP] Autenticação e provisionamento de entidades base");

    await runStep("Autenticação de Victor ('vssousa') e Rebeca ('rcoelhorss')", async () => {
      const vRes = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: "vssousa", password: "Iphone5s.@" }),
      });
      assert.equal(vRes.status, 200);
      victorToken = vRes.data.accessToken;
      const vDecoded = verifyAccessToken(victorToken);
      victorUserId = vDecoded.userId;
      victorHouseholdId = vDecoded.householdId;
      assert.equal(victorHouseholdId, "household-principal");

      const rRes = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: "rcoelhorss", password: "leandroreis" }),
      });
      assert.equal(rRes.status, 200);
      rebecaToken = rRes.data.accessToken;
      const rDecoded = verifyAccessToken(rebecaToken);
      rebecaUserId = rDecoded.userId;
      rebecaHouseholdId = rDecoded.householdId;
      assert.equal(rebecaHouseholdId, "household-principal");

      rachelToken = rebecaToken;
      rachelUserId = rebecaUserId;
      rachelHouseholdId = rebecaHouseholdId;

      // Token JWT assinado do Atacante (household-hacker)
      attackerToken = jwt.sign(
        {
          userId: attackerUserId,
          email: "hacker@adversary.local",
          role: "user",
          name: "Attacker Bob",
          householdId: attackerHouseholdId,
        },
        config.JWT_ACCESS_SECRET,
        { expiresIn: "2h" },
      );
    });

    await runStep("Provisionar recursos no household-principal (Victor e Rebeca)", async () => {
      // 1. Conta do Victor
      const accRes = await api("/api/financas/accounts", {
        method: "POST",
        body: JSON.stringify({ name: "Conta Segura Victor", type: "checking", balanceCents: 1000000 }),
      }, victorToken);
      assert.equal(accRes.status, 201);
      vicAccountId = accRes.data.data.id;

      // 2. Cartão do Victor
      const cardRes = await api("/api/financas/cards", {
        method: "POST",
        body: JSON.stringify({
          accountId: vicAccountId,
          name: "Black Victor",
          brand: "Mastercard",
          closingDay: 5,
          dueDay: 12,
          creditLimitCents: 2500000,
        }),
      }, victorToken);
      assert.equal(cardRes.status, 201);
      vicCardId = cardRes.data.data.id;

      // 3. Categoria do Victor
      const catRes = await api("/api/financas/categories", {
        method: "POST",
        body: JSON.stringify({ name: "Alimentação Principal", icon: "utensils", color: "#10b981", kind: "expense" }),
      }, victorToken);
      assert.equal(catRes.status, 201);
      vicCategoryId = catRes.data.data.id;

      // 4. Dívida recorrente do Victor
      const debtRes = await api("/api/financas/debts", {
        method: "POST",
        body: JSON.stringify({
          name: "Internet Fibra Casal",
          amountCents: 14990,
          dueDay: 15,
          accountId: vicAccountId,
          categoryId: vicCategoryId,
          startMonth: "2026-09",
        }),
      }, victorToken);
      assert.equal(debtRes.status, 201);
      vicDebtId = debtRes.data.data.id;

      // 5. Transação do Victor
      const txRes = await api("/api/financas/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId: vicAccountId,
          cardId: vicCardId,
          categoryId: vicCategoryId,
          amountCents: 15000,
          transactionDate: "2026-09-12",
          description: "Supermercado - Victor",
        }),
      }, victorToken);
      assert.equal(txRes.status, 201);
      vicTxId = txRes.data.data.transaction.id;

      // 6. Transação da Rebeca
      const rTxRes = await api("/api/financas/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId: vicAccountId,
          categoryId: vicCategoryId,
          amountCents: 8000,
          transactionDate: "2026-09-12",
          description: "Farmácia - Rebeca",
        }),
      }, rebecaToken);
      assert.equal(rTxRes.status, 201);
      rebecaTxId = rTxRes.data.data.transaction.id;
      rachelTxId = rebecaTxId;
    });

    await runStep("Provisionar recursos no household-hacker (Atacante)", async () => {
      // Conta do Hacker
      const hAccRes = await api("/api/financas/accounts", {
        method: "POST",
        body: JSON.stringify({ name: "Conta Maliciosa Hacker", type: "checking", balanceCents: 50000 }),
      }, attackerToken);
      assert.equal(hAccRes.status, 201);
      hackerAccountId = hAccRes.data.data.id;

      // Cartão do Hacker
      const hCardRes = await api("/api/financas/cards", {
        method: "POST",
        body: JSON.stringify({
          accountId: hackerAccountId,
          name: "Cartão Hacker",
          brand: "Visa",
          closingDay: 1,
          dueDay: 10,
          creditLimitCents: 50000,
        }),
      }, attackerToken);
      assert.equal(hCardRes.status, 201);
      hackerCardId = hCardRes.data.data.id;

      // Categoria do Hacker
      const hCatRes = await api("/api/financas/categories", {
        method: "POST",
        body: JSON.stringify({ name: "Despesas Hacker", icon: "skull", color: "#ef4444", kind: "expense" }),
      }, attackerToken);
      assert.equal(hCatRes.status, 201);
      hackerCategoryId = hCatRes.data.data.id;

      // Dívida do Hacker
      const hDebtRes = await api("/api/financas/debts", {
        method: "POST",
        body: JSON.stringify({
          name: "VPN Hacker",
          amountCents: 5000,
          dueDay: 20,
          accountId: hackerAccountId,
          startMonth: "2026-09",
        }),
      }, attackerToken);
      assert.equal(hDebtRes.status, 201);
      hackerDebtId = hDebtRes.data.data.id;

      // Transação legítima do Hacker em seu próprio household
      const hTxRes = await api("/api/financas/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId: hackerAccountId,
          amountCents: 5000,
          transactionDate: "2026-09-12",
          description: "Gasto Próprio Hacker",
        }),
      }, attackerToken);
      assert.equal(hTxRes.status, 201);
      hackerTxId = hTxRes.data.data.transaction.id;
    });

    // -------------------------------------------------------------------------
    // CENÁRIO A: Usuário atacante de outro household tenta listar dados
    // -------------------------------------------------------------------------
    console.log("\n📌 [CENÁRIO A] Tentativa de listagem cruzada de transações, contas, dívidas e dashboard");

    await runStep("A.1: Atacante lista transações -> nunca recebe transações do household-principal", async () => {
      const res = await api("/api/financas/transactions", {}, attackerToken);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.data));

      const txList: any[] = res.data.data;
      assert.ok(
        !txList.some((t) => t.id === vicTxId || t.id === rebecaTxId),
        "Atacante NÃO DEVE receber transações do household-principal",
      );
      assert.ok(
        txList.every((t) => t.household_id === attackerHouseholdId),
        "Todas as transações retornadas devem ser estritamente do household-hacker",
      );
    });

    await runStep("A.2: Atacante lista contas -> nunca recebe contas do household-principal", async () => {
      const res = await api("/api/financas/accounts", {}, attackerToken);
      assert.equal(res.status, 200);
      const accounts: any[] = res.data.data;

      assert.ok(
        !accounts.some((a) => a.id === vicAccountId),
        "Atacante NÃO DEVE receber contas do household-principal",
      );
      assert.ok(
        accounts.every((a) => a.household_id === attackerHouseholdId || a.user_id === attackerHouseholdId),
        "Contas listadas devem pertencer unicamente ao atacante",
      );
    });

    await runStep("A.3: Atacante lista dívidas -> nunca recebe dívidas do household-principal", async () => {
      const res = await api("/api/financas/debts", {}, attackerToken);
      assert.equal(res.status, 200);
      const debts: any[] = res.data.data;

      assert.ok(
        !debts.some((d) => d.id === vicDebtId),
        "Atacante NÃO DEVE receber dívidas do household-principal",
      );
      assert.ok(
        debts.every((d) => d.household_id === attackerHouseholdId || d.user_id === attackerHouseholdId),
        "Dívidas listadas devem pertencer unicamente ao atacante",
      );
    });

    await runStep("A.4: Atacante consulta dashboard -> reflete 0 do household-principal", async () => {
      const res = await api("/api/financas/dashboard?month=2026-09", {}, attackerToken);
      assert.equal(res.status, 200);
      const dash = res.data.data;

      // O atacante tem apenas 1 transação de 5000 centavos em seu household
      assert.equal(dash.gastoMesCents, 5000, "Dashboard do atacante deve contabilizar apenas seus próprios 5000 centavos");
      assert.ok(
        !dash.gastosPorConta?.some((g: any) => g.accountId === vicAccountId),
        "Dashboard do atacante não pode conter contas do household-principal",
      );
      assert.ok(
        !dash.gastosPorCartao?.some((g: any) => g.cardId === vicCardId),
        "Dashboard do atacante não pode conter cartões do household-principal",
      );
    });

    // -------------------------------------------------------------------------
    // CENÁRIO B: Tentativa de GET /:id, PUT /:id, DELETE /:id em recursos do household-principal
    // -------------------------------------------------------------------------
    console.log("\n📌 [CENÁRIO B] Tentativa de GET /:id, PUT /:id e DELETE /:id em recursos do household-principal");

    await runStep("B.1: Tentativas hostis contra Transação do household-principal", async () => {
      // GET /:id
      const getRes = await api(`/api/financas/transactions/${vicTxId}`, {}, attackerToken);
      assert.equal(getRes.status, 404, "GET /transactions/:id de outro household deve retornar 404");

      // PUT /:id
      const putRes = await api(`/api/financas/transactions/${vicTxId}`, {
        method: "PUT",
        body: JSON.stringify({ 
          description: "HACKED TRANSACTION", 
          amountCents: 999999,
          accountId: hackerAccountId,
          categoryId: hackerCategoryId,
          transactionDate: "2026-09-12"
        }),
      }, attackerToken);
      assert.equal(putRes.status, 404, "PUT /transactions/:id de outro household deve retornar 404");

      // DELETE /:id
      const delRes = await api(`/api/financas/transactions/${vicTxId}`, {
        method: "DELETE",
      }, attackerToken);
      assert.equal(delRes.status, 404, "DELETE /transactions/:id de outro household deve retornar 404");

      // Checagem no banco de integridade
      const tx = await db.get("SELECT description, amount_cents FROM fin_transactions WHERE id = ?", vicTxId);
      assert.equal(tx.description, "Supermercado - Victor", "Descrição original da transação deve estar intacta");
      assert.equal(tx.amount_cents, 15000, "Valor original da transação deve estar intacto");
    });

    await runStep("B.2: Tentativas hostis contra Conta do household-principal", async () => {
      // GET /:id
      const getRes = await api(`/api/financas/accounts/${vicAccountId}`, {}, attackerToken);
      assert.equal(getRes.status, 404, "GET /accounts/:id de outro household deve retornar 404");

      // PUT /:id
      const putRes = await api(`/api/financas/accounts/${vicAccountId}`, {
        method: "PUT",
        body: JSON.stringify({ 
          name: "HACKED ACCOUNT", 
          balanceCents: 0,
          type: "checking"
        }),
      }, attackerToken);
      assert.equal(putRes.status, 404, "PUT /accounts/:id de outro household deve retornar 404");

      // DELETE /:id
      const delRes = await api(`/api/financas/accounts/${vicAccountId}`, {
        method: "DELETE",
      }, attackerToken);
      assert.equal(delRes.status, 404, "DELETE /accounts/:id de outro household deve retornar 404");

      // Integridade no banco
      const acc = await db.get("SELECT name, balance_cents FROM fin_accounts WHERE id = ?", vicAccountId);
      assert.equal(acc.name, "Conta Segura Victor", "Nome da conta original deve estar intacto");
      assert.equal(acc.balance_cents, 1000000, "Saldo original da conta deve estar intacto");
    });

    await runStep("B.3: Tentativas hostis contra Cartão do household-principal", async () => {
      // GET /:id
      const getRes = await api(`/api/financas/cards/${vicCardId}`, {}, attackerToken);
      assert.equal(getRes.status, 404, "GET /cards/:id de outro household deve retornar 404");

      // PUT /:id
      const putRes = await api(`/api/financas/cards/${vicCardId}`, {
        method: "PUT",
        body: JSON.stringify({ 
          name: "HACKED CARD", 
          creditLimitCents: 0,
          accountId: hackerAccountId,
          brand: "Visa",
          closingDay: 1,
          dueDay: 10
        }),
      }, attackerToken);
      assert.equal(putRes.status, 404, "PUT /cards/:id de outro household deve retornar 404");

      // DELETE /:id
      const delRes = await api(`/api/financas/cards/${vicCardId}`, {
        method: "DELETE",
      }, attackerToken);
      assert.equal(delRes.status, 404, "DELETE /cards/:id de outro household deve retornar 404");

      // Integridade no banco
      const card = await db.get("SELECT name FROM fin_cards WHERE id = ?", vicCardId);
      assert.equal(card.name, "Black Victor", "Cartão deve permanecer intacto");
    });

    await runStep("B.4: Tentativas hostis contra Dívida do household-principal", async () => {
      // GET /:id
      const getRes = await api(`/api/financas/debts/${vicDebtId}`, {}, attackerToken);
      assert.equal(getRes.status, 404, "GET /debts/:id de outro household deve retornar 404");

      // PUT /:id
      const putRes = await api(`/api/financas/debts/${vicDebtId}`, {
        method: "PUT",
        body: JSON.stringify({ 
          name: "HACKED DEBT", 
          amountCents: 1,
          dueDay: 20,
          accountId: hackerAccountId,
          startMonth: "2026-09"
        }),
      }, attackerToken);
      assert.equal(putRes.status, 404, "PUT /debts/:id de outro household deve retornar 404");

      // DELETE /:id
      const delRes = await api(`/api/financas/debts/${vicDebtId}`, {
        method: "DELETE",
      }, attackerToken);
      assert.equal(delRes.status, 404, "DELETE /debts/:id de outro household deve retornar 404");

      // Integridade no banco
      const debt = await db.get("SELECT name, amount_cents FROM fin_debts WHERE id = ?", vicDebtId);
      assert.equal(debt.name, "Internet Fibra Casal", "Dívida deve permanecer intacta");
      assert.equal(debt.amount_cents, 14990, "Valor da dívida deve permanecer intacto");
    });

    await runStep("B.5: Tentativas hostis contra Categoria do household-principal", async () => {
      // GET /:id
      const getRes = await api(`/api/financas/categories/${vicCategoryId}`, {}, attackerToken);
      assert.equal(getRes.status, 404, "GET /categories/:id de outro household deve retornar 404");

      // PUT /:id
      const putRes = await api(`/api/financas/categories/${vicCategoryId}`, {
        method: "PUT",
        body: JSON.stringify({ 
          name: "HACKED CATEGORY", 
          color: "#000000",
          icon: "skull",
          kind: "expense"
        }),
      }, attackerToken);
      assert.equal(putRes.status, 404, "PUT /categories/:id de outro household deve retornar 404");

      // DELETE /:id
      const delRes = await api(`/api/financas/categories/${vicCategoryId}`, {
        method: "DELETE",
      }, attackerToken);
      assert.equal(delRes.status, 404, "DELETE /categories/:id de outro household deve retornar 404");

      // Integridade no banco
      const cat = await db.get("SELECT name FROM fin_categories WHERE id = ?", vicCategoryId);
      assert.equal(cat.name, "Alimentação Principal", "Categoria deve permanecer intacta");
    });

    // -------------------------------------------------------------------------
    // CENÁRIO C: Injeção de householdId no body ignorada pela API
    // -------------------------------------------------------------------------
    console.log("\n📌 [CENÁRIO C] Injeção forjada de householdId no JSON body de criação");

    await runStep("Atacante envia householdId: 'household-principal' -> gravado estritamente em 'household-hacker'", async () => {
      const res = await api("/api/financas/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId: hackerAccountId,
          amountCents: 12345,
          transactionDate: "2026-09-12",
          description: "Tentativa Injeção householdId",
          householdId: "household-principal", // Payload malicioso
        }),
      }, attackerToken);

      assert.equal(res.status, 201, "Criação deve responder 201");
      const createdTxId = res.data.data.transaction.id;
      assert.ok(createdTxId > 0);

      // Verificação direta no banco SQLite
      const row = await db.get<{ household_id: string; user_id: string }>(
        "SELECT household_id, user_id FROM fin_transactions WHERE id = ?",
        createdTxId,
      );

      assert.equal(
        row?.household_id,
        attackerHouseholdId,
        `household_id no banco deve ser '${attackerHouseholdId}', JAMAIS 'household-principal'`,
      );

      // Garantir que Victor não vê esta transação
      const checkVicList = await api("/api/financas/transactions", {}, victorToken);
      assert.ok(
        !checkVicList.data.data.some((t: any) => t.id === createdTxId),
        "Transação do atacante NÃO PODE aparecer para o household-principal",
      );
    });

    // -------------------------------------------------------------------------
    // CENÁRIO D: Injeção de userId no body para tentar forjar autor
    // -------------------------------------------------------------------------
    console.log("\n📌 [CENÁRIO D] Tentativa de forjar autor enviando userId: 'vssousa' no body");

    await runStep("Atacante envia userId: 'vssousa' -> registrado o user_id real do token autenticado", async () => {
      const res = await api("/api/financas/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId: hackerAccountId,
          amountCents: 54321,
          transactionDate: "2026-09-12",
          description: "Tentativa Forja de Autor",
          userId: "vssousa", // Payload malicioso para culpar Victor
        }),
      }, attackerToken);

      assert.equal(res.status, 201, "Criação deve responder 201");
      const createdTxId = res.data.data.transaction.id;
      assert.ok(createdTxId > 0);

      // Verificação direta no banco SQLite
      const row = await db.get<{ user_id: string; household_id: string }>(
        "SELECT user_id, household_id FROM fin_transactions WHERE id = ?",
        createdTxId,
      );

      assert.equal(
        row?.user_id,
        attackerUserId,
        `user_id gravado no banco deve ser '${attackerUserId}', JAMAIS 'vssousa'`,
      );

      // Garantir que não existe transação forjada atribuída a Victor
      const forgedRow = await db.get(
        "SELECT id FROM fin_transactions WHERE user_id = 'vssousa' AND description = 'Tentativa Forja de Autor'",
      );
      assert.equal(forgedRow, undefined, "Não deve existir transação atribuída a 'vssousa' com a descrição maliciosa");
    });

    // -------------------------------------------------------------------------
    // CENÁRIO E: Tentativa de vincular accountId, cardId ou categoryId de outro household
    // -------------------------------------------------------------------------
    console.log("\n📌 [CENÁRIO E] Atacante tenta apontar para conta, cartão ou categoria de outro household");

    await runStep("E.1: Atacante aponta accountId do household-principal -> 404 Conta não encontrada", async () => {
      const res = await api("/api/financas/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId: vicAccountId, // Conta de outro household
          amountCents: 7777,
          transactionDate: "2026-09-12",
          description: "Ataque com accountId alheio",
        }),
      }, attackerToken);

      assert.equal(res.status, 404, "Deve retornar 404 quando accountId não pertencer ao household");
      assert.ok(
        String(res.data?.error?.message || res.data?.message).includes("Conta não encontrada"),
        "Mensagem de erro deve especificar 'Conta não encontrada'",
      );
    });

    await runStep("E.2: Atacante usa sua própria conta, mas aponta cardId do household-principal -> 404 Cartão não encontrado", async () => {
      const res = await api("/api/financas/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId: hackerAccountId, // Conta legítima do hacker
          cardId: vicCardId,          // Cartão de outro household
          amountCents: 8888,
          transactionDate: "2026-09-12",
          description: "Ataque com cardId alheio",
        }),
      }, attackerToken);

      assert.equal(res.status, 404, "Deve retornar 404 quando cardId não pertencer ao household");
      assert.ok(
        String(res.data?.error?.message || res.data?.message).includes("Cartão não encontrado"),
        "Mensagem de erro deve especificar 'Cartão não encontrado'",
      );
    });

    await runStep("E.3: Atacante usa sua conta, mas aponta categoryId do household-principal -> 404 Categoria não encontrada", async () => {
      const res = await api("/api/financas/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId: hackerAccountId, // Conta legítima do hacker
          categoryId: vicCategoryId, // Categoria de outro household
          amountCents: 9999,
          transactionDate: "2026-09-12",
          description: "Ataque com categoryId alheio",
        }),
      }, attackerToken);

      assert.equal(res.status, 404, "Deve retornar 404 quando categoryId não pertencer ao household");
      assert.ok(
        String(res.data?.error?.message || res.data?.message).includes("Categoria não encontrada"),
        "Mensagem de erro deve especificar 'Categoria não encontrada'",
      );
    });

    await runStep("E.4: Atacante tenta atualizar sua transação para conta alheia -> bloqueado com 400 ou 404", async () => {
      const res = await api(`/api/financas/transactions/${hackerTxId}`, {
        method: "PUT",
        body: JSON.stringify({
          accountId: vicAccountId,
          amountCents: 5000,
          transactionDate: "2026-09-12",
          description: "Gasto Próprio Hacker",
        }),
      }, attackerToken);

      assert.ok(
        res.status === 400 || res.status === 404,
        `Atualização para conta alheia deve retornar 400 ou 404, recebeu HTTP ${res.status}`,
      );
    });

    // -------------------------------------------------------------------------
    // CENÁRIO F: Victor e Rebeca (mesmo household) continuam compartilhando dados
    // -------------------------------------------------------------------------
    console.log("\n📌 [CENÁRIO F] Colaboração mútua no mesmo household (Victor cria, Rebeca edita/vê e vice-versa)");

    await runStep("F.1: Victor cria transação -> Rebeca consulta e altera com sucesso", async () => {
      // 1. Victor cria transação
      const createRes = await api("/api/financas/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId: vicAccountId,
          categoryId: vicCategoryId,
          amountCents: 3500,
          transactionDate: "2026-09-12",
          description: "Padaria - Criada por Victor",
        }),
      }, victorToken);
      assert.equal(createRes.status, 201);
      const sharedTxId = createRes.data.data.transaction.id;

      // 2. Rebeca consulta pelo ID
      const getRes = await api(`/api/financas/transactions/${sharedTxId}`, {}, rebecaToken);
      assert.equal(getRes.status, 200, "Rebeca deve conseguir consultar transação do Victor via GET /:id");
      assert.equal(getRes.data.data.description, "Padaria - Criada por Victor");

      // 3. Rebeca edita a transação
      const updateRes = await api(`/api/financas/transactions/${sharedTxId}`, {
        method: "PUT",
        body: JSON.stringify({
          description: "Padaria - Editada por Rebeca",
          accountId: vicAccountId,
          categoryId: vicCategoryId,
          amountCents: 3500,
          transactionDate: "2026-09-12"
        }),
      }, rebecaToken);
      assert.equal(updateRes.status, 200, "Rebeca deve conseguir editar transação do Victor via PUT /:id");

      // 4. Victor consulta e vê alteração feita por Rebeca
      const vGetRes = await api(`/api/financas/transactions/${sharedTxId}`, {}, victorToken);
      assert.equal(vGetRes.status, 200);
      assert.equal(vGetRes.data.data.description, "Padaria - Editada por Rebeca");
    });

    await runStep("F.2: Rebeca cria transação -> Victor consulta e altera com sucesso", async () => {
      // 1. Rebeca cria transação
      const createRes = await api("/api/financas/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId: vicAccountId,
          categoryId: vicCategoryId,
          amountCents: 4200,
          transactionDate: "2026-09-12",
          description: "Livraria - Criada por Rebeca",
        }),
      }, rebecaToken);
      assert.equal(createRes.status, 201);
      const sharedTxId = createRes.data.data.transaction.id;

      // 2. Victor consulta pelo ID
      const getRes = await api(`/api/financas/transactions/${sharedTxId}`, {}, victorToken);
      assert.equal(getRes.status, 200, "Victor deve conseguir consultar transação da Rebeca via GET /:id");
      assert.equal(getRes.data.data.description, "Livraria - Criada por Rebeca");

      // 3. Victor edita a transação
      const updateRes = await api(`/api/financas/transactions/${sharedTxId}`, {
        method: "PUT",
        body: JSON.stringify({
          description: "Livraria - Editada por Victor",
          accountId: vicAccountId,
          categoryId: vicCategoryId,
          amountCents: 4200,
          transactionDate: "2026-09-12"
        }),
      }, victorToken);
      assert.equal(updateRes.status, 200, "Victor deve conseguir editar transação da Rebeca via PUT /:id");

      // 4. Rebeca consulta e vê alteração feita por Victor
      const rGetRes = await api(`/api/financas/transactions/${sharedTxId}`, {}, rebecaToken);
      assert.equal(rGetRes.status, 200);
      assert.equal(rGetRes.data.data.description, "Livraria - Editada por Victor");
    });

    await runStep("F.3: Compartilhamento de Contas e Cartões entre Victor e Rebeca", async () => {
      // Rebeca consulta a conta criada por Victor
      const accGet = await api(`/api/financas/accounts/${vicAccountId}`, {}, rebecaToken);
      assert.equal(accGet.status, 200, "Rebeca deve conseguir acessar conta criada por Victor");
      assert.equal(accGet.data.data.name, "Conta Segura Victor");

      // Rebeca atualiza o nome da conta compartilhada
      const accPut = await api(`/api/financas/accounts/${vicAccountId}`, {
        method: "PUT",
        body: JSON.stringify({ 
          name: "Conta Principal Casal (Victor & Rebeca)",
          type: "checking",
          balanceCents: 1000000 
        }),
      }, rebecaToken);
      assert.equal(accPut.status, 200);

      // Victor confirma a alteração
      const vAccGet = await api(`/api/financas/accounts/${vicAccountId}`, {}, victorToken);
      assert.equal(vAccGet.status, 200);
      assert.equal(vAccGet.data.data.name, "Conta Principal Casal (Victor & Rebeca)");

      // Rebeca consulta o cartão criado por Victor
      const cardGet = await api(`/api/financas/cards/${vicCardId}`, {}, rebecaToken);
      assert.equal(cardGet.status, 200, "Rebeca deve conseguir acessar cartão criado por Victor");
      assert.equal(cardGet.data.data.name, "Black Victor");

      // Rebeca atualiza o limite do cartão
      const cardPut = await api(`/api/financas/cards/${vicCardId}`, {
        method: "PUT",
        body: JSON.stringify({ 
          creditLimitCents: 3000000,
          accountId: vicAccountId,
          name: "Black Victor",
          brand: "Mastercard",
          closingDay: 5,
          dueDay: 12
        }),
      }, rebecaToken);
      assert.equal(cardPut.status, 200);

      // Victor confirma novo limite
      const vCardGet = await api(`/api/financas/cards/${vicCardId}`, {}, victorToken);
      assert.equal(vCardGet.status, 200);
      assert.equal(vCardGet.data.data.credit_limit_cents, 3000000);
    });

    await runStep("F.4: Compartilhamento de Categorias e Dívidas Recorrentes entre Victor e Rebeca", async () => {
      // Rebeca consulta a categoria criada por Victor
      const catGet = await api(`/api/financas/categories/${vicCategoryId}`, {}, rebecaToken);
      assert.equal(catGet.status, 200, "Rebeca deve acessar categoria do Victor");

      // Rebeca edita a categoria
      const catPut = await api(`/api/financas/categories/${vicCategoryId}`, {
        method: "PUT",
        body: JSON.stringify({ 
          name: "Alimentação & Mercado Casal", 
          color: "#059669",
          icon: "utensils", 
          kind: "expense"
        }),
      }, rebecaToken);
      assert.equal(catPut.status, 200);

      // Victor vê nova categoria
      const vCatGet = await api(`/api/financas/categories/${vicCategoryId}`, {}, victorToken);
      assert.equal(vCatGet.status, 200);
      assert.equal(vCatGet.data.data.name, "Alimentação & Mercado Casal");

      // Rebeca consulta dívida do Victor
      const debtGet = await api(`/api/financas/debts/${vicDebtId}`, {}, rebecaToken);
      assert.equal(debtGet.status, 200, "Rebeca deve acessar dívida do Victor");

      // Rebeca atualiza o valor da dívida
      const debtPut = await api(`/api/financas/debts/${vicDebtId}`, {
        method: "PUT",
        body: JSON.stringify({ 
          amountCents: 15990,
          name: "Internet Fibra Casal",
          dueDay: 15,
          accountId: vicAccountId,
          categoryId: vicCategoryId,
          startMonth: "2026-09"
        }),
      }, rebecaToken);
      assert.equal(debtPut.status, 200);

      // Victor confirma novo valor da dívida
      const vDebtGet = await api(`/api/financas/debts/${vicDebtId}`, {}, victorToken);
      assert.equal(vDebtGet.status, 200);
      assert.equal(vDebtGet.data.data.amount_cents, 15990);
    });

    console.log("\n=======================================================================");
    console.log("🛡️  TODOS OS TESTES ADVERSARIAIS E DE ISOLAMENTO PASSARAM COM SUCESSO!");
    console.log(`📊 Estatísticas: ${stats.passed} passos executados, 0 falhas.`);
    console.log("=======================================================================");
  } finally {
    // Cleanup de dados do atacante
    try {
      await db.run("DELETE FROM fin_transactions WHERE household_id = ?", attackerHouseholdId);
      await db.run("DELETE FROM fin_debt_payments WHERE user_id = ?", attackerUserId);
      await db.run("DELETE FROM fin_debt_occurrences WHERE user_id = ?", attackerUserId);
      await db.run("DELETE FROM fin_debts WHERE household_id = ?", attackerHouseholdId);
      await db.run("DELETE FROM fin_cards WHERE household_id = ?", attackerHouseholdId);
      await db.run("DELETE FROM fin_accounts WHERE household_id = ?", attackerHouseholdId);
      await db.run("DELETE FROM fin_categories WHERE household_id = ?", attackerHouseholdId);
    } catch {
      // ignore
    }
    // Cleanup do servidor de testes
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// Execução direta via tsx
runSecurityAdversarialTests().catch((err) => {
  console.error("\n❌ ERRO FATAL NA EXECUÇÃO DOS TESTES ADVERSARIAIS:", err);
  process.exit(1);
});
