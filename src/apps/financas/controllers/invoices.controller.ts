import { getUserId } from "../shared/errors.js";
import * as service from "../services/invoices.service.js";

export const list = async (req: any, res: any) => {
  const userId = getUserId(req);
  const items = await service.listInvoices(userId);
  res.json({ success: true, data: items });
};