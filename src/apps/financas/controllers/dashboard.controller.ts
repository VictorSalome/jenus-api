import { getHouseholdId } from "../shared/errors.js";
import { getDashboard } from "../services/dashboard.service.js";

export const dashboard = async (req: any, res: any) => {
  const householdId = await getHouseholdId(req);
  const data = await getDashboard(householdId, req.query.month as string);
  res.json({ success: true, data });
};
