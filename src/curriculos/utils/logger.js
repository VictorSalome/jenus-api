import fs from 'fs/promises';
import path from 'path';
import config from '../config/index.js';

/**
 * Sistema de logging para a aplicação
 */

// Níveis de log
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// Configuração do logger
const loggerConfig = {
  level: process.env.LOG_LEVEL || 'INFO',
  maxFileSize: parseInt(process.env.LOG_MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB
  maxFiles: parseInt(process.env.LOG_MAX_FILES) || 5,
  enableConsole: process.env.LOG_CONSOLE !== 'false',
  enableFile: process.env.LOG_FILE !== 'false'
};

/**
 * Garante que o diretório de logs existe
 */
const ensureLogDir = async () => {
  try {
    const logPath = config.paths.logs;
    await fs.mkdir(logPath, { recursive: true });
    return logPath;
  } catch (error) {
    console.error('Erro ao criar diretório de logs:', error);
    return null;
  }
};

/**
 * Formata timestamp para logs
 */
const formatTimestamp = () => {
  return new Date().toISOString();
};

/**
 * Formata mensagem de log
 */
const formatLogMessage = (level, message, meta = {}) => {
  const timestamp = formatTimestamp();
  const metaString = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
  
  return `[${timestamp}] [${level}] ${message}${metaString}`;
};

/**
 * Escreve log no arquivo
 */
const writeToFile = async (level, message, meta = {}) => {
  if (!config.enableFile) return;
  
  try {
    const logDir = await ensureLogDir();
    if (!logDir) return;
    
    const today = new Date().toISOString().split('T')[0];
    const filename = `app-${today}.log`;
    const filepath = path.join(logDir, filename);
    
    const logMessage = formatLogMessage(level, message, meta) + '\n';
    
    // Verificar tamanho do arquivo
    try {
      const stats = await fs.stat(filepath);
      if (stats.size > config.maxFileSize) {
        await rotateLogFile(filepath);
      }
    } catch (error) {
      // Arquivo não existe, será criado
    }
    
    await fs.appendFile(filepath, logMessage, 'utf8');
  } catch (error) {
    console.error('Erro ao escrever no arquivo de log:', error);
  }
};

/**
 * Rotaciona arquivo de log quando atinge o tamanho máximo
 */
const rotateLogFile = async (filepath) => {
  try {
    const dir = path.dirname(filepath);
    const basename = path.basename(filepath, '.log');
    
    // Mover arquivos existentes
    for (let i = config.maxFiles - 1; i > 0; i--) {
      const oldFile = path.join(dir, `${basename}.${i}.log`);
      const newFile = path.join(dir, `${basename}.${i + 1}.log`);
      
      try {
        await fs.access(oldFile);
        if (i === config.maxFiles - 1) {
          await fs.unlink(oldFile); // Remove o mais antigo
        } else {
          await fs.rename(oldFile, newFile);
        }
      } catch (error) {
        // Arquivo não existe, continuar
      }
    }
    
    // Renomear arquivo atual
    const rotatedFile = path.join(dir, `${basename}.1.log`);
    await fs.rename(filepath, rotatedFile);
  } catch (error) {
    console.error('Erro na rotação do arquivo de log:', error);
  }
};

/**
 * Escreve log no console
 */
const writeToConsole = (level, message, meta = {}) => {
  if (!config.enableConsole) return;
  
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

/**
 * Verifica se o nível de log deve ser registrado
 */
const shouldLog = (level) => {
  const currentLevel = LOG_LEVELS[config.level.toUpperCase()] || LOG_LEVELS.INFO;
  const messageLevel = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
  
  return messageLevel <= currentLevel;
};

/**
 * Função genérica de log
 */
const log = async (level, message, meta = {}) => {
  if (!shouldLog(level)) return;
  
  // Processar meta se for um Error
  if (meta instanceof Error) {
    meta = {
      error: meta.message,
      stack: meta.stack,
      name: meta.name
    };
  }
  
  // Log no console
  writeToConsole(level, message, meta);
  
  // Log no arquivo (assíncrono)
  writeToFile(level, message, meta).catch(error => {
    console.error('Erro ao escrever log no arquivo:', error);
  });
};

/**
 * Log de erro
 * @param {string} message - Mensagem de erro
 * @param {Object|Error} meta - Metadados ou objeto Error
 */
export const logError = (message, meta = {}) => {
  log('ERROR', message, meta);
};

/**
 * Log de aviso
 * @param {string} message - Mensagem de aviso
 * @param {Object} meta - Metadados
 */
export const logWarn = (message, meta = {}) => {
  log('WARN', message, meta);
};

/**
 * Log de informação
 * @param {string} message - Mensagem informativa
 * @param {Object} meta - Metadados
 */
export const logInfo = (message, meta = {}) => {
  log('INFO', message, meta);
};

/**
 * Log de debug
 * @param {string} message - Mensagem de debug
 * @param {Object} meta - Metadados
 */
export const logDebug = (message, meta = {}) => {
  log('DEBUG', message, meta);
};

/**
 * Middleware de logging para Express
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 */
export const loggerMiddleware = (req, res, next) => {
  const start = Date.now();
  const { method, url, ip } = req;
  
  // Log da requisição
  logInfo('Requisição recebida', {
    method,
    url,
    ip,
    userAgent: req.get('User-Agent')
  });
  
  // Interceptar o final da resposta
  const originalSend = res.send;
  res.send = function(data) {
    const duration = Date.now() - start;
    const { statusCode } = res;
    
    // Log da resposta
    const logLevel = statusCode >= 400 ? 'ERROR' : statusCode >= 300 ? 'WARN' : 'INFO';
    const logFunction = logLevel === 'ERROR' ? logError : logLevel === 'WARN' ? logWarn : logInfo;
    
    logFunction('Resposta enviada', {
      method,
      url,
      statusCode,
      duration: `${duration}ms`,
      contentLength: res.get('Content-Length') || data?.length || 0
    });
    
    return originalSend.call(this, data);
  };
  
  next();
};

/**
 * Middleware de tratamento de erros com logging
 * @param {Error} error - Erro capturado
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware
 */
export const errorLoggerMiddleware = (error, req, res, next) => {
  const { method, url, ip } = req;
  
  logError('Erro na aplicação', {
    error: error.message,
    stack: error.stack,
    method,
    url,
    ip,
    body: req.body,
    params: req.params,
    query: req.query
  });
  
  next(error);
};

/**
 * Limpa logs antigos
 * @param {number} days - Número de dias para manter os logs
 */
export const cleanOldLogs = async (days = 30) => {
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
    logError('Erro ao limpar logs antigos', error);
  }
};

/**
 * Obtém estatísticas dos logs
 * @returns {Object} Estatísticas dos logs
 */
export const getLogStats = async () => {
  try {
    const logDir = await ensureLogDir();
    if (!logDir) return null;
    
    const files = await fs.readdir(logDir);
    const logFiles = files.filter(file => file.endsWith('.log'));
    
    let totalSize = 0;
    const fileStats = [];
    
    for (const file of logFiles) {
      const filepath = path.join(logDir, file);
      const stats = await fs.stat(filepath);
      
      totalSize += stats.size;
      fileStats.push({
        name: file,
        size: stats.size,
        modified: stats.mtime
      });
    }
    
    return {
      totalFiles: logFiles.length,
      totalSize,
      files: fileStats.sort((a, b) => b.modified - a.modified)
    };
  } catch (error) {
    logError('Erro ao obter estatísticas dos logs', error);
    return null;
  }
};

// Configurar limpeza automática de logs (executar uma vez por dia)
if (process.env.NODE_ENV === 'production') {
  setInterval(() => {
    cleanOldLogs().catch(error => {
      console.error('Erro na limpeza automática de logs:', error);
    });
  }, 24 * 60 * 60 * 1000); // 24 horas
}

// Log de inicialização
logInfo('Sistema de logging inicializado', {
  level: config.level,
  logDir: config.logDir,
  enableConsole: config.enableConsole,
  enableFile: config.enableFile
});