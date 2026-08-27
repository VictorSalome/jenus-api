import rateLimit from "express-rate-limit";
import { config } from "../../core/config.js";

/**
 * Preset padrão aplicado globalmente (todas as rotas que não têm um
 * rate-limit próprio, ex.: promo e auth hoje).
 */
export const defaultLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Preset mais restrito para rotas sensíveis a brute-force (login,
 * forgot-password).
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Muitas tentativas. Tente novamente em alguns minutos." },
});

/**
 * Preset estrito genérico, para rotas que precisam de um limite mais
 * agressivo do que o padrão (ex.: uploads, disparos em massa).
 */
export const strictLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
