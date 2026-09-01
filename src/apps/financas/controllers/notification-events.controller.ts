import { getUserId } from "../shared/errors.js";
import * as service from "../services/notification-events.service.js";

export const list = async (req: any, res: any) => {
  const userId = getUserId(req);
  const items = await service.listEvents(userId, req.query.status);
  res.json({ success: true, data: items });
};

/** Recebe o RAW do Android e processa (parse + duplicidade + criação de transação). */
export const create = async (req: any, res: any) => {
  const userId = getUserId(req);
  const result = await service.processRawNotification(userId, req.body);
  res.status(201).json({ success: true, data: result });
};

export const importEvent = async (req: any, res: any) => {
  const userId = getUserId(req);
  const result = await service.importEvent(userId, Number(req.params.id));
  if (!result) {
    res.status(400).json({ success: false, message: "Não foi possível importar o evento" });
    return;
  }
  res.json({ success: true, data: result });
};

export const ignore = async (req: any, res: any) => {
  const userId = getUserId(req);
  const result = await service.ignoreEvent(userId, Number(req.params.id));
  if (!result) {
    res.status(404).json({ success: false, message: "Evento não encontrado" });
    return;
  }
  res.json({ success: true, data: result });
};