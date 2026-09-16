import assert from "node:assert/strict";
import { generatePermanentTestToken } from "../../../shared/auth/jwt-auth.js";
import { getDb, initDb } from "../../../core/database.js";

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";
const TEST_TOKEN = generatePermanentTestToken(`finance-tester-${Date.now()}@jenus.local`);

// Helper para fazer requisições HTTP autenticadas
async function api(path: string, options: RequestInit = {}) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TEST_TOKEN}`,
    ...(options.headers as Record<string, string> || {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const contentType = res.headers.get("content-type") || "";
  let data: any = null;
  if (contentType.includes("application/json")) {
    data = await res.json();
  } else if (contentType.includes("application/vnd.openxmlformats") || contentType.includes("octet-stream")) {
    data = await res.arrayBuffer();
  } else {
    data = await res.text();
  }

  return { status: res.status, ok: res.ok, data, headers: res.headers };
}

interface TestStats {
  passed: number;
  failed: number;
  modules: { name: string; status: "OK" | "FAIL"; error?: string }[];
}

const stats: TestStats = {
  passed: 0,
  failed: 0,
  modules: [],
};

async function runStep(name: string, fn: () => Promise<void>) {
  process.stdout.write(`  ⏳ ${name}... `);
  try {
    await fn();
    stats.passed++;
    stats.modules.push({ name, status: "OK" });
    console.log("✅ OK");
  } catch (err: any) {
    stats.failed++;
    const errMsg = err?.message || String(err);
    stats.modules.push({ name, status: "FAIL", error: errMsg });
    console.log(`❌ FALHOU: ${errMsg}`);
  }
}

export async function runFinancialTests() {
  console.log("=======================================================================");
  console.log("🚀 INICIANDO BATERIA DE TESTES DO MÓDULO FINANCEIRO (JENUS-API)");
  console.log(`📡 URL Alvo: ${BASE_URL}`);
  console.log("=======================================================================\n");

  await initDb();
  const db = await getDb();

  // IDs criados durante a execução
  let accountId: number = 0;
  let cardId: number = 0;
  let categoryId: number = 0;
  let merchantId: number = 0;
  let incomeTxId: number = 0;
  let expenseTxId: number = 0;
  let installmentTxId: number = 0;
  let installmentPlanId: number = 0;
  let firstInstallmentId: number = 0;
  let debtId: number = 0;
  let occurrenceId: number = 0;
  let paymentId: number = 0;
  let notificationEventId: number = 0;
  let importedTxId: number = 0;

  try {
    // -------------------------------------------------------------------------
    // 1. HEALTHCHECK DA API
    // -------------------------------------------------------------------------
    console.log("📌 [1/13] Conectividade e Saúde da API");
    await runStep("GET /api/health - Conexão e banco de dados", async () => {
      const res = await api("/api/health");
      assert.equal(res.status, 200, "Healthcheck deve retornar status 200");
      assert.equal(res.data.status, "ok", "Status retornado deve ser 'ok'");
      assert.equal(res.data.database, "connected", "Banco deve estar conectado");
    });

    // -------------------------------------------------------------------------
    // 2. CATEGORIAS (fin_categories)
    // -------------------------------------------------------------------------
    console.log("\n📌 [2/13] Gestão de Categorias");
    await runStep("GET /api/financas/categories - Inicialização e listagem", async () => {
      const res = await api("/api/financas/categories");
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      assert.ok(Array.isArray(res.data.data), "data deve ser um array de categorias");
      assert.ok(res.data.data.length > 0, "Deve conter categorias padrão");
    });

    await runStep("POST /api/financas/categories - Criar nova categoria", async () => {
      const res = await api("/api/financas/categories", {
        method: "POST",
        body: JSON.stringify({
          name: `Investimentos Teste ${Date.now()}`,
          icon: "trending-up",
          color: "#10b981",
          kind: "expense",
        }),
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.ok(res.data.data.id > 0);
      categoryId = res.data.data.id;
    });

    await runStep("PUT /api/financas/categories/:id - Atualizar categoria", async () => {
      assert.ok(categoryId > 0);
      const res = await api(`/api/financas/categories/${categoryId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: "Investimentos & Cripto",
          color: "#059669",
        }),
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.data.name, "Investimentos & Cripto");
    });

    // -------------------------------------------------------------------------
    // 3. CONTAS BANCÁRIAS (fin_accounts)
    // -------------------------------------------------------------------------
    console.log("\n📌 [3/13] Contas Bancárias");
    await runStep("POST /api/financas/accounts - Criar conta corrente", async () => {
      const res = await api("/api/financas/accounts", {
        method: "POST",
        body: JSON.stringify({
          name: `Conta Nubank Teste ${Date.now()}`,
          type: "checking",
          bank: "Nubank",
          balanceCents: 500000, // R$ 5.000,00
          currency: "BRL",
        }),
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.ok(res.data.data.id > 0);
      assert.equal(res.data.data.balance_cents, 500000);
      accountId = res.data.data.id;
    });

    await runStep("GET /api/financas/accounts - Listar contas", async () => {
      const res = await api("/api/financas/accounts");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.data));
      const found = res.data.data.some((acc: any) => acc.id === accountId);
      assert.ok(found, "Conta criada deve estar na lista");
    });

    await runStep("PUT /api/financas/accounts/:id - Atualizar saldo da conta", async () => {
      assert.ok(accountId > 0);
      const res = await api(`/api/financas/accounts/${accountId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: "Conta Nubank Principal",
          balanceCents: 550000,
        }),
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.data.name, "Conta Nubank Principal");
      assert.equal(res.data.data.balance_cents, 550000);
    });

    // -------------------------------------------------------------------------
    // 4. CARTÕES DE CRÉDITO (fin_cards)
    // -------------------------------------------------------------------------
    console.log("\n📌 [4/13] Cartões de Crédito");
    await runStep("POST /api/financas/cards - Criar cartão de crédito", async () => {
      assert.ok(accountId > 0);
      const res = await api("/api/financas/cards", {
        method: "POST",
        body: JSON.stringify({
          accountId,
          name: `Mastercard Black ${Date.now()}`,
          last4: "9876",
          brand: "Mastercard",
          closingDay: 25,
          dueDay: 5,
          creditLimitCents: 1500000, // R$ 15.000,00
        }),
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.ok(res.data.data.id > 0);
      assert.equal(res.data.data.last4, "9876");
      assert.equal(res.data.data.closing_day, 25);
      assert.equal(res.data.data.due_day, 5);
      cardId = res.data.data.id;
    });

    await runStep("GET /api/financas/cards - Listar cartões", async () => {
      const res = await api("/api/financas/cards");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.data));
      const found = res.data.data.some((c: any) => c.id === cardId);
      assert.ok(found, "Cartão criado deve estar na lista");
    });

    await runStep("PUT /api/financas/cards/:id - Atualizar limite do cartão", async () => {
      assert.ok(cardId > 0);
      const res = await api(`/api/financas/cards/${cardId}`, {
        method: "PUT",
        body: JSON.stringify({
          creditLimitCents: 2000000, // R$ 20.000,00
        }),
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.data.credit_limit_cents, 2000000);
    });

    // -------------------------------------------------------------------------
    // 5. ESTABELECIMENTOS / MERCHANTS (fin_merchants)
    // -------------------------------------------------------------------------
    console.log("\n📌 [5/13] Estabelecimentos / Merchants");
    await runStep("POST /api/financas/merchants - Criar merchant", async () => {
      const res = await api("/api/financas/merchants", {
        method: "POST",
        body: JSON.stringify({
          name: `Posto Shell Alphaville ${Date.now()}`,
          categoryId,
        }),
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.ok(res.data.data.id > 0);
      assert.ok(res.data.data.name_normalized.includes("shell"));
      merchantId = res.data.data.id;
    });

    await runStep("GET /api/financas/merchants - Listar merchants", async () => {
      const res = await api("/api/financas/merchants");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.data));
      const found = res.data.data.some((m: any) => m.id === merchantId);
      assert.ok(found, "Merchant criado deve estar na lista");
    });

    await runStep("PUT /api/financas/merchants/:id - Atualizar merchant", async () => {
      assert.ok(merchantId > 0);
      const res = await api(`/api/financas/merchants/${merchantId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: "Posto Shell Veloce",
        }),
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.data.name, "Posto Shell Veloce");
    });

    // -------------------------------------------------------------------------
    // 6. TRANSAÇÕES À VISTA E PARCELADAS (fin_transactions & installments)
    // -------------------------------------------------------------------------
    console.log("\n📌 [6/13] Transações / Lançamentos");
    const today = new Date().toISOString().slice(0, 10);

    await runStep("POST /api/financas/transactions - Criar receita à vista", async () => {
      assert.ok(accountId > 0);
      const res = await api("/api/financas/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId,
          description: "Consultoria Dev Software",
          amountCents: 450000, // +R$ 4.500,00
          type: "credit",
          transactionDate: today,
          source: "MANUAL",
        }),
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.ok(res.data.data.transaction?.id > 0);
      assert.equal(res.data.data.transaction.amount_cents, 450000);
      assert.equal(res.data.data.transaction.type, "credit");
      incomeTxId = res.data.data.transaction.id;
    });

    await runStep("POST /api/financas/transactions - Criar despesa à vista na conta", async () => {
      assert.ok(accountId > 0);
      const res = await api("/api/financas/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId,
          description: "Almoço Executivo",
          merchantName: "Restaurante Sabor Nobre",
          categoryId,
          amountCents: 6500, // R$ 65,00 (inteiro positivo)
          type: "debit",
          transactionDate: today,
          source: "MANUAL",
        }),
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.ok(res.data.data.transaction?.id > 0);
      assert.equal(res.data.data.transaction.amount_cents, 6500);
      expenseTxId = res.data.data.transaction.id;
    });

    await runStep("POST /api/financas/transactions - Criar compra parcelada em 3x no cartão", async () => {
      assert.ok(accountId > 0 && cardId > 0);
      const res = await api("/api/financas/transactions", {
        method: "POST",
        body: JSON.stringify({
          accountId,
          cardId,
          description: "Monitor Ultrawide 34 pol",
          merchantName: "Kabum Informatica",
          categoryId,
          amountCents: 240000, // R$ 2.400,00 total (3x 800,00)
          type: "debit",
          transactionDate: today,
          installmentsTotal: 3,
          source: "MANUAL",
        }),
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.ok(res.data.data.transaction?.id > 0);
      assert.ok(res.data.data.plan?.id > 0, "Deve gerar plano de parcelamento");
      assert.equal(res.data.data.installments?.length, 3, "Deve gerar 3 parcelas");
      installmentTxId = res.data.data.transaction.id;
      installmentPlanId = res.data.data.plan.id;
    });

    await runStep("GET /api/financas/transactions - Listar transações com filtros", async () => {
      const res = await api(`/api/financas/transactions?month=${today.slice(0, 7)}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.data));
      assert.ok(res.data.data.length >= 3, "Deve listar as transações criadas");
    });

    await runStep("PUT /api/financas/transactions/:id - Atualizar transação", async () => {
      assert.ok(expenseTxId > 0);
      const res = await api(`/api/financas/transactions/${expenseTxId}`, {
        method: "PUT",
        body: JSON.stringify({
          description: "Almoço Executivo com Equipe",
          categoryId,
        }),
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.data.description, "Almoço Executivo com Equipe");
      assert.equal(res.data.data.category_id, categoryId);
    });

    // -------------------------------------------------------------------------
    // 7. PARCELAMENTOS (fin_installments & plans)
    // -------------------------------------------------------------------------
    console.log("\n📌 [7/13] Parcelamentos e Projeção Futura");
    await runStep("GET /api/financas/installments - Listar parcelas geradas", async () => {
      assert.ok(installmentPlanId > 0);
      const res = await api(`/api/financas/installments?planId=${installmentPlanId}`);
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.data));
      assert.equal(res.data.data.length, 3, "Devem existir exatamente 3 parcelas geradas");
      firstInstallmentId = res.data.data[0].id;
    });

    await runStep("GET /api/financas/installments/future - Projeção de comprometimento futuro", async () => {
      const res = await api("/api/financas/installments/future");
      assert.equal(res.status, 200);
      assert.ok(res.data.success);
      assert.ok(Array.isArray(res.data.data));
    });

    await runStep("POST /api/financas/installments/:id/pay - Marcar parcela como paga", async () => {
      assert.ok(firstInstallmentId > 0);
      const res = await api(`/api/financas/installments/${firstInstallmentId}/pay`, {
        method: "POST",
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.data.status, "PAID");
    });

    // -------------------------------------------------------------------------
    // 8. FATURAS DE CARTÃO (invoices)
    // -------------------------------------------------------------------------
    console.log("\n📌 [8/13] Faturas de Cartão de Crédito");
    await runStep("GET /api/financas/invoices - Listagem de faturas por ciclo", async () => {
      const res = await api("/api/financas/invoices");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.data));
      const invoiceForCard = res.data.data.find((inv: any) => inv.cardId === cardId);
      assert.ok(invoiceForCard, "Fatura para o cartão criado deve existir");
      assert.ok(invoiceForCard.totalCents > 0, "Fatura deve conter o valor da compra no cartão");
    });

    // -------------------------------------------------------------------------
    // 9. DÍVIDAS RECORRENTES (fin_debts & occurrences)
    // -------------------------------------------------------------------------
    console.log("\n📌 [9/13] Dívidas Recorrentes / Contas Fixas");
    const currentMonth = today.slice(0, 7);

    await runStep("POST /api/financas/debts - Criar dívida recorrente fixa", async () => {
      assert.ok(accountId > 0);
      const res = await api("/api/financas/debts", {
        method: "POST",
        body: JSON.stringify({
          name: `Aluguel & Condomínio ${Date.now()}`,
          amountCents: 280000, // R$ 2.800,00
          dueDay: 10,
          categoryId,
          accountId,
          startMonth: currentMonth,
          notes: "Contrato anual de locação",
        }),
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.ok(res.data.data.id > 0);
      assert.equal(res.data.data.amount_cents, 280000);
      debtId = res.data.data.id;
    });

    await runStep("GET /api/financas/debts - Listar dívidas cadastradas", async () => {
      const res = await api("/api/financas/debts");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.data));
      const found = res.data.data.some((d: any) => d.id === debtId);
      assert.ok(found, "Dívida criada deve estar na lista");
    });

    await runStep("GET /api/financas/debts/:id - Obter detalhes da dívida", async () => {
      assert.ok(debtId > 0);
      const res = await api(`/api/financas/debts/${debtId}`);
      assert.equal(res.status, 200);
      assert.equal(res.data.data.id, debtId);
      assert.equal(res.data.data.due_day, 10);
    });

    await runStep("GET /api/financas/debts/occurrences - Listar ocorrências do mês (com auto-geração)", async () => {
      const res = await api(`/api/financas/debts/occurrences?month=${currentMonth}`);
      assert.equal(res.status, 200);
      assert.ok(res.data.data.occurrences, "Deve conter array occurrences");
      assert.ok(Array.isArray(res.data.data.occurrences));
      const occ = res.data.data.occurrences.find((o: any) => o.debt_id === debtId);
      assert.ok(occ, "Ocorrência mensal da dívida deve ter sido gerada");
      assert.equal(occ.expected_amount_cents, 280000);
      occurrenceId = occ.id;
    });

    await runStep("POST /api/financas/debts/occurrences/:id/pay - Registrar pagamento da ocorrência", async () => {
      assert.ok(occurrenceId > 0);
      const res = await api(`/api/financas/debts/occurrences/${occurrenceId}/pay`, {
        method: "POST",
        body: JSON.stringify({
          amountCents: 280000,
          paidDate: today,
          notes: "Pago via PIX",
        }),
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.data.status, "PAID");
      assert.equal(res.data.data.paid_amount_cents, 280000);
      assert.ok(res.data.data.payments?.length > 0);
      paymentId = res.data.data.payments[0].id;
    });

    await runStep("DELETE /api/financas/debts/payments/:paymentId - Estornar pagamento", async () => {
      assert.ok(paymentId > 0);
      const res = await api(`/api/financas/debts/payments/${paymentId}`, {
        method: "DELETE",
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.data.status, "PENDING");
      assert.equal(res.data.data.totalPaid, 0);
    });

    await runStep("GET /api/financas/debts/suggestions - Sugestões de despesas recorrentes", async () => {
      const res = await api("/api/financas/debts/suggestions");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.data));
    });

    await runStep("POST /api/financas/debts/check-reminders - Checagem de lembretes e notificações", async () => {
      const res = await api("/api/financas/debts/check-reminders", {
        method: "POST",
      });
      assert.equal(res.status, 200);
      assert.ok(typeof res.data.data?.notifiedCount === "number", "Deve conter notifiedCount");
      assert.ok(typeof res.data.data?.totalFound === "number", "Deve conter totalFound");
    });

    await runStep("PUT /api/financas/debts/:id - Atualizar dívida", async () => {
      assert.ok(debtId > 0);
      const res = await api(`/api/financas/debts/${debtId}`, {
        method: "PUT",
        body: JSON.stringify({
          name: "Aluguel, Condomínio & IPTU",
          amountCents: 295000,
        }),
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.data.name, "Aluguel, Condomínio & IPTU");
      assert.equal(res.data.data.amount_cents, 295000);
    });

    // -------------------------------------------------------------------------
    // 10. EVENTOS DE NOTIFICAÇÃO BANCÁRIA (fin_notification_events)
    // -------------------------------------------------------------------------
    console.log("\n📌 [10/13] Eventos de Notificação Bancária (Push Parser & Capture)");
    await runStep("POST /api/financas/notification-events - Receber evento RAW do Nubank", async () => {
      const res = await api("/api/financas/notification-events", {
        method: "POST",
        body: JSON.stringify({
          packageName: "com.nu.production",
          appLabel: "Nubank",
          title: "Nubank",
          text: `Compra de R$ 134,50 no Posto Ipiranga ${Date.now()} aprovada`,
          postTime: Date.now(),
        }),
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
      assert.ok(res.data.data.event?.id > 0);
      assert.ok(res.data.data.parsed, "Parser deve extrair os dados da compra");
      assert.equal(res.data.data.parsed.amountCents, 13450);
      notificationEventId = res.data.data.event.id;
    });

    await runStep("GET /api/financas/notification-events - Listar eventos pendentes/detectados", async () => {
      const res = await api("/api/financas/notification-events");
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(res.data.data));
      const found = res.data.data.some((e: any) => e.id === notificationEventId);
      assert.ok(found, "Evento criado deve estar na lista");
    });

    await runStep("POST /api/financas/notification-events/:id/ignore - Ignorar evento", async () => {
      assert.ok(notificationEventId > 0);
      const res = await api(`/api/financas/notification-events/${notificationEventId}/ignore`, {
        method: "POST",
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.data.status, "ignored");
    });

    await runStep("POST /api/financas/notification-events/:id/import - Converter evento em transação real", async () => {
      assert.ok(notificationEventId > 0);
      // Reativa status para permitir import
      await db.run("UPDATE fin_notification_events SET status = 'parsed' WHERE id = ?", notificationEventId);
      const res = await api(`/api/financas/notification-events/${notificationEventId}/import`, {
        method: "POST",
      });
      assert.equal(res.status, 200);
      assert.ok(res.data.data.transaction?.id > 0, "Deve criar transação a partir da notificação");
      importedTxId = res.data.data.transaction.id;
    });

    await runStep("POST /api/financas/notification-events/batch-delete - Operações em lote", async () => {
      const res = await api("/api/financas/notification-events/batch-delete", {
        method: "POST",
        body: JSON.stringify({ ids: [notificationEventId] }),
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
    });

    // -------------------------------------------------------------------------
    // 11. WEBHOOK ATALHOS APPLE SHORTCUTS / SIRI
    // -------------------------------------------------------------------------
    console.log("\n📌 [11/13] Webhook iOS Shortcuts / Siri");
    await runStep("POST /api/financas/webhook/shortcut - Envio de texto bruto de compra", async () => {
      const res = await api("/api/financas/webhook/shortcut", {
        method: "POST",
        body: JSON.stringify({
          text: `Compra de R$ 42,00 no Starbucks ${Date.now()} aprovada`,
          appLabel: "Nubank",
        }),
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.success, true);
    });

    await runStep("POST /api/financas/webhook/shortcut - Envio de dados estruturados", async () => {
      const res = await api("/api/financas/webhook/shortcut", {
        method: "POST",
        body: JSON.stringify({
          amount: 89.9,
          merchant: "Farmacia Raia",
          card: "Nubank",
        }),
      });
      assert.ok([200, 201].includes(res.status), "Status deve ser 200 ou 201");
      assert.equal(res.data.success, true);
    });

    // -------------------------------------------------------------------------
    // 12. DISPARO DE PUSH NOTIFICATION DE TESTE
    // -------------------------------------------------------------------------
    console.log("\n📌 [12/13] Teste de Disparo de Notificação Push");
    await runStep("POST /api/financas/push/test - Simular disparo de push", async () => {
      const res = await api("/api/financas/push/test", {
        method: "POST",
        body: JSON.stringify({
          title: "Compra Nubank",
          body: "Compra de R$ 99,00 no Posto Ipiranga aprovada",
          amount: 99.0,
          merchant: "Posto Ipiranga",
        }),
      });
      assert.equal(res.status, 200);
      assert.ok(res.data.data?.event, "Evento de push deve ser registrado no banco");
    });

    // -------------------------------------------------------------------------
    // 13. DASHBOARD E MODELO DE IMPORTAÇÃO
    // -------------------------------------------------------------------------
    console.log("\n📌 [13/13] Dashboard Consolidado & Importação XLSX");
    await runStep("GET /api/financas/dashboard - Métricas financeiras consolidadas", async () => {
      const res = await api(`/api/financas/dashboard?month=${currentMonth}`);
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
      const d = res.data.data;
      assert.ok(typeof d.gastoMesCents === "number", "Deve ter gastoMesCents");
      assert.ok(typeof d.gastoParceladoMesCents === "number", "Deve ter gastoParceladoMesCents");
      assert.ok(Array.isArray(d.faturasAbertas), "Deve ter array de faturasAbertas");
      assert.ok(Array.isArray(d.gastosPorCategoria), "Deve ter array de gastosPorCategoria");
      assert.ok(Array.isArray(d.gastosPorConta), "Deve ter array de gastosPorConta");
      assert.ok(Array.isArray(d.gastosPorCartao), "Deve ter array de gastosPorCartao");
      assert.ok(Array.isArray(d.comprometimentoFuturo), "Deve ter comprometimentoFuturo");
      assert.ok(d.comprometimentoTotalMes, "Deve ter comprometimentoTotalMes consolidado");
    });

    await runStep("GET /api/financas/transactions/import/template - Download de template XLSX", async () => {
      const res = await api("/api/financas/transactions/import/template");
      assert.equal(res.status, 200);
      const contentType = res.headers.get("content-type") || "";
      assert.ok(
        contentType.includes("spreadsheetml") || contentType.includes("octet-stream"),
        "Deve retornar planilha Excel",
      );
    });

    // -------------------------------------------------------------------------
    // LIMPEZA FINAL DOS DADOS DE TESTE
    // -------------------------------------------------------------------------
    console.log("\n🧹 Limpando dados criados pelo teste...");
    await runStep("Deletar transações, dívidas, cartões e contas de teste", async () => {
      // Deleta pagamentos e ocorrências
      if (debtId) {
        await db.run("DELETE FROM fin_debt_payments WHERE occurrence_id IN (SELECT id FROM fin_debt_occurrences WHERE debt_id = ?)", debtId);
        await db.run("DELETE FROM fin_debt_occurrences WHERE debt_id = ?", debtId);
        await db.run("DELETE FROM fin_debts WHERE id = ?", debtId);
      }
      // Deleta parcelas e planos
      if (installmentPlanId) {
        await db.run("DELETE FROM fin_installments WHERE plan_id = ?", installmentPlanId);
        await db.run("DELETE FROM fin_installment_plans WHERE id = ?", installmentPlanId);
      }
      // Deleta transações avulsas
      const txIds = [incomeTxId, expenseTxId, installmentTxId, importedTxId].filter(Boolean);
      for (const txId of txIds) {
        await db.run("DELETE FROM fin_transactions WHERE id = ?", txId);
      }
      // Deleta merchant
      if (merchantId) {
        await db.run("DELETE FROM fin_merchants WHERE id = ?", merchantId);
      }
      // Deleta cartão
      if (cardId) {
        await db.run("DELETE FROM fin_cards WHERE id = ?", cardId);
      }
      // Deleta categoria
      if (categoryId) {
        await db.run("DELETE FROM fin_categories WHERE id = ?", categoryId);
      }
      // Deleta conta
      if (accountId) {
        await db.run("DELETE FROM fin_accounts WHERE id = ?", accountId);
      }
    });

  } catch (globalErr) {
    console.error("\n❌ Erro fatal durante a execução dos testes:", globalErr);
  } finally {
    console.log("\n=======================================================================");
    console.log("📊 RESUMO DOS TESTES DO MÓDULO FINANCEIRO");
    console.log("=======================================================================");
    console.log(`✅ Sucessos: ${stats.passed}`);
    console.log(`❌ Falhas:   ${stats.failed}`);
    console.log(`📈 Taxa:     ${((stats.passed / (stats.passed + stats.failed || 1)) * 100).toFixed(1)}%`);
    console.log("=======================================================================\n");

    if (stats.failed > 0) {
      console.log("❌ Testes com falha:");
      for (const m of stats.modules.filter((mod) => mod.status === "FAIL")) {
        console.log(`  - ${m.name}: ${m.error}`);
      }
      process.exit(1);
    } else {
      console.log("🎉 TODOS OS TESTES DO MÓDULO FINANCEIRO PASSARAM COM SUCESSO! (100%)");
    }
  }
}

// Se executado diretamente pelo tsx
if (process.argv[1]?.endsWith("financas.test.ts")) {
  runFinancialTests().catch((e) => {
    console.error("Erro não capturado:", e);
    process.exit(1);
  });
}
