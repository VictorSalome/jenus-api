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

export async function runHouseholdMultiuserTests() {
  console.log("=======================================================================");
  console.log("🚀 SUÍTE DE TESTES: MULTIUSUÁRIO E FINANÇAS COMPARTILHADAS (HOUSEHOLD)");
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
      ...(options.headers as Record<string, string> || {}),
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
  let victorToken: string = "";
  let victorUserId: string = "";
  let victorHouseholdId: string = "";

  let rebecaToken: string = "";
  let rebecaUserId: string = "";
  let rebecaHouseholdId: string = "";

  let sharedAccountId: number = 0;
  let sharedCategoryId: number = 0;
  let victorTxId: number = 0;
  let rebecaTxId: number = 0;
  let victorCreatedAccountId: number = 0;
  let rebecaCreatedCategoryId: number = 0;

  try {
    // -------------------------------------------------------------------------
    // 1. LOGIN DO VICTOR
    // -------------------------------------------------------------------------
    console.log("📌 [1/11] Login do Victor e validação do JWT com householdId e userId");
    await runStep("Autenticação de Victor via POST /api/auth/login", async () => {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "vssousa",
          password: "Iphone5s.@",
        }),
      });

      assert.equal(res.status, 200, "Login do Victor deve retornar HTTP 200");
      assert.equal(res.data.success, true, "Campo success deve ser true");
      assert.ok(res.data.accessToken, "Deve retornar accessToken");

      victorToken = res.data.accessToken;

      const decoded = verifyAccessToken(victorToken);
      assert.ok(decoded, "Token JWT do Victor deve ser decodificável");
      assert.equal(decoded.userId, "vssousa", "userId no JWT deve ser 'vssousa'");
      assert.equal(decoded.householdId, "household-principal", "householdId no JWT deve ser 'household-principal'");
      assert.equal(decoded.name, "Victor", "name no JWT deve ser 'Victor'");
      assert.equal(decoded.role, "admin", "role do Victor deve ser 'admin'");

      victorUserId = decoded.userId;
      victorHouseholdId = decoded.householdId;
    });

    // -------------------------------------------------------------------------
    // 2. LOGIN DA REBECA
    // -------------------------------------------------------------------------
    console.log("📌 [2/11] Login da Rebeca e validação do MESMO householdId");
    await runStep("Autenticação de Rebeca ('rcoelhorss' / 'leandroreis') via POST /api/auth/login", async () => {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: "rcoelhorss",
          password: "leandroreis",
        }),
      });

      assert.equal(res.status, 200, "Login da Rebeca deve retornar HTTP 200");
      assert.equal(res.data.success, true, "Campo success deve ser true");
      assert.ok(res.data.accessToken, "Deve retornar accessToken para Rebeca");

      rebecaToken = res.data.accessToken;

      const decoded = verifyAccessToken(rebecaToken);
      assert.ok(decoded, "Token JWT da Rebeca deve ser decodificável");
      assert.equal(decoded.userId, "rcoelhorss", "userId no JWT deve ser 'rcoelhorss'");
      assert.equal(decoded.householdId, "household-principal", "householdId no JWT deve ser 'household-principal'");
      assert.equal(decoded.name, "Rebeca", "name no JWT deve ser 'Rebeca'");
      assert.equal(decoded.householdId, victorHouseholdId, "Rebeca e Victor devem pertencer ao MESMO householdId");

      rebecaUserId = decoded.userId;
      rebecaHouseholdId = decoded.householdId;
    });

    // Setup de Conta e Categoria base para os testes de transações
    await runStep("Garantir conta e categoria ativas no household", async () => {
      const accRes = await api("/api/financas/accounts", {}, victorToken);
      if (accRes.data?.data?.length > 0) {
        sharedAccountId = accRes.data.data[0].id;
      } else {
        const createdAcc = await api("/api/financas/accounts", {
          method: "POST",
          body: JSON.stringify({ name: "Conta Corrente Casal", type: "checking" }),
        }, victorToken);
        sharedAccountId = createdAcc.data.data.id;
      }

      const catRes = await api("/api/financas/categories", {}, victorToken);
      if (catRes.data?.data?.length > 0) {
        sharedCategoryId = catRes.data.data[0].id;
      } else {
        const createdCat = await api("/api/financas/categories", {
          method: "POST",
          body: JSON.stringify({ name: "Alimentação Casal", kind: "expense" }),
        }, victorToken);
        sharedCategoryId = createdCat.data.data.id;
      }

      assert.ok(sharedAccountId > 0, "ID da conta compartilhada deve ser válido");
      assert.ok(sharedCategoryId > 0, "ID da categoria compartilhada deve ser válido");
    });

    // -------------------------------------------------------------------------
    // 3. VICTOR CRIA UMA TRANSAÇÃO
    // -------------------------------------------------------------------------
    console.log("📌 [3/11] Victor cria uma transação (verificação de user_id e household_id no banco)");
    await runStep("Victor registra transação de débito via POST /api/financas/transactions", async () => {
      const res = await api("/api/financas/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId: sharedAccountId,
          categoryId: sharedCategoryId,
          amountCents: 15000, // R$ 150,00
          type: "debit",
          transactionDate: "2026-09-12",
          description: "Supermercado - Compra do Victor",
        }),
      }, victorToken);

      assert.equal(res.status, 201, "Criação de transação deve retornar HTTP 201");
      assert.equal(res.data.success, true, "Campo success deve ser true");
      assert.ok(res.data.data?.transaction?.id, "ID da transação deve ser retornado");

      victorTxId = res.data.data.transaction.id;

      // Validação direta no banco SQLite
      const row = await db.get(
        "SELECT id, user_id, household_id, amount_cents, description FROM fin_transactions WHERE id = ?",
        victorTxId,
      );

      assert.ok(row, "Transação deve existir na tabela fin_transactions");
      assert.equal(row.user_id, victorUserId, `user_id gravado no banco deve ser '${victorUserId}'`);
      assert.equal(row.household_id, "household-principal", "household_id gravado no banco deve ser 'household-principal'");
      assert.equal(row.amount_cents, 15000, "Valor em centavos deve ser 15000");
    });

    // -------------------------------------------------------------------------
    // 4. REBECA LISTA TRANSAÇÕES E VÊ A TRANSAÇÃO DO VICTOR COM user_name = 'Victor'
    // -------------------------------------------------------------------------
    console.log("📌 [4/11] Rebeca lista transações e visualiza transação do Victor com user_name = 'Victor'");
    await runStep("Rebeca consulta GET /api/financas/transactions", async () => {
      const res = await api("/api/financas/transactions", {}, rebecaToken);

      assert.equal(res.status, 200, "Rebeca deve conseguir listar transações (HTTP 200)");
      assert.ok(Array.isArray(res.data?.data), "data deve ser um array");

      const txVictor = res.data.data.find((t: any) => t.id === victorTxId);
      assert.ok(txVictor, "Rebeca deve encontrar a transação criada pelo Victor");
      assert.equal(txVictor.user_name, "Victor", "user_name da transação deve ser 'Victor'");
      assert.equal(txVictor.user_id, victorUserId, `user_id da transação deve ser '${victorUserId}'`);
      assert.equal(txVictor.household_id, "household-principal", "household_id deve ser 'household-principal'");
    });

    // -------------------------------------------------------------------------
    // 5. REBECA CRIA UMA TRANSAÇÃO
    // -------------------------------------------------------------------------
    console.log("📌 [5/11] Rebeca cria uma transação (verificação de user_id e household_id no banco)");
    await runStep("Rebeca registra transação de débito via POST /api/financas/transactions", async () => {
      const res = await api("/api/financas/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId: sharedAccountId,
          categoryId: sharedCategoryId,
          amountCents: 8500, // R$ 85,00
          type: "debit",
          transactionDate: "2026-09-12",
          description: "Farmácia - Compra da Rebeca",
        }),
      }, rebecaToken);

      assert.equal(res.status, 201, "Criação de transação pela Rebeca deve retornar HTTP 201");
      assert.equal(res.data.success, true, "Campo success deve ser true");
      assert.ok(res.data.data?.transaction?.id, "ID da transação deve ser retornado");

      rebecaTxId = res.data.data.transaction.id;

      // Validação direta no banco SQLite
      const row = await db.get(
        "SELECT id, user_id, household_id, amount_cents, description FROM fin_transactions WHERE id = ?",
        rebecaTxId,
      );

      assert.ok(row, "Transação da Rebeca deve existir na tabela fin_transactions");
      assert.equal(row.user_id, rebecaUserId, `user_id gravado no banco deve ser '${rebecaUserId}'`);
      assert.equal(row.household_id, "household-principal", "household_id gravado no banco deve ser 'household-principal'");
      assert.equal(row.amount_cents, 8500, "Valor em centavos deve ser 8500");
    });

    // -------------------------------------------------------------------------
    // 6. VICTOR LISTA TRANSAÇÕES E VÊ AMBAS (DELE E DA REBECA)
    // -------------------------------------------------------------------------
    console.log("📌 [6/11] Victor lista transações e vê ambas as transações (dele e da Rebeca)");
    await runStep("Victor consulta GET /api/financas/transactions", async () => {
      const res = await api("/api/financas/transactions", {}, victorToken);

      assert.equal(res.status, 200, "Victor deve conseguir listar transações (HTTP 200)");
      assert.ok(Array.isArray(res.data?.data), "data deve ser um array");

      const myTx = res.data.data.find((t: any) => t.id === victorTxId);
      const herTx = res.data.data.find((t: any) => t.id === rebecaTxId);

      assert.ok(myTx, "Victor deve encontrar a sua própria transação");
      assert.equal(myTx.user_name, "Victor", "Transação do Victor deve ter user_name 'Victor'");

      assert.ok(herTx, "Victor deve encontrar a transação da Rebeca");
      assert.equal(herTx.user_name, "Rebeca", "Transação da Rebeca deve ter user_name 'Rebeca'");
      assert.equal(herTx.user_id, rebecaUserId, `user_id da transação deve ser '${rebecaUserId}'`);
    });

    // -------------------------------------------------------------------------
    // 7. FILTRO POR AUTOR (userId = Victor ou userId = Rebeca)
    // -------------------------------------------------------------------------
    console.log("📌 [7/11] Filtro por autor (userId = Victor ou userId = Rebeca)");
    await runStep("Filtro por autor via query param ?userId=", async () => {
      // Filtrar por Victor
      const filterVictor = await api(`/api/financas/transactions?userId=${victorUserId}`, {}, rebecaToken);
      assert.equal(filterVictor.status, 200, "Filtro por Victor deve retornar HTTP 200");
      const listVictor = filterVictor.data.data;
      assert.ok(listVictor.some((t: any) => t.id === victorTxId), "Lista filtrada pelo Victor DEVE conter a transação do Victor");
      assert.ok(!listVictor.some((t: any) => t.id === rebecaTxId), "Lista filtrada pelo Victor NÃO DEVE conter a transação da Rebeca");
      assert.ok(listVictor.every((t: any) => t.user_id === victorUserId), "Todos os itens devem pertencer a Victor");

      // Filtrar por Rebeca
      const filterRebeca = await api(`/api/financas/transactions?userId=${rebecaUserId}`, {}, victorToken);
      assert.equal(filterRebeca.status, 200, "Filtro por Rebeca deve retornar HTTP 200");
      const listRebeca = filterRebeca.data.data;
      assert.ok(listRebeca.some((t: any) => t.id === rebecaTxId), "Lista filtrada pela Rebeca DEVE conter a transação da Rebeca");
      assert.ok(!listRebeca.some((t: any) => t.id === victorTxId), "Lista filtrada pela Rebeca NÃO DEVE conter a transação do Victor");
      assert.ok(listRebeca.every((t: any) => t.user_id === rebecaUserId), "Todos os itens devem pertencer a Rebeca");
    });

    // -------------------------------------------------------------------------
    // 8. CONTAS E CATEGORIAS COMPARTILHADAS
    // -------------------------------------------------------------------------
    console.log("📌 [8/11] Contas e categorias criadas por um são acessíveis pelo outro no mesmo household");
    await runStep("Victor cria conta e Rebeca acessa; Rebeca cria categoria e Victor acessa", async () => {
      // Victor cria conta
      const createAccRes = await api("/api/financas/accounts", {
        method: "POST",
        body: JSON.stringify({
          name: "Reserva Conjunta Criada por Victor",
          type: "savings",
          bank: "Nubank",
          balanceCents: 500000,
        }),
      }, victorToken);

      assert.equal(createAccRes.status, 201, "Victor deve criar conta com status 201");
      victorCreatedAccountId = createAccRes.data.data.id;

      // Rebeca lista contas e vê a conta criada por Victor
      const rebecaAccRes = await api("/api/financas/accounts", {}, rebecaToken);
      assert.equal(rebecaAccRes.status, 200, "Rebeca lista contas com status 200");
      const accFoundByRebeca = rebecaAccRes.data.data.find((a: any) => a.id === victorCreatedAccountId);
      assert.ok(accFoundByRebeca, "Rebeca DEVE ter acesso à conta criada por Victor no mesmo household");
      assert.equal(accFoundByRebeca.name, "Reserva Conjunta Criada por Victor");

      // Rebeca cria categoria
      const createCatRes = await api("/api/financas/categories", {
        method: "POST",
        body: JSON.stringify({
          name: "Lazer da Família Criado por Rebeca",
          icon: "sun",
          color: "#f59e0b",
          kind: "expense",
        }),
      }, rebecaToken);

      assert.equal(createCatRes.status, 201, "Rebeca deve criar categoria com status 201");
      rebecaCreatedCategoryId = createCatRes.data.data.id;

      // Victor lista categorias e vê a categoria criada por Rebeca
      const victorCatRes = await api("/api/financas/categories", {}, victorToken);
      assert.equal(victorCatRes.status, 200, "Victor lista categorias com status 200");
      const catFoundByVictor = victorCatRes.data.data.find((c: any) => c.id === rebecaCreatedCategoryId);
      assert.ok(catFoundByVictor, "Victor DEVE ter acesso à categoria criada por Rebeca no mesmo household");
      assert.equal(catFoundByVictor.name, "Lazer da Família Criado por Rebeca");
    });

    // -------------------------------------------------------------------------
    // 9. DASHBOARD CONSOLIDA OS GASTOS DE AMBOS OS USUÁRIOS
    // -------------------------------------------------------------------------
    console.log("📌 [9/11] Dashboard consolida os gastos de ambos os usuários do household");
    await runStep("GET /api/financas/dashboard consolida Victor + Rebeca", async () => {
      const refMonth = "2026-09";
      const dashVictor = await api(`/api/financas/dashboard?month=${refMonth}`, {}, victorToken);
      assert.equal(dashVictor.status, 200, "Dashboard para Victor deve retornar 200");

      const dashRebeca = await api(`/api/financas/dashboard?month=${refMonth}`, {}, rebecaToken);
      assert.equal(dashRebeca.status, 200, "Dashboard para Rebeca deve retornar 200");

      const gastoMesVictor = dashVictor.data.data.gastoMesCents;
      const gastoMesRebeca = dashRebeca.data.data.gastoMesCents;

      // Ambos os membros devem ver o mesmo montante consolidado do cofre
      assert.equal(gastoMesVictor, gastoMesRebeca, "Ambos os membros devem ver exatamente o mesmo gasto do mês");

      // Total no banco para o mês de 2026-09
      const dbSumRow = await db.get<{ total: number }>(
        `SELECT COALESCE(SUM(amount_cents), 0) as total
           FROM fin_transactions
          WHERE household_id = 'household-principal'
            AND transaction_date BETWEEN '2026-09-01' AND '2026-09-30'
            AND status != 'CANCELLED' AND type = 'debit'`,
      );
      const expectedDbTotal = dbSumRow?.total ?? 0;

      assert.equal(gastoMesVictor, expectedDbTotal, "Dashboard deve refletir a soma exata de fin_transactions do household");
      assert.ok(
        gastoMesVictor >= (15000 + 8500),
        `Total consolidado (${gastoMesVictor}) deve incluir ao menos a soma das duas transações do teste (23500)`,
      );

      // Validação de gastosPorMembro
      assert.ok(Array.isArray(dashVictor.data.data.gastosPorMembro), "gastosPorMembro deve ser um array");
      assert.ok(dashVictor.data.data.gastosPorMembro.length >= 2, "gastosPorMembro deve conter Victor e Rebeca");
      const victorMembro = dashVictor.data.data.gastosPorMembro.find((m: any) => m.user_id === victorUserId);
      const rebecaMembro = dashVictor.data.data.gastosPorMembro.find((m: any) => m.user_id === rebecaUserId);
      assert.ok(victorMembro, "Victor deve estar em gastosPorMembro");
      assert.ok(rebecaMembro, "Rebeca deve estar em gastosPorMembro");
      assert.equal(victorMembro.name, "Victor");
      assert.equal(rebecaMembro.name, "Rebeca");
      assert.ok(victorMembro.total_cents >= 15000, "Gasto do Victor deve ser >= 15000");
      assert.ok(rebecaMembro.total_cents >= 8500, "Gasto da Rebeca deve ser >= 8500");
      assert.ok(typeof victorMembro.percentage === "number", "Percentual do Victor deve ser number");
      assert.ok(typeof rebecaMembro.percentage === "number", "Percentual da Rebeca deve ser number");

      // Validação de faturas (invoices) com members
      const invRes = await api("/api/financas/invoices", {}, victorToken);
      assert.equal(invRes.status, 200, "Listagem de faturas deve retornar 200");
      assert.ok(Array.isArray(invRes.data.data), "Faturas deve retornar array");
      for (const inv of invRes.data.data) {
        assert.ok(Array.isArray(inv.members), "Fatura deve conter array de members");
      }

      // Validação de dívidas fixas (debts occurrences) com paid_by_name
      const debtsOccRes = await api(`/api/financas/debts/occurrences?month=${refMonth}`, {}, victorToken);
      assert.equal(debtsOccRes.status, 200, "Listagem de ocorrências de dívida deve retornar 200");
      assert.ok(Array.isArray(debtsOccRes.data.data.occurrences), "Ocorrências deve ser array");
      for (const occ of debtsOccRes.data.data.occurrences) {
        assert.ok("paid_by_name" in occ, "Ocorrência deve conter paid_by_name");
        assert.ok(Array.isArray(occ.payments), "Ocorrência deve conter payments array");
      }
    });

    // -------------------------------------------------------------------------
    // 10. PROTEÇÃO DE SEGURANÇA: USUÁRIO DE OUTRO HOUSEHOLD NÃO TEM ACESSO
    // -------------------------------------------------------------------------
    console.log("📌 [10/11] Proteção de isolamento multi-tenant (household fictício não acessa nem altera household-principal)");
    await runStep("Intruso de outro household é bloqueado em leitura e escrita", async () => {
      // Gera JWT válido de outro household isolado
      const intruderToken = jwt.sign(
        {
          userId: "hacker-user-isolated",
          email: "hacker@ficticio.local",
          role: "user",
          name: "Intruso",
          householdId: "household-ficticio-isolado",
        },
        config.JWT_ACCESS_SECRET,
        { expiresIn: "1h" },
      );

      // 10.1 Leitura de transações: intruso NÃO vê transações de household-principal
      const intruderTxRes = await api("/api/financas/transactions", {}, intruderToken);
      assert.equal(intruderTxRes.status, 200, "Requisição do intruso retorna 200 com lista própria");
      const intruderTxs = intruderTxRes.data.data;
      assert.ok(
        !intruderTxs.some((t: any) => t.id === victorTxId || t.id === rebecaTxId),
        "Intruso de outro household NÃO DEVE ver transações do household-principal",
      );

      // 10.2 Leitura de contas: intruso NÃO vê contas do household-principal
      const intruderAccRes = await api("/api/financas/accounts", {}, intruderToken);
      assert.equal(intruderAccRes.status, 200);
      assert.ok(
        !intruderAccRes.data.data.some((a: any) => a.id === sharedAccountId || a.id === victorCreatedAccountId),
        "Intruso de outro household NÃO DEVE ver contas do household-principal",
      );

      // 10.3 Alteração maliciosa: tentativa de alterar transação do Victor pelo intruso
      const updateRes = await api(`/api/financas/transactions/${victorTxId}`, {
        method: "PUT",
        body: JSON.stringify({
          description: "DESCRIÇÃO ADULTERADA POR HACKER",
          amountCents: 999999,
        }),
      }, intruderToken);

      assert.equal(updateRes.status, 404, "Tentativa de alterar transação de outro household deve retornar 404");

      // 10.4 Exclusão maliciosa: tentativa de deletar transação do Victor pelo intruso
      const deleteRes = await api(`/api/financas/transactions/${victorTxId}`, {
        method: "DELETE",
      }, intruderToken);

      assert.equal(deleteRes.status, 404, "Tentativa de deletar transação de outro household deve retornar 404");

      // 10.5 Criação maliciosa: tentativa de criar transação usando conta do household-principal
      const createFakeTxRes = await api("/api/financas/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId: sharedAccountId,
          amountCents: 5000,
          transactionDate: "2026-09-12",
          description: "Transação Forjada pelo Intruso",
        }),
      }, intruderToken);

      assert.ok(
        createFakeTxRes.status === 404 || createFakeTxRes.status === 400,
        "Tentativa de usar conta de outro household deve ser recusada com 400 ou 404",
      );

      // Verifica integridade dos dados no banco: transação do Victor permaneceu inalterada
      const checkTx = await db.get(
        "SELECT description, amount_cents FROM fin_transactions WHERE id = ?",
        victorTxId,
      );
      assert.equal(checkTx.description, "Supermercado - Compra do Victor", "Descrição original deve estar intacta");
      assert.equal(checkTx.amount_cents, 15000, "Valor original deve estar intacto");
    });

    // -------------------------------------------------------------------------
    // 11. VALIDAÇÃO DE SENHAS COM BCRYPT NO BANCO DE DADOS
    // -------------------------------------------------------------------------
    console.log("📌 [11/11] Validação de segurança das senhas no banco (nenhuma senha em texto puro)");
    await runStep("Checagem de hash bcrypt ($2a$ ou $2b$) na tabela users", async () => {
      const users = await db.all("SELECT id, username, password_hash, name FROM users");
      assert.ok(users.length >= 2, "Devem existir ao menos 2 usuários cadastrados (Victor e Rebeca)");

      for (const u of users) {
        assert.ok(
          u.password_hash.startsWith("$2a$") || u.password_hash.startsWith("$2b$"),
          `Hash de '${u.username}' deve começar com '$2a$' ou '$2b$'. Valor atual: ${u.password_hash.slice(0, 7)}...`,
        );

        assert.notEqual(u.password_hash, "Iphone5s.@", "Senha de Victor não pode estar em texto puro no banco");
        assert.notEqual(u.password_hash, "leandroreis", "Senha de Rebeca não pode estar em texto puro no banco");
        assert.notEqual(u.password_hash, "victor123", "Senha padrão não pode estar em texto puro");
        assert.notEqual(u.password_hash, u.username, "Hash não pode ser igual ao username");
        assert.ok(u.password_hash.length >= 60, "Comprimento do hash bcrypt deve ser de no mínimo 60 caracteres");
      }
    });

    console.log("\n=======================================================================");
    console.log("🎉 TODOS OS CRITÉRIOS DE MULTIUSUÁRIO / HOUSEHOLD FORAM APROVADOS COM 100%!");
    console.log(`📊 Estatísticas: ${stats.passed} passos executados, 0 falhas.`);
    console.log("=======================================================================");
  } finally {
    // Cleanup do servidor de testes
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// Execução direta via tsx
runHouseholdMultiuserTests().catch((err) => {
  console.error("\n❌ ERRO FATAL NA EXECUÇÃO DOS TESTES:", err);
  process.exit(1);
});
