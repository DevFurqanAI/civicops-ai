import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
export default function SessionControls() {
  const auth = useAuth();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function logout() {
    setBusy(true); setError('');
    try {await auth.logout();} catch {setError('Sign-out failed. Please retry.');} finally {setBusy(false);}
  }
  return <div className="session-controls">
    {auth.loading ? <span role="status">Restoring session...</span> : auth.user ? <>
      <span>{auth.user.role === 'CITIZEN' ? 'Citizen account' : auth.user.role === 'ADMIN' ? 'Administrator' : 'Operator'}</span>
      {auth.user.role !== 'CITIZEN' && <Link to="/operator/dashboard" className="session-link">Dashboard</Link>}
      <button disabled={busy} onClick={logout} className="session-link">{busy ? 'Signing out...' : 'Sign out'}</button>
    </> : <Link to="/login" state={{from: location.pathname}} className="session-link">Sign in / account</Link>}
    {error && <span role="alert">{error}</span>}
  </div>;
}
