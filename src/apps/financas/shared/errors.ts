import { getDb } from "../../../core/database.js";

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Recurso não encontrado") {
    super(message, 404);
  }
}

export const asyncHandler = (
  fn: (req: any, res: any, next: any) => Promise<unknown>,
) => {
  return (req: any, res: any, next: any): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export const getUserId = (req: any): string => {
  const user = req?.user;
  return user?.userId ? String(user.userId) : "";
};

export const getUserName = (req: any): string => {
  const user = req?.user;
  return user?.name || user?.username || user?.email || "";
};

export const getHouseholdId = async (req: any): Promise<string> => {
  const user = req?.user;
  if (user?.householdId) {
    return String(user.householdId);
  }

  const userId = getUserId(req);
  if (userId) {
    try {
      const db = await getDb();
      const member = await db.get<{ household_id: string }>(
        "SELECT household_id FROM financial_household_members WHERE user_id = ? LIMIT 1",
        userId,
      );
      if (member?.household_id) {
        if (req.user) req.user.householdId = member.household_id;
        return member.household_id;
      }
    } catch {
      // fallback abaixo
    }
  }

  throw new AppError("Acesso negado: usuário não vinculado a nenhum ambiente financeiro", 403);
};