import * as XLSX from "xlsx";

import { listCategories } from "./categories.service.js";
import { listCards } from "./cards.service.js";
import { listAccounts, ensureDefaultAccount } from "./accounts.service.js";
import { createTransaction } from "./transactions.service.js";
import { createDebt } from "./debts.service.js";
import { isPossibleDuplicate } from "./duplicates.service.js";
import { getDb } from "../../../core/database.js";
import { AppError } from "../shared/errors.js";

const TEMPLATE_HEADERS = [
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

const DEBT_TEMPLATE_HEADERS = [
  "Nome",
  "Valor (R$)",
  "Dia Vencimento",
  "Categoria",
  "Conta",
  "Mês Início",
  "Mês Fim",
  "Observações",
];

const MAX_ROWS = 2000;

/** Gera o modelo de planilha (.xlsx) com abas de Transações, Dívidas Fixas e listas de consulta. */
export const generateImportTemplate = async (
  householdId: string,
  userId?: string,
): Promise<Buffer> => {
  const [categories, cards, accounts] = await Promise.all([
    listCategories(householdId),
    listCards(householdId),
    listAccounts(householdId),
  ]);

  // 1. Aba Transações
  const exampleRow = [
    "15/09/2026",
    "Despesa",
    "Supermercado Extra",
    "Compras do mês",
    "250,00",
    categories[0]?.name || "Alimentação",
    accounts[0]?.name || "Conta Corrente",
    cards[0]?.name || "",
    1,
    "Pago",
    "15/09/2026",
  ];

  const transacoesSheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, exampleRow]);
  transacoesSheet["!cols"] = [
    { wch: 12 }, // Data
    { wch: 14 }, // Tipo
    { wch: 24 }, // Estabelecimento
    { wch: 24 }, // Descrição
    { wch: 12 }, // Valor (R$)
    { wch: 16 }, // Categoria
    { wch: 16 }, // Conta
    { wch: 16 }, // Cartão
    { wch: 10 }, // Parcelas
    { wch: 12 }, // Status
    { wch: 16 }, // Data Vencimento
  ];

  // 2. Aba Dívidas Fixas (recorrentes)
  const debtExampleRow = [
    "Aluguel Apartamento",
    "1.800,00",
    10,
    categories.find((c: any) => normalizeHeader(c.name).includes("moradia"))?.name ||
      categories[0]?.name ||
      "Moradia",
    accounts[0]?.name || "Conta Corrente",
    "01/2026",
    "",
    "Contrato anual",
  ];

  const dividasSheet = XLSX.utils.aoa_to_sheet([DEBT_TEMPLATE_HEADERS, debtExampleRow]);
  dividasSheet["!cols"] = [
    { wch: 24 }, // Nome
    { wch: 14 }, // Valor (R$)
    { wch: 16 }, // Dia Vencimento
    { wch: 16 }, // Categoria
    { wch: 16 }, // Conta
    { wch: 12 }, // Mês Início
    { wch: 12 }, // Mês Fim
    { wch: 24 }, // Observações
  ];

  // 3. Abas de apoio para consulta
  const categoriasSheet = XLSX.utils.aoa_to_sheet([
    ["Categorias disponíveis"],
    ...categories.map((c: any) => [c.name]),
  ]);
  categoriasSheet["!cols"] = [{ wch: 24 }];

  const contasSheet = XLSX.utils.aoa_to_sheet([
    ["Contas disponíveis"],
    ...accounts.map((a: any) => [a.name]),
  ]);
  contasSheet["!cols"] = [{ wch: 24 }];

  const cartoesSheet = XLSX.utils.aoa_to_sheet([
    ["Cartões disponíveis"],
    ...cards.map((c: any) => [c.name]),
  ]);
  cartoesSheet["!cols"] = [{ wch: 24 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, transacoesSheet, "Transações");
  XLSX.utils.book_append_sheet(workbook, dividasSheet, "Dívidas Fixas");
  XLSX.utils.book_append_sheet(workbook, categoriasSheet, "Categorias disponíveis");
  XLSX.utils.book_append_sheet(workbook, contasSheet, "Contas disponíveis");
  XLSX.utils.book_append_sheet(workbook, cartoesSheet, "Cartões disponíveis");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

const normalizeHeader = (s: unknown): string =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const getColIndex = (headerMap: Map<string, number>, ...names: string[]): number | undefined => {
  for (const name of names) {
    const norm = normalizeHeader(name);
    if (headerMap.has(norm)) return headerMap.get(norm);
  }
  return undefined;
};

const getVal = (row: unknown[], idx: number | undefined): unknown => {
  if (idx === undefined || idx < 0 || idx >= row.length) return "";
  return row[idx];
};

const parseTipo = (raw: unknown): "debit" | "credit" | "transfer" => {
  if (raw === null || raw === undefined || raw === "") return "debit";
  const str = normalizeHeader(raw);
  if (str === "receita" || str === "credit" || str === "credito" || str === "entrada") return "credit";
  if (str === "transferencia" || str === "transfer") return "transfer";
  if (str === "despesa" || str === "debit" || str === "debito" || str === "saida") return "debit";
  return "debit";
};

const parseStatus = (raw: unknown): "PAID" | "PENDING" => {
  if (raw === null || raw === undefined || raw === "") return "PAID";
  const str = normalizeHeader(raw);
  if (str === "pendente" || str === "pending" || str === "a pagar") return "PENDING";
  if (str === "pago" || str === "paid" || str === "liquidado") return "PAID";
  return "PAID";
};

/** Converte "1.250,50" ou "250,00" ou "250.00" em centavos inteiros. */
const parseValorReais = (raw: unknown): number | null => {
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw === "number") {
    return Math.round(raw * 100);
  }
  let str = String(raw).trim();
  str = str.replace(/^R\$\s*/i, "");
  // Formato brasileiro: ponto = milhar, vírgula = decimal.
  if (str.includes(",")) {
    str = str.replace(/\./g, "").replace(",", ".");
  }
  const value = Number(str);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
};

