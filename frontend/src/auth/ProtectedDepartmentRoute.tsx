import type { ReactNode } from 'react';
import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from './useAuth';
import { departmentAccess } from '../services/session';

export function ProtectedDepartmentRoute({children}: {children: ReactNode}) {
  const auth = useAuth();
  const location = useLocation();
  const access = departmentAccess(auth);
  if (access === 'loading') return <div role="status" className="surface dashboard-loading">Verifying department access...</div>;
  if (access === 'login') return <Navigate to="/login" replace state={{from: location.pathname}} />;
  if (access === 'denied') return <div className="surface dashboard-loading"><p role="alert">An active department account is required.</p><Link to="/">Return to citizen portal</Link></div>;
  return children;
}
