import type { Request, Response, NextFunction } from "express";
import * as service from "./system.service.js";

export const getLogs = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const level = typeof req.query.level === "string" ? req.query.level : undefined;
    const module = typeof req.query.module === "string" ? req.query.module : undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const { entries, available } = await service.getLogs({ level, module, limit });
    res.json({ success: true, data: { entries, available } });
  } catch (err: any) {
    next(err);
  }
};

export const getModules = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const modules = await service.listModules();
    res.json({ success: true, data: modules });
  } catch (err: any) {
    next(err);
  }
};
