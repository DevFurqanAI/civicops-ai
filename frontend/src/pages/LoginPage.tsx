import AppHeader from '../components/AppHeader';
import { loginDestination } from '../services/session';
import { useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { accountActions, authConfigured } from '../services/auth';
import { useNavigate, useLocation } from 'react-router-dom';
import { Shield, Lock, Mail, ArrowRight, UserCog, User } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const auth = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function login(event: React.FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError(''); setMessage('');
    try {
      if (mode === 'reset') {setMessage(await accountActions.requestReset(email)); return;}
      if (mode === 'signup') {
        if (password !== confirmation) throw new Error('Passwords do not match.');
        setMessage(await accountActions.signup(email, password)); setPassword(''); setConfirmation(''); return;
      }
      const user = await auth.login(email, password);
      setPassword('');
      navigate(loginDestination(user.role, location.state?.from), {replace: true});
    } catch (error) {setError(error instanceof Error ? error.message : 'Sign-in failed.');} finally {setBusy(false);}
  }
  return (
    <div className="auth-shell"><AppHeader /><main id="main-content" className="auth-content">
      <div className="w-full max-w-md">
        
        {/* Logo Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-teal-50 text-teal-700 mb-4 shadow-sm">
            <Shield size={32} />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">CivicOps AI</h1>
          <p className="text-slate-500 mt-2">Your account, connected to your community.</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8 relative overflow-hidden">
          {(!authConfigured || error || auth.error) && <p role="alert" className="text-sm text-teal-700 mb-4">{!authConfigured ? 'Frontend Supabase Auth configuration is missing. Add the public URL and publishable key.' : error || auth.error}</p>}
          <h2 className="text-xl font-bold text-slate-800 mb-4">{mode === 'signup' ? 'Create citizen account' : mode === 'reset' ? 'Reset password' : 'Sign in'}</h2>
          {message && <p role="status" className="text-sm text-emerald-700 mb-4">{message}</p>}
          <form onSubmit={login} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Email Address</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="email"
                  required autoComplete="username" aria-label="Email address" value={email} onChange={e => setEmail(e.target.value)} disabled={busy || !authConfigured}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-800 outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700 transition-all"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            {mode !== 'reset' && <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-semibold text-slate-700">Password</label>
                <button type="button" disabled={busy} onClick={() => {setMode('reset'); setError(''); setMessage(''); setPassword('');}} className="text-xs text-teal-700">Forgot password?</button>
              </div>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="password"
                  required minLength={mode === 'signup' ? 12 : undefined} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} aria-label="Password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy || !authConfigured}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-800 outline-none focus:border-teal-700 focus:ring-1 focus:ring-teal-700 transition-all"
                  placeholder="Password"
                />
              </div>
            </div>}
            {mode === 'signup' && <label className="block text-sm font-semibold text-slate-700">Confirm password<input type="password" required minLength={12} autoComplete="new-password" value={confirmation} disabled={busy} onChange={e => setConfirmation(e.target.value)} className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-xl p-3" /></label>}
            <button type="submit" disabled={busy || auth.loading || !authConfigured} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all mt-2 shadow-lg shadow-slate-900/20">
              {busy ? 'Please wait...' : mode === 'signup' ? 'Create Citizen Account' : mode === 'reset' ? 'Send Reset Link' : 'Sign in'} <ArrowRight size={18} />
            </button>
          </form>
          <button type="button" disabled={busy} onClick={() => {setMode(mode === 'login' ? 'signup' : 'login'); setPassword(''); setConfirmation(''); setError(''); setMessage('');}} className="mt-4 text-sm font-semibold text-teal-700">{mode === 'login' ? 'Create a citizen account' : 'Back to sign in'}</button>
          {mode === 'signup' && <p className="text-xs text-slate-500 mt-2">Use at least 12 characters. New accounts have citizen access. Confirmation links must be opened in this browser.</p>}

          {/* Hackathon Quick Access */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider text-center mb-4">Portal access</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => navigate('/')} className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 text-slate-600 hover:text-blue-700 transition-all">
                <User size={20} />
                <span className="text-xs font-semibold">Citizen Portal</span>
              </button>
              <button onClick={() => navigate('/operator/dashboard')} className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-200 hover:border-teal-700 hover:bg-teal-50 text-slate-600 hover:text-teal-800 transition-all">
                <UserCog size={20} />
                <span className="text-xs font-semibold">Operator Dashboard</span>
              </button>
            </div>
          </div>
          
        </div>
      </div>
    </main></div>
  );
}