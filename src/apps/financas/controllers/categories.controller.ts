import { getHouseholdId, getUserId } from "../shared/errors.js";
import * as service from "../services/categories.service.js";

export const list = async (req: any, res: any) => {
  const householdId = await getHouseholdId(req);
  const userId = getUserId(req);
  await service.ensureDefaultCategories(householdId, userId);
  const items = await service.listCategories(householdId);
  res.json({ success: true, data: items });
};

export const create = async (req: any, res: any) => {
  const householdId = await getHouseholdId(req);
  const userId = getUserId(req);
  const item = await service.createCategory(householdId, req.body, userId);
  res.status(201).json({ success: true, data: item });
};

export const getOne = async (req: any, res: any) => {
  const householdId = await getHouseholdId(req);
  const item = await service.getCategory(householdId, Number(req.params.id));
  if (!item) {
    res.status(404).json({ success: false, message: "Categoria não encontrada" });
    return;
  }
  res.json({ success: true, data: item });
};

export const update = async (req: any, res: any) => {
  const householdId = await getHouseholdId(req);
  const item = await service.updateCategory(householdId, Number(req.params.id), req.body);
  if (!item) {
    res.status(404).json({ success: false, message: "Categoria não encontrada" });
    return;
  }
  res.json({ success: true, data: item });
};

export const remove = async (req: any, res: any) => {
  const householdId = await getHouseholdId(req);
  const deleted = await service.deleteCategory(householdId, Number(req.params.id));
  if (!deleted) {
    res.status(404).json({ success: false, message: "Categoria não encontrada" });
    return;
  }
  res.json({ success: true });
};
