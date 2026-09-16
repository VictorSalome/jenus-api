import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

export function validateParams<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      return next(result.error);
    }
    req.params = result.data as any;
    next();
  };
}
