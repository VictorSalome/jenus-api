import nodemailer from "nodemailer";

export interface SmtpOverrides {
  host?: string;
  port?: string | number;
  secure?: boolean | string;
  user?: string;
  pass?: string;
  emailFrom?: string;
}

/**
 * Configuração do transporter de e-mail
 */
export const getSmtpRuntimeConfig = (overrides: SmtpOverrides = {}) => {
  const basePort = parseInt(process.env.SMTP_PORT, 10) || 587;
  const port =
    overrides.port !== undefined ? parseInt(String(overrides.port), 10) : basePort;

  return {
    host: overrides.host ?? process.env.SMTP_HOST,
    port: Number.isFinite(port) ? port : 587,
    secure:
      overrides.secure !== undefined
        ? Boolean(overrides.secure)
        : process.env.SMTP_SECURE === "true",
    auth: {
      user: overrides.user ?? process.env.SMTP_USER,
      pass: overrides.pass ?? process.env.SMTP_PASS,
    },
    emailFrom:
      overrides.emailFrom ?? process.env.EMAIL_FROM ?? process.env.SMTP_USER,
  };
};

export const criarTransporter = (overrides: SmtpOverrides = {}) => {
  const smtp = getSmtpRuntimeConfig(overrides);
  const config = {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    connectionTimeout:
      parseInt(process.env.SMTP_CONNECTION_TIMEOUT_MS) || 10000,
    greetingTimeout: parseInt(process.env.SMTP_GREETING_TIMEOUT_MS) || 10000,
    socketTimeout: parseInt(process.env.SMTP_SOCKET_TIMEOUT_MS) || 15000,
    auth: smtp.auth,
    tls: {
      rejectUnauthorized: false,
    },
  };

  // Para desenvolvimento, usar Ethereal Email se não houver configuração SMTP
  if (!process.env.SMTP_HOST && process.env.NODE_ENV === "development") {
    return nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      auth: {
        user: "ethereal.user@ethereal.email",
        pass: "ethereal.pass",
      },
    });
  }

  return nodemailer.createTransport(config);
};

export const withSendTimeout = (promise, timeoutMs) =>
  Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error(`Timeout no envio de e-mail (${timeoutMs}ms)`)),
        timeoutMs,
      );
    }),
  ]);

export const isTimeoutLikeError = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("timeout") ||
    error?.code === "ETIMEDOUT" ||
    error?.code === "ESOCKET"
  );
};

export const getTransportFallbacks = (baseConfig: SmtpOverrides = {}) => {
  const runtimeConfig = getSmtpRuntimeConfig(baseConfig);
  const host = String(runtimeConfig.host || "").toLowerCase();
  const port = runtimeConfig.port;
  const secure = runtimeConfig.secure;

  const fallbacks = [
    {
      name: `smtp:${host || "default"}:${port}:${secure ? "ssl" : "starttls"}`,
      overrides: {
        host: runtimeConfig.host,
        port: runtimeConfig.port,
        secure: runtimeConfig.secure,
        user: runtimeConfig.auth.user,
        pass: runtimeConfig.auth.pass,
      },
    },
  ];

  if (host.includes("gmail.com") && port !== 465) {
    fallbacks.push({
      name: "smtp:gmail.com:465:ssl-fallback",
      overrides: {
        host: runtimeConfig.host,
        port: 465,
        secure: true,
        user: runtimeConfig.auth.user,
        pass: runtimeConfig.auth.pass,
      },
    });
  }

  return fallbacks;
};

/**
 * Envia um e-mail genérico usando o transporter configurado, com fallback
 * automático de porta/segurança e timeout.
 */
export const sendMail = async (
  mailOptions: Record<string, unknown>,
  overrides: SmtpOverrides = {},
) => {
  const transportFallbacks = getTransportFallbacks(overrides);
  const sendTimeoutMs = parseInt(process.env.EMAIL_SEND_TIMEOUT_MS) || 20000;
  let resultado: any = null;
  let lastError: any = null;

  for (const transportTry of transportFallbacks) {
    const transporter = criarTransporter(transportTry.overrides);
    try {
      resultado = await withSendTimeout(
        transporter.sendMail(mailOptions),
        sendTimeoutMs,
      );
      break;
    } catch (error: any) {
      lastError = error;
      const isLast =
        transportTry === transportFallbacks[transportFallbacks.length - 1];
      if (!isTimeoutLikeError(error) || isLast) {
        throw error;
      }
    } finally {
      if (typeof transporter.close === "function") {
        transporter.close();
      }
    }
  }

  if (!resultado && lastError) {
    throw lastError;
  }

  return resultado;
};
