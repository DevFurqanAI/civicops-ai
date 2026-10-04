import { useEffect, useRef, useState } from 'react';
import { Inbox, RefreshCw, Layers, MapPin, Search, Filter, ArrowRight, Clock, ShieldCheck, Bot, CheckCircle2, ServerCrash } from 'lucide-react';
import AppHeader from '../components/AppHeader';
import EmptyState from '../components/EmptyState';
import ReportEvidence from '../components/ReportEvidence';
import IncidentMap from '../components/IncidentMap';
import { getDepartmentIncidents, getDepartmentIncident, getDepartmentActions, getDepartmentHistory,
  getDepartmentUpdates, updateDepartmentStatus, addDepartmentUpdate } from '../services/api';
import type { IncidentView, TrackingDetails, WorkUpdate } from '../services/api';
import { categoryLabels, statusLabels } from '../data/civicData';
import type { IncidentStatus } from '../data/civicData';
import { displayTime, visibleSignals } from '../utils/presentation';
import { useAuth } from '../auth/useAuth';
import { ApiError } from '../services/api';
import { defaultDepartmentFilters, filterDepartmentIncidents, filtersForSelection, departmentSummary, departmentIdentity } from '../utils/departmentDashboard';
import type { DepartmentFilters } from '../utils/departmentDashboard';

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
  const [filtersState, setFilters] = useState<DepartmentFilters>({...defaultDepartmentFilters});
  const auth = useAuth();
  const [actionError, setActionError] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const queueLoaded = useRef(false);
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
      if (!controller.signal.aborted) {queueLoaded.current = true; setRows(rows); setSelected(id => rows.some(row => row.id === id) ? id : null);}
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
    if (!detail || inFlight.current || loading || error) return;
    inFlight.current = true; setBusy(true); setMessage(''); setActionError(false);
    try {
      if (status) await updateDepartmentStatus(detail.id, status, detail.updated_at, note.trim() || undefined);
      else await addDepartmentUpdate(detail.id, detail.updated_at, note.trim());
      setMessage(status === 'RESOLVED_PENDING_VERIFICATION' ? 'Completion submitted for operator verification.' : status ? 'Status saved.' : 'Private work update saved.');
      setRefresh(n => n + 1);
    } catch (error) {setActionError(true); setMessage(error instanceof ApiError && error.status === 409 ? 'This incident changed or the action is no longer available. The latest record is being loaded; review it before retrying.' : error instanceof Error ? error.message : 'Action failed. Please retry.'); setRefresh(n => n + 1);}
    finally {inFlight.current = false; setBusy(false);}
  }
  const visible = filterDepartmentIncidents(rows, filtersState);
  const summary = departmentSummary(rows);
  const signals = detail ? visibleSignals(detail.supporting_signals) : [];
  const hasFilters = Object.entries(filtersState).some(([key, value]) => value !== defaultDepartmentFilters[key as keyof DepartmentFilters]);
  const readOnly = detail?.status === 'RESOLVED' || detail?.status === 'RESOLVED_PENDING_VERIFICATION';
  function selectIncident(id: string) {setFilters(filters => filtersForSelection(rows, filters, id)); setSelected(id); setMessage('');}
  return <div className="app-shell operations-shell department-dashboard"><AppHeader operations /><main id="main-content" className="operations-width">
    <div className="operations-heading"><div><h1>{departmentIdentity(auth.user, rows)}</h1><p className="department-subtitle">Department Operations Portal</p><p>Review assigned work, record progress and submit completion for verification.</p></div><button className="button button-secondary" disabled={busy || loading || detailLoading} onClick={() => setRefresh(n => n + 1)}><RefreshCw size={16} />{loading ? 'Refreshing...' : 'Refresh queue'}</button></div>
    {message && <p role={actionError ? 'alert' : 'status'} className={`notice ${actionError ? 'notice-error' : 'notice-success'}`}>{!actionError && <CheckCircle2 size={17} />}{message}</p>}
    <dl className="summary-strip department-summary" aria-label="Your department's active work">{summary.map(item => <div key={item.label} className={item.status === 'RESOLVED_PENDING_VERIFICATION' ? 'summary-warning' : ''}><dt>{item.label}</dt><dd>{loading || error ? '?' : item.count}</dd></div>)}</dl>
    {error && !queueLoaded.current ? <section className="surface"><EmptyState icon={ServerCrash} title="We couldn't load your queue"><p role="alert">{error}</p><button className="button button-secondary" onClick={() => setRefresh(n => n + 1)}>Try again</button></EmptyState></section> : loading && !queueLoaded.current ? <div className="surface dashboard-loading" role="status"><RefreshCw size={22} /><h2>Loading department work</h2><p>Fetching your authorized assignments and their current status.</p></div> : <div className="command-layout department-layout">
      <div className="department-workspace">{loading && <p role="status">Refreshing assigned incidents...</p>}{error && <p role="alert" className="notice notice-error">{error} The last loaded queue is shown; refresh before taking action.</p>}
        <section className="surface department-map" aria-label="Assigned incident locations"><IncidentMap incidents={rows} selectedId={selected} onSelect={selectIncident} disabled={busy || loading || !!error} /></section>
        <section className="surface queue-panel" aria-label="Department incident queue"><div className="queue-heading"><div><h2>Assigned incidents</h2><span className="subtle-text">{visible.length} of {rows.length} incidents{hasFilters ? ' match your filters' : ' in your department'}</span></div><Filter size={18} aria-hidden="true" /></div>
          <div className="department-filters">
            <label className="department-search" htmlFor="department-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search incident ID, issue or landmark</span><input id="department-search" className="field-input" type="search" disabled={busy || loading || !!error} value={filtersState.search} onChange={e => setFilters({...filtersState, search: e.target.value})} placeholder="Search incident ID, issue or landmark" /></label>
            <label className="field-label" htmlFor="department-status">Status<select id="department-status" className="field-input" disabled={busy || loading || !!error} value={filtersState.status} onChange={e => setFilters({...filtersState, status: e.target.value as DepartmentFilters['status']})}><option value="ALL">All active</option>{filters.map(status => <option key={status} value={status}>{status === 'ASSIGNED' ? 'Assigned / new' : status === 'RESOLVED_PENDING_VERIFICATION' ? 'Pending verification' : statusLabels[status]}</option>)}</select></label>
            <label className="field-label" htmlFor="department-priority">Priority<select id="department-priority" className="field-input" disabled={busy || loading || !!error} value={filtersState.priority} onChange={e => setFilters({...filtersState, priority: e.target.value as DepartmentFilters['priority']})}><option value="ALL">All priorities</option>{['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(priority => <option key={priority} value={priority}>{priority.charAt(0) + priority.slice(1).toLowerCase()}</option>)}</select></label>
            <label className="field-label" htmlFor="department-category">Category<select id="department-category" className="field-input" disabled={busy || loading || !!error} value={filtersState.category} onChange={e => setFilters({...filtersState, category: e.target.value as DepartmentFilters['category']})}><option value="ALL">All categories</option>{Object.entries(categoryLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label>
            <div className="department-filter-footer"><span>Map shows all {rows.length} authorized incidents.</span><button className="text-link" disabled={!hasFilters || busy} onClick={() => setFilters({...defaultDepartmentFilters})}>Clear filters</button></div>
          </div>
          <div className="incident-list">{visible.length ? visible.map(row => <button key={row.id} className="incident-row" disabled={busy || loading || !!error} aria-pressed={row.id === selected} onClick={() => selectIncident(row.id)}>
            <span className="incident-row-top"><span className={`priority-tag priority-${row.priority.toLowerCase()}`}>{row.priority}</span><span className="incident-code">{row.displayId}</span><ArrowRight size={16} className="row-arrow" aria-hidden="true" /></span><h3>{row.title}</h3><p className="queue-summary">{row.summary}</p><span className="incident-row-facts"><span>{row.categoryLabel}</span><span>{row.report_count} reports</span><span>Evidence {Math.round(row.evidence_confidence * 100)}%</span></span><span className="incident-row-location"><MapPin size={14} />{row.location.text}</span><span className="incident-row-footer"><span className={`status-tag status-${row.status.toLowerCase()}`}>{row.statusLabel}</span></span><span className="incident-time"><Clock size={13} /><time>Updated {displayTime(row.updated_at)}</time></span>
          </button>) : <EmptyState icon={Inbox} title={rows.length ? 'No incidents match these filters' : 'No assigned incidents yet'}><p>{rows.length ? 'Try another status, priority or category, or clear your search.' : 'Incidents appear here once an operator verifies and releases them to your department.'}</p>{rows.length > 0 && <button className="button button-secondary" onClick={() => setFilters({...defaultDepartmentFilters})}>Clear filters</button>}</EmptyState>}</div>
        </section>
      </div>
      <section className="surface intelligence-panel department-detail" aria-label="Selected incident details">{!detail ? <EmptyState icon={Layers} title={detailLoading ? 'Loading incident details...' : selected ? 'Incident unavailable' : 'Select an assignment'}><p role={detailError ? 'alert' : 'status'}>{detailError || 'Choose an incident from the queue or map to review its evidence and next action.'}</p>{detailError && <button className="button button-secondary" onClick={() => setRefresh(n => n + 1)}>Retry details</button>}</EmptyState> : <>
        <div className="intelligence-heading"><span className="incident-code">{detail.displayId}</span><span className={`priority-tag priority-${detail.priority.toLowerCase()}`}>{detail.priority}</span><h2>{detail.title}</h2><p>{detail.categoryLabel}</p><span className={`status-tag status-${detail.status.toLowerCase()}`}>{detail.statusLabel}</span></div>
        <dl className="incident-current"><div><dt>Current department</dt><dd>{detail.departmentLabel}</dd></div><div><dt>Current status</dt><dd>{detail.statusLabel}</dd></div><div className="incident-location"><dt>Location / landmark</dt><dd><MapPin size={16} />{detail.location.text}</dd></div></dl>
        <section className="intelligence-section ai-summary"><h3><Bot size={18} />Incident summary<span className="source-label">AI intake</span></h3><p>{detail.aiSummary}</p></section>
        <dl className="intelligence-metrics"><div><dt>Reports</dt><dd>{detail.report_count}</dd></div><div><dt>Evidence confidence</dt><dd>{Math.round(detail.evidence_confidence * 100)}<span>%</span></dd><small>{detail.evidence}</small></div><div><dt>Spam risk</dt><dd>{Math.round(detail.spam_risk * 100)}<span>%</span></dd><small>{detail.spamRisk}</small></div></dl>
        <section className="intelligence-section"><h3><Layers size={18} />Supporting signals</h3>{signals.length ? <ul className="signals-list">{signals.map((signal, index) => <li key={index}><strong>{signal.label}</strong><p>{signal.detail}</p></li>)}</ul> : <p className="field-help">No supporting signals are available for this incident.</p>}</section>
        <section className="intelligence-section"><ReportEvidence key={detail.id} incidentId={detail.id} /></section>
        <section className="intelligence-section"><div className="review-heading"><h3><ShieldCheck size={18} />Response plan</h3><span className={`approval-tag approval-${detail.response_plan_status.toLowerCase()}`}>{detail.response_plan_status}</span></div><p className="field-help">AI recommendation ? operator review ? department execution</p>{detail.response_plan.length ? <ol className="response-steps">{detail.response_plan.map((step, index) => <li key={index}>{step}</li>)}</ol> : <p className="field-help">No response plan is available yet.</p>}{detail.status === 'ACCEPTED' && detail.response_plan_status !== 'APPROVED' && <p className="inline-warning">An operator must approve the response plan before work starts.</p>}</section>
        <section className="intelligence-section department-actions" aria-busy={busy}><h3>Next action</h3>{readOnly ? <div className={`notice ${detail.status === 'RESOLVED' ? 'notice-success' : ''}`}><ShieldCheck size={20} /><div><strong>{detail.status === 'RESOLVED' ? 'Resolution confirmed' : 'Submitted for Operator Verification'}</strong><p>{detail.status === 'RESOLVED' ? 'This incident is complete and read-only.' : 'Your completion is awaiting review. Final resolution is confirmed by an operator.'}</p></div></div> : <>
          <p className="field-help">{detail.status === 'ASSIGNED' ? 'Accept this assignment to begin your department?s work.' : 'Record what your team has done. Completion requires a resolution note.'}</p>
          {(detail.status !== 'ASSIGNED' || actions.includes('ACCEPTED')) && <><label className="field-label" htmlFor="department-note">Private work update / completion note</label><textarea id="department-note" className="field-input" rows={4} maxLength={2000} disabled={busy || loading || !!error} value={note} onChange={e => setNote(e.target.value)} placeholder="Work carried out, current progress or completion details..." /><p className="field-help">Visible to your department and operators. Hidden from public tracking.</p></>}
          <div className="review-actions">{actions.map(status => <button key={status} className="button button-primary" disabled={busy || loading || !!error || (status === 'RESOLVED_PENDING_VERIFICATION' && !note.trim())} onClick={() => void mutate(status)}>{busy ? 'Saving...' : actionLabels[status] || statusLabels[status]}</button>)}{['ACCEPTED', 'IN_PROGRESS'].includes(detail.status) && <button className="button button-secondary" disabled={busy || loading || !!error || !note.trim()} onClick={() => void mutate()}>Add Work Update</button>}</div>{busy && <p role="status" className="field-help">Saving your update. Please wait.</p>}
        </>}</section>
        <section className="intelligence-section"><h3><Clock size={18} />Status history</h3>{history.length ? <ol className="signals-list department-timeline">{history.map((row, index) => <li key={index}><strong>{statusLabels[row.new_status]}</strong><p><time>{displayTime(row.created_at)}</time></p></li>)}</ol> : <EmptyState icon={Clock} compact title="No status history yet"><p>Recorded lifecycle changes will appear here.</p></EmptyState>}</section>
        <section className="intelligence-section"><h3>Department work history</h3>{updates.length ? <ul className="signals-list">{updates.map((row, index) => <li key={index}><strong>{row.action === 'DEPARTMENT_WORK_UPDATE' ? 'Work update' : 'Lifecycle update'}</strong><p>{row.notes}</p><time className="incident-time">{displayTime(row.created_at)}</time></li>)}</ul> : <p className="field-help">No private work updates recorded yet.</p>}</section>
      </>}</section>
    </div>}
  </main></div>;
}
