import { Request, Response } from 'express';
import { getDb } from '../../core/database.js';

export const exportConfig = async (_req: Request, res: Response): Promise<void> => {
  try {
    const db = await getDb();
    
    const channels = await db.all('SELECT username, name, is_active FROM promo_channels');
    const categories = await db.all('SELECT name, color, icon, sort_order, is_active FROM promo_categories');
    const filters = await db.all('SELECT name, type, keywords, is_active FROM promo_filters');
    
    const config = {
      channels,
      categories,
      filters,
      exportedAt: new Date().toISOString()
    };
    
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', 'attachment; filename=promo-monitor-config.json');
    res.send(JSON.stringify(config, null, 2));
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao exportar' });
  }
};

export const importConfig = async (req: Request, res: Response): Promise<void> => {
  try {
    const { channels } = req.body;
    const db = await getDb();
    
    // Limpa e reinsere (simplificado - em produção seria mais cuidadoso)
    if (channels && Array.isArray(channels)) {
      for (const ch of channels) {
        try {
          await db.run(
            'INSERT OR REPLACE INTO promo_channels (username, name, is_active) VALUES (?, ?, ?)',
            ch.username, ch.name, ch.is_active
          );
        } catch {}
      }
    }
    
    res.json({ success: true, message: 'Configurações importadas' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro ao importar' });
  }
};
