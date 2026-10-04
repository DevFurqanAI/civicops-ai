import { useEffect, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { authController } from '../services/auth';
import { AuthContext } from './context';

export function AuthProvider({children}: {children: ReactNode}) {
  const state = useSyncExternalStore(authController.subscribe, authController.getSnapshot);
  useEffect(() => authController.start(), []);
  return <AuthContext.Provider value={{...state, login: authController.login, logout: authController.logout}}>{children}</AuthContext.Provider>;
}
