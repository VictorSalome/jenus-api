import { logInfo, logError } from "../utils/logger.js";
import config from "../config/index.js";

/**
 * Middleware de autenticação por API Key
 * Para uso em endpoints que podem ser acessados externamente (scraper, etc)
 */

// API Keys válidas (pode ser configurado via .env)
const API_KEYS = process.env.API_KEYS 
  ? process.env.API_KEYS.split(",").map(k => k.trim())
  : ["dev-key", "scraper-key"]; // Keys padrão para desenvolvimento

// Cache de keys válidas
const validKeys = new Set(API_KEYS);

/**
 * Middleware para verificar API Key
 * Header: X-API-Key ou query param: api_key
 */
export const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers["x-api-key"] || req.query.api_key;

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: {
        message: "API Key é obrigatória",
        status: 401
      },
      hint: "Forneça a API Key via header 'X-API-Key' ou query param 'api_key'",
      timestamp: new Date().toISOString()
    });
  }

  if (!validKeys.has(apiKey)) {
    logInfo("API Key inválida tentativa", { ip: req.ip, key: apiKey?.substring(0, 5) + "..." });
    return res.status(403).json({
      success: false,
      error: {
        message: "API Key inválida",
        status: 403
      },
      timestamp: new Date().toISOString()
    });
  }

  // Adicionar info do cliente à request
  req.apiClient = { key: apiKey };
  next();
};

/**
 * Middleware opcional - ignora auth em desenvolvimento
 */
export const optionalApiKeyAuth = (req, res, next) => {
  const apiKey = req.headers["x-api-key"] || req.query.api_key;

  if (!apiKey || !validKeys.has(apiKey)) {
    // Em desenvolvimento, permite acesso sem auth
    if (process.env.NODE_ENV === "development") {
      req.apiClient = { key: "anonymous" };
      return next();
    }
    return res.status(401).json({
      success: false,
      error: {
        message: "API Key é obrigatória",
        status: 401
      }
    });
  }

  req.apiClient = { key: apiKey };
  next();
};

/**
 * Adiciona uma nova API Key
 * @param {string} key - API Key a ser adicionada
 * @returns {boolean} - true se adicionada com sucesso
 */
export const addApiKey = (key) => {
  if (key && !validKeys.has(key)) {
    validKeys.add(key);
    logInfo("Nova API Key adicionada", { key: key?.substring(0, 5) + "..." });
    return true;
  }
  return false;
};

/**
 * Remove uma API Key
 * @param {string} key - API Key a ser removida
 * @returns {boolean} - true se removida com sucesso
 */
export const removeApiKey = (key) => {
  if (validKeys.delete(key)) {
    logInfo("API Key removida", { key: key?.substring(0, 5) + "..." });
    return true;
  }
  return false;
};

/**
 * Verifica se uma API Key é válida
 * @param {string} key - API Key a ser verificada
 * @returns {boolean}
 */
export const isValidApiKey = (key) => {
  return validKeys.has(key);
};