import { getUserId } from "../shared/errors.js";
import { getDashboard } from "../services/dashboard.service.js";

export const dashboard = async (req: any, res: any) => {
  const userId = getUserId(req);
  const data = await getDashboard(userId, req.query.month as string);
  res.json({ success: true, data });
};