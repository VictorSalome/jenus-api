import { getUserId } from "../shared/errors.js";
import * as service from "../services/debts.service.js";

const currentMonthKey = (): string => new Date().toISOString().slice(0, 7);

export const listOccurrences = async (req: any, res: any) => {
  const userId = getUserId(req);
  const month = typeof req.query.month === "string" ? req.query.month : currentMonthKey();
  const data = await service.listOccurrences(userId, month);
  res.json({ success: true, data });
};

export const listDebts = async (req: any, res: any) => {
  const userId = getUserId(req);
  const data = await service.listDebts(userId);
  res.json({ success: true, data });
};

export const getDebt = async (req: any, res: any) => {
  const userId = getUserId(req);
  const id = Number(req.params.id);
  const data = await service.getDebt(userId, id);
  if (!data) {
    res.status(404).json({ success: false, message: "Dívida não encontrada" });
    return;
  }
  res.json({ success: true, data });
};

export const createDebt = async (req: any, res: any) => {
  const userId = getUserId(req);
  const { name, amountCents, dueDay, categoryId, accountId, startMonth, endMonth, notes } = req.body;
  if (!name || !amountCents || !dueDay) {
    res.status(400).json({ success: false, message: "Nome, valor e dia do vencimento são obrigatórios" });
    return;
  }
  const data = await service.createDebt(userId, {
    name,
    amountCents: Number(amountCents),
    dueDay: Number(dueDay),
    categoryId: categoryId ? Number(categoryId) : null,
    accountId: accountId ? Number(accountId) : null,
    startMonth,
    endMonth,
    notes,
  });
  res.status(201).json({ success: true, data });
};

export const updateDebt = async (req: any, res: any) => {
  const userId = getUserId(req);
  const id = Number(req.params.id);
  const data = await service.updateDebt(userId, id, req.body);
  if (!data) {
    res.status(404).json({ success: false, message: "Dívida não encontrada" });
    return;
  }
  res.json({ success: true, data });
};

export const removeDebt = async (req: any, res: any) => {
  const userId = getUserId(req);
  const id = Number(req.params.id);
  await service.deleteDebt(userId, id);
  res.json({ success: true });
};

export const addPayment = async (req: any, res: any) => {
  const userId = getUserId(req);
  const occurrenceId = Number(req.params.id);
  const { amountCents, paidDate, notes } = req.body;
  if (!amountCents || Number(amountCents) <= 0) {
    res.status(400).json({ success: false, message: "Valor pago deve ser maior que zero" });
    return;
  }
  const data = await service.addPayment(userId, occurrenceId, {
    amountCents: Number(amountCents),
    paidDate,
    notes,
  });
  res.status(201).json({ success: true, data });
};

export const removePayment = async (req: any, res: any) => {
  const userId = getUserId(req);
  const paymentId = Number(req.params.paymentId);
  const data = await service.deletePayment(userId, paymentId);
  res.json({ success: true, data });
};