/** Converte "DD/MM/AAAA" (ou Date do Excel) em "YYYY-MM-DD". */
const parseDataBr = (raw: unknown): string | null => {
  if (raw === null || raw === undefined || raw === "") return null;
  if (raw instanceof Date) {
    return raw.toISOString().slice(0, 10);
  }
  const str = String(raw).trim();
  const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const day = d.padStart(2, "0");
  const month = m.padStart(2, "0");
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return null;
  return `${y}-${month}-${day}`;
};

/** Converte "MM/AAAA" ou "AAAA-MM" em "YYYY-MM". */
const parseMonthStr = (raw: unknown): string | null => {
  if (raw === null || raw === undefined || raw === "") return null;
  if (raw instanceof Date) {
    return raw.toISOString().slice(0, 7);
  }
  const str = String(raw).trim();
  const matchBr = str.match(/^(\d{1,2})\/(\d{4})$/);
  if (matchBr) {
    const m = matchBr[1].padStart(2, "0");
    const y = matchBr[2];
    if (Number(m) >= 1 && Number(m) <= 12) {
      return `${y}-${m}`;
    }
  }
  const matchIso = str.match(/^(\d{4})-(\d{2})$/);
  if (matchIso) {
    const m = matchIso[2];
    if (Number(m) >= 1 && Number(m) <= 12) {
      return str;
    }
  }
  return null;
};

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportResult {
  success: true;
  imported: number;
  importedDebts: number;
  failed: number;
  duplicated: number;
  errors: ImportRowError[];
  duplicates: ImportRowError[];
}

