export type Role = 'CITIZEN' | 'OPERATOR' | 'ADMIN' | 'DEPARTMENT';
export interface TrustedUser {user_id: string; role: Role; department_id?: string | null; department_name?: string | null; email?: string | null}
export interface AuthState {loading: boolean; user: TrustedUser | null; error: string}
let accessToken: string | null = null;
export const getAccessToken = () => accessToken;
export function operatorAccess(state: AuthState): 'loading' | 'login' | 'denied' | 'allowed' {
  return state.loading ? 'loading' : !state.user ? 'login' : ['OPERATOR', 'ADMIN'].includes(state.user.role) ? 'allowed' : 'denied';
}
export function departmentAccess(state: AuthState): 'loading' | 'login' | 'denied' | 'allowed' {
  return state.loading ? 'loading' : !state.user ? 'login' : state.user.role === 'DEPARTMENT' && state.user.department_id ? 'allowed' : 'denied';
}
export type SessionInput = string | null | {token: string; user_id: string};
export interface SessionDriver {
  restore(): Promise<SessionInput>;
  subscribe(callback: (session: SessionInput, event?: string) => void): () => void;
  signIn(email: string, password: string): Promise<SessionInput>;
  signOut(): Promise<void>;
  loadUser(): Promise<TrustedUser>;
}
export function createSessionController(driver: SessionDriver) {
  let state: AuthState = {loading: true, user: null, error: ''};
  let generation = 0, eventVersion = 0, consumers = 0;
  let stopDriver: (() => void) | undefined;
  let verifiedToken: string | null = null;
  let loggingIn = false;
  let signInEventToken: string | null = null;
  let pending: {identity: string; promise: Promise<TrustedUser | null>} | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: AuthState) => {state = next; listeners.forEach(listener => listener());};
  function clear() {
    ++generation; pending = null; verifiedToken = null; accessToken = null;
    publish({loading: false, user: null, error: ''});
  }
  function accept(session: SessionInput, force = false): Promise<TrustedUser | null> {
    if (!session) {clear(); return Promise.resolve(null);}
    const token = typeof session === 'string' ? session : session.token;
    const identity = typeof session === 'string' ? token : session.user_id;
    const expectedUser = typeof session === 'string' ? null : session.user_id;
    accessToken = token;
    if (pending?.identity === identity) return pending.promise;
    const sameUser = Boolean(state.user && (expectedUser ? expectedUser === state.user.user_id : token === verifiedToken));
    if (sameUser && !force) {verifiedToken = token; return Promise.resolve(state.user);}
    const version = ++generation;
    if (!sameUser) publish({loading: true, user: null, error: ''});
    // Defer provider work outside the synchronous Supabase auth callback/lock.
    const promise = Promise.resolve().then(() => driver.loadUser()).then(user => {
      if (version !== generation) return null;
      if ((expectedUser && user.user_id !== expectedUser) || !['CITIZEN', 'OPERATOR', 'ADMIN', 'DEPARTMENT'].includes(user.role)
          || (user.role === 'DEPARTMENT' && !user.department_id)) throw new Error('Invalid profile');
      verifiedToken = accessToken;
      publish({loading: false, user, error: ''});
      return user;
    }).catch(() => {
      if (version === generation) {clear(); publish({loading: false, user: null, error: 'Session could not be verified. Sign in again or retry.'});}
      return null;
    }).finally(() => {if (pending?.promise === promise) pending = null;});
    pending = {identity, promise};
    return promise;
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {listeners.add(listener); return () => {listeners.delete(listener);};},
    start: () => {
      if (consumers++ === 0) {
        const restorationVersion = eventVersion;
        const restorationGeneration = generation;
        stopDriver = driver.subscribe((session, event) => {
          ++eventVersion;
          if (event === 'SIGNED_OUT' || !session) {clear(); return;}
          if (loggingIn && event === 'SIGNED_IN') signInEventToken = typeof session === 'string' ? session : session.token;
          // Repeated SIGNED_IN / INITIAL_SESSION for the verified identity are
          // deduplicated; TOKEN_REFRESHED updates the token without blanking UI.
          void accept(session, loggingIn && event === 'SIGNED_IN');
        });
        void driver.restore().then(session => {if (restorationVersion === eventVersion) return accept(session);})
          .catch(() => {if (restorationVersion === eventVersion && restorationGeneration === generation) {clear(); publish({loading: false, user: null, error: 'Authentication is unavailable. Check frontend auth configuration.'});}});
      }
      let stopped = false;
      return () => {if (!stopped) {stopped = true; if (--consumers === 0) stopDriver?.();}};
    },
    login: async (email: string, password: string) => {
      ++eventVersion;
      loggingIn = true;
      signInEventToken = null;
      try {
        const session = await driver.signIn(email, password);
        const token = typeof session === 'string' ? session : session?.token;
        const user = await accept(session, token !== signInEventToken);
        if (!user) throw new Error('Session could not be verified.');
        return user;
      } finally {loggingIn = false; signInEventToken = null;}
    },
    logout: async () => {++eventVersion; clear(); await driver.signOut();},
  };
}

export function loginDestination(role: Role, from: unknown): string {
  if (typeof from === 'string' && from.startsWith('/track/')) return from;
  return ['OPERATOR', 'ADMIN'].includes(role) ? '/operator/dashboard' : role === 'DEPARTMENT' ? '/department/dashboard' : '/';
}
