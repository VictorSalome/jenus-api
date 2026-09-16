import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from './jwt-auth.js';

export const requireAuth = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim() || (req as any).cookies?.accessToken;

  if (!token) {
    res.status(401).json({ success: false, message: 'Acesso negado. Faça login.', needsRefresh: true });
    return;
  }

  const decoded = verifyAccessToken(token);
  if (!decoded) {
    res.status(401).json({ success: false, message: 'Token inválido ou expirado', needsRefresh: true });
    return;
  }

  (req as any).user = decoded;
  next();
};

export const optionalAuth = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim() || (req as any).cookies?.accessToken;

  if (token) {
    const decoded = verifyAccessToken(token);
    if (decoded) {
      (req as any).user = decoded;
    }
  }
  next();
};

export const requireRole = (role: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as any).user;
    if (!user || user.role !== role) {
      res.status(403).json({
        success: false,
        message: `Acesso negado: privilégio '${role}' obrigatório para esta operação.`,
      });
      return;
    }
    next();
  };
};