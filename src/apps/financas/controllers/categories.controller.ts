import { getUserId } from "../shared/errors.js";
import * as service from "../services/categories.service.js";

export const list = async (req: any, res: any) => {
  const userId = getUserId(req);
  await service.ensureDefaultCategories(userId);
  const items = await service.listCategories(userId);
  res.json({ success: true, data: items });
};

export const create = async (req: any, res: any) => {
  const userId = getUserId(req);
  const item = await service.createCategory(userId, req.body);
  res.status(201).json({ success: true, data: item });
};

export const update = async (req: any, res: any) => {
  const userId = getUserId(req);
  const item = await service.updateCategory(userId, Number(req.params.id), req.body);
  if (!item) {
    res.status(404).json({ success: false, message: "Categoria não encontrada" });
    return;
  }
  res.json({ success: true, data: item });
};

export const remove = async (req: any, res: any) => {
  const userId = getUserId(req);
  await service.deleteCategory(userId, Number(req.params.id));
  res.json({ success: true });
};