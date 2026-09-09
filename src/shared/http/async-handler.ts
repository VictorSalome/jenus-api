import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Envolve handlers assíncronos do Express para garantir que quaisquer Promises
 * rejeitadas ou exceções sejam capturadas e encaminhadas para o middleware global
 * de erros (next(err)), prevenindo unhandledRejection e crash do processo Node.js.
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any> | any,
): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export default asyncHandler;
