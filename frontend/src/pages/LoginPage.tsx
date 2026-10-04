import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Lock, Mail, ArrowRight, UserCog, User } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = (e: React.FormEvent, role: 'citizen' | 'operator') => {
    e.preventDefault();
    setIsLoading(true);
    
    // Simulate network authentication
    setTimeout(() => {
      setIsLoading(false);
      if (role === 'operator') {
        navigate('/operator/dashboard');
      } else {
        navigate('/');
      }
    }, 800);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md">
        
        {/* Logo Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 text-red-600 mb-4 shadow-sm">
            <Shield size={32} />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">CivicOps AI</h1>
          <p className="text-slate-500 mt-2">Secure Authentication Gateway</p>
        </div>

        {/* Login Form */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 p-8 relative overflow-hidden">
          {isLoading && (
            <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-20 flex items-center justify-center">
               <svg className="animate-spin h-8 w-8 text-red-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            </div>
          )}

          <form onSubmit={(e) => handleLogin(e, 'operator')} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1">Email Address</label>
              <div className="relative">
                <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="email" 
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-800 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all"
                  placeholder="operator@civicops.gov"
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-semibold text-slate-700">Password</label>
                <a href="#" className="text-xs font-medium text-red-600 hover:text-red-700">Forgot?</a>
              </div>
              <div className="relative">
                <Lock size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="password" 
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-800 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500 transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all mt-2 shadow-lg shadow-slate-900/20">
              Sign In Securely <ArrowRight size={18} />
            </button>
          </form>

          {/* Hackathon Quick Access */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider text-center mb-4">Hackathon Demo Access</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={(e) => handleLogin(e, 'citizen')} className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50 text-slate-600 hover:text-blue-700 transition-all">
                <User size={20} />
                <span className="text-xs font-semibold">Citizen Portal</span>
              </button>
              <button onClick={(e) => handleLogin(e, 'operator')} className="flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-200 hover:border-red-500 hover:bg-red-50 text-slate-600 hover:text-red-700 transition-all">
                <UserCog size={20} />
                <span className="text-xs font-semibold">Command Center</span>
              </button>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}