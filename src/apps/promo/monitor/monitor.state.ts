// Estado global do monitor
let isRunning = false;
let telegramConnected = false;
let monitorInterval: NodeJS.Timeout | null = null;

export function setRunningState(running: boolean): void {
  isRunning = running;
}

export function setTelegramConnected(connected: boolean): void {
  telegramConnected = connected;
}

export function getMonitorStatus(): { running: boolean } {
  return { running: isRunning };
}

export function getConnectionStatus(): { telegramConnected: boolean; monitorRunning: boolean } {
  return { telegramConnected, monitorRunning: isRunning };
}

export function setMonitorInterval(interval: NodeJS.Timeout | null): void {
  if (monitorInterval) {
    clearInterval(monitorInterval);
  }
  monitorInterval = interval;
}
