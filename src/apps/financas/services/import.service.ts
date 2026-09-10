import * as XLSX from "xlsx";

import { listCategories } from "./categories.service.js";
import { listCards } from "./cards.service.js";
import { ensureDefaultAccount } from "./accounts.service.js";
import { createTransaction } from "./transactions.service.js";
import { isPossibleDuplicate } from "./duplicates.service.js";
import { AppError } from "../shared/errors.js";

const TEMPLATE_HEADERS = [
  "Data",
  "Estabelecimento",
  "Descrição",
  "Valor (R$)",
  "Categoria",
  "Cartão",
  "Parcelas",
];

const MAX_ROWS = 2000;

/** Gera o modelo de planilha (.xlsx) personalizado com as categorias e cartões do usuário. */
export const generateImportTemplate = async (userId: string): Promise<Buffer> => {
  const [categories, cards] = await Promise.all([
    listCategories(userId),
    listCards(userId),
  ]);

  const exampleRow = [
    "15/09/2026",
    "Supermercado Extra",
    "Compras do mês",
    "250,00",
    "Alimentação",
    "Nubank",
    1,
  ];

  const transacoesSheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, exampleRow]);
  transacoesSheet["!cols"] = [
    { wch: 12 },
    { wch: 24 },
    { wch: 24 },
    { wch: 12 },
    { wch: 16 },
    { wch: 16 },
    { wch: 10 },
  ];

  const categoriasSheet = XLSX.utils.aoa_to_sheet([
    ["Categorias disponíveis"],
    ...categories.map((c: any) => [c.name]),
  ]);
  categoriasSheet["!cols"] = [{ wch: 24 }];

  const cartoesSheet = XLSX.utils.aoa_to_sheet([
    ["Cartões disponíveis"],
    ...cards.map((c: any) => [c.name]),
  ]);
  cartoesSheet["!cols"] = [{ wch: 24 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, transacoesSheet, "Transações");
  XLSX.utils.book_append_sheet(workbook, categoriasSheet, "Categorias disponíveis");
  XLSX.utils.book_append_sheet(workbook, cartoesSheet, "Cartões disponíveis");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
};

const normalize = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();

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

export interface ImportRowError {
  row: number;
  message: string;
}

export interface ImportResult {
  success: true;
  imported: number;
  failed: number;
  duplicated: number;
  errors: ImportRowError[];
  duplicates: ImportRowError[];
}

/** Faz o parse do .xlsx e cria as transações válidas, coletando erros por linha. */
export const importTransactionsFromXlsx = async (
  userId: string,
  fileBuffer: Buffer,
): Promise<ImportResult> => {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(fileBuffer, { type: "buffer", cellDates: true });
  } catch {
    throw new AppError("Arquivo inválido — envie um .xlsx válido", 400);
  }

  const sheetName =
    workbook.SheetNames.find((n) => normalize(n) === normalize("Transações")) ||
    workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new AppError("Planilha sem aba de Transações", 400);
  }

  const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
  // Pula só o cabeçalho (linha 1). A linha 2 (exemplo) é tratada como dado real
  // caso o usuário a mantenha preenchida.
  const dataRows = rows.slice(1);

  if (dataRows.length > MAX_ROWS) {
    throw new AppError(`Planilha excede o limite de ${MAX_ROWS} linhas`, 400);
  }

  const [categories, cards, accountId] = await Promise.all([
    listCategories(userId),
    listCards(userId),
    ensureDefaultAccount(userId),
  ]);

  const categoryByName = new Map<string, number>(
    categories.map((c: any) => [normalize(c.name), c.id]),
  );
  const cardByName = new Map<string, number>(
    cards.map((c: any) => [normalize(c.name), c.id]),
  );

  let imported = 0;
  const errors: ImportRowError[] = [];
  const duplicates: ImportRowError[] = [];

  for (let i = 0; i < dataRows.length; i++) {
    const rowNumber = i + 2; // linha 1 = cabeçalho
    const row = dataRows[i];
    const [rawData, rawEstabelecimento, rawDescricao, rawValor, rawCategoria, rawCartao, rawParcelas] = row;

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

      const categoriaStr = String(rawCategoria || "").trim();
      const categoryId = categoriaStr ? categoryByName.get(normalize(categoriaStr)) : undefined;

      const cartaoStr = String(rawCartao || "").trim();
      const cardId = cartaoStr ? cardByName.get(normalize(cartaoStr)) : undefined;

      let installmentsTotal = 1;
      if (rawParcelas !== "" && rawParcelas !== undefined) {
        const parsed = Number(rawParcelas);
        if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 60) {
          installmentsTotal = parsed;
        }
      }

      // Evita duplicar transações se a mesma planilha for reenviada (mesmo
      // padrão de dedup usado em processRawNotification): mesmo usuário,
      // estabelecimento normalizado, valor e fonte "IMPORT", dentro de uma
      // janela de ±7 dias da data da linha.
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

      await createTransaction(userId, {
        accountId,
        cardId,
        merchantName,
        description: String(rawDescricao || "").trim() || undefined,
        amountCents,
        transactionDate,
        categoryId,
        installmentsTotal,
        source: "IMPORT",
      });
      imported++;
    } catch (err: any) {
      errors.push({ row: rowNumber, message: err?.message || "Erro desconhecido" });
    }
  }

  return {
    success: true,
    imported,
    failed: errors.length,
    duplicated: duplicates.length,
    errors,
    duplicates,
  };
};
