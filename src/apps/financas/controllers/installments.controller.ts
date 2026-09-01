import { getUserId } from "../shared/errors.js";
import * as service from "../services/installments.service.js";

export const list = async (req: any, res: any) => {
  const userId = getUserId(req);
  const items = await service.listInstallments(userId, req.query);
  res.json({ success: true, data: items });
};

export const pay = async (req: any, res: any) => {
  const userId = getUserId(req);
  const item = await service.payInstallment(userId, Number(req.params.id));
  if (!item) {
    res.status(404).json({ success: false, message: "Parcela não encontrada" });
    return;
  }
  res.json({ success: true, data: item });
};

export const cancel = async (req: any, res: any) => {
  const userId = getUserId(req);
  const item = await service.cancelInstallment(userId, Number(req.params.id));
  if (!item) {
    res.status(404).json({ success: false, message: "Parcela não encontrada" });
    return;
  }
  res.json({ success: true, data: item });
};

export const future = async (req: any, res: any) => {
  const userId = getUserId(req);
  const referenceMonth = req.query.month as string;
  const data = await service.futureCommitment(userId, referenceMonth);
  res.json({ success: true, data });
};