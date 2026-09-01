import { getUserId } from "../shared/errors.js";
import * as service from "../services/cards.service.js";

export const list = async (req: any, res: any) => {
  const userId = getUserId(req);
  const items = await service.listCards(userId);
  res.json({ success: true, data: items });
};

export const create = async (req: any, res: any) => {
  const userId = getUserId(req);
  const item = await service.createCard(userId, req.body);
  res.status(201).json({ success: true, data: item });
};

export const update = async (req: any, res: any) => {
  const userId = getUserId(req);
  const item = await service.updateCard(userId, Number(req.params.id), req.body);
  if (!item) {
    res.status(404).json({ success: false, message: "Cartão não encontrado" });
    return;
  }
  res.json({ success: true, data: item });
};

export const remove = async (req: any, res: any) => {
  const userId = getUserId(req);
  await service.deleteCard(userId, Number(req.params.id));
  res.json({ success: true });
};