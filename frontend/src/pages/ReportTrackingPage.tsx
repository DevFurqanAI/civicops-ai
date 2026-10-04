import AppHeader from '../components/AppHeader';
import EmptyState from '../components/EmptyState';
import ReportEvidence from '../components/ReportEvidence';
import { useAuth } from '../auth/useAuth';
import { statusLabels } from '../data/civicData';
import { useEffect, useState, useRef } from 'react';
import { Clock, MapPin, Tag, ShieldCheck, ThumbsUp, ThumbsDown, MinusCircle, MessageSquare, ArrowLeft } from 'lucide-react';
import { useParams, Link } from 'react-router-dom';
import { getReport, getTrackingDetails, submitFeedback } from '../services/api';
import type { ReportView, TrackingDetails } from '../services/api';

export default function ReportTrackingPage() {
  const { id } = useParams();
  const auth = useAuth();
  const [report, setReport] = useState<ReportView | null>(null);
  const [tracking, setTracking] = useState<TrackingDetails | null>(null);
  const [error, setError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const feedbackInFlight = useRef(false);
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');
  async function giveFeedback(response: 'YES' | 'PARTIALLY' | 'NO') {
    if (feedbackInFlight.current || !report?.incident_id || !tracking?.can_submit_feedback) return;
    feedbackInFlight.current = true; setFeedbackBusy(true); setFeedbackMessage('');
    try {
      const result = await submitFeedback(report.public_id, report.incident_id, response);
      setTracking({...tracking, can_submit_feedback: false, feedback_response: response});
      setFeedbackMessage(result.review_requested ? 'Feedback saved and flagged for review. The incident has not been reopened.' : 'Feedback saved.');
    } catch (error) {setFeedbackMessage(error instanceof Error ? error.message : 'Feedback could not be saved.');}
    finally {feedbackInFlight.current = false; setFeedbackBusy(false);}
  }
  useEffect(() => {
    if (auth.loading) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setReport(null); setTracking(null); setLocationError('');
    async function load() {
      try {
        if (!id) throw new Error('A tracking ID is required.');
        const result = await getReport(id, controller.signal);
        if (controller.signal.aborted) return;
        setReport(result); setLoading(false);
        try {
          const detail = await getTrackingDetails(result.public_id, controller.signal);
          if (!controller.signal.aborted) setTracking(detail);
        } catch {if (!controller.signal.aborted) setLocationError('Tracking history and location are unavailable. Refresh to retry.');}
      } catch (error) {
        if (!controller.signal.aborted) {setError(error instanceof Error ? error.message : 'Unable to load report.'); setLoading(false);}
      }
    }
    void load();
    return () => controller.abort();
  }, [id, refresh, auth.loading, auth.user?.user_id]);
  const resolved = report?.status === 'RESOLVED';
  const pending = report?.ai_status !== 'PROCESSED';
  return <div className="app-shell"><AppHeader /><main id="main-content" className="page-width tracking-page">
    <Link to="/track" className="text-link"><ArrowLeft size={16} />Track another report</Link>
    <div className="page-intro"><span className="section-tag">Report tracking</span><h1>{loading ? 'Loading your report' : error ? 'Report unavailable' : resolved ? 'An update from your community.' : 'Your report, in view.'}</h1><p className="tracking-id">{report?.public_id || id}</p></div>
    {loading ? <div role="status" className="surface dashboard-loading"><span className="loading-ring" /><p>Loading current report status...</p></div> : error ? <div className="notice notice-error" role="alert">{error}</div> : report && <div className="tracking-layout">
      <section className="surface tracking-overview"><div className={`tracking-status ${resolved ? 'tracking-resolved' : ''}`}><span className="tracking-status-icon">{resolved ? <ShieldCheck size={25} /> : <Clock size={25} />}</span><div><span className="field-help">Current status</span><h2>{report.statusLabel}</h2></div></div><p>{pending ? 'Your report is stored. AI processing is pending; classification and incident linking are not confirmed.' : report.incident_id ? 'Your report is linked to an incident managed by the operations team.' : 'Your report is stored and is not linked to an incident yet.'}</p>
        <dl className="tracking-facts"><div><dt><Tag size={16} />Category</dt><dd>{pending ? 'Classification pending' : report.categoryLabel}</dd></div><div><dt><MapPin size={16} />Location</dt><dd>{tracking?.location.landmark || (tracking?.location.latitude != null && tracking.location.longitude != null ? `${tracking.location.latitude}, ${tracking.location.longitude}` : locationError || (tracking ? 'Location not provided.' : 'Loading location...'))}</dd></div>{tracking?.incident_code && <div><dt>Incident</dt><dd>{tracking.incident_code}</dd></div>}</dl>
        {auth.user && <div className="tracking-evidence"><ReportEvidence key={`${report.public_id}-${auth.user.user_id}`} publicId={report.public_id} /></div>}
        {resolved && <div className="feedback-section"><h3><MessageSquare size={18} />Was the issue resolved?</h3><p>{tracking?.feedback_response ? `Recorded feedback: ${tracking.feedback_response}` : !auth.user ? 'Sign in to give feedback on your own report.' : tracking?.can_submit_feedback ? 'Let the team know. Each linked report can submit one response.' : 'Feedback is available for your own linked report after resolution.'}</p><fieldset disabled={feedbackBusy || !tracking?.can_submit_feedback} className="feedback-options"><legend className="sr-only">Resolution feedback</legend><button onClick={() => void giveFeedback('YES')} className="button button-secondary"><ThumbsUp size={16} />Fully resolved</button><button onClick={() => void giveFeedback('PARTIALLY')} className="button button-secondary"><MinusCircle size={16} />Partially</button><button onClick={() => void giveFeedback('NO')} className="button button-secondary"><ThumbsDown size={16} />Not resolved</button></fieldset>{feedbackBusy && <p role="status">Saving feedback...</p>}{feedbackMessage && <p role="status">{feedbackMessage}</p>}</div>}
      </section>
      <section className="surface tracking-history"><h2>Recorded updates</h2><p className="subtle-text">Status changes from the linked incident.</p>{tracking?.history.length ? <ol className="tracking-timeline">{tracking.history.map((event,index) => <li key={`${event.created_at}-${index}`}><span className="timeline-marker"><Clock size={15} /></span><div><h3>{statusLabels[event.new_status]}</h3><time dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time></div></li>)}</ol> : <EmptyState icon={Clock} compact title={locationError ? 'Updates are unavailable' : tracking ? 'No updates yet' : 'Loading updates'}><p>{locationError || (tracking ? 'Your current status is shown on the left. Recorded changes will appear here when available.' : 'Retrieving recorded status changes...')}</p></EmptyState>}</section>
    </div>}
    <div className="tracking-footer"><button disabled={loading || feedbackBusy} onClick={() => setRefresh(n => n + 1)} className="button button-secondary">{error ? 'Retry loading report' : 'Refresh status'}</button><Link to="/" className="text-link">Report another issue</Link></div>
  </main></div>;
}
