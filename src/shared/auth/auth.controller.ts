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
      const refreshToken = generateRefreshToken(user.id);

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

export const forgotPassword = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({ success: false, message: 'Email é obrigatório' });
      return;
    }

    const result = await authService.forgotPassword();

    if (result.success && result.tempPassword) {
      // Enviar email com senha temporária
      try {
        const { criarTransporter } = await import('../email/mailer.js');
        const transporter = criarTransporter();
        await transporter.sendMail({
          from: process.env.EMAIL_FROM || process.env.SMTP_USER,
          to: email,
          subject: 'Recuperação de senha - Jenus',
          html: `
            <h2>Recuperação de Senha</h2>
            <p>Uma nova senha temporária foi gerada para sua conta:</p>
            <p style="font-size:24px;font-weight:bold;background:#f0f0f0;padding:10px;border-radius:4px;">${result.tempPassword}</p>
            <p>Use esta senha para fazer login. Recomendamos alterá-la após o acesso.</p>
            <p style="color:#666;font-size:12px;">Se você não solicitou esta recuperação, ignore este email.</p>
          `,
        });
      } catch (emailErr) {
        console.error('Erro ao enviar email de recuperação:', emailErr);
        // Mesmo se email falhar, a senha já foi gerada — retorna para debug
      }

      res.json({
        success: true,
        message: 'Senha temporária enviada para seu email',
      });
    } else {
      res.status(500).json({ success: false, message: 'Erro ao gerar senha temporária' });
    }
  } catch (err) {
    res.status(500).json({ success: false, message: 'Erro interno no servidor' });
  }
};
