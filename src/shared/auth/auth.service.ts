import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { config } from '../../core/config.js';
import { LoginInput, AuthResponse } from './auth.types.js';

export const login = async (input: LoginInput): Promise<AuthResponse> => {
  const { username, password } = input;

  if (username !== config.ADMIN_USERNAME) {
    return { success: false, message: 'Usuário ou senha inválidos' };
  }

  const isValid = await bcrypt.compare(password, config.ADMIN_PASSWORD_HASH);

  if (!isValid) {
    return { success: false, message: 'Usuário ou senha inválidos' };
  }

  return {
    success: true,
    message: 'Login realizado com sucesso',
    user: { username }
  };
};

export const logout = (): AuthResponse => ({
  success: true,
  message: 'Logout realizado com sucesso'
});

export const generateTempPassword = (): string => {
  return crypto.randomBytes(4).toString('hex'); // 8 chars
};

export const setTemporaryPassword = async (tempPassword: string): Promise<void> => {
  const hash = await bcrypt.hash(tempPassword, 10);
  config.ADMIN_PASSWORD_HASH = hash;
};

export const forgotPassword = async (): Promise<{ success: boolean; tempPassword?: string; message: string }> => {
  const tempPassword = generateTempPassword();
  await setTemporaryPassword(tempPassword);
  return {
    success: true,
    tempPassword,
    message: 'Senha temporária gerada com sucesso',
  };
};
