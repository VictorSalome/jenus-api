import { getUserId } from "../shared/errors.js";
import * as service from "../services/transactions.service.js";

export const list = async (req: any, res: any) => {
  const userId = getUserId(req);
  const items = await service.listTransactions(userId, req.query);
  res.json({ success: true, data: items });
};

export const create = async (req: any, res: any) => {
  const userId = getUserId(req);
  const result = await service.createTransaction(userId, req.body);
  res.status(201).json({ success: true, data: result });
};

export const update = async (req: any, res: any) => {
  const userId = getUserId(req);
  const item = await service.updateTransaction(userId, Number(req.params.id), req.body);
  if (!item) {
    res.status(404).json({ success: false, message: "Transação não encontrada" });
    return;
  }
  res.json({ success: true, data: item });
};

export const remove = async (req: any, res: any) => {
  const userId = getUserId(req);
  const deleted = await service.deleteTransaction(userId, Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ success: false, message: "Transação não encontrada" });
    return;
  }
  res.json({ success: true });
};