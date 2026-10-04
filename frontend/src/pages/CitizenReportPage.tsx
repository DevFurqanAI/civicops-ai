import AppHeader from '../components/AppHeader';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth/useAuth';
import { useState, useRef } from 'react';
import { Camera, Mic, MapPin, Send, CheckCircle2, Square, Trash2, ArrowRight, FileText, Layers, UserCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { WifiOff, AlertTriangle } from 'lucide-react';
import { useEffect } from 'react';
import { ApiError, createReport, prepareSubmission, uploadEvidence } from '../services/api';
import type { SubmissionAttempt } from '../services/api';
const translations = {
  en: {
    title: "Report an issue",
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
  }
};

type LangType = 'en' | 'ur' | 'ru';

export default function CitizenReportPage() {
  const navigate = useNavigate();
  const auth = useAuth();
  const [lang, setLang] = useState<LangType>('en');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [landmark, setLandmark] = useState('');
  const attempt = useRef<SubmissionAttempt | null>(null);
  const inFlight = useRef(false);
  const [conflict, setConflict] = useState(false);
  
  // Hardware Integrations State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const imageUploadId = useRef('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const audioUploadId = useRef('');
  const [storedPublicId, setStoredPublicId] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  useEffect(() => () => {if (imagePreview) URL.revokeObjectURL(imagePreview);}, [imagePreview]);
  useEffect(() => () => {if (audioURL) URL.revokeObjectURL(audioURL);}, [audioURL]);
  useEffect(() => () => {
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    const recorder = mediaRecorderRef.current;
    if (recorder) {recorder.onstop = null; if (recorder.state !== 'inactive') recorder.stop(); recorder.stream.getTracks().forEach(track => track.stop());}
  }, []);
  const t = translations[lang];

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (inFlight.current) return;
    const file = e.target.files?.[0];
    if (file) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {setSubmitError('Use JPEG, PNG or WebP up to 10 MiB.'); return;}
      setImageFile(file); imageUploadId.current = crypto.randomUUID(); setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleGetLocation = () => {
    setIsLocating(true);
    if (!navigator.geolocation) {
      setSubmitError('GPS is unavailable in this browser. You can enter an area, street or landmark and submit without GPS.');
      setIsLocating(false);
      return;
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setIsLocating(false);
      },
      () => {
        setSubmitError('GPS could not be retrieved. You can enter an area, street or landmark and submit without GPS.');
        setIsLocating(false);
      }
    );
  };

  // Audio Recording Logic
  const toggleRecording = async () => {
    if (inFlight.current) return;
    if (isRecording) {
      // Stop Recording
      mediaRecorderRef.current?.stop();
      mediaRecorderRef.current?.stream.getTracks().forEach(track => track.stop());
    } else {
      // Start Recording
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mimeType = ['audio/webm;codecs=opus', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
        if (!mimeType) {stream.getTracks().forEach(track => track.stop()); throw new Error('Recording format unsupported');}
        const mediaRecorder = new MediaRecorder(stream, {mimeType});
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        mediaRecorder.onstop = () => {
          if (recordingTimer.current) clearTimeout(recordingTimer.current);
          setIsRecording(false);
          stream.getTracks().forEach(track => track.stop());
          const mime = mediaRecorder.mimeType.split(';')[0];
          const audioBlob = new Blob(audioChunksRef.current, { type: mime });
          setAudioFile(new File([audioBlob], mime === 'audio/mp4' ? 'voice.m4a' : 'voice.webm', {type: mime}));
          audioUploadId.current = crypto.randomUUID();
          setAudioURL(URL.createObjectURL(audioBlob));
        };

        mediaRecorder.start();
        recordingTimer.current = setTimeout(() => {if (mediaRecorder.state !== 'inactive') mediaRecorder.stop();}, 300_000);
        setIsRecording(true);
      } catch (err) {
        console.error("Error accessing microphone:", err);
        alert("Please allow microphone access to record audio.");
      }
    }
  };

  

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current || auth.loading) return;
    setSubmitError(null);
    setConflict(false);
    if (isOffline) {
      setSubmitError('You are offline. Reconnect before submitting. This draft is not queued.');
      return;
    }
    inFlight.current = true;
    setIsSubmitting(true);
    let reportCreated = false;
    try {
      const input = {description, language: lang, location, landmark};
      attempt.current = prepareSubmission(input, attempt.current);
      const report = await createReport(input, attempt.current.submissionId);
      reportCreated = true;
      setStoredPublicId(report.public_id);
      if (auth.user) {
        if (imageFile) await uploadEvidence(report.public_id, imageFile, imageUploadId.current);
        if (audioFile) await uploadEvidence(report.public_id, audioFile, audioUploadId.current);
      }
      navigate(`/track/${encodeURIComponent(report.public_id)}`, {state: {report}});
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Submission failed. Please retry.');
      setConflict(!reportCreated && error instanceof ApiError && error.status === 409);
    } finally {
      inFlight.current = false;
      setIsSubmitting(false);
    }
  };

  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [submitError, setSubmitError] = useState<string | null>(null);
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

  return <div className="app-shell">
    <AppHeader />
    <main id="main-content" className="page-width citizen-layout">
      <div className="page-intro citizen-intro"><span className="section-tag">Citizen services</span><h1>A better place starts<br className="hidden md:block" /> with a report.</h1><p>Tell us what needs attention. CivicOps helps organize the issue for the people who can respond.</p></div>
      <section className="surface report-form-panel" aria-labelledby="report-heading">
        <div className="report-form-heading"><div><h2 id="report-heading">{t.title}</h2><p>{auth.user ? 'Reporting from your citizen account' : 'No account needed for a text report'}</p></div>
          <div className="language-control"><label htmlFor="report-language" className="sr-only">Report language</label><select id="report-language" value={lang} disabled={isSubmitting} onChange={e => setLang(e.target.value as LangType)}><option value="en">English</option><option value="ur">Urdu / اردو</option><option value="ru">Roman Urdu</option></select></div>
        </div>
        {isOffline && <div role="status" className="notice notice-warning"><WifiOff size={18} /><span>You are offline. Reconnect to submit; this draft is not queued.</span></div>}
        {submitError && <div role="alert" className="notice notice-error"><AlertTriangle size={18} /><div><strong>Submission needs attention</strong><p>{submitError}</p>{storedPublicId && <p>Text report saved: <Link to={`/track/${encodeURIComponent(storedPublicId)}`}>{storedPublicId}</Link>. Retry the unchanged draft to finish evidence upload.</p>}{conflict && <button type="button" className="text-link" onClick={() => {attempt.current = null; setConflict(false); setSubmitError(null);}}>Start a new submission for this draft</button>}</div></div>}
        <form onSubmit={handleSubmit} className="report-form" dir={lang === 'ur' ? 'rtl' : 'ltr'} lang={lang === 'ur' ? 'ur' : lang === 'ru' ? 'ur-Latn' : 'en'}>
          <div className="form-section"><label htmlFor="report-description" className="field-label"><span className="step-number">1</span>{t.whatHappened}</label><p id="description-help" className="field-help">Describe the issue in your own words. AI identifies its category.</p>
            <textarea id="report-description" rows={5} required minLength={3} disabled={isSubmitting} aria-describedby="description-help" aria-label={t.whatHappened} value={description} onChange={e => setDescription(e.target.value)} className="field-input report-description" placeholder={t.placeholder} />
          </div>
          <div className="form-section"><label htmlFor="landmark" className="field-label"><span className="step-number">2</span>Location or landmark <span className="optional-label">Optional</span></label><input id="landmark" value={landmark} disabled={isSubmitting} onChange={e => setLandmark(e.target.value)} aria-describedby="location-help" placeholder="Enter an area, street or landmark" className="field-input" />
            <p id="location-help" className="field-help">Enter an area, street or landmark. GPS permission is optional; your written location is saved independently.</p>{landmark.trim() && <p className="location-confirmation"><CheckCircle2 size={15} />Written location included</p>}<div className="location-action"><button type="button" onClick={handleGetLocation} disabled={isSubmitting || !!location || isLocating} className="button button-secondary"><MapPin size={17} />{isLocating ? 'Finding location...' : location ? t.locationSecured : 'Use my current location (optional)'}</button>{location && <span className="location-confirmation"><CheckCircle2 size={15} />Coordinates attached</span>}</div>
          </div>
          <div className="form-section"><div className="field-label"><span className="step-number">3</span>Photo or voice evidence <span className="optional-label">Optional</span></div>
            <p className="field-help">{auth.user ? 'Private evidence is available to you and authorized operators.' : 'Sign in before reporting to save private evidence. Anonymous text-only reporting is always available.'}</p>
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={isSubmitting} className="hidden" ref={fileInputRef} onChange={handleImageChange} />
            <div className="evidence-actions"><button type="button" disabled={isSubmitting} onClick={() => fileInputRef.current?.click()} className="button button-secondary"><Camera size={18} />{imagePreview ? 'Change photo' : t.addPhoto}</button><button type="button" onClick={toggleRecording} disabled={isSubmitting} aria-pressed={isRecording} className={`button ${isRecording ? 'button-warning' : 'button-secondary'}`}><>{isRecording ? <Square size={17} /> : <Mic size={18} />}{isRecording ? 'Stop recording' : 'Record voice'}</></button>
              {auth.user && <label className="button button-secondary file-button">Choose audio<input type="file" aria-label="Upload voice evidence" accept="audio/webm,audio/mp4,audio/mpeg,audio/wav,.m4a" disabled={isSubmitting || isRecording} onChange={e => {const file = e.target.files?.[0]; if (file) {if (file.size > 15 * 1024 * 1024) {setSubmitError('Audio must be at most 15 MiB.'); return;} setAudioFile(file); audioUploadId.current = crypto.randomUUID(); setAudioURL(URL.createObjectURL(file));}}} /></label>}
            </div>
            {!auth.user && (imagePreview || audioURL) && <p className="field-help">Local preview only. It will not be uploaded with an anonymous report.</p>}
            {imagePreview && <div className="image-preview"><img src={imagePreview} alt="Selected report evidence preview" /></div>}
            {audioURL && <div className="audio-preview"><audio src={audioURL} controls /><button type="button" disabled={isSubmitting} onClick={() => {setAudioURL(null); setAudioFile(null);}} className="icon-button" aria-label="Remove voice evidence"><Trash2 size={18} /></button></div>}
            <p className="field-help evidence-limits">JPEG, PNG or WebP up to 10 MiB. Voice up to 15 MiB and five minutes. A text description is required.</p>
          </div>
          <div className="report-submit"><button type="submit" disabled={isSubmitting || isOffline || isRecording || auth.loading} className="button button-primary submit-button">{isSubmitting ? 'Submitting report...' : t.submit}{isSubmitting ? <span className="loading-ring" /> : <Send size={18} />}</button><p>You will receive a tracking ID after your report is saved.</p></div>
        </form>
      </section>
      <aside className="citizen-guidance"><div className="guidance-title"><span className="guidance-line" /><h2>From your street<br />to the right team.</h2></div><p>One clear description helps the operations team understand what needs attention.</p>
        <ol className="process-list"><li><FileText size={21} /><div><h3>Your report is saved</h3><p>Text and location become a trackable report. Private evidence is optional.</p></div></li><li><Layers size={21} /><div><h3>AI organizes the issue</h3><p>AI suggests a category and related reports may be grouped into one incident.</p></div></li><li><UserCheck size={21} /><div><h3>People review the response</h3><p>Operators manage assignments, review response plans and record status updates.</p></div></li></ol>
        <div className="guidance-account"><h3>{auth.user ? 'Your report, connected to you.' : 'Report without an account.'}</h3><p>{auth.user ? 'Your account keeps access to private evidence and eligible resolution feedback.' : 'Anonymous text reporting is available. Sign in for private evidence and feedback on your owned reports.'}</p>{!auth.user && <Link to="/login" className="text-link">Sign in or create an account <ArrowRight size={16} /></Link>}</div>
        <Link to="/track" className="guidance-tracking">Already reported an issue?<span>Track your report <ArrowRight size={17} /></span></Link>
      </aside>
    </main>
    <footer className="page-width app-footer"><span>CivicOps AI</span><span>Clear reports. Considered responses.</span></footer>
  </div>;
}
