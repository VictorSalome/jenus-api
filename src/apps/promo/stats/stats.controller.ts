import { Request, Response } from 'express';
import * as statsService from './stats.service.js';

export const getOverview = async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = await statsService.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao buscar estatísticas' });
  }
};

export const getByChannel = async (_req: Request, res: Response): Promise<void> => {
  try {
    const data = await statsService.getByChannel();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao buscar estatísticas' });
  }
};

export const getByFilter = async (_req: Request, res: Response): Promise<void> => {
  try {
    const data = await statsService.getByFilter();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao buscar estatísticas' });
  }
};
