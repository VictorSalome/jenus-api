import { Request, Response } from 'express';
import * as authService from './auth.service.js';
import { generateAccessToken, generateRefreshToken } from './jwt-auth.js';

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ success: false, message: 'Username e password são obrigatórios' });
      return;
    }

    const result = await authService.login({ username, password });

    if (result.success) {
      const user = { id: username, email: username, role: 'admin' };
      const accessToken = generateAccessToken(user);
      const refreshToken = await generateRefreshToken(user.id);

      res.json({
        success: true,
        message: result.message,
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

export const logout = (_req: Request, res: Response): void => {
  res.json(authService.logout());
};

export const me = (req: Request, res: Response): void => {
  const user = (req as any).user;
  if (user) {
    res.json({ success: true, user: { username: user.email || user.userId } });
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

    if (result.success) {
      const user = { id: username, email: username, role: 'admin' };
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
