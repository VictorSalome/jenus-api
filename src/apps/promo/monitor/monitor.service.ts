import { startTelegramMonitor, stopTelegramMonitor } from './monitor.telegram.js';
import { getMonitorStatus, setRunningState } from './monitor.state.js';
import { sendMonitorStarted } from '../discord/discord.service.js';

export const startMonitor = async (): Promise<void> => {
  if (getMonitorStatus().running) {
    console.log('[Monitor] Monitor já está rodando');
    return;
  }
  
  setRunningState(true);
  console.log('[Monitor] Iniciando monitoramento real do Telegram...');
  
  // Notificar no Discord que o monitor foi iniciado
  sendMonitorStarted().then((sent) => {
    if (sent) console.log('[Monitor] Notificação enviada ao Discord');
  });
  
  // Iniciar imediatamente
  await startTelegramMonitor();
  
  // Agendar verificações periódicas usando scheduleNextCheck do monitor.telegram
  // Não usar setInterval para evitar duplicidade com o scheduleNextCheck interno
};

export const stopMonitor = async (): Promise<void> => {
  if (!getMonitorStatus().running) {
    console.log('[Monitor] Monitor já está parado');
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
  console.log('[Monitor] Monitor parado com sucesso');
};

export { getMonitorStatus };
