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
  return async (req: any, res: any, next: any): Promise<void> => {
    try {
      await fn(req, res, next);
    } catch (err: any) {
      const status = err instanceof AppError ? err.statusCode : 500;
      res.status(status).json({
        success: false,
        message: err?.message || "Erro interno do servidor",
      });
    }
  };
};

export const getUserId = (req: any): string => {
  const user = req.user;
  return user?.userId ? String(user.userId) : "";
};