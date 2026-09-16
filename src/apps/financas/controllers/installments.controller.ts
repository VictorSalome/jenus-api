import { getHouseholdId, getUserId } from "../shared/errors.js";
import * as service from "../services/installments.service.js";

export const list = async (req: any, res: any) => {
  const householdId = await getHouseholdId(req);
  const items = await service.listInstallments(householdId, req.query);
  res.json({ success: true, data: items });
};

export const pay = async (req: any, res: any) => {
  const householdId = await getHouseholdId(req);
  const item = await service.payInstallment(householdId, Number(req.params.id));
  if (!item) {
    res.status(404).json({ success: false, message: "Parcela não encontrada" });
    return;
  }
  res.json({ success: true, data: item });
};

export const cancel = async (req: any, res: any) => {
  const householdId = await getHouseholdId(req);
  const item = await service.cancelInstallment(householdId, Number(req.params.id));
  if (!item) {
    res.status(404).json({ success: false, message: "Parcela não encontrada" });
    return;
  }
  res.json({ success: true, data: item });
};

export const future = async (req: any, res: any) => {
  const householdId = await getHouseholdId(req);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const referenceMonth = (req.query.month as string) || currentMonth;
  const data = await service.futureCommitment(householdId, referenceMonth);
  res.json({ success: true, data });
};
