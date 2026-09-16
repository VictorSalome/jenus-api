import { getHouseholdId, getUserId } from "../shared/errors.js";
import * as service from "../services/transactions.service.js";

export const list = async (req: any, res: any) => {
  const householdId = await getHouseholdId(req);
  const items = await service.listTransactions(householdId, req.query);
  res.json({ success: true, data: items });
};

export const getOne = async (req: any, res: any) => {
  const householdId = await getHouseholdId(req);
  const item = await service.getTransaction(householdId, Number(req.params.id));
  if (!item) {
    res.status(404).json({ success: false, message: "Transação não encontrada" });
    return;
  }
  res.json({ success: true, data: item });
};

export const create = async (req: any, res: any) => {
  const householdId = await getHouseholdId(req);
  const userId = getUserId(req);
  const result = await service.createTransaction(householdId, userId, req.body);
  res.status(201).json({ success: true, data: result });
};

export const update = async (req: any, res: any) => {
  const householdId = await getHouseholdId(req);
  const item = await service.updateTransaction(householdId, Number(req.params.id), req.body);
  if (!item) {
    res.status(404).json({ success: false, message: "Transação não encontrada" });
    return;
  }
  res.json({ success: true, data: item });
};

export const remove = async (req: any, res: any) => {
  const householdId = await getHouseholdId(req);
  const deleted = await service.deleteTransaction(householdId, Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ success: false, message: "Transação não encontrada" });
    return;
  }
  res.json({ success: true });
};
