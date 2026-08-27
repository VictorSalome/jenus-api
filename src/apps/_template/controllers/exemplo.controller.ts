import { Request, Response } from "express";
import * as exemploRepo from "../repositories/exemplo.repository.js";

// TODO: renomeie o arquivo/controller para a entidade real.

export const list = async (_req: Request, res: Response): Promise<void> => {
  try {
    const data = await exemploRepo.findAll();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: "Erro ao listar" });
  }
};

export const create = async (req: Request, res: Response): Promise<void> => {
  try {
    const { nome } = req.body;
    if (!nome) {
      res.status(400).json({ success: false, message: "nome é obrigatório" });
      return;
    }
    const id = await exemploRepo.create(nome);
    res.json({ success: true, data: { id } });
  } catch (err) {
    res.status(500).json({ success: false, message: "Erro ao criar" });
  }
};
