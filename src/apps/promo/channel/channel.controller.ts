import { Request, Response } from 'express';
import * as channelRepo from './channel.repository.js';

export const list = async (_req: Request, res: Response): Promise<void> => {
  try {
    const channels = await channelRepo.findAll();
    res.json({ success: true, data: channels });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao listar canais' });
  }
};

export const create = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, name } = req.body;

    if (!username || username.trim() === '') {
      res.status(400).json({ success: false, message: 'Username é obrigatório' });
      return;
    }

    // Garante que começa com @
    const formattedUsername = username.trim().startsWith('@') ? username.trim() : `@${username.trim()}`;

    // Verificar se canal já existe
    const existing = await channelRepo.findByUsername(formattedUsername);
    if (existing) {
      res.status(409).json({ success: false, message: 'Canal já existe' });
      return;
    }

    const id = await channelRepo.create({
      username: formattedUsername,
      name: name || formattedUsername,
      isActive: true,
    });

    res.json({ success: true, message: 'Canal adicionado', data: { id } });
  } catch (err: any) {
    if (err.message?.includes('UNIQUE constraint failed')) {
      res.status(409).json({ success: false, message: 'Canal já existe' });
    } else {
      res.status(500).json({ success: false, message: 'Erro ao adicionar canal' });
    }
  }
};

export const remove = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    await channelRepo.remove(id);
    res.json({ success: true, message: 'Canal removido' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao remover canal' });
  }
};

export const toggle = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    await channelRepo.toggle(id);
    res.json({ success: true, message: 'Status alterado' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao alterar status' });
  }
};
