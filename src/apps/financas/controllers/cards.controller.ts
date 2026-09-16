import { getHouseholdId, getUserId } from "../shared/errors.js";
import * as service from "../services/cards.service.js";

export const list = async (req: any, res: any) => {
  const householdId = await getHouseholdId(req);
  const items = await service.listCards(householdId);
  res.json({ success: true, data: items });
};

export const create = async (req: any, res: any) => {
  const householdId = await getHouseholdId(req);
  const userId = getUserId(req);
  const item = await service.createCard(householdId, req.body, userId);
  res.status(201).json({ success: true, data: item });
};

export const getOne = async (req: any, res: any) => {
  const householdId = await getHouseholdId(req);
  const item = await service.getCard(householdId, Number(req.params.id));
  if (!item) {
    res.status(404).json({ success: false, message: "Cartão não encontrado" });
    return;
  }
  res.json({ success: true, data: item });
};

export const update = async (req: any, res: any) => {
  const householdId = await getHouseholdId(req);
  const item = await service.updateCard(householdId, Number(req.params.id), req.body);
  if (!item) {
    res.status(404).json({ success: false, message: "Cartão não encontrado" });
    return;
  }
  res.json({ success: true, data: item });
};

export const remove = async (req: any, res: any) => {
  const householdId = await getHouseholdId(req);
  const card = await service.getCard(householdId, Number(req.params.id));
  if (!card) {
    res.status(404).json({ success: false, message: "Cartão não encontrado" });
    return;
  }
  if (req.user?.role && req.user.role !== "admin") {
    res.status(403).json({ success: false, message: "Apenas administradores podem excluir cartões." });
    return;
  }
  await service.deleteCard(householdId, Number(req.params.id));
  res.json({ success: true });
};
