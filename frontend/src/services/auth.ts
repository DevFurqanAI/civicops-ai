import { createClient } from '@supabase/supabase-js';
import { getCurrentUser } from './api';
import { createSessionController } from './session';
import { createAccountActions } from './accounts';
import { enrichDepartmentIdentity } from '../utils/departmentDashboard';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
// Fail closed for a missing/wrong key type. Never accept a server key here.
export const authConfigured = Boolean(url && /^https?:\/\//.test(url) && key?.startsWith('sb_publishable_'));
const supabase = authConfigured ? createClient(url, key, {auth: {
  persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce',
}}) : null;
function requireClient() {
  if (!supabase) throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in the frontend environment.');
  return supabase;
}
export const accountActions = createAccountActions({
  signUp: input => requireClient().auth.signUp(input),
  resetPasswordForEmail: (email, options) => requireClient().auth.resetPasswordForEmail(email, options),
  updateUser: input => requireClient().auth.updateUser(input),
}, window.location.origin);

let callbackPromise: Promise<void> | null = null;
export function completeAuthCallback(): Promise<void> {
  // Cache for React StrictMode's repeated effect. Consume codes once and remove
  // them from the address bar; never print callback URLs/tokens/provider errors.
  if (!callbackPromise) {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code');
    window.history.replaceState({}, '', url.pathname);
    callbackPromise = (async () => {
      if (!code || url.searchParams.has('error')) throw new Error('This link is invalid or expired. Request a new link in the same browser.');
      const {error, data} = await requireClient().auth.exchangeCodeForSession(code);
      if (error || !data.session) throw new Error('This link is invalid or expired. Request a new link in the same browser.');
    })();
  }
  return callbackPromise;
}
export const authController = createSessionController({
  restore: async () => {
    const {data, error} = await requireClient().auth.getSession();
    if (error) throw new Error('Session restoration failed');
    return data.session ? {token: data.session.access_token, user_id: data.session.user.id} : null;
  },
  subscribe: callback => {
    if (!supabase) return () => {};
    const {data} = supabase.auth.onAuthStateChange((event, session) => callback(session ? {token: session.access_token, user_id: session.user.id} : null, event));
    return () => data.subscription.unsubscribe();
  },
  signIn: async (email, password) => {
    const {data, error} = await requireClient().auth.signInWithPassword({email, password});
    if (error || !data.session) throw new Error('Invalid email/password or sign-in is unavailable.');
    return {token: data.session.access_token, user_id: data.session.user.id};
  },
  signOut: async () => {
    const {error} = await requireClient().auth.signOut();
    if (error) throw new Error('Sign-out failed. Please retry.');
  },
  loadUser: async () => enrichDepartmentIdentity(await getCurrentUser(), {
    account: async () => {
      const {data, error} = await requireClient().auth.getUser();
      return error ? null : data.user;
    },
    department: async id => {
      const {data, error} = await requireClient().from('departments').select('id,display_name').eq('id', id).abortSignal(AbortSignal.timeout(5000)).maybeSingle();
      return error ? null : data;
    },
  }),
});
