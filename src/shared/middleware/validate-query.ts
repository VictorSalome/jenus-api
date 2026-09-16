import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(result.error);
    }
    req.query = result.data as any;
    next();
  };
}
