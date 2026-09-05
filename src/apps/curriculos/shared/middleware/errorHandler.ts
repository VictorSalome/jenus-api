import { logError } from '../utils/logger.js';
import { serverConfig } from '../../config/index.js';
import type { Request, Response, NextFunction, ErrorRequestHandler } from 'express';

export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  errors: unknown[];

  constructor(message: string, errors: unknown[] = []) {
    super(message, 400);
    this.errors = errors;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado') {
    super(message, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Não autorizado') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado') {
    super(message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflito de dados') {
    super(message, 409);
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = 'Muitas requisições') {
    super(message, 429);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Serviço indisponível') {
    super(message, 503);
  }
}

const getMulterErrorMessage = (error: { code?: string }): string => {
  switch (error.code) {
    case 'LIMIT_FILE_SIZE':
      return 'Arquivo muito grande';
    case 'LIMIT_FILE_COUNT':
      return 'Muitos arquivos';
    case 'LIMIT_FIELD_KEY':
      return 'Nome do campo muito longo';
    case 'LIMIT_FIELD_VALUE':
      return 'Valor do campo muito longo';
    case 'LIMIT_FIELD_COUNT':
      return 'Muitos campos';
    case 'LIMIT_UNEXPECTED_FILE':
      return 'Arquivo inesperado';
    case 'MISSING_FIELD_NAME':
      return 'Nome do campo ausente';
    default:
      return 'Erro no upload do arquivo';
  }
};

interface ErrorResponse {
  success: boolean;
  error: {
    message: string;
    status: number;
    stack?: string;
    details?: { name: string; code: unknown; originalMessage: string };
    errors?: unknown[];
  };
  timestamp?: string;
  requestId?: string;
}

export const errorHandler: ErrorRequestHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  if (res.headersSent) {
    next(error);
    return;
  }

  logError('Erro capturado pelo middleware', {
    error: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    body: req.body,
    params: req.params,
    query: req.query,
  });

  let statusCode = 500;
  let message = 'Erro interno do servidor';
  let errors: unknown[] = [];

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;

    if (error instanceof ValidationError) {
      errors = error.errors;
    }
  } else if (error.name === 'ValidationError') {
    statusCode = 400;
    message = 'Dados inválidos';
    errors = Object.values(
      (error as unknown as { errors?: Record<string, { message: string }> })
        .errors || {},
    ).map((err) => err.message);
  } else if (error.name === 'CastError') {
    statusCode = 400;
    message = 'ID inválido';
  } else if (
    (error as unknown as Record<string, unknown>).code === 11000
  ) {
    statusCode = 409;
    message = 'Dados duplicados';
  } else if (error.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Token inválido';
  } else if (error.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expirado';
  } else if (error.name === 'MulterError') {
    statusCode = 400;
    message = getMulterErrorMessage(error as unknown as { code?: string });
  } else if (
    (error as unknown as Record<string, unknown>).code === 'ENOENT'
  ) {
    statusCode = 404;
    message = 'Arquivo não encontrado';
  } else if (
    (error as unknown as Record<string, unknown>).code === 'EACCES'
  ) {
    statusCode = 403;
    message = 'Permissão negada';
  } else if (
    (error as unknown as Record<string, unknown>).code === 'EMFILE' ||
    (error as unknown as Record<string, unknown>).code === 'ENFILE'
  ) {
    statusCode = 503;
    message = 'Muitos arquivos abertos';
  } else if (
    (error as unknown as Record<string, unknown>).code === 'ENOSPC'
  ) {
    statusCode = 507;
    message = 'Espaço em disco insuficiente';
  }

  const errorResponse: ErrorResponse = {
    success: false,
    error: {
      message,
      status: statusCode,
    },
  };

  if (serverConfig.env === 'development') {
    errorResponse.error.stack = error.stack;
    errorResponse.error.details = {
      name: error.name,
      code: (error as unknown as Record<string, unknown>).code,
      originalMessage: error.message,
    };
  }

  if (errors.length > 0) {
    errorResponse.error.errors = errors;
  }

  errorResponse.timestamp = new Date().toISOString();

  if ((req as Request & { id?: string }).id) {
    errorResponse.requestId = (req as Request & { id?: string }).id;
  }

  res.status(statusCode).json(errorResponse);
};

export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export const notFoundHandler = (
  req: Request,
  _res: Response,
  next: NextFunction,
): void => {
  const error = new NotFoundError(
    `Rota ${req.method} ${req.originalUrl} não encontrada`,
  );
  next(error);
};

process.on('uncaughtException', (error: Error) => {
  logError('Exceção não capturada', error);
  console.error('UNCAUGHT EXCEPTION! Shutting down...');
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  const r = reason as Error | undefined;
  logError('Promise rejeitada não tratada', {
    reason: r?.message || String(reason),
    stack: r?.stack,
  });
  console.error('UNHANDLED REJECTION! Shutting down...');
  process.exit(1);
});

const gracefulShutdown = (signal: string): void => {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export const requestIdMiddleware = (
  req: Request & { id?: string },
  res: Response,
  next: NextFunction,
): void => {
  req.id = generateRequestId();
  res.setHeader('X-Request-ID', req.id);
  next();
};

const generateRequestId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

export const timeoutMiddleware = (timeout = 30000) => {
  return (req: Request & { timedout?: boolean }, res: Response, next: NextFunction): void => {
    req.timedout = false;
    let timeoutTriggered = false;

    const timer = setTimeout(() => {
      timeoutTriggered = true;
      req.timedout = true;

      if (!res.headersSent && !res.writableEnded) {
        const error = new ServiceUnavailableError('Timeout da requisição');
        next(error);
      }
    }, timeout);

    const clearTimer = (): void => clearTimeout(timer);
    res.on('finish', clearTimer);
    res.on('close', clearTimer);

    const originalSend = res.send;
    res.send = function (this: Response, data: unknown) {
      clearTimeout(timer);
      return originalSend.call(this, data as string | Buffer);
    } as typeof res.send;

    const originalJson = res.json;
    res.json = function (this: Response, data: unknown) {
      clearTimeout(timer);
      return originalJson.call(this, data);
    } as typeof res.json;

    if (timeoutTriggered) return;

    next();
  };
};

export const contentTypeMiddleware = (allowedTypes = ['application/json']) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Métodos sem body não transportam Content-Type — DELETE sem payload
    // (ex.: excluir experiência do perfil) chegava aqui sem header e era
    // rejeitado com 400. GET/HEAD/DELETE/OPTIONS passam direto.
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'DELETE' || req.method === 'OPTIONS') {
      next();
      return;
    }

    const contentType = req.get('Content-Type');

    if (!contentType) {
      next(new ValidationError('Content-Type é obrigatório'));
      return;
    }

    const isAllowed = allowedTypes.some((type) =>
      contentType.toLowerCase().includes(type.toLowerCase()),
    );

    if (!isAllowed) {
      next(
        new ValidationError(
          `Content-Type não suportado. Tipos permitidos: ${allowedTypes.join(', ')}`,
        ),
      );
      return;
    }

    next();
  };
};
