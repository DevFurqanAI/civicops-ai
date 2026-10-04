import { useEffect, useRef, useState } from 'react';
import { Inbox, RefreshCw, Layers } from 'lucide-react';
import AppHeader from '../components/AppHeader';
import EmptyState from '../components/EmptyState';
import ReportEvidence from '../components/ReportEvidence';
import { getDepartmentIncidents, getDepartmentIncident, getDepartmentActions, getDepartmentHistory,
  getDepartmentUpdates, updateDepartmentStatus, addDepartmentUpdate } from '../services/api';
import type { IncidentView, TrackingDetails, WorkUpdate } from '../services/api';
import { statusLabels } from '../data/civicData';
import type { IncidentStatus } from '../data/civicData';
import { displayTime } from '../utils/presentation';

const filters: IncidentStatus[] = ['ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'RESOLVED_PENDING_VERIFICATION'];
const actionLabels: Partial<Record<IncidentStatus, string>> = {
  ACCEPTED: 'Accept Assignment', IN_PROGRESS: 'Start Work', RESOLVED_PENDING_VERIFICATION: 'Submit Completion',
};

export default function DepartmentDashboard() {
  const [rows, setRows] = useState<IncidentView[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<IncidentView | null>(null);
  const [actions, setActions] = useState<IncidentStatus[]>([]);
  const [history, setHistory] = useState<TrackingDetails['history']>([]);
  const [updates, setUpdates] = useState<WorkUpdate[]>([]);
  const [filter, setFilter] = useState('ALL');
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [message, setMessage] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    void getDepartmentIncidents(controller.signal).then(rows => {
      if (!controller.signal.aborted) {setRows(rows); setSelected(id => rows.some(row => row.id === id) ? id : null);}
    }).catch(error => {if (!controller.signal.aborted) setError(error.message);})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => {
    const controller = new AbortController();
    setDetail(null); setDetailError(''); setActions([]); setHistory([]); setUpdates([]); setNote('');
    if (selected) {
      setDetailLoading(true);
      void Promise.all([getDepartmentIncident(selected, controller.signal), getDepartmentActions(selected, controller.signal),
        getDepartmentHistory(selected, controller.signal), getDepartmentUpdates(selected, controller.signal)])
        .then(([detail, actions, history, updates]) => {
          if (!controller.signal.aborted) {setDetail(detail); setActions(actions.allowed_statuses); setHistory(history); setUpdates(updates);}
        }).catch(error => {if (!controller.signal.aborted) setDetailError(error.message);})
        .finally(() => {if (!controller.signal.aborted) setDetailLoading(false);});
    } else setDetailLoading(false);
    return () => controller.abort();
  }, [selected, refresh]);
  async function mutate(status?: IncidentStatus) {
    if (!detail || inFlight.current) return;
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      if (status) await updateDepartmentStatus(detail.id, status, detail.updated_at, note.trim() || undefined);
      else await addDepartmentUpdate(detail.id, detail.updated_at, note.trim());
      setMessage(status === 'RESOLVED_PENDING_VERIFICATION' ? 'Completion submitted for operator verification.' : status ? 'Status saved.' : 'Private work update saved.');
      setRefresh(n => n + 1);
    } catch (error) {setMessage(error instanceof Error ? error.message : 'Action failed.'); setRefresh(n => n + 1);}
    finally {inFlight.current = false; setBusy(false);}
  }
  const visible = rows.filter(row => filter === 'ALL' || row.status === filter);
  return <div className="app-shell operations-shell"><AppHeader operations /><main id="main-content" className="operations-width">
    <div className="operations-heading"><div><span className="section-tag">Department operations</span><h1>Assigned work</h1><p>Accept assignments, record progress and submit completion for operator review.</p></div><button className="button button-secondary" disabled={busy || loading || detailLoading} onClick={() => setRefresh(n => n + 1)}><RefreshCw size={16} />Refresh</button></div>
    {message && <p role="status" className="notice">{message}</p>}
    {error ? <p role="alert" className="notice notice-error">{error}</p> : loading ? <p role="status" className="surface dashboard-loading">Loading assigned incidents...</p> : <div className="command-layout">
      <section className="surface queue-panel"><div className="queue-heading"><h2>Department queue</h2><span>{visible.length} incidents</span></div>
        <div className="queue-filters"><label htmlFor="department-status" className="sr-only">Filter work status</label><select id="department-status" className="field-input" disabled={busy} value={filter} onChange={e => setFilter(e.target.value)}><option value="ALL">All assigned work</option>{filters.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></div>
        <div className="incident-list">{visible.length ? visible.map(row => <button key={row.id} className="incident-row" disabled={busy} aria-pressed={row.id === selected} onClick={() => {setSelected(row.id); setMessage('');}}>
          <span className="incident-row-top"><span className={`priority-tag priority-${row.priority.toLowerCase()}`}>{row.priority}</span><span>{row.displayId}</span></span><h3>{row.title}</h3><p>{row.summary}</p><span className="incident-row-facts">{row.categoryLabel} · {row.report_count} reports</span><p>{row.location.text}</p><span className="status-tag">{row.statusLabel}</span><time className="incident-time">Updated {displayTime(row.updated_at)}</time>
        </button>) : <EmptyState icon={Inbox} title="No assigned work in this view"><p>Released incidents for your department will appear here.</p></EmptyState>}</div>
      </section>
      <section className="surface intelligence-panel">{!detail ? <EmptyState icon={Layers} title={detailLoading ? 'Loading incident...' : selected ? 'Incident unavailable' : 'Select an assignment'}><p role={detailError ? 'alert' : 'status'}>{detailError || 'Choose an incident to view evidence and record work.'}</p></EmptyState> : <>
        <div className="intelligence-heading"><span className="incident-code">{detail.displayId}</span><h2>{detail.title}</h2><p>{detail.statusLabel} · {detail.departmentLabel}</p></div>
        <section className="intelligence-section"><h3>Incident summary</h3><p>{detail.summary}</p><p>{detail.location.text}</p><p>{detail.report_count} reports · Evidence confidence {Math.round(detail.evidence_confidence * 100)}% · Spam risk {Math.round(detail.spam_risk * 100)}%</p></section>
        <section className="intelligence-section"><ReportEvidence key={detail.id} incidentId={detail.id} /></section>
        <section className="intelligence-section"><h3>Response plan</h3><p>Human approval: {detail.response_plan_status}</p><ol className="response-steps">{detail.response_plan.map((step, index) => <li key={index}>{step}</li>)}</ol>{detail.status === 'ACCEPTED' && detail.response_plan_status !== 'APPROVED' && <p className="inline-warning">An operator must approve the response plan before work starts.</p>}</section>
        <section className="intelligence-section"><h3>Work actions</h3><label className="field-label" htmlFor="department-note">Private work update / completion note</label><textarea id="department-note" className="field-input" rows={4} maxLength={2000} disabled={busy} value={note} onChange={e => setNote(e.target.value)} /><p className="field-help">Completion requires a note. Updates are visible to your department and operators, not public tracking.</p><div className="review-actions"><button className="button button-secondary" disabled={busy || !note.trim()} onClick={() => void mutate()}>Add Work Update</button>{actions.map(status => <button key={status} className="button button-primary" disabled={busy || (status === 'RESOLVED_PENDING_VERIFICATION' && !note.trim())} onClick={() => void mutate(status)}>{actionLabels[status]}</button>)}</div>{detail.status === 'RESOLVED_PENDING_VERIFICATION' && <p className="notice">Awaiting operator verification. This incident is not yet resolved.</p>}</section>
        <section className="intelligence-section"><h3>Status history</h3>{history.length ? <ul className="signals-list">{history.map((row, index) => <li key={index}><strong>{statusLabels[row.new_status]}</strong><p>{displayTime(row.created_at)}</p></li>)}</ul> : <p>No status history recorded.</p>}</section>
        <section className="intelligence-section"><h3>Private work updates</h3>{updates.length ? <ul className="signals-list">{updates.map((row, index) => <li key={index}><time>{displayTime(row.created_at)}</time><p>{row.notes}</p></li>)}</ul> : <p>No work updates recorded.</p>}</section>
      </>}</section>
    </div>}
  </main></div>;
}
