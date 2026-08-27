import bcrypt from 'bcryptjs';
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
