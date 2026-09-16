import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { initDb, getDb } from "../../../core/database.js";
import { createAccount } from "../services/accounts.service.js";
import { createCategory } from "../services/categories.service.js";
import {
  generateImportTemplate,
  importTransactionsFromXlsx,
} from "../services/import.service.js";

async function runTests() {
  console.log("=======================================================================");
  console.log("🚀 INICIANDO TESTES DO PARSER DE IMPORTAÇÃO (TRANSAÇÕES + DÍVIDAS FIXAS)");
  console.log("=======================================================================\n");

  await initDb();
  const db = await getDb();

  const testUserId = `test-user-import-${Date.now()}`;

  // Cria categorias e contas de teste
  const catAlimentacao = await createCategory(testUserId, {
    name: "Alimentação Teste",
    kind: "expense",
  });
  const catSalario = await createCategory(testUserId, {
    name: "Salário Teste",
    kind: "income",
  });

  const contaItau = await createAccount(testUserId, {
    name: "Itaú Teste",
    type: "checking",
  });
  const contaNubank = await createAccount(testUserId, {
    name: "Nubank Teste",
    type: "checking",
  });

  try {
    // -------------------------------------------------------------------------
    // TESTE 0: Geração do Template com Transações, Dívidas Fixas e Abas Auxiliares
    // -------------------------------------------------------------------------
    console.log("📌 [Teste 0] Geração do template XLSX com abas de Transações e Dívidas Fixas");
    const templateBuffer = await generateImportTemplate(testUserId);
    assert.ok(templateBuffer && templateBuffer.length > 0, "Buffer deve ser gerado");

    const templateWb = XLSX.read(templateBuffer, { type: "buffer" });
    assert.deepEqual(
      templateWb.SheetNames,
      ["Transações", "Dívidas Fixas", "Categorias disponíveis", "Contas disponíveis", "Cartões disponíveis"],
      "Deve conter as 5 abas esperadas",
    );

    const transacoesSheet = templateWb.Sheets["Transações"];
    const templateRows = XLSX.utils.sheet_to_json(transacoesSheet, { header: 1 }) as unknown[][];
    assert.deepEqual(
      templateRows[0],
      [
        "Data",
        "Tipo",
        "Estabelecimento",
        "Descrição",
        "Valor (R$)",
        "Categoria",
        "Conta",
        "Cartão",
        "Parcelas",
        "Status",
        "Data Vencimento",
      ],
      "Cabeçalho de Transações deve conter exatamente as 11 colunas",
    );

    const dividasSheet = templateWb.Sheets["Dívidas Fixas"];
    const dividasRows = XLSX.utils.sheet_to_json(dividasSheet, { header: 1 }) as unknown[][];
    assert.deepEqual(
      dividasRows[0],
      [
        "Nome",
        "Valor (R$)",
        "Dia Vencimento",
        "Categoria",
        "Conta",
        "Mês Início",
        "Mês Fim",
        "Observações",
      ],
      "Cabeçalho de Dívidas Fixas deve conter exatamente as 8 colunas",
    );
    console.log("  ✅ Template validado com sucesso (5 abas e colunas corretas)\n");

    // -------------------------------------------------------------------------
    // CENÁRIO 1: Novo formato (11 colunas com Receita, Despesa, Conta, Status)
    // -------------------------------------------------------------------------
    console.log("📌 [Cenário 1] Importação com novo formato (11 colunas)");
    const headers11 = [
      "Data",
      "Tipo",
      "Estabelecimento",
      "Descrição",
      "Valor (R$)",
      "Categoria",
      "Conta",
      "Cartão",
      "Parcelas",
      "Status",
      "Data Vencimento",
    ];

    const rowReceita = [
      "10/09/2026",
      "Receita",
      "Empresa XYZ",
      "Salário Mensal",
      "5.000,00",
      "Salário Teste",
      "Itaú Teste",
      "",
      1,
      "Pago",
      "10/09/2026",
    ];

    const rowDespesa = [
      "15/09/2026",
      "Despesa",
      "Restaurante Sabor",
      "Almoço",
      "85,50",
      "Alimentação Teste",
      "Nubank Teste",
      "",
      1,
      "Pago",
      "20/09/2026",
    ];

    const wb1 = XLSX.utils.book_new();
    const ws1 = XLSX.utils.aoa_to_sheet([headers11, rowReceita, rowDespesa]);
    XLSX.utils.book_append_sheet(wb1, ws1, "Transações");
    const buf1 = XLSX.write(wb1, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const res1 = await importTransactionsFromXlsx(testUserId, buf1);
    assert.equal(res1.imported, 2, "Deve importar 2 transações");
    assert.equal(res1.failed, 0, "Nenhuma falha esperada");
    assert.equal(res1.duplicated, 0, "Nenhuma duplicação esperada");

    // Valida persistência da Receita
    const txReceita = await db.get(
      `SELECT * FROM fin_transactions WHERE user_id = ? AND description = 'Salário Mensal'`,
      testUserId,
    );
    assert.ok(txReceita, "Transação de receita deve existir no banco");
    assert.equal(txReceita.type, "credit", "Tipo deve ser 'credit'");
    assert.equal(txReceita.amount_cents, 500000, "Valor deve ser 500000 centavos");
    assert.equal(txReceita.account_id, contaItau.id, "Conta deve ser Itaú Teste");
    assert.equal(txReceita.status, "PAID", "Status deve ser PAID");
    assert.equal(txReceita.due_date, "2026-09-10", "Due date deve ser 2026-09-10");
    assert.equal(txReceita.paid_date, "2026-09-10", "Paid date deve ser 2026-09-10");

    // Valida persistência da Despesa
    const txDespesa = await db.get(
      `SELECT * FROM fin_transactions WHERE user_id = ? AND description = 'Almoço'`,
      testUserId,
    );
    assert.ok(txDespesa, "Transação de despesa deve existir no banco");
    assert.equal(txDespesa.type, "debit", "Tipo deve ser 'debit'");
    assert.equal(txDespesa.amount_cents, 8550, "Valor deve ser 8550 centavos");
    assert.equal(txDespesa.account_id, contaNubank.id, "Conta deve ser Nubank Teste");
    assert.equal(txDespesa.status, "PAID", "Status deve ser PAID");
    assert.equal(txDespesa.due_date, "2026-09-20", "Due date deve ser 2026-09-20");
    assert.equal(txDespesa.paid_date, "2026-09-15", "Paid date deve ser 2026-09-15");
    console.log("  ✅ Cenário 1 concluído com sucesso: Receita e Despesa persistidas corretamente\n");

    // -------------------------------------------------------------------------
    // CENÁRIO 2: Formato Legado (7 colunas antigas)
    // -------------------------------------------------------------------------
    console.log("📌 [Cenário 2] Retrocompatibilidade com formato legado (7 colunas)");
    const headersLegado = [
      "Data",
      "Estabelecimento",
      "Descrição",
      "Valor (R$)",
      "Categoria",
      "Cartão",
      "Parcelas",
    ];

    const rowLegado = [
      "12/09/2026",
      "Padaria Central",
      "Café da manhã",
      "25,00",
      "Alimentação Teste",
      "",
      1,
    ];

    const wb2 = XLSX.utils.book_new();
    const ws2 = XLSX.utils.aoa_to_sheet([headersLegado, rowLegado]);
    XLSX.utils.book_append_sheet(wb2, ws2, "Transações");
    const buf2 = XLSX.write(wb2, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const res2 = await importTransactionsFromXlsx(testUserId, buf2);
    assert.equal(res2.imported, 1, "Deve importar 1 transação legada");
    assert.equal(res2.failed, 0, "Nenhuma falha no formato legado");

    const txLegado = await db.get(
      `SELECT * FROM fin_transactions WHERE user_id = ? AND description = 'Café da manhã'`,
      testUserId,
    );
    assert.ok(txLegado, "Transação legada deve existir no banco");
    assert.equal(txLegado.type, "debit", "Tipo padrão deve ser 'debit'");
    assert.equal(txLegado.status, "PAID", "Status padrão deve ser 'PAID'");
    assert.equal(txLegado.due_date, "2026-09-12", "Due date padrão deve ser a transaction_date");
    assert.ok(txLegado.account_id > 0, "Deve associar a uma conta padrão");
    console.log("  ✅ Cenário 2 concluído com sucesso: formato legado processado com valores padrão\n");

    // -------------------------------------------------------------------------
    // CENÁRIO 3: Conta inválida gera erro claro com linha
    // -------------------------------------------------------------------------
    console.log("📌 [Cenário 3] Validação de conta inexistente");
    const rowContaInvalida = [
      "14/09/2026",
      "Despesa",
      "Farmácia Vida",
      "Remédio",
      "45,00",
      "Alimentação Teste",
      "Conta Fantasma Inexistente",
      "",
      1,
      "Pago",
      "14/09/2026",
    ];

    const wb3 = XLSX.utils.book_new();
    const ws3 = XLSX.utils.aoa_to_sheet([headers11, rowContaInvalida]);
    XLSX.utils.book_append_sheet(wb3, ws3, "Transações");
    const buf3 = XLSX.write(wb3, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const res3 = await importTransactionsFromXlsx(testUserId, buf3);
    assert.equal(res3.imported, 0, "Nenhuma transação deve ser importada");
    assert.equal(res3.failed, 1, "Deve registrar 1 falha");
    assert.equal(res3.errors.length, 1, "Deve conter 1 erro detalhado");
    assert.equal(res3.errors[0].row, 2, "Linha do erro deve ser 2");
    assert.ok(
      res3.errors[0].message.includes("Conta Fantasma Inexistente"),
      `Mensagem deve citar a conta inválida: ${res3.errors[0].message}`,
    );
    console.log(`  ✅ Cenário 3 concluído com sucesso: Erro capturado na linha 2: "${res3.errors[0].message}"\n`);

    // -------------------------------------------------------------------------
    // CENÁRIO 4: Importação de Dívidas Fixas (aba 'Dívidas Fixas')
    // -------------------------------------------------------------------------
    console.log("📌 [Cenário 4] Importação de Dívidas Fixas (recorrentes)");
    const debtHeaders = [
      "Nome",
      "Valor (R$)",
      "Dia Vencimento",
      "Categoria",
      "Conta",
      "Mês Início",
      "Mês Fim",
      "Observações",
    ];

    const rowDebtAluguel = [
      "Aluguel Residencial Teste",
      "2.200,00",
      10,
      "Alimentação Teste",
      "Itaú Teste",
      "09/2026",
      "",
      "Contrato Imobiliária",
    ];

    const rowDebtInternet = [
      "Internet Fibra Teste",
      "149,90",
      20,
      "",
      "Nubank Teste",
      "09/2026",
      "12/2026",
      "Plano 600MB",
    ];

    const wb4 = XLSX.utils.book_new();
    const ws4 = XLSX.utils.aoa_to_sheet([debtHeaders, rowDebtAluguel, rowDebtInternet]);
    XLSX.utils.book_append_sheet(wb4, ws4, "Dívidas Fixas");
    const buf4 = XLSX.write(wb4, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const res4 = await importTransactionsFromXlsx(testUserId, buf4);
    assert.equal(res4.importedDebts, 2, "Deve cadastrar 2 dívidas fixas");
    assert.equal(res4.failed, 0, "Nenhuma falha em dívidas fixas");

    // Valida no banco fin_debts
    const debtAluguel = await db.get(
      "SELECT * FROM fin_debts WHERE user_id = ? AND name = 'Aluguel Residencial Teste'",
      testUserId,
    );
    assert.ok(debtAluguel, "Dívida do aluguel deve existir no banco");
    assert.equal(debtAluguel.amount_cents, 220000);
    assert.equal(debtAluguel.due_day, 10);
    assert.equal(debtAluguel.account_id, contaItau.id);
    assert.equal(debtAluguel.start_month, "2026-09");
    assert.equal(debtAluguel.notes, "Contrato Imobiliária");

    const debtInternet = await db.get(
      "SELECT * FROM fin_debts WHERE user_id = ? AND name = 'Internet Fibra Teste'",
      testUserId,
    );
    assert.ok(debtInternet, "Dívida de internet deve existir no banco");
    assert.equal(debtInternet.amount_cents, 14990);
    assert.equal(debtInternet.due_day, 20);
    assert.equal(debtInternet.account_id, contaNubank.id);
    assert.equal(debtInternet.end_month, "2026-12");

    // Valida que as ocorrências do mês foram criadas
    const occAluguel = await db.get(
      "SELECT * FROM fin_debt_occurrences WHERE debt_id = ? AND month = '2026-09'",
      debtAluguel.id,
    );
    assert.ok(occAluguel, "Ocorrência mensal do aluguel deve existir");
    assert.equal(occAluguel.due_date, "2026-09-10");
    assert.equal(occAluguel.expected_amount_cents, 220000);

    console.log("  ✅ Cenário 4 concluído com sucesso: Dívidas fixas e ocorrências cadastradas\n");

    console.log("=======================================================================");
    console.log("🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!");
    console.log("=======================================================================");
  } finally {
    // Limpa dados criados pelo teste
    await db.run("DELETE FROM fin_debt_payments WHERE user_id = ?", testUserId);
    await db.run("DELETE FROM fin_debt_occurrences WHERE user_id = ?", testUserId);
    await db.run("DELETE FROM fin_debts WHERE user_id = ?", testUserId);
    await db.run("DELETE FROM fin_transactions WHERE user_id = ?", testUserId);
    await db.run("DELETE FROM fin_accounts WHERE user_id = ?", testUserId);
    await db.run("DELETE FROM fin_categories WHERE user_id = ?", testUserId);
    await db.run("DELETE FROM fin_merchants WHERE user_id = ?", testUserId);
  }
}

runTests().catch((err) => {
  console.error("❌ ERRO DURANTE EXECUÇÃO DOS TESTES:", err);
  process.exit(1);
});
