export interface User {
  id?: string;
  username: string;
  name?: string;
  role?: string;
  householdId?: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: User;
}
