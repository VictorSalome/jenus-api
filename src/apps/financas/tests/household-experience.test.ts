import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import express from "express";
import jwt from "jsonwebtoken";

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

export async function runHouseholdExperienceTests() {
  console.log("=======================================================================");
  console.log("💑 SUÍTE DE TESTES: EXPERIÊNCIA COMPARTILHADA DO CASAL (HOUSEHOLD)");
  console.log("=======================================================================\n");

  const baseDbPath = path.resolve(process.cwd(), "data/promo-monitor.db");
  const testDbPath = path.resolve(process.cwd(), "data/test-household-experience.db");

  // Limpa artefatos residuais de execuções anteriores
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
  if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);

  // Clona o schema com migrations já executadas para isolamento 100% limpo
  if (fs.existsSync(baseDbPath)) {
    fs.copyFileSync(baseDbPath, testDbPath);
  }
  process.env.DATABASE_PATH = testDbPath;

  // Importações dinâmicas após vincular DATABASE_PATH isolado
  const { initDb, getDb } = await import("../../../core/database.js");
  const { config } = await import("../../../core/config.js");
  const { default: authApp } = await import("../../../apps/auth/index.js");
  const { default: financasRouter } = await import("../routes/financas.routes.js");
  const { globalErrorHandler } = await import("../../../shared/http/index.js");
  const { verifyAccessToken } = await import("../../../shared/auth/jwt-auth.js");
  const { seedHouseholdDatabase } = await import("../migrations/index.js");

  await initDb();
  const db = await getDb();

  // Limpa dados operacionais das tabelas financeiras para garantir dados determinísticos
  await db.exec(`
    DELETE FROM fin_transactions;
    DELETE FROM fin_debt_payments;
    DELETE FROM fin_debt_occurrences;
    DELETE FROM fin_debts;
    DELETE FROM fin_installments;
    DELETE FROM fin_installment_plans;
    DELETE FROM fin_cards;
    DELETE FROM fin_accounts;
    DELETE FROM fin_categories;
  `);

  // Seed dos usuários do casal e associação ao household-principal
  await seedHouseholdDatabase(db);

  // Servidor Express efêmero para requisições HTTP ponta a ponta
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
  let victorToken = "";
  let victorUserId = "";
  let rebecaToken = "";
  let rebecaUserId = "";

  let sharedAccountId = 0;
  let sharedCategoryId = 0;
  let sharedCardId = 0;
  let debtOccurrenceId = 0;

  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);

  try {
    // -------------------------------------------------------------------------
    // SETUP: Autenticação do casal e infraestrutura base
    // -------------------------------------------------------------------------
    console.log("📌 [Setup] Autenticação de Victor e Rebeca no household-principal");
    await runStep("Login de Victor via POST /api/auth/login", async () => {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: "vssousa", password: "Iphone5s.@" }),
      });
      assert.equal(res.status, 200, "Login de Victor deve retornar 200");
      assert.ok(res.data.accessToken, "Deve retornar accessToken para Victor");
      victorToken = res.data.accessToken;

      const decoded = verifyAccessToken(victorToken);
      assert.equal(decoded.name, "Victor");
      assert.equal(decoded.householdId, "household-principal");
      victorUserId = decoded.userId;
    });

    await runStep("Login de Rebeca via POST /api/auth/login", async () => {
      const res = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: "rcoelhorss", password: "leandroreis" }),
      });
      assert.equal(res.status, 200, "Login de Rebeca deve retornar 200");
      assert.ok(res.data.accessToken, "Deve retornar accessToken para Rebeca");
      rebecaToken = res.data.accessToken;

      const decoded = verifyAccessToken(rebecaToken);
      assert.equal(decoded.name, "Rebeca");
      assert.equal(decoded.householdId, "household-principal");
      rebecaUserId = decoded.userId;
    });

    await runStep("Criação de conta e categoria compartilhadas do casal", async () => {
      const accRes = await api("/api/financas/accounts", {
        method: "POST",
        body: JSON.stringify({ name: "Conta Conjunta Casal", type: "checking" }),
      }, victorToken);
      assert.equal(accRes.status, 201);
      sharedAccountId = accRes.data.data.id;

      const catRes = await api("/api/financas/categories", {
        method: "POST",
        body: JSON.stringify({ name: "Despesas Gerais Casal", kind: "expense" }),
      }, rebecaToken);
      assert.equal(catRes.status, 201);
      sharedCategoryId = catRes.data.data.id;

      assert.ok(sharedAccountId > 0);
      assert.ok(sharedCategoryId > 0);
    });

    // -------------------------------------------------------------------------
    // 1. RATEIO DE GASTOS DO CASAL NO DASHBOARD (gastosPorMembro)
    // -------------------------------------------------------------------------
    console.log("\n📌 [1/4] Rateio de gastos do casal no Dashboard (gastosPorMembro)");

    await runStep("Valida que se não houver gastos, percentage não gera divisão por zero (retorna 0%)", async () => {
      // 1.1 Sem transações: gastosPorMembro é array vazio sem crash
      const emptyDash = await api("/api/financas/dashboard", {}, victorToken);
      assert.equal(emptyDash.status, 200);
      assert.ok(Array.isArray(emptyDash.data.data.gastosPorMembro));
      assert.equal(emptyDash.data.data.gastosPorMembro.length, 0);

      // 1.2 Transação com valor 0: totalGastosMembros === 0 não gera NaN nem Infinity (retorna 0%)
      await db.run(
        `INSERT INTO fin_transactions (household_id, account_id, user_id, amount_cents, type, status, transaction_date, description)
         VALUES ('household-principal', ?, ?, 0, 'debit', 'PENDING', ?, 'Transação Zero Cents Teste')`,
        sharedAccountId,
        victorUserId,
        today,
      );

      const zeroDash = await api("/api/financas/dashboard", {}, victorToken);
      assert.equal(zeroDash.status, 200);
      const zeroMembers = zeroDash.data.data.gastosPorMembro;
      assert.ok(zeroMembers.length > 0, "Deve conter membro mesmo com valor 0");
      const zeroVictor = zeroMembers.find((m: any) => m.user_id === victorUserId);
      assert.ok(zeroVictor, "Victor deve constar na lista");
      assert.equal(zeroVictor.total_cents, 0, "total_cents deve ser 0");
      assert.equal(zeroVictor.percentage, 0, "percentage deve ser 0%");
      assert.ok(!Number.isNaN(zeroVictor.percentage), "percentage não pode ser NaN");

      // Remove a transação de teste de 0 centavos
      await db.run("DELETE FROM fin_transactions WHERE amount_cents = 0");
    });

    await runStep("Victor cria transação de R$ 60,00 e Rebeca cria transação de R$ 40,00 no mês atual", async () => {
      // Victor: R$ 60,00 (6000 centavos)
      const txVictor = await api("/api/financas/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId: sharedAccountId,
          categoryId: sharedCategoryId,
          amountCents: 6000,
          type: "debit",
          transactionDate: today,
          description: "Supermercado Semanal - Victor",
        }),
      }, victorToken);
      assert.equal(txVictor.status, 201, "Transação de Victor deve retornar 201");
      assert.equal(txVictor.data.data.transaction.amount_cents, 6000);

      // Rebeca: R$ 40,00 (4000 centavos)
      const txRebeca = await api("/api/financas/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId: sharedAccountId,
          categoryId: sharedCategoryId,
          amountCents: 4000,
          type: "debit",
          transactionDate: today,
          description: "Padaria e Frutas - Rebeca",
        }),
      }, rebecaToken);
      assert.equal(txRebeca.status, 201, "Transação de Rebeca deve retornar 201");
      assert.equal(txRebeca.data.data.transaction.amount_cents, 4000);
    });

    await runStep("Consulta GET /api/financas/dashboard e valida Victor com 6000 (60%) e Rebeca com 4000 (40%)", async () => {
      const dash = await api("/api/financas/dashboard", {}, victorToken);
      assert.equal(dash.status, 200);
      assert.equal(dash.data.success, true);

      const membros = dash.data.data.gastosPorMembro;
      assert.ok(Array.isArray(membros), "gastosPorMembro deve ser array");
      assert.equal(membros.length, 2, "Devem existir exatamente 2 membros com gastos no mês");

      const victor = membros.find((m: any) => m.user_id === victorUserId || m.name === "Victor");
      const rebeca = membros.find((m: any) => m.user_id === rebecaUserId || m.name === "Rebeca");

      assert.ok(victor, "Victor deve estar em gastosPorMembro");
      assert.ok(rebeca, "Rebeca deve estar em gastosPorMembro");

      assert.equal(victor.name, "Victor");
      assert.equal(victor.total_cents, 6000, "Gasto do Victor deve ser exatamente 6000 centavos (R$ 60,00)");
      assert.equal(victor.percentage, 60, "Percentual do Victor deve ser exatamente 60%");

      assert.equal(rebeca.name, "Rebeca");
      assert.equal(rebeca.total_cents, 4000, "Gasto da Rebeca deve ser exatamente 4000 centavos (R$ 40,00)");
      assert.equal(rebeca.percentage, 40, "Percentual da Rebeca deve ser exatamente 40%");

      assert.equal(victor.percentage + rebeca.percentage, 100, "Soma dos percentuais deve totalizar 100%");

      // Rebeca visualiza exatamente os mesmos dados no Dashboard compartilhado
      const dashRebeca = await api("/api/financas/dashboard", {}, rebecaToken);
      assert.equal(dashRebeca.status, 200);
      assert.deepEqual(dashRebeca.data.data.gastosPorMembro, membros);
    });

    // -------------------------------------------------------------------------
    // 2. DÍVIDAS FIXAS COM IDENTIFICAÇÃO DO PAGADOR
    // -------------------------------------------------------------------------
    console.log("\n📌 [2/4] Dívidas fixas com identificação do pagador");

    await runStep("Victor cadastra dívida fixa e registra pagamento integral", async () => {
      // 2.1 Cadastra dívida recorrente
      const debtRes = await api("/api/financas/debts", {
        method: "POST",
        body: JSON.stringify({
          name: "Internet Fibra Residencial",
          amountCents: 15000, // R$ 150,00
          dueDay: 15,
          startMonth: currentMonth,
          accountId: sharedAccountId,
          categoryId: sharedCategoryId,
        }),
      }, victorToken);
      assert.equal(debtRes.status, 201, "Criação de dívida deve retornar 201");
      const debtId = debtRes.data.data.id;
      assert.ok(debtId > 0);

      // 2.2 Localiza ocorrência do mês
      const occRes = await api(`/api/financas/debts/occurrences?month=${currentMonth}`, {}, victorToken);
      assert.equal(occRes.status, 200);
      const occurrences = occRes.data.data.occurrences;
      const targetOcc = occurrences.find((o: any) => o.debt_id === debtId);
      assert.ok(targetOcc, "Ocorrência do mês atual deve ter sido gerada");
      debtOccurrenceId = targetOcc.id;
      assert.equal(targetOcc.paid_by_name, null, "Antes do pagamento, paid_by_name deve ser null");

      // 2.3 Victor registra o pagamento
      const payRes = await api(`/api/financas/debts/occurrences/${debtOccurrenceId}/pay`, {
        method: "POST",
        body: JSON.stringify({
          amountCents: 15000,
          paidDate: today,
          notes: "Pago via Pix do Victor",
        }),
      }, victorToken);
      assert.equal(payRes.status, 201, "Pagamento de dívida deve retornar 201");
    });

    await runStep("Consulta GET /api/financas/debts/occurrences e valida occ.paid_by_name e payments[0].paid_by_name === 'Victor'", async () => {
      const occRes = await api(`/api/financas/debts/occurrences?month=${currentMonth}`, {}, victorToken);
      assert.equal(occRes.status, 200);

      const occurrences = occRes.data.data.occurrences;
      const targetOcc = occurrences.find((o: any) => o.id === debtOccurrenceId);
      assert.ok(targetOcc, "Ocorrência paga deve ser encontrada");

      // Validação do status e identificação direta na ocorrência
      assert.equal(targetOcc.status, "PAID", "Status da ocorrência deve ser PAID");
      assert.equal(targetOcc.paid_amount_cents, 15000, "Valor pago deve ser 15000");
      assert.equal(targetOcc.paid_by_name, "Victor", "occ.paid_by_name deve ser 'Victor'");

      // Validação do array de pagamentos com identificação do pagador
      assert.ok(Array.isArray(targetOcc.payments), "occ.payments deve ser um array");
      assert.equal(targetOcc.payments.length, 1, "Deve existir 1 registro de pagamento");
      assert.equal(targetOcc.payments[0].paid_by_name, "Victor", "occ.payments[0].paid_by_name deve ser 'Victor'");
      assert.equal(targetOcc.payments[0].user_id, victorUserId, "user_id do pagamento deve ser de Victor");

      // Rebeca consulta ocorrências e também vê Victor como pagador
      const rebecaOccRes = await api(`/api/financas/debts/occurrences?month=${currentMonth}`, {}, rebecaToken);
      assert.equal(rebecaOccRes.status, 200);
      const rebecaSeenOcc = rebecaOccRes.data.data.occurrences.find((o: any) => o.id === debtOccurrenceId);
      assert.equal(rebecaSeenOcc.paid_by_name, "Victor");
      assert.equal(rebecaSeenOcc.payments[0].paid_by_name, "Victor");
    });

    // -------------------------------------------------------------------------
    // 3. FATURAS COM RATEIO POR MEMBRO
    // -------------------------------------------------------------------------
    console.log("\n📌 [3/4] Faturas com rateio por membro");

    await runStep("Cadastro de cartão de crédito compartilhado", async () => {
      const cardRes = await api("/api/financas/cards", {
        method: "POST",
        body: JSON.stringify({
          accountId: sharedAccountId,
          name: "Nubank Ultravioleta Casal",
          brand: "Mastercard",
          last4: "9988",
          closingDay: 25,
          dueDay: 5,
          creditLimitCents: 1000000,
        }),
      }, victorToken);
      assert.equal(cardRes.status, 201);
      sharedCardId = cardRes.data.data.id;
      assert.ok(sharedCardId > 0);
    });

    await runStep("Victor faz compra no cartão de R$ 100,00 e Rebeca faz compra no mesmo cartão de R$ 50,00", async () => {
      // Compra do Victor: R$ 100,00 (10000 centavos)
      const victorCardTx = await api("/api/financas/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId: sharedAccountId,
          cardId: sharedCardId,
          categoryId: sharedCategoryId,
          amountCents: 10000,
          type: "debit",
          transactionDate: today,
          description: "Jantar Casal - Victor no Cartão",
        }),
      }, victorToken);
      assert.equal(victorCardTx.status, 201);

      // Compra da Rebeca: R$ 50,00 (5000 centavos)
      const rebecaCardTx = await api("/api/financas/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId: sharedAccountId,
          cardId: sharedCardId,
          categoryId: sharedCategoryId,
          amountCents: 5000,
          type: "debit",
          transactionDate: today,
          description: "Cinema e Pipoca - Rebeca no Cartão",
        }),
      }, rebecaToken);
      assert.equal(rebecaCardTx.status, 201);
    });

    await runStep("Consulta GET /api/financas/invoices e valida fatura com Victor (R$ 100,00 - 67%) e Rebeca (R$ 50,00 - 33%)", async () => {
      const invRes = await api("/api/financas/invoices", {}, victorToken);
      assert.equal(invRes.status, 200);
      assert.ok(Array.isArray(invRes.data.data));

      const fatura = invRes.data.data.find((inv: any) => inv.cardId === sharedCardId);
      assert.ok(fatura, "Fatura do cartão compartilhado deve ser encontrada");
      assert.equal(fatura.totalCents, 15000, "Total da fatura deve ser R$ 150,00 (15000 centavos)");

      assert.ok(Array.isArray(fatura.members), "Fatura deve conter array de members");
      assert.equal(fatura.members.length, 2, "Fatura deve conter exatamente 2 membros");

      const mVictor = fatura.members.find((m: any) => m.name === "Victor" || m.user_id === victorUserId);
      const mRebeca = fatura.members.find((m: any) => m.name === "Rebeca" || m.user_id === rebecaUserId);

      assert.ok(mVictor, "Victor deve constar nos membros da fatura");
      assert.ok(mRebeca, "Rebeca deve constar nos membros da fatura");

      assert.equal(mVictor.total_cents, 10000, "Total do Victor na fatura deve ser R$ 100,00 (10000 centavos)");
      assert.equal(mVictor.percentage, 67, "Percentual do Victor na fatura deve ser 67%");

      assert.equal(mRebeca.total_cents, 5000, "Total da Rebeca na fatura deve ser R$ 50,00 (5000 centavos)");
      assert.equal(mRebeca.percentage, 33, "Percentual da Rebeca na fatura deve ser 33%");

      assert.equal(mVictor.percentage + mRebeca.percentage, 100, "Soma dos percentuais na fatura deve totalizar 100%");
    });

    await runStep("Valida transações sem autor no cartão retornam como 'Sem identificação'", async () => {
      // Simula inserção direta de transação legada/importada sem identificação de autor (user_id vazio / sem correspondência em users)
      await db.run(
        `INSERT INTO fin_transactions (household_id, account_id, card_id, category_id, amount_cents, type, status, transaction_date, description, installments_total, user_id)
         VALUES ('household-principal', ?, ?, ?, 3000, 'debit', 'PENDING', ?, 'Assinatura Compartilhada Sem Autor', 1, '')`,
        sharedAccountId,
        sharedCardId,
        sharedCategoryId,
        today,
      );

      const invRes = await api("/api/financas/invoices", {}, victorToken);
      assert.equal(invRes.status, 200);

      const fatura = invRes.data.data.find((inv: any) => inv.cardId === sharedCardId);
      assert.ok(fatura);
      assert.equal(fatura.totalCents, 18000, "Total com transação anônima deve ser 18000 centavos");

      const mAnon = fatura.members.find((m: any) => m.name === "Sem identificação");
      assert.ok(mAnon, "Deve existir membro com name 'Sem identificação'");
      assert.equal(mAnon.total_cents, 3000, "Valor do membro sem identificação deve ser 3000 centavos");
      assert.equal(mAnon.percentage, 17, "Percentual do membro sem identificação (3000/18000) deve ser 17%");
    });

    // -------------------------------------------------------------------------
    // 4. TESTE DE SEGURANÇA E ISOLAMENTO MULTI-TENANT
    // -------------------------------------------------------------------------
    console.log("\n📌 [4/4] Teste de segurança e isolamento multi-tenant");

    await runStep("Confirma que usuário de outro household não consegue ler gastosPorMembro, pagamentos ou faturas", async () => {
      // Gera token de usuário pertencente a outro household
      const intruderToken = jwt.sign(
        {
          userId: "intruso-adversarial-123",
          email: "intruso@outro-household.local",
          role: "user",
          name: "Intruso",
          householdId: "household-hacker-isolado",
        },
        config.JWT_ACCESS_SECRET,
        { expiresIn: "1h" },
      );

      // 4.1 Intruso não acessa gastosPorMembro do household-principal
      const intruderDash = await api("/api/financas/dashboard", {}, intruderToken);
      assert.equal(intruderDash.status, 200, "Requisição do intruso retorna 200");
      const intruderMembros = intruderDash.data.data?.gastosPorMembro || [];
      assert.ok(
        !intruderMembros.some((m: any) => m.name === "Victor" || m.name === "Rebeca"),
        "Intruso NÃO DEVE ter acesso a gastosPorMembro do household-principal",
      );
      assert.equal(intruderDash.data.data.gastoMesCents, 0, "Gasto do intruso deve ser 0");

      // 4.2 Intruso não acessa ocorrências ou pagamentos de dívidas do household-principal
      const intruderDebts = await api(`/api/financas/debts/occurrences?month=${currentMonth}`, {}, intruderToken);
      assert.equal(intruderDebts.status, 200);
      const intruderOccurrences = intruderDebts.data.data?.occurrences || [];
      assert.ok(
        !intruderOccurrences.some((o: any) => o.paid_by_name === "Victor" || o.id === debtOccurrenceId),
        "Intruso NÃO DEVE ter acesso às dívidas/pagamentos do household-principal",
      );

      // 4.3 Intruso não consegue pagar dívida do household-principal
      const payIntruderRes = await api(`/api/financas/debts/occurrences/${debtOccurrenceId}/pay`, {
        method: "POST",
        body: JSON.stringify({ amountCents: 5000, paidDate: today }),
      }, intruderToken);
      assert.equal(
        payIntruderRes.status,
        404,
        "Tentativa do intruso de registrar pagamento em dívida de outro household DEVE retornar 404",
      );

      // 4.4 Intruso não acessa faturas do household-principal
      const intruderInvoices = await api("/api/financas/invoices", {}, intruderToken);
      assert.equal(intruderInvoices.status, 200);
      const invoicesList = intruderInvoices.data.data || [];
      assert.equal(invoicesList.length, 0, "Intruso deve receber lista vazia de faturas");
      assert.ok(
        !invoicesList.some((inv: any) => inv.cardId === sharedCardId),
        "Intruso NÃO DEVE visualizar fatura de cartão de outro household",
      );
    });

    console.log("\n=======================================================================");
    console.log("🎉 TODOS OS CRITÉRIOS DA EXPERIÊNCIA COMPARTILHADA FORAM APROVADOS (100%)!");
    console.log(`📊 Estatísticas: ${stats.passed} passos executados com sucesso, 0 falhas.`);
    console.log("=======================================================================");
  } finally {
    // Teardown do servidor e conexão SQLite
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();

    // Limpeza de arquivos temporários do teste
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
    if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
  }
}

// Execução direta quando chamado via CLI / tsx
runHouseholdExperienceTests().catch((err) => {
  console.error("\n❌ ERRO FATAL NA SUÍTE DE TESTES:", err);
  process.exit(1);
});
