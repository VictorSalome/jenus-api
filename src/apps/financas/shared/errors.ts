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
  const user = req.user;
  return user?.userId ? String(user.userId) : "";
};