import { Request, Response } from 'express';
import * as authService from './auth.service.js';
import { generateAccessToken, generateRefreshToken, revokeRefreshToken, verifyRefreshToken } from './jwt-auth.js';

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ success: false, message: 'Username e password são obrigatórios' });
      return;
    }

    const result = await authService.login({ username, password });

    if (result.success && result.user) {
      const user = {
        id: result.user.id || username,
        email: result.user.username,
        name: result.user.name,
        role: result.user.role || 'user',
        householdId: result.user.householdId,
      };
      const accessToken = generateAccessToken(user);
      const refreshToken = await generateRefreshToken(user.id);

      res.json({
        success: true,
        message: result.message || 'Login realizado com sucesso',
        user: result.user,
        accessToken,
        refreshToken,
      });
    } else {
      res.status(401).json(result);
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro interno no servidor' });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const refreshToken = req.body?.refreshToken || req.headers['x-refresh-token'];
    if (refreshToken && typeof refreshToken === 'string') {
      const decoded = verifyRefreshToken(refreshToken);
      if ((decoded as any)?.tokenId) {
        await revokeRefreshToken((decoded as any).tokenId);
      }
    }
  } catch {
    // Falha silenciosa na revogação para não bloquear logout do cliente
  }
  res.json(authService.logout());
};

export const me = (req: Request, res: Response): void => {
  const user = (req as any).user;
  if (user) {
    res.json({
      success: true,
      user: {
        id: user.userId,
        username: user.email || user.userId,
        name: user.name,
        role: user.role,
        householdId: user.householdId,
      },
    });
  } else {
    res.status(401).json({ success: false, message: 'Não autenticado' });
  }
};

/**
 * Endpoint OAuth2 Password Flow específico para o cadeado (Authorize) do Swagger UI.
 * Aceita application/x-www-form-urlencoded ou JSON e retorna o formato access_token esperado pelo Swagger.
 */
export const swaggerTokenLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const username = (req.body?.username || req.query?.username) as string;
    const password = (req.body?.password || req.query?.password) as string;

    if (!username || !password) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'Nome de usuário e senha são obrigatórios.',
      });
      return;
    }

    const result = await authService.login({ username, password });

    if (result.success && result.user) {
      const user = {
        id: result.user.id || username,
        email: result.user.username,
        name: result.user.name,
        role: result.user.role || 'user',
        householdId: result.user.householdId,
      };
      const accessToken = generateAccessToken(user);

      // Formato padrão OAuth2 esperado pelo Swagger UI
      res.json({
        access_token: accessToken,
        token_type: 'bearer',
        expires_in: 900,
      });
    } else {
      res.status(401).json({
        error: 'invalid_grant',
        error_description: result.message || 'Credenciais inválidas.',
      });
    }
  } catch (err: any) {
    res.status(500).json({
      error: 'server_error',
      error_description: err?.message || 'Erro interno no servidor.',
    });
  }
};
