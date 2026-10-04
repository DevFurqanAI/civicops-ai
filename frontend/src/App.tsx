import { BrowserRouter, Routes, Route } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import CitizenReportPage from './pages/CitizenReportPage';
import ReportTrackingPage from './pages/ReportTrackingPage';
import OperationsDashboard from './pages/OperationsDashboard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth Route */}
        <Route path="/login" element={<LoginPage />} />
        
        {/* Citizen Routes (Public) */}
        <Route path="/" element={<CitizenReportPage />} />
        <Route path="/track/:id" element={<ReportTrackingPage />} />
        
        {/* Operator Routes (Protected in Production) */}
        <Route path="/operator/dashboard" element={<OperationsDashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;