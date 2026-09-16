import assert from "node:assert/strict";
import { generatePermanentTestToken } from "../src/shared/auth/jwt-auth.js";

const BASE_URL = process.env.API_BASE_URL || "http://localhost:3001";
const TOKEN = generatePermanentTestToken("usuario-teste-dashboard@jenus.local");

async function api(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TOKEN}`,
      ...(options.headers as Record<string, string> || {}),
    },
  });

  const contentType = res.headers.get("content-type") || "";
  let data: any = null;
  if (contentType.includes("application/json")) {
    data = await res.json().catch(() => null);
  } else if (contentType.includes("spreadsheetml") || contentType.includes("octet-stream")) {
    data = await res.arrayBuffer();
  } else {
    data = await res.text();
  }

  return { status: res.status, ok: res.ok, data, headers: res.headers };
}

function formatBRL(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

async function testCenario13() {
  console.log("=======================================================================");
  console.log("📊 TESTE PRÁTICO: CENÁRIO 13 & 17 — DASHBOARD CONSOLIDADO & PLANILHA");
  console.log(`📡 Conectando em: ${BASE_URL}`);
  console.log("=======================================================================\n");

  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);

  // PASSO 1: Consultar Dashboard Consolidado
  console.log(`▶ [Passo 1] Consultando métricas consolidadas do Dashboard para o mês ${currentMonth}...`);
  const dashRes = await api(`/api/financas/dashboard?month=${currentMonth}`);
  console.log(`   Status HTTP: ${dashRes.status}`);
  assert.equal(dashRes.status, 200, "Dashboard deve retornar 200");
  assert.equal(dashRes.data.success, true);

  const d = dashRes.data.data;
  console.log("\n   📈 MÉTRICAS PRINCIPAIS DO DASHBOARD:");
  console.log(`   - Gasto do Mês (à vista / débito): ${formatBRL(d.gastoMesCents)}`);
  console.log(`   - Compras Parceladas no Mês: ${formatBRL(d.gastoParceladoMesCents)}`);
  console.log(`   - Faturas Abertas Vigentes: ${d.faturasAbertas.length} cartão(ões)`);

  if (d.faturasAbertas.length > 0) {
    for (const f of d.faturasAbertas) {
      console.log(`     * ${f.cardName}: ${formatBRL(f.totalCents)} (Vence em ${f.dueDate})`);
    }
  }

  console.log(`   - Dívidas Fixas do Mês: Previsto ${formatBRL(d.dividasMes?.previstoCents || 0)} | Pago ${formatBRL(d.dividasMes?.pagoCents || 0)}`);
  console.log(`   - Comprometimento Total do Mês: ${formatBRL(d.comprometimentoTotalMes?.totalCents || 0)} (${d.comprometimentoTotalMes?.percentualPago || 0}% pago)`);
  console.log(`   - Comprometimento Futuro: ${d.comprometimentoFuturo.length} meses projetados`);
  console.log(`   - Categorias com gastos: ${d.gastosPorCategoria.length}`);
  console.log(`   - Contas com gastos: ${d.gastosPorConta.length}`);
  console.log(`   - Cartões com gastos: ${d.gastosPorCartao.length}`);

  assert.ok(typeof d.gastoMesCents === "number");
  assert.ok(typeof d.gastoParceladoMesCents === "number");
  assert.ok(Array.isArray(d.faturasAbertas));
  assert.ok(Array.isArray(d.comprometimentoFuturo));
  assert.ok(Array.isArray(d.gastosPorCategoria));
  assert.ok(Array.isArray(d.gastosPorConta));
  assert.ok(Array.isArray(d.gastosPorCartao));
  console.log("   ✅ Passo 1 concluído com sucesso!\n");

  // PASSO 2: Testar Download do Template Excel (.xlsx) para Importação
  console.log("▶ [Passo 2] Testando download dinâmico do modelo de planilha Excel (.xlsx)...");
  const templateRes = await api("/api/financas/transactions/import/template");
  console.log(`   Status HTTP: ${templateRes.status}`);
  assert.equal(templateRes.status, 200);

  const contentType = templateRes.headers.get("content-type") || "";
  const contentDisp = templateRes.headers.get("content-disposition") || "";
  const bufferSize = templateRes.data?.byteLength || 0;

  console.log(`   Content-Type: ${contentType}`);
  console.log(`   Content-Disposition: ${contentDisp}`);
  console.log(`   Tamanho da Planilha Gerada: ${(bufferSize / 1024).toFixed(2)} KB`);

  assert.ok(
    contentType.includes("spreadsheetml") || contentType.includes("octet-stream"),
    "Deve retornar arquivo Excel oficial",
  );
  assert.ok(bufferSize > 1000, "Planilha deve conter dados (abas de apoio e colunas)");
  console.log("   ✅ Passo 2 concluído com sucesso!\n");

  // PASSO 3: Testar Webhook dos Atalhos da Apple / Siri (iOS)
  console.log("▶ [Passo 3] Testando Webhook público para automação Siri / Apple Shortcuts...");
  const webhookRes = await api("/api/financas/webhook/shortcut", {
    method: "POST",
    body: JSON.stringify({
      text: `Compra de R$ 54,90 na Drogaria Pacheco ${Date.now()} aprovada`,
      appLabel: "Nubank",
    }),
  });

  console.log(`   Status HTTP: ${webhookRes.status}`);
  assert.equal(webhookRes.status, 201);
  assert.equal(webhookRes.data.success, true);
  console.log(`   Resposta do Webhook: "${webhookRes.data.message}"`);
  console.log("   ✅ Passo 3 concluído com sucesso!\n");

  console.log("=======================================================================");
  console.log("🎉 CENÁRIO 13 & 17 (DASHBOARD, TEMPLATE & WEBHOOK) 100% VALIDADO!");
  console.log("=======================================================================");
}

testCenario13().catch((err) => {
  console.error("❌ Falha no teste do Cenário 13:", err);
  process.exit(1);
});
