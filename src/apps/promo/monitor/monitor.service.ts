import { startTelegramMonitor, stopTelegramMonitor } from './monitor.telegram.js';
import { getMonitorStatus, setRunningState } from './monitor.state.js';
import { sendMonitorStarted } from '../discord/discord.service.js';
import * as logger from '../../../core/logger.js';

export const startMonitor = async (): Promise<void> => {
  if (getMonitorStatus().running) {
    logger.info('Monitor já está rodando', 'Monitor');
    return;
  }

  setRunningState(true);
  logger.info('Iniciando monitoramento real do Telegram...', 'Monitor');

  // Notificar no Discord que o monitor foi iniciado
  sendMonitorStarted().then((sent) => {
    if (sent) logger.info('Notificação enviada ao Discord', 'Monitor');
  });

  // Iniciar imediatamente
  await startTelegramMonitor();

  // Agendar verificações periódicas usando scheduleNextCheck do monitor.telegram
  // Não usar setInterval para evitar duplicidade com o scheduleNextCheck interno
};

export const stopMonitor = async (): Promise<void> => {
  if (!getMonitorStatus().running) {
    logger.info('Monitor já está parado', 'Monitor');
    return;
  }

  setRunningState(false);

  // Push: notificar que o monitor parou
  try {
    const { sendPushNotification } = await import('../push/push.service.js');
    await sendPushNotification({
      title: '⚠️ Monitor parou',
      body: 'O monitor de promoções foi desligado',
      data: { screen: 'monitor' },
    });
  } catch {}

  await stopTelegramMonitor();
  logger.info('Monitor parado com sucesso', 'Monitor');
};

export { getMonitorStatus };
