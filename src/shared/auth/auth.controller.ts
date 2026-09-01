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
