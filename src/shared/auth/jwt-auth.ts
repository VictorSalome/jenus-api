/**
 * JWT Authentication System with Refresh Tokens
 * =============================================
 * 
 * Mecanismo: Access token (15min) + Refresh token (7d) em cookies httpOnly
 * Refresh automático via middleware
 * Rate limiting global e por rota
 * 
 * Uso:
 * - Login retorna { accessToken, user }
 * - Header Authorization: Bearer <token>
 * - Refresh automático no frontend via token.exp field
 */

import jwt from 'jsonwebtoken';
import { Request, Response } from 'express';
import crypto from 'crypto';
import { getDb } from '../../core/database.js';

// Configurações
const ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_SECRET || 'your-access-token-secret-change-me';
const REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-token-secret-change-me';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

// Persistido no SQLite (tabela auth_refresh_tokens) — antes era um Map em
// memória, e qualquer restart do processo (deploy, crash, pm2 reload)
// derrubava todas as sessões ativas mesmo com "lembrar-me" marcado.

interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
}

/**
 * Gera access token (15 minutos)
 */
export function generateAccessToken(user: User): string {
  const payload: JwtPayload = {
    userId: user.id,
    email: user.email,
    role: user.role,
  };
  
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

/**
 * Gera refresh token (7 dias) com fingerprint único
 */
export async function generateRefreshToken(userId: string, fingerprint: string = ''): Promise<string> {
  const tokenId = crypto.randomBytes(16).toString('hex');
  const payload = {
    userId,
    tokenId,
    fingerprint,
  };

  const token = jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });

  // Armazena o refresh token
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const db = await getDb();
  await db.run(
    'INSERT INTO auth_refresh_tokens (token_id, user_id, expires_at, is_revoked) VALUES (?, ?, ?, 0)',
    tokenId,
    userId,
    expiresAt.toISOString(),
  );

  return token;
}

/**
 * Verifica e decodifica access token
 */
export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, ACCESS_TOKEN_SECRET) as JwtPayload;
  } catch (error) {
    return null;
  }
}

/**
 * Verifica refresh token
 */
export function verifyRefreshToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, REFRESH_TOKEN_SECRET) as JwtPayload;
  } catch (error) {
    return null;
  }
}

/**
 * Revoga refresh token (logout)
 */
export async function revokeRefreshToken(tokenId: string): Promise<boolean> {
  const db = await getDb();
  const result = await db.run(
    'UPDATE auth_refresh_tokens SET is_revoked = 1 WHERE token_id = ?',
    tokenId,
  );
  return (result.changes ?? 0) > 0;
}

/**
 * Limpa refresh tokens expirados/revogados
 */
export async function cleanupExpiredTokens(): Promise<void> {
  const db = await getDb();
  await db.run(
    "DELETE FROM auth_refresh_tokens WHERE expires_at < ? OR is_revoked = 1",
    new Date().toISOString(),
  );
}

// requireAuth/optionalAuth foram consolidados em auth.middleware.ts para evitar
// duas implementações quase idênticas convivendo em shared/auth/. Importe-os de
// './auth.middleware.js'.

/**
 * Endpoint de refresh token
 */
export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
  
  if (!refreshToken) {
    res.status(401).json({ success: false, message: 'Refresh token não fornecido' });
    return;
  }
  
  const decoded = verifyRefreshToken(refreshToken);
  if (!decoded) {
    res.status(401).json({ success: false, message: 'Refresh token inválido' });
    return;
  }
  
  // Extrai tokenId do payload
  const tokenId = (decoded as any).tokenId;
  const db = await getDb();
  const stored = await db.get(
    'SELECT * FROM auth_refresh_tokens WHERE token_id = ?',
    tokenId,
  );

  if (!stored || stored.is_revoked) {
    res.status(401).json({ success: false, message: 'Refresh token revogado' });
    return;
  }

  // Gera novos tokens
  const user = {
    id: (decoded as any).userId,
    email: (decoded as any).email,
    role: (decoded as any).role,
  };

  const newAccessToken = generateAccessToken(user);
  const newRefreshToken = await generateRefreshToken(user.id, (decoded as any).fingerprint);

  res.json({
    success: true,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    user,
  });
};

// Exporta para uso em controladores
export { ACCESS_TOKEN_SECRET, REFRESH_TOKEN_SECRET };