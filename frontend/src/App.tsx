import { AuthProvider } from './auth/AuthProvider';
import { ProtectedOperatorRoute } from './auth/ProtectedOperatorRoute';
import { ProtectedDepartmentRoute } from './auth/ProtectedDepartmentRoute';
import DepartmentDashboard from './pages/DepartmentDashboard';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import CitizenReportPage from './pages/CitizenReportPage';
import ReportTrackingPage from './pages/ReportTrackingPage';
import OperationsDashboard from './pages/OperationsDashboard';
import AuthCallbackPage from './pages/AuthCallbackPage';
import TrackLookupPage from './pages/TrackLookupPage';

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
      <Routes>
        {/* Auth Route */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/auth/callback" element={<AuthCallbackPage />} />
        <Route path="/auth/reset" element={<AuthCallbackPage reset />} />
        
        {/* Citizen Routes (Public) */}
        <Route path="/" element={<CitizenReportPage />} />
        <Route path="/track/:id" element={<ReportTrackingPage />} />
        <Route path="/track" element={<TrackLookupPage />} />
        
        {/* Operator Routes (Protected) */}
        <Route path="/operator/dashboard" element={<ProtectedOperatorRoute><OperationsDashboard /></ProtectedOperatorRoute>} />
        <Route path="/department/dashboard" element={<ProtectedDepartmentRoute><DepartmentDashboard /></ProtectedDepartmentRoute>} />
      </Routes>
    </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