/** Faz o parse do .xlsx para transações e dívidas fixas com cabeçalhos normalizados. */
export async function importTransactionsFromXlsx(
  householdId: string,
  userId: string,
  fileBuffer: Buffer,
): Promise<ImportResult>;
export async function importTransactionsFromXlsx(
  userId: string,
  fileBuffer: Buffer,
): Promise<ImportResult>;
export async function importTransactionsFromXlsx(
  arg1: string,
  arg2: any,
  arg3?: any,
): Promise<ImportResult> {
  let householdId: string;
  let userId: string;
  let fileBuffer: Buffer;

  if (typeof arg2 === "string" && arg3) {
    householdId = arg1;
    userId = arg2;
    fileBuffer = arg3;
  } else {
    userId = arg1;
    fileBuffer = arg2;
    const db = await getDb();
    const member = await db.get<{ household_id: string }>(
      "SELECT household_id FROM financial_household_members WHERE user_id = ? LIMIT 1",
      userId,
    );
    householdId = member?.household_id || userId;
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true });
  } catch {
    throw new AppError("Arquivo inválido — envie um .xlsx válido", 400);
  }

  // Localiza abas
  const sheetDebtsName = workbook.SheetNames.find((n) => {
    const norm = normalizeHeader(n);
    return norm.includes("divida") || norm.includes("fixa") || norm.includes("recorren");
  });

  const sheetTxName =
    workbook.SheetNames.find((n) => {
      const norm = normalizeHeader(n);
      return norm.includes("transac") || norm === "extrato" || norm === "lancamentos";
    }) || workbook.SheetNames.find((n) => n !== sheetDebtsName);

  const sheetTx = sheetTxName ? workbook.Sheets[sheetTxName] : null;
  const sheetDebts = sheetDebtsName ? workbook.Sheets[sheetDebtsName] : null;

  if (!sheetTx && !sheetDebts) {
    throw new AppError("Planilha sem aba de Transações ou Dívidas Fixas", 400);
  }

  const [categories, cards, accounts, defaultAccountId, db] = await Promise.all([
    listCategories(householdId),
    listCards(householdId),
    listAccounts(householdId),
    ensureDefaultAccount(householdId, userId),
    getDb(),
  ]);

  const categoryByName = new Map<string, number>(
    categories.map((c: any) => [normalizeHeader(c.name), c.id]),
  );
  const cardByName = new Map<string, number>(
    cards.map((c: any) => [normalizeHeader(c.name), c.id]),
  );
  const accountByName = new Map<string, number>(
    accounts.map((a: any) => [normalizeHeader(a.name), a.id]),
  );

  let imported = 0;
  let importedDebts = 0;
  const errors: ImportRowError[] = [];
  const duplicates: ImportRowError[] = [];

  // =========================================================================
  // 1. Processar aba de Transações
  // =========================================================================
  if (sheetTx) {
    const txRows: unknown[][] = XLSX.utils.sheet_to_json(sheetTx, {
      header: 1,
      raw: true,
      defval: "",
    });

    if (txRows.length > 0) {
      const headerRow = txRows[0] as unknown[];
      const headerMap = new Map<string, number>();
      for (let c = 0; c < headerRow.length; c++) {
        const norm = normalizeHeader(headerRow[c]);
        if (norm) headerMap.set(norm, c);
      }

      const colData = getColIndex(headerMap, "data");
      const colTipo = getColIndex(headerMap, "tipo");
      const colEstabelecimento = getColIndex(
        headerMap,
        "estabelecimento",
        "local",
        "comerciante",
        "empresa",
        "pagador",
      );
      const colDescricao = getColIndex(headerMap, "descricao", "detalhes", "observacao");
      const colValor = getColIndex(headerMap, "valor (r$)", "valor r$", "valor(r$)", "valor");
      const colCategoria = getColIndex(headerMap, "categoria");
      const colConta = getColIndex(headerMap, "conta", "conta bancaria");
      const colCartao = getColIndex(headerMap, "cartao", "cartao de credito");
      const colParcelas = getColIndex(headerMap, "parcelas", "parcela");
      const colStatus = getColIndex(headerMap, "status", "situacao");
      const colDataVencimento = getColIndex(
        headerMap,
        "data vencimento",
        "data de vencimento",
        "vencimento",
      );

      // Se a aba tiver os cabeçalhos mínimos de transações
      if (colData !== undefined && colEstabelecimento !== undefined && colValor !== undefined) {
        const dataRows = txRows.slice(1);
        if (dataRows.length > MAX_ROWS) {
          throw new AppError(`Aba Transações excede o limite de ${MAX_ROWS} linhas`, 400);
        }

        for (let i = 0; i < dataRows.length; i++) {
          const rowNumber = i + 2;
          const row = dataRows[i];

          const rawData = getVal(row, colData);
          const rawEstabelecimento = getVal(row, colEstabelecimento);
          const rawValor = getVal(row, colValor);

          const isEmpty =
            (rawData === "" || rawData === undefined) &&
            (rawEstabelecimento === "" || rawEstabelecimento === undefined) &&
            (rawValor === "" || rawValor === undefined);
          if (isEmpty) continue;

          try {
            const transactionDate = parseDataBr(rawData);
            if (!transactionDate) {
              throw new AppError("Data inválida — use o formato DD/MM/AAAA", 400);
            }
            const merchantName = String(rawEstabelecimento || "").trim();
            if (!merchantName) {
              throw new AppError("Estabelecimento é obrigatório", 400);
            }
            const amountCents = parseValorReais(rawValor);
            if (!amountCents || amountCents <= 0) {
              throw new AppError("Valor inválido", 400);
            }

            const rawTipo = getVal(row, colTipo);
            const type = parseTipo(rawTipo);

            const rawDescricao = getVal(row, colDescricao);
            const description = String(rawDescricao || "").trim() || undefined;

            const rawCategoria = getVal(row, colCategoria);
            const categoriaStr = String(rawCategoria || "").trim();
            const categoryId = categoriaStr ? categoryByName.get(normalizeHeader(categoriaStr)) : undefined;

            const rawConta = getVal(row, colConta);
            const contaStr = String(rawConta || "").trim();
            let accountId = defaultAccountId;
            if (contaStr) {
              const foundAccountId = accountByName.get(normalizeHeader(contaStr));
              if (!foundAccountId) {
                throw new AppError(`Conta "${contaStr}" não encontrada`, 400);
              }
              accountId = foundAccountId;
            }

            const rawCartao = getVal(row, colCartao);
            const cartaoStr = String(rawCartao || "").trim();
            const cardId = cartaoStr ? cardByName.get(normalizeHeader(cartaoStr)) : undefined;

            const rawParcelas = getVal(row, colParcelas);
            let installmentsTotal = 1;
            if (rawParcelas !== "" && rawParcelas !== undefined) {
              const parsed = Number(rawParcelas);
              if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 60) {
                installmentsTotal = parsed;
              }
            }

            const rawStatus = getVal(row, colStatus);
            const status = parseStatus(rawStatus);

            const rawDataVencimento = getVal(row, colDataVencimento);
            let dueDate: string | undefined = undefined;
            if (rawDataVencimento !== "" && rawDataVencimento !== undefined) {
              const parsedDue = parseDataBr(rawDataVencimento);
              if (!parsedDue) {
                throw new AppError("Data de vencimento inválida — use o formato DD/MM/AAAA", 400);
              }
              dueDate = parsedDue;
            }

            const { duplicate } = await isPossibleDuplicate(
              userId,
              merchantName,
              amountCents,
              transactionDate,
              "IMPORT",
            );
            if (duplicate) {
              duplicates.push({ row: rowNumber, message: "Transação semelhante já existe — ignorada" });
              continue;
            }

            await createTransaction(householdId, userId, {
              accountId,
              cardId,
              merchantName,
              description,
              amountCents,
              type,
              transactionDate,
              categoryId,
              installmentsTotal,
              status,
              dueDate,
              source: "IMPORT",
            });
            imported++;
          } catch (err: any) {
            errors.push({ row: rowNumber, message: err?.message || "Erro desconhecido" });
          }
        }
      }
    }
  }

  // =========================================================================
  // 2. Processar aba de Dívidas Fixas (se existir)
  // =========================================================================
  if (sheetDebts) {
    const debtRows: unknown[][] = XLSX.utils.sheet_to_json(sheetDebts, {
      header: 1,
      raw: true,
      defval: "",
    });

    if (debtRows.length > 0) {
      const headerRow = debtRows[0] as unknown[];
      const headerMap = new Map<string, number>();
      for (let c = 0; c < headerRow.length; c++) {
        const norm = normalizeHeader(headerRow[c]);
        if (norm) headerMap.set(norm, c);
      }

      const colNome = getColIndex(headerMap, "nome", "divida", "titulo", "descricao");
      const colValor = getColIndex(headerMap, "valor (r$)", "valor r$", "valor(r$)", "valor");
      const colDia = getColIndex(headerMap, "dia vencimento", "dia do vencimento", "dia", "vencimento");
      const colCategoria = getColIndex(headerMap, "categoria");
      const colConta = getColIndex(headerMap, "conta", "conta bancaria");
      const colMesInicio = getColIndex(headerMap, "mes inicio", "mes de inicio", "inicio");
      const colMesFim = getColIndex(headerMap, "mes fim", "mes de fim", "fim", "termino");
      const colObservacoes = getColIndex(headerMap, "observacoes", "observacao", "notas");

      if (colNome !== undefined && colValor !== undefined) {
        const dataRows = debtRows.slice(1);
        for (let i = 0; i < dataRows.length; i++) {
          const rowNumber = i + 2;
          const row = dataRows[i];

          const rawNome = getVal(row, colNome);
          const rawValor = getVal(row, colValor);

          const isEmpty =
            (rawNome === "" || rawNome === undefined) &&
            (rawValor === "" || rawValor === undefined);
          if (isEmpty) continue;

          try {
            const name = String(rawNome || "").trim();
            if (!name) {
              throw new AppError("[Dívidas Fixas] Nome da dívida é obrigatório", 400);
            }

            const amountCents = parseValorReais(rawValor);
            if (!amountCents || amountCents <= 0) {
              throw new AppError(`[Dívidas Fixas] Valor inválido para "${name}"`, 400);
            }

            let dueDay = 10;
            const rawDia = getVal(row, colDia);
            if (rawDia !== "" && rawDia !== undefined) {
              const parsedDay = Number(rawDia);
              if (Number.isInteger(parsedDay) && parsedDay >= 1 && parsedDay <= 31) {
                dueDay = parsedDay;
              } else {
                throw new AppError(
                  `[Dívidas Fixas] Dia de vencimento inválido para "${name}" (use 1 a 31)`,
                  400,
                );
              }
            }

            const rawCategoria = getVal(row, colCategoria);
            const categoriaStr = String(rawCategoria || "").trim();
            const categoryId = categoriaStr
              ? categoryByName.get(normalizeHeader(categoriaStr))
              : undefined;

            const rawConta = getVal(row, colConta);
            const contaStr = String(rawConta || "").trim();
            let accountId: number | undefined = undefined;
            if (contaStr) {
              const foundAccountId = accountByName.get(normalizeHeader(contaStr));
              if (!foundAccountId) {
                throw new AppError(`[Dívidas Fixas] Conta "${contaStr}" não encontrada`, 400);
              }
              accountId = foundAccountId;
            }

            const rawMesInicio = getVal(row, colMesInicio);
            let startMonth: string | undefined = undefined;
            if (rawMesInicio !== "" && rawMesInicio !== undefined) {
              const parsedMonth = parseMonthStr(rawMesInicio);
              if (!parsedMonth) {
                throw new AppError(
                  `[Dívidas Fixas] Mês de início inválido para "${name}" (use MM/AAAA)`,
                  400,
                );
              }
              startMonth = parsedMonth;
            }

            const rawMesFim = getVal(row, colMesFim);
            let endMonth: string | null = null;
            if (rawMesFim !== "" && rawMesFim !== undefined) {
              const parsedMonth = parseMonthStr(rawMesFim);
              if (!parsedMonth) {
                throw new AppError(
                  `[Dívidas Fixas] Mês de fim inválido para "${name}" (use MM/AAAA)`,
                  400,
                );
              }
              endMonth = parsedMonth;
            }

            const rawObservacoes = getVal(row, colObservacoes);
            const notes = String(rawObservacoes || "").trim() || null;

            // Evita duplicar se a dívida fixa já existir com mesmo nome e ativa
            const existingDebt = await db.get(
              "SELECT id FROM fin_debts WHERE (household_id = ? OR user_id = ?) AND LOWER(name) = ? AND active = 1",
              householdId,
              userId,
              name.toLowerCase(),
            );
            if (existingDebt) {
              duplicates.push({
                row: rowNumber,
                message: `[Dívidas Fixas] Dívida "${name}" já cadastrada — ignorada`,
              });
              continue;
            }

            await createDebt(householdId, {
              name,
              amountCents,
              dueDay,
              categoryId: categoryId ?? null,
              accountId: accountId ?? null,
              startMonth,
              endMonth,
              notes,
            }, userId);
            importedDebts++;
          } catch (err: any) {
            errors.push({ row: rowNumber, message: err?.message || "Erro desconhecido" });
          }
        }
      }
    }
  }

  return {
    success: true,
    imported,
    importedDebts,
    failed: errors.length,
    duplicated: duplicates.length,
    errors,
    duplicates,
  };
}
