import bcrypt from 'bcryptjs';
import { getDb } from '../../core/database.js';
import { LoginInput, AuthResponse } from './auth.types.js';

export const login = async (input: LoginInput): Promise<AuthResponse> => {
  const { username, password } = input;

  if (!username || !password) {
    return { success: false, message: 'Usuário ou senha inválidos' };
  }

  const db = await getDb();
  const user = await db.get(
    'SELECT id, username, password_hash, name, role FROM users WHERE LOWER(username) = LOWER(?)',
    username
  );

  if (!user) {
    return { success: false, message: 'Usuário ou senha inválidos' };
  }

  const isValid = await bcrypt.compare(password, user.password_hash);

  if (!isValid) {
    return { success: false, message: 'Usuário ou senha inválidos' };
  }

  const member = await db.get<{ household_id: string }>(
    'SELECT household_id FROM financial_household_members WHERE user_id = ? LIMIT 1',
    user.id
  );

  // FAIL-CLOSED: Rejeita login de usuário sem household explicitamente vinculado
  if (!member?.household_id) {
    return {
      success: false,
      message: 'Acesso recusado: usuário não possui ambiente familiar (household) vinculado.',
    };
  }

  const householdId = member.household_id;

  return {
    success: true,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      householdId,
    },
  };
};

export const logout = (): AuthResponse => ({
  success: true,
  message: 'Logout realizado com sucesso'
});
