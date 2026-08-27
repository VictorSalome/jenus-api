export interface User {
  username: string;
}

export interface LoginInput {
  username: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message: string;
  user?: User;
}
