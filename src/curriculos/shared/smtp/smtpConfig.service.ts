import fs from "fs/promises";
import path from "path";
import { logInfo, logWarn } from "../utils/logger.js";
import config from "../../config/index.js";

const SMTP_CONFIG_FILE = path.join(
  config.paths.data,
  "smtp-config.json",
);

const normalizeBoolean = (value, defaultValue = false) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") return true;
    if (normalized === "false") return false;
  }
  return defaultValue;
};

const normalizePort = (value, defaultPort = 587) => {
  const port = parseInt(value, 10);
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    return defaultPort;
  }
  return port;
};

const getRuntimeConfig = () => {
  const port = normalizePort(process.env.SMTP_PORT, 587);
  const secure = normalizeBoolean(process.env.SMTP_SECURE, port === 465);

  return {
    host: String(process.env.SMTP_HOST || "").trim(),
    port,
    secure,
    user: String(process.env.SMTP_USER || "").trim(),
    pass: String(process.env.SMTP_PASS || ""),
    emailFrom: String(
      process.env.EMAIL_FROM || process.env.SMTP_USER || "",
    ).trim(),
  };
};

const buildPublicConfig = (config) => ({
  host: config.host,
  port: config.port,
  secure: config.secure,
  user: config.user,
  emailFrom: config.emailFrom,
  passConfigured: Boolean(config.pass),
  passMasked: config.pass ? "••••••••••••••••" : "",
});

const validateConfigInput = (config) => {
  const errors = [];

  if (!config.host) errors.push("SMTP_HOST é obrigatório");
  if (!config.user) errors.push("SMTP_USER é obrigatório");
  if (!config.pass) errors.push("SMTP_PASS é obrigatório");

  if (
    !Number.isInteger(config.port) ||
    config.port < 1 ||
    config.port > 65535
  ) {
    errors.push("SMTP_PORT deve ser um número entre 1 e 65535");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

const applyToProcessEnv = (config) => {
  process.env.SMTP_HOST = config.host;
  process.env.SMTP_PORT = String(config.port);
  process.env.SMTP_SECURE = String(config.secure);
  process.env.SMTP_USER = config.user;
  process.env.SMTP_PASS = config.pass;
  process.env.EMAIL_FROM = config.emailFrom;
};

const parsePersistedConfig = (raw) => {
  const parsed = JSON.parse(raw);

  return {
    host: String(parsed.host || "").trim(),
    port: normalizePort(parsed.port, 587),
    secure: normalizeBoolean(parsed.secure, false),
    user: String(parsed.user || "").trim(),
    pass: String(parsed.pass || ""),
    emailFrom: String(parsed.emailFrom || parsed.user || "").trim(),
  };
};

export const initializeSmtpRuntimeConfig = async () => {
  try {
    const raw = await fs.readFile(SMTP_CONFIG_FILE, "utf8");
    const fileConfig = parsePersistedConfig(raw);
    const validation = validateConfigInput(fileConfig);

    if (!validation.isValid) {
      logWarn(
        "Configuração SMTP persistida inválida. Mantendo variáveis de ambiente.",
        {
          errors: validation.errors,
        },
      );
      return;
    }

    applyToProcessEnv(fileConfig);
    logInfo("Configuração SMTP carregada do arquivo persistido", {
      host: fileConfig.host,
      port: fileConfig.port,
      secure: fileConfig.secure,
    });
  } catch (error) {
    if (error?.code !== "ENOENT") {
      logWarn("Falha ao carregar configuração SMTP persistida", {
        error: error.message,
      });
    }
  }
};

export const getSmtpConfig = () => {
  return buildPublicConfig(getRuntimeConfig());
};

export const updateSmtpConfig = async (payload) => {
  const nextConfig = {
    host: String(payload?.host || "").trim(),
    port: normalizePort(payload?.port, 587),
    secure: normalizeBoolean(payload?.secure, false),
    user: String(payload?.user || "").trim(),
    pass: String(payload?.pass || ""),
    emailFrom: String(payload?.emailFrom || payload?.user || "").trim(),
  };

  const validation = validateConfigInput(nextConfig);
  if (!validation.isValid) {
    const error: Error & { details?: string[] } = new Error("Dados SMTP inválidos");
    error.details = validation.errors;
    throw error;
  }

  await fs.mkdir(path.dirname(SMTP_CONFIG_FILE), { recursive: true });
  await fs.writeFile(
    SMTP_CONFIG_FILE,
    JSON.stringify(nextConfig, null, 2),
    "utf8",
  );

  applyToProcessEnv(nextConfig);

  logInfo("Configuração SMTP atualizada manualmente", {
    host: nextConfig.host,
    port: nextConfig.port,
    secure: nextConfig.secure,
  });

  return buildPublicConfig(nextConfig);
};
