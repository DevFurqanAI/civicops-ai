import { useState, useRef } from 'react';
import { Camera, Mic, MapPin, Send, AlertCircle, Shield, Globe, CheckCircle2, Square, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { WifiOff, AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';
const translations = {
  en: {
    title: "Report Incident",
    subtitle: "Your report helps keep the community safe.",
    whatHappened: "What happened?",
    aiSummary: "AI will summarize this",
    placeholder: "E.g., A large pipe burst on main street causing flooding...",
    category: "Category",
    addPhoto: "Add Photo",
    setLocation: "Set Location",
    locationSecured: "Location Secured",
    submit: "Submit Secure Report",
    processing: "Processing AI...",
    langLabel: "English",
    categories: ["Infrastructure (Potholes, Water)", "Sanitation (Garbage, Sewers)", "Security (Theft, Suspicious Activity)", "Emergency (Fire, Medical)", "Other"]
  },
  ur: {
    title: "واقعہ کی اطلاع دیں",
    subtitle: "آپ کی اطلاع کمیونٹی کو محفوظ رکھنے میں مدد کرتی ہے۔",
    whatHappened: "کیا ہوا؟",
    aiSummary: "AI اس کا خلاصہ کرے گا",
    placeholder: "مثال کے طور پر، مین سٹریٹ پر ایک بڑا پائپ پھٹ گیا ہے...",
    category: "زمرہ",
    addPhoto: "تصویر شامل کریں",
    setLocation: "مقام منتخب کریں",
    locationSecured: "مقام محفوظ ہو گیا",
    submit: "رپورٹ جمع کرائیں",
    processing: "AI پروسیسنگ کر رہا ہے...",
    langLabel: "اردو",
    categories: ["انفراسٹرکچر (سڑکیں، پانی)", "صفائی (کوڑا کرکٹ، سیوریج)", "سیکیورٹی (چوری، مشکوک سرگرمی)", "ہنگامی صورتحال (آگ، میڈیکل)", "دیگر"]
  },
  ru: {
    title: "Incident Report Karein",
    subtitle: "Aap ki report community ko mehfooz rakhne mein madad karti hai.",
    whatHappened: "Kya hua?",
    aiSummary: "AI iska khulasa karega",
    placeholder: "Misaal ke tor par, main street par paani ka pipe phat gaya hai...",
    category: "Category",
    addPhoto: "Tasveer Shamil Karein",
    setLocation: "Location Set Karein",
    locationSecured: "Location Secured",
    submit: "Report Jama Karein",
    processing: "AI Process kar raha hai...",
    langLabel: "Roman Urdu",
    categories: ["Infrastructure (Sarkain, Paani)", "Safai (Kachra, Gutter)", "Security (Chori, Mashkook Harkat)", "Emergency (Aag, Medical)", "Deegar"]
  }
};

type LangType = 'en' | 'ur' | 'ru';

export default function CitizenReportPage() {
  const navigate = useNavigate();
  const [lang, setLang] = useState<LangType>('en');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(translations.en.categories[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Hardware Integrations State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const t = translations[lang];

  const cycleLang = () => {
    if (lang === 'en') setLang('ur');
    else if (lang === 'ur') setLang('ru');
    else setLang('en');
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setImagePreview(URL.createObjectURL(file));
  };

  const handleGetLocation = () => {
    setIsLocating(true);
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      setIsLocating(false);
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setIsLocating(false);
      },
      (error) => {
        console.error(error);
        alert('Unable to retrieve your location. Please check browser permissions.');
        setIsLocating(false);
      }
    );
  };

  // Audio Recording Logic
  const toggleRecording = async () => {
    if (isRecording) {
      // Stop Recording
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
    } else {
      // Start Recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = () => {
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          setAudioURL(URL.createObjectURL(audioBlob));
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Error accessing microphone:", err);
        alert("Please allow microphone access to record audio.");
      }
    }
  };

  

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(false);
    
    // Task 13: Weak/No Internet Check
    if (isOffline) {
      alert("Your report is waiting to be sent. Please reconnect to the internet.");
      return;
    }

    setIsSubmitting(true);
    
    // Simulate API call with a 10% chance of failure to show the error state
    setTimeout(() => {
      setIsSubmitting(false);
      const randomFailure = Math.random() < 0.1; 
      
      if (randomFailure) {
        setSubmitError(true);
      } else {
        navigate('/track/CV-1042');
      }
    }, 1500);
  };

  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [submitError, setSubmitError] = useState(false);
  // Native Browser Offline Detection
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-4 md:p-8 flex items-center justify-center font-sans ${lang === 'ur' ? 'dir-rtl' : 'dir-ltr'}`}>
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden transition-all">
        
        <div className="bg-gradient-to-r from-red-600 to-red-700 px-6 py-8 text-white relative overflow-hidden">
          <div className="absolute top-4 right-4 z-20">
            <button onClick={cycleLang} className="flex items-center gap-1 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-full text-sm font-medium backdrop-blur-sm transition-colors">
              <Globe size={16} /> {t.langLabel}
            </button>
          </div>
          <div className="absolute top-0 right-0 opacity-10 translate-x-4 -translate-y-4">
            <AlertCircle size={120} />
          </div>
          <div className="relative z-10 mt-4" dir={lang === 'ur' ? 'rtl' : 'ltr'}>
            <div className="flex items-center gap-2 mb-2">
              <Shield size={20} className="text-red-200" />
              <span className="text-red-100 text-sm font-semibold tracking-wider uppercase">CivicOps AI</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">{t.title}</h1>
            <p className="text-red-100 mt-2 text-sm">{t.subtitle}</p>
          </div>
        </div>

{/* Task 13: Offline Warning Banner */}
{isOffline && (
  <div className="bg-amber-100 text-amber-800 p-3 text-sm font-semibold flex items-center justify-center gap-2">
    <WifiOff size={16} />
    You are offline. Please reconnect to the internet to submit your report.
  </div>
)}

        {/* Task 13: Submission Failed Error Banner */}
        {submitError && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 m-6 mb-0 flex items-start gap-3">
            <AlertTriangle className="text-red-500 mt-0.5" size={18} />
            <div>
              <h3 className="text-sm font-bold text-red-800">Submission Failed</h3>
              <p className="text-xs text-red-600 mt-1">Your report could not be submitted to the backend. Please try again.</p>
            </div>
          </div>
        )}



        <form onSubmit={handleSubmit} className="p-6 space-y-6" dir={lang === 'ur' ? 'rtl' : 'ltr'}>
          
          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700 flex items-center justify-between">
              {t.whatHappened}
              <span className="text-xs font-normal text-slate-400">{t.aiSummary}</span>
            </label>
            <div className="relative group">
              <textarea 
                rows={4}
                required={!audioURL} // Not required if they left a voice note
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className={`w-full bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none resize-none transition-all ${lang === 'ur' ? 'pl-14' : 'pr-14'}`}
                placeholder={t.placeholder}
              />
              <button 
                type="button" 
                onClick={toggleRecording}
                className={`absolute bottom-3 ${lang === 'ur' ? 'left-3' : 'right-3'} p-2.5 rounded-full transition-all duration-200 active:scale-95 shadow-sm border ${isRecording ? 'bg-red-500 text-white border-red-600 animate-pulse' : 'bg-white text-slate-400 hover:text-red-600 hover:bg-red-50 border-slate-100'}`} 
                title={isRecording ? "Stop recording" : "Record voice"}
              >
                {isRecording ? <Square size={18} fill="currentColor" /> : <Mic size={20} />}
              </button>
            </div>
            
            {/* Audio Preview Bar */}
            {audioURL && (
              <div className="flex items-center gap-3 bg-slate-100 p-2 rounded-xl mt-2 animate-in fade-in slide-in-from-top-2">
                <audio src={audioURL} controls className="h-8 flex-1" />
                <button type="button" onClick={() => setAudioURL(null)} className="p-2 text-slate-400 hover:text-red-500 bg-white rounded-lg shadow-sm border border-slate-200 transition-colors">
                  <Trash2 size={16} />
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-semibold text-slate-700">{t.category}</label>
            <div className="relative">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full appearance-none bg-slate-50 border border-slate-200 rounded-2xl p-4 text-slate-800 focus:bg-white focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all">
                {t.categories.map((cat, idx) => (
                  <option key={idx} value={cat}>{cat}</option>
                ))}
              </select>
              <div className={`absolute ${lang === 'ur' ? 'left-4' : 'right-4'} top-1/2 -translate-y-1/2 pointer-events-none text-slate-400`}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-2">
            <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageChange} />
            <button type="button" onClick={() => fileInputRef.current?.click()} className="group flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-2xl p-4 hover:border-red-500 hover:bg-red-50 text-slate-600 transition-all active:scale-95 overflow-hidden relative h-24">
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="absolute inset-0 w-full h-full object-cover opacity-80" />
              ) : (
                <><Camera size={24} className="group-hover:text-red-500 transition-colors" /><span className="text-sm font-medium">{t.addPhoto}</span></>
              )}
            </button>

            <button type="button" onClick={handleGetLocation} disabled={!!location || isLocating} className={`group flex flex-col items-center justify-center gap-2 border-2 rounded-2xl p-4 transition-all h-24 ${location ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-100 hover:border-red-500 hover:bg-red-50 text-slate-600 shadow-sm active:scale-95'}`}>
              {isLocating ? (
                <svg className="animate-spin h-6 w-6 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
              ) : location ? (
                <><CheckCircle2 size={24} className="text-emerald-500" /><span className="text-sm font-medium">{t.locationSecured}</span></>
              ) : (
                <><MapPin size={24} className="group-hover:text-red-500 transition-colors" /><span className="text-sm font-medium">{t.setLocation}</span></>
              )}
            </button>
          </div>

          <div className="pt-4">
            <button type="submit" disabled={isSubmitting} className="w-full bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold py-4 rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-red-600/30 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed">
              {isSubmitting ? (
                <><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>{t.processing}</>
              ) : (
                <>{t.submit} <Send size={20} className={lang === 'ur' ? 'rotate-180' : ''} /></>
              )}
            </button>
          </div>
          
        </form>
      </div>
    </div>
  );
}