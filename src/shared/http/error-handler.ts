import type { Request, Response, NextFunction, ErrorRequestHandler } from "express";
import * as logger from "../../core/logger.js";

export interface ApiErrorResponse {
  success: false;
  error: {
    message: string;
    status: number;
    code?: string;
    details?: unknown;
    stack?: string;
  };
  timestamp: string;
}

/**
 * Middleware global de tratamento de erros Express (4 parâmetros).
 * Captura todos os erros repassados via next(err) ou lançados em rotas e middlewares.
 * Formata respostas padronizadas em JSON e trata adequadamente exceções do SQLite.
 */
export const globalErrorHandler: ErrorRequestHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Se os headers já foram enviados para o cliente, delegar para o handler padrão do Express
  if (res.headersSent) {
    return next(err);
  }

  let status: number = err.status || err.statusCode || 500;
  let message: string = err.message || "Erro interno do servidor";
  let code: string | undefined = err.code;

  const errMsg = String(err.message || "");

  // Tratamento específico de erros SQLite
  if (code === "SQLITE_CONSTRAINT" || errMsg.includes("UNIQUE constraint failed") || errMsg.includes("FOREIGN KEY constraint failed")) {
    status = 409;
    code = "CONFLICT";
    if (errMsg.includes("UNIQUE constraint failed")) {
      const fieldMatch = errMsg.match(/UNIQUE constraint failed: ([\w.]+)/);
      const field = fieldMatch ? fieldMatch[1] : "registro";
      message = `Conflito de unicidade: o campo '${field}' já está em uso.`;
    } else if (errMsg.includes("FOREIGN KEY constraint failed")) {
      message = "Operação recusada: violação de integridade referencial (chave estrangeira inexistente ou vinculada).";
    }
  } else if (code === "SQLITE_BUSY" || errMsg.includes("database is locked")) {
    status = 503;
    code = "DATABASE_BUSY";
    message = "O banco de dados está temporariamente ocupado. Tente novamente em alguns instantes.";
  } else if (err.name === "UnauthorizedError" || err.name === "JsonWebTokenError" || err.name === "TokenExpiredError") {
    status = 401;
    code = "UNAUTHORIZED";
    message = err.name === "TokenExpiredError" ? "Token expirado" : "Token de autenticação inválido";
  } else if (err.name === "ZodError" || err.name === "ValidationError") {
    status = 400;
    code = "VALIDATION_ERROR";
    message = err.message || "Dados inválidos fornecidos";
  } else if (err.name === "NotFoundError" || status === 404) {
    status = 404;
    code = "NOT_FOUND";
    message = err.message || "Recurso não encontrado";
  }

  logger.error(
    `[GlobalError] ${req.method} ${req.originalUrl} (${status}) - ${message}`,
    "HTTP",
  );
  if (status >= 500 && err.stack) {
    logger.debug(err.stack, "HTTP");
  }

  const isDev = process.env.NODE_ENV === "development";

  const responseBody: ApiErrorResponse = {
    success: false,
    error: {
      message,
      status,
      ...(code ? { code } : {}),
      ...(err.errors ? { details: err.errors } : {}),
      ...(isDev && err.stack ? { stack: err.stack } : {}),
    },
    timestamp: new Date().toISOString(),
  };

  res.status(status).json(responseBody);
};
