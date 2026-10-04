import AppHeader from '../components/AppHeader';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Shield, Lock } from 'lucide-react';
import { accountActions, authController, completeAuthCallback } from '../services/auth';

export default function AuthCallbackPage({reset = false}: {reset?: boolean}) {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    void completeAuthCallback().then(() => {if (active) {setReady(true); if (!reset) setMessage('Email confirmed. You can now sign in.');}})
      .catch(error => {if (active) setError(error instanceof Error ? error.message : 'Unable to verify this link.');});
    return () => {active = false;};
  }, [reset]);
  async function save(event: React.FormEvent) {
    event.preventDefault(); if (busy || !ready) return;
    setError('');
    if (password !== confirmation) {setError('Passwords do not match.'); return;}
    setBusy(true);
    try {
      await accountActions.updatePassword(password);
      await authController.logout();
      setPassword(''); setConfirmation(''); setReady(false); setMessage('Password updated. Sign in with your new password.');
    } catch (error) {setError(error instanceof Error ? error.message : 'Unable to update password.');}
    finally {setBusy(false);}
  }
  return <div className="auth-shell"><AppHeader /><main id="main-content" className="auth-content"><div className="w-full max-w-md">
    <div className="text-center mb-8"><Shield size={40} className="mx-auto text-teal-700 mb-4" /><h1 className="text-3xl font-bold text-slate-900">CivicOps AI</h1></div>
    <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 space-y-5">
      <h2 className="text-xl font-bold text-slate-800">{reset ? 'Reset password' : 'Confirm account'}</h2>
      {error && <p role="alert" className="text-sm text-teal-700">{error}</p>}
      {message && <p role="status" className="text-sm text-emerald-700">{message}</p>}
      {!ready && !error && !message && <p role="status" className="text-sm text-slate-500">Verifying link...</p>}
      {reset && ready && <form onSubmit={save} className="space-y-4">
        <label className="block text-sm font-semibold text-slate-700">New password<input type="password" required minLength={12} autoComplete="new-password" value={password} disabled={busy} onChange={e => setPassword(e.target.value)} className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-xl p-3" /></label>
        <label className="block text-sm font-semibold text-slate-700">Confirm password<input type="password" required minLength={12} autoComplete="new-password" value={confirmation} disabled={busy} onChange={e => setConfirmation(e.target.value)} className="mt-2 w-full bg-slate-50 border border-slate-200 rounded-xl p-3" /></label>
        <button disabled={busy} className="w-full bg-slate-900 text-white font-bold p-3 rounded-xl flex justify-center gap-2"><Lock size={18} />{busy ? 'Saving...' : 'Update password'}</button>
      </form>}
      <Link to="/login" className="block text-sm font-semibold text-teal-700">Return to sign in</Link>
    </div></div></main></div>;
}
