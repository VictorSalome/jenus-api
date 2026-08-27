import { Request, Response } from 'express';
import { getDb } from '../../../core/database.js';

export const list = async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDb();
    const alerts = await db.all('SELECT * FROM promo_price_alerts ORDER BY created_at DESC');
    res.json({ success: true, data: alerts });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao listar alertas' });
  }
};

export const create = async (req: Request, res: Response): Promise<void> => {
  try {
    const { productName, targetPrice } = req.body;
    
    if (!productName || !targetPrice) {
      res.status(400).json({ success: false, message: 'Nome do produto e preço alvo são obrigatórios' });
      return;
    }
    
    const db = await getDb();
    
    // Verificar se já existe alerta para o mesmo produto+preço
    const existing = await db.get(
      'SELECT * FROM promo_price_alerts WHERE product_name = ? AND target_price = ? AND is_active = 1',
      productName, targetPrice
    );
    if (existing) {
      res.status(409).json({ success: false, message: 'Já existe um alerta para este produto com este preço' });
      return;
    }
    
    const result = await db.run(
      'INSERT INTO promo_price_alerts (product_name, target_price) VALUES (?, ?)',
      productName, targetPrice
    );
    res.json({ success: true, message: 'Alerta criado', data: { id: result.lastID } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao criar alerta' });
  }
};

export const update = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { productName, targetPrice } = req.body;
    
    if (!productName || !targetPrice) {
      res.status(400).json({ success: false, message: 'Nome do produto e preço alvo são obrigatórios' });
      return;
    }
    
    const db = await getDb();
    await db.run(
      'UPDATE promo_price_alerts SET product_name = ?, target_price = ? WHERE id = ?',
      productName, targetPrice, id
    );
    res.json({ success: true, message: 'Alerta atualizado' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao atualizar alerta' });
  }
};

export const toggle = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const db = await getDb();
    await db.run(
      'UPDATE promo_price_alerts SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?',
      id,
    );
    res.json({ success: true, message: 'Status alterado' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao alterar status' });
  }
};

export const remove = async (req: Request, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const db = await getDb();
    await db.run('DELETE FROM promo_price_alerts WHERE id = ?', id);
    res.json({ success: true, message: 'Alerta removido' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao remover alerta' });
  }
};
