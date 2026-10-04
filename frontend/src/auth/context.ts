import { createContext } from 'react';
import type { AuthState, TrustedUser } from '../services/session';
export interface AuthContextValue extends AuthState {
  login(email: string, password: string): Promise<TrustedUser>;
  logout(): Promise<void>;
}
export const AuthContext = createContext<AuthContextValue | null>(null);
