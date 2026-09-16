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
    res.status(404).json({ success: false, message: "Evento não encontrado" });
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

export const remove = async (req: any, res: any) => {
  const userId = getUserId(req);
  const ok = await service.removeEvent(userId, Number(req.params.id));
  if (!ok) {
    res.status(404).json({ success: false, message: "Evento não encontrado" });
    return;
  }
  res.json({ success: true, message: "Evento excluído com sucesso", data: { id: Number(req.params.id), count: 1 } });
};

export const batchRemove = async (req: any, res: any) => {
  const userId = getUserId(req);
  const ids: number[] = req.body.ids;
  const deleted = await service.batchRemoveEvents(userId, ids);
  res.json({ success: true, message: `${deleted} eventos excluídos com sucesso`, data: { count: deleted } });
};

export const batchImport = async (req: any, res: any) => {
  const userId = getUserId(req);
  const ids: number[] = req.body.ids;
  const imported = await service.batchImportEvents(userId, ids);
  res.json({ success: true, message: `${imported} compras importadas com sucesso`, data: { count: imported } });
};

export const batchIgnore = async (req: any, res: any) => {
  const userId = getUserId(req);
  const ids: number[] = req.body.ids;
  const ignored = await service.batchIgnoreEvents(userId, ids);
  res.json({ success: true, message: `${ignored} compras ignoradas com sucesso`, data: { count: ignored } });
};