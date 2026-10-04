import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Search, ClipboardCheck } from 'lucide-react';
import AppHeader from '../components/AppHeader';

export default function TrackLookupPage() {
  const [id, setId] = useState('');
  const navigate = useNavigate();
  function track(event: React.FormEvent) {
    event.preventDefault();
    if (id.trim()) navigate(`/track/${encodeURIComponent(id.trim())}`);
  }
  return <div className="app-shell"><AppHeader /><main id="main-content" className="page-width lookup-layout">
    <div className="page-intro"><span className="section-tag">Citizen services</span><h1>Follow your report.</h1><p>See its current status, recorded updates and any evidence attached to your report.</p></div>
    <section className="surface lookup-form"><Search size={28} className="accent-icon" /><h2>Enter your tracking ID</h2><p>Use the CV- ID shown after submission.</p>
      <form onSubmit={track} className="space-y-5"><label htmlFor="tracking-id" className="field-label">Report ID</label><input id="tracking-id" required value={id} onChange={e => setId(e.target.value)} autoComplete="off" placeholder="CV-..." className="field-input" /><button className="button button-primary">Track report <ArrowRight size={17} /></button></form>
    </section>
    <aside className="lookup-guidance"><ClipboardCheck size={26} /><h2>Updates from the actual incident</h2><p>Tracking shows recorded status changes. If your report is still being processed, you’ll see that state clearly.</p><p>Sign in to access your owned reports, private evidence and eligible resolution feedback.</p></aside>
  </main></div>;
}
