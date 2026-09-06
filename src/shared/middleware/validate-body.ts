import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const error = result.error as ZodError;
      const message = error.errors
        .map((e) => `${e.path.join(".") || "root"}: ${e.message}`)
        .join("; ");
      res.status(400).json({
        success: false,
        message: `Validation error: ${message}`,
        errors: error.errors,
      });
      return;
    }
    req.body = result.data;
    next();
  };
}
