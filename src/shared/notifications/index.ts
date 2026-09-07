import type { AppModule } from '../http/app-registry.js';
import notificationRouter from './notification.routes.js';

export { notificationDispatcher } from './notification.dispatcher.js';
export { notificationMigrations } from './migrations.js';
export * from './notification.types.js';

const notificationsModule: AppModule = {
  name: 'notifications',
  prefix: '/api/notifications',
  router: notificationRouter,
  protected: false, // Controle granular de auth dentro das rotas
};

export default notificationsModule;
