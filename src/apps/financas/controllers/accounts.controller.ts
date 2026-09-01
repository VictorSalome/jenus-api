import { getUserId } from "../shared/errors.js";
import * as service from "../services/accounts.service.js";
import { ensureDefaultCategories } from "../services/categories.service.js";

export const list = async (req: any, res: any) => {
  const userId = getUserId(req);
  const items = await service.listAccounts(userId);
  res.json({ success: true, data: items });
};

export const create = async (req: any, res: any) => {
  const userId = getUserId(req);
  await ensureDefaultCategories(userId);
  const item = await service.createAccount(userId, req.body);
  res.status(201).json({ success: true, data: item });
};

export const update = async (req: any, res: any) => {
  const userId = getUserId(req);
  const item = await service.updateAccount(userId, Number(req.params.id), req.body);
  if (!item) {
    res.status(404).json({ success: false, message: "Conta não encontrada" });
    return;
  }
  res.json({ success: true, data: item });
};

export const remove = async (req: any, res: any) => {
  const userId = getUserId(req);
  await service.deleteAccount(userId, Number(req.params.id));
  res.json({ success: true });
};