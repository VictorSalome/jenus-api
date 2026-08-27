import fs from 'fs/promises';
import path from 'path';
import config from '../../config/index.js';
import type { Request, Response, NextFunction } from 'express';

const LOG_LEVELS: Record<string, number> = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3,
};

const loggerConfig = {
  level: process.env.LOG_LEVEL || 'INFO',
  maxFileSize: parseInt(process.env.LOG_MAX_FILE_SIZE || '10485760', 10),
  maxFiles: parseInt(process.env.LOG_MAX_FILES || '5', 10),
  enableConsole: process.env.LOG_CONSOLE !== 'false',
  enableFile: process.env.LOG_FILE !== 'false',
};

const ensureLogDir = async (): Promise<string | null> => {
  try {
    const logPath = config.paths.logs;
    await fs.mkdir(logPath, { recursive: true });
    return logPath;
  } catch (error) {
    console.error('Erro ao criar diretório de logs:', error);
    return null;
  }
};

const formatTimestamp = (): string => {
  return new Date().toISOString();
};

const formatLogMessage = (
  level: string,
  message: string,
  meta: Record<string, unknown> = {},
): string => {
  const timestamp = formatTimestamp();
  const metaString =
    Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaString}`;
};

const rotateLogFile = async (filepath: string): Promise<void> => {
  try {
    const dir = path.dirname(filepath);
    const basename = path.basename(filepath, '.log');

    for (let i = loggerConfig.maxFiles - 1; i > 0; i--) {
      const oldFile = path.join(dir, `${basename}.${i}.log`);
      const newFile = path.join(dir, `${basename}.${i + 1}.log`);

      try {
        await fs.access(oldFile);
        if (i === loggerConfig.maxFiles - 1) {
          await fs.unlink(oldFile);
        } else {
          await fs.rename(oldFile, newFile);
        }
      } catch {
        // Arquivo não existe, continuar
      }
    }

    const rotatedFile = path.join(dir, `${basename}.1.log`);
    await fs.rename(filepath, rotatedFile);
  } catch (error) {
    console.error('Erro na rotação do arquivo de log:', error);
  }
};

const writeToFile = async (
  level: string,
  message: string,
  meta: Record<string, unknown> = {},
): Promise<void> => {
  if (!loggerConfig.enableFile) return;

  try {
    const logDir = await ensureLogDir();
    if (!logDir) return;

    const today = new Date().toISOString().split('T')[0];
    const filename = `app-${today}.log`;
    const filepath = path.join(logDir, filename);

    const logMessage = formatLogMessage(level, message, meta) + '\n';

    try {
      const stats = await fs.stat(filepath);
      if (stats.size > loggerConfig.maxFileSize) {
        await rotateLogFile(filepath);
      }
    } catch {
      // Arquivo não existe, será criado
    }

    await fs.appendFile(filepath, logMessage, 'utf8');
  } catch (error) {
    console.error('Erro ao escrever no arquivo de log:', error);
  }
};

const writeToConsole = (
  level: string,
  message: string,
  meta: Record<string, unknown> = {},
): void => {
  if (!loggerConfig.enableConsole) return;

  const formattedMessage = formatLogMessage(level, message, meta);

  switch (level) {
    case 'ERROR':
      console.error(formattedMessage);
      break;
    case 'WARN':
      console.warn(formattedMessage);
      break;
    case 'INFO':
      console.info(formattedMessage);
      break;
    case 'DEBUG':
      console.debug(formattedMessage);
      break;
    default:
      console.log(formattedMessage);
  }
};

const shouldLog = (level: string): boolean => {
  const currentLevel =
    LOG_LEVELS[(config.log.level || 'INFO').toUpperCase()] ?? LOG_LEVELS.INFO;
  const messageLevel = LOG_LEVELS[level.toUpperCase()] ?? LOG_LEVELS.INFO;
  return messageLevel <= currentLevel;
};

const log = async (
  level: string,
  message: string,
  meta: Record<string, unknown> | Error = {},
): Promise<void> => {
  if (!shouldLog(level)) return;

  let processedMeta: Record<string, unknown>;
  if (meta instanceof Error) {
    processedMeta = {
      error: meta.message,
      stack: meta.stack,
      name: meta.name,
    };
  } else {
    processedMeta = meta;
  }

  writeToConsole(level, message, processedMeta);

  writeToFile(level, message, processedMeta).catch((error) => {
    console.error('Erro ao escrever log no arquivo:', error);
  });
};

export const logError = (
  message: string,
  meta: Record<string, unknown> | Error = {},
): void => {
  log('ERROR', message, meta);
};

export const logWarn = (
  message: string,
  meta: Record<string, unknown> = {},
): void => {
  log('WARN', message, meta);
};

export const logInfo = (
  message: string,
  meta: Record<string, unknown> = {},
): void => {
  log('INFO', message, meta);
};

export const logDebug = (
  message: string,
  meta: Record<string, unknown> = {},
): void => {
  log('DEBUG', message, meta);
};

export const loggerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const start = Date.now();
  const { method, url, ip } = req;

  logInfo('Requisição recebida', {
    method,
    url,
    ip,
    userAgent: req.get('User-Agent'),
  });

  const originalSend = res.send;
  res.send = function (this: Response, data: unknown) {
    const duration = Date.now() - start;
    const { statusCode } = res;

    const logLevel =
      statusCode >= 400 ? 'ERROR' : statusCode >= 300 ? 'WARN' : 'INFO';
    const logFunction =
      logLevel === 'ERROR'
        ? logError
        : logLevel === 'WARN'
          ? logWarn
          : logInfo;

    logFunction('Resposta enviada', {
      method,
      url,
      statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length') || (data as string)?.length || 0,
    });

    return originalSend.call(this, data as string | Buffer);
  } as typeof res.send;

  next();
};

export const errorLoggerMiddleware = (
  error: Error,
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const { method, url, ip } = req;

  logError('Erro na aplicação', {
    error: error.message,
    stack: error.stack,
    method,
    url,
    ip,
    body: req.body,
    params: req.params,
    query: req.query,
  });

  next(error);
};

export const cleanOldLogs = async (days = 30): Promise<void> => {
  try {
    const logDir = await ensureLogDir();
    if (!logDir) return;

    const files = await fs.readdir(logDir);
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    for (const file of files) {
      if (file.endsWith('.log')) {
        const filepath = path.join(logDir, file);
        const stats = await fs.stat(filepath);

        if (stats.mtime < cutoffDate) {
          await fs.unlink(filepath);
          logInfo('Log antigo removido', { file });
        }
      }
    }
  } catch (error) {
    logError('Erro ao limpar logs antigos', error as Record<string, unknown>);
  }
};

export const getLogStats = async (): Promise<{
  totalFiles: number;
  totalSize: number;
  files: { name: string; size: number; modified: Date }[];
} | null> => {
  try {
    const logDir = await ensureLogDir();
    if (!logDir) return null;

    const files = await fs.readdir(logDir);
    const logFiles = files.filter((file) => file.endsWith('.log'));

    let totalSize = 0;
    const fileStats: { name: string; size: number; modified: Date }[] = [];

    for (const file of logFiles) {
      const filepath = path.join(logDir, file);
      const stats = await fs.stat(filepath);

      totalSize += stats.size;
      fileStats.push({
        name: file,
        size: stats.size,
        modified: stats.mtime,
      });
    }

    return {
      totalFiles: logFiles.length,
      totalSize,
      files: fileStats.sort((a, b) => b.modified.getTime() - a.modified.getTime()),
    };
  } catch (error) {
    logError('Erro ao obter estatísticas dos logs', error as Record<string, unknown>);
    return null;
  }
};

if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    cleanOldLogs().catch((error) => {
      console.error('Erro na limpeza automática de logs:', error);
    });
  }, 24 * 60 * 60 * 1000);
}

logInfo('Sistema de logging inicializado', {
  level: config.log.level,
  logDir: config.log.logDir,
  enableConsole: config.log.enableConsole,
  enableFile: config.log.enableFile,
});
