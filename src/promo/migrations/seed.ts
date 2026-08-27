import sqlite3 from 'sqlite3';
import { Database } from 'sqlite';
import * as logger from '../../core/logger.js';
import { promoConfig } from '../config.js';

export const seedPromoDatabase = async (
  database: Database<sqlite3.Database, sqlite3.Statement>,
): Promise<void> => {
  logger.info('Verificando seed (promo)...', 'Database');

  const configRow = await database.get('SELECT COUNT(*) as count FROM promo_telegram_config');
  if (configRow.count === 0) {
    logger.info('Inserindo configuração inicial...', 'Database');
    await database.run(`
      INSERT INTO promo_telegram_config (id, api_id, api_hash, phone, is_connected)
      VALUES (1, ?, ?, '', 0)
    `, promoConfig.API_ID || '', promoConfig.API_HASH || '');
  } else if (promoConfig.API_ID && promoConfig.API_HASH) {
    // Preencher com valores do .env se estiverem vazios
    const existing = await database.get('SELECT api_id, api_hash FROM promo_telegram_config WHERE id = 1');
    if (!existing?.api_id && !existing?.api_hash) {
      logger.info('Preenchendo API_ID/API_HASH do .env na config existente...', 'Database');
      await database.run(`
        UPDATE promo_telegram_config SET api_id = ?, api_hash = ? WHERE id = 1
      `, promoConfig.API_ID, promoConfig.API_HASH);
    }
  }

  const channelCount = await database.get('SELECT COUNT(*) as count FROM promo_channels');
  if (channelCount.count === 0) {
    logger.info('Inserindo canais padrão...', 'Database');
    const channels = [
      '@urubupromo',
      '@ofertasgamer_oficial',
      '@LaPromotion',
      '@mpromotech',
      '@ofertasthautec',
      '@iuriindica',
      '@pcdorafa'
    ];

    for (const channel of channels) {
      try {
        await database.run('INSERT INTO promo_channels (username, is_active) VALUES (?, 1)', channel);
      } catch {
        // Ignora duplicatas
      }
    }
  }

  const categoryCount = await database.get('SELECT COUNT(*) as count FROM promo_categories');
  if (categoryCount.count === 0) {
    logger.info('Inserindo categorias e filtros padrão...', 'Database');

    const categories = [
      { name: '📱 Celulares', color: '#3b82f6', icon: '📱' },
      { name: '🎮 Hardware', color: '#ef4444', icon: '🎮' }
    ];

    const celularesResult = await database.run(
      'INSERT INTO promo_categories (name, color, icon, sort_order) VALUES (?, ?, ?, ?)',
      categories[0].name, categories[0].color, categories[0].icon, 0
    );
    const celularesId = celularesResult.lastID;

    const hardwareResult = await database.run(
      'INSERT INTO promo_categories (name, color, icon, sort_order) VALUES (?, ?, ?, ?)',
      categories[1].name, categories[1].color, categories[1].icon, 1
    );
    const hardwareId = hardwareResult.lastID;

    const filters = [
      { categoryId: celularesId, name: 'Galaxy', type: 'broad', keywords: JSON.stringify(['galaxy', 'samsung', 's24', 's25', 'tab', 'watch']) },
      { categoryId: celularesId, name: 'Galaxy S22', type: 'specific', keywords: JSON.stringify(['galaxy s22', 's22 ultra', 's22 plus']) },
      { categoryId: celularesId, name: 'iPhone', type: 'broad', keywords: JSON.stringify(['iphone', 'apple', 'ios']) },
      { categoryId: hardwareId, name: 'RTX', type: 'broad', keywords: JSON.stringify(['rtx', 'nvidia', 'geforce']) },
      { categoryId: hardwareId, name: 'RTX 4060', type: 'specific', keywords: JSON.stringify(['rtx 4060', '4060 ti']) },
      { categoryId: hardwareId, name: 'AMD RX', type: 'broad', keywords: JSON.stringify(['rx', 'radeon', 'amd']) }
    ];

    for (const filter of filters) {
      await database.run(
        'INSERT INTO promo_filters (category_id, name, type, keywords) VALUES (?, ?, ?, ?)',
        filter.categoryId, filter.name, filter.type, filter.keywords
      );
    }
  }

  logger.info('Seed (promo) concluído!', 'Database');
};
