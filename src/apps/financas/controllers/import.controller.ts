import { getUserId } from "../shared/errors.js";
import * as service from "../services/import.service.js";

export const downloadTemplate = async (req: any, res: any) => {
  const userId = getUserId(req);
  const buffer = await service.generateImportTemplate(userId);
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="modelo-importacao-financas.xlsx"',
  );
  res.send(buffer);
};

export const importTransactions = async (req: any, res: any) => {
  const userId = getUserId(req);
  const file = req.file;
  if (!file) {
    res.status(400).json({ success: false, message: "Nenhum arquivo enviado" });
    return;
  }
  const result = await service.importTransactionsFromXlsx(userId, file.buffer);
  res.json(result);
};
