export type Role = 'CITIZEN' | 'OPERATOR' | 'ADMIN';
export interface TrustedUser {user_id: string; role: Role}
export interface AuthState {loading: boolean; user: TrustedUser | null; error: string}
let accessToken: string | null = null;
export const getAccessToken = () => accessToken;
export function operatorAccess(state: AuthState): 'loading' | 'login' | 'denied' | 'allowed' {
  return state.loading ? 'loading' : !state.user ? 'login' : state.user.role === 'CITIZEN' ? 'denied' : 'allowed';
}
export interface SessionDriver {
  restore(): Promise<string | null>;
  subscribe(callback: (token: string | null) => void): () => void;
  signIn(email: string, password: string): Promise<string>;
  signOut(): Promise<void>;
  loadUser(): Promise<TrustedUser>;
}
export function createSessionController(driver: SessionDriver) {
  let state: AuthState = {loading: true, user: null, error: ''};
  let generation = 0;
  let stopDriver: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const publish = (next: AuthState) => {state = next; listeners.forEach(listener => listener());};
  async function accept(token: string | null): Promise<TrustedUser | null> {
    const version = ++generation;
    accessToken = token;
    if (!token) {publish({loading: false, user: null, error: ''}); return null;}
    publish({loading: true, user: null, error: ''});
    try {
      const user = await driver.loadUser();
      if (version !== generation) return null;
      if (!['CITIZEN', 'OPERATOR', 'ADMIN'].includes(user.role)) throw new Error('Invalid profile');
      publish({loading: false, user, error: ''});
      return user;
    } catch {
      if (version === generation) {accessToken = null; publish({loading: false, user: null, error: 'Session could not be verified. Sign in again or retry.'});}
      return null;
    }
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {listeners.add(listener); return () => {listeners.delete(listener);};},
    start: () => {
      const version = generation;
      stopDriver = driver.subscribe(token => {void Promise.resolve().then(() => accept(token));});
      void driver.restore().then(token => {if (version === generation) return accept(token);})
        .catch(() => {if (version === generation) {accessToken = null; publish({loading: false, user: null, error: 'Authentication is unavailable. Check frontend auth configuration.'});}});
      return () => {++generation; stopDriver?.();};
    },
    login: async (email: string, password: string) => {
      const token = await driver.signIn(email, password);
      const user = await accept(token);
      if (!user) throw new Error('Session could not be verified.');
      return user;
    },
    logout: async () => {await driver.signOut(); await accept(null);},
  };
}

export function loginDestination(role: Role, from: unknown): string {
  if (typeof from === 'string' && from.startsWith('/track/')) return from;
  return role === 'CITIZEN' ? '/' : '/operator/dashboard';
}
