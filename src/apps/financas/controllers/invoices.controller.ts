import { getHouseholdId } from "../shared/errors.js";
import * as service from "../services/invoices.service.js";

export const list = async (req: any, res: any) => {
  const householdId = await getHouseholdId(req);
  const items = await service.listInvoices(householdId);
  res.json({ success: true, data: items });
};
