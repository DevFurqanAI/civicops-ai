import { useState } from 'react';
import { CheckCircle, Clock, MapPin, Tag, ShieldCheck, ThumbsUp, ThumbsDown, MinusCircle, MessageSquare } from 'lucide-react';
import { useParams, Link } from 'react-router-dom';

export default function ReportTrackingPage() {
  const { id } = useParams();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Mock data - set to "Resolved" to display the feedback UI
  const report = {
    id: id || "CV-1042",
    status: "Resolved", 
    category: "Security (Theft, Suspicious Activity)",
    location: "Main Street",
    timestamp: "Just now"
  };

  const handleFeedback = (type: string) => {
    setIsSubmitting(true);
    setTimeout(() => {
      setFeedback(type);
      setIsSubmitting(false);
    }, 800);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8 flex items-center justify-center font-sans">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        
        {/* Dynamic Header based on Status */}
        <div className={`${report.status === 'Resolved' ? 'bg-indigo-600' : 'bg-emerald-500'} px-6 py-8 text-white text-center relative overflow-hidden transition-colors`}>
          {report.status === 'Resolved' ? (
            <ShieldCheck size={64} className="mx-auto mb-4 text-indigo-200" />
          ) : (
            <CheckCircle size={64} className="mx-auto mb-4 text-emerald-100" />
          )}
          <h1 className="text-2xl font-bold tracking-tight">
            {report.status === 'Resolved' ? 'Incident Resolved' : 'Report Received'}
          </h1>
          <p className={`${report.status === 'Resolved' ? 'text-indigo-200' : 'text-emerald-100'} mt-2 text-sm`}>ID: {report.id}</p>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
            <div className="flex items-center gap-3 text-slate-700">
              <Tag size={18} className="text-slate-400" />
              <span className="text-sm font-medium">{report.category}</span>
            </div>
            <div className="flex items-center gap-3 text-slate-700">
              <MapPin size={18} className="text-slate-400" />
              <span className="text-sm font-medium">{report.location}</span>
            </div>
          </div>

          {/* Status Timeline */}
          <div className="space-y-4 pt-2">
            <h3 className="text-sm font-semibold text-slate-700">Current Status</h3>
            
            <div className="relative border-l-2 border-emerald-500 ml-3 pl-6 pb-6">
              <div className="absolute -left-[11px] top-0 bg-emerald-500 rounded-full p-1"><CheckCircle size={14} className="text-white" /></div>
              <p className="text-sm font-bold text-slate-800">Received & Analyzed</p>
              <p className="text-xs text-slate-500 mt-1">AI processed your report details.</p>
            </div>

            <div className="relative border-l-2 border-emerald-500 ml-3 pl-6 pb-6">
              <div className="absolute -left-[11px] top-0 bg-emerald-500 rounded-full p-1"><Clock size={14} className="text-white" /></div>
              <p className="text-sm font-bold text-slate-800">Under Review</p>
              <p className="text-xs text-slate-500 mt-1">Operator verified the incident.</p>
            </div>

            <div className="relative ml-3 pl-6">
              <div className="absolute -left-[11px] top-0 bg-indigo-500 rounded-full p-1"><ShieldCheck size={14} className="text-white" /></div>
              <p className="text-sm font-bold text-indigo-700">Resolved</p>
              <p className="text-xs text-slate-500 mt-1">Authorities have cleared this incident.</p>
            </div>
          </div>

          {/* Resolution Feedback UI (Only shows if Resolved) */}
          {report.status === 'Resolved' && (
            <div className="mt-6 border-t border-slate-100 pt-6">
              {feedback ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 text-center animate-in fade-in zoom-in duration-300">
                  <CheckCircle size={32} className="mx-auto text-emerald-500 mb-2" />
                  <h4 className="font-bold text-emerald-800">Feedback Submitted</h4>
                  <p className="text-xs text-emerald-600 mt-1">Thank you for helping us keep CivicOps AI accurate and reliable.</p>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 relative overflow-hidden">
                  {isSubmitting && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex items-center justify-center">
                      <svg className="animate-spin h-6 w-6 text-indigo-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    </div>
                  )}
                  <h4 className="font-bold text-slate-800 flex items-center gap-2 mb-4">
                    <MessageSquare size={18} className="text-indigo-500" /> Verification Required
                  </h4>
                  <p className="text-sm text-slate-600 mb-4">Are you satisfied that this issue has been completely resolved by the assigned department?</p>
                  
                  <div className="grid grid-cols-1 gap-2">
                    <button onClick={() => handleFeedback('yes')} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white hover:border-emerald-500 hover:bg-emerald-50 text-slate-700 transition-colors group">
                      <span className="text-sm font-semibold">Yes, fully resolved</span>
                      <ThumbsUp size={16} className="text-slate-400 group-hover:text-emerald-500" />
                    </button>
                    <button onClick={() => handleFeedback('partial')} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white hover:border-amber-500 hover:bg-amber-50 text-slate-700 transition-colors group">
                      <span className="text-sm font-semibold">Partially resolved</span>
                      <MinusCircle size={16} className="text-slate-400 group-hover:text-amber-500" />
                    </button>
                    <button onClick={() => handleFeedback('no')} className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white hover:border-red-500 hover:bg-red-50 text-slate-700 transition-colors group">
                      <span className="text-sm font-semibold">No, not resolved</span>
                      <ThumbsDown size={16} className="text-slate-400 group-hover:text-red-500" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="pt-2">
            <Link to="/" className="block w-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-center font-bold py-4 rounded-2xl transition-colors">
              Return to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}