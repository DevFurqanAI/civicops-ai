import type { ReactNode } from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from './useAuth';
import { operatorAccess } from '../services/session';
export function ProtectedOperatorRoute({children}: {children: ReactNode}) {
  const auth = useAuth();
  const location = useLocation();
  const access = operatorAccess(auth);
  if (access === 'loading') return <div role="status" className="min-h-screen bg-slate-50 flex items-center justify-center text-slate-500">Verifying session...</div>;
  if (access === 'login') return <Navigate to="/login" replace state={{from: location.pathname}} />;
  if (access === 'denied') return <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 text-slate-700"><p role="alert">Operator access is required.</p><Link to="/" className="text-blue-600 underline">Return to citizen portal</Link></div>;
  return children;
}
