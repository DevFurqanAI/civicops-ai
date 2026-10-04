import type { Department, IncidentStatus } from '../data/civicData';
import ReportEvidence from '../components/ReportEvidence';
import AppHeader from '../components/AppHeader';
import EmptyState from '../components/EmptyState';
import { displayTime, visibleSignals } from '../utils/presentation';
import { useState, useMemo, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { getIncidents, getIncident, getDashboardSummary, addOperationalNote, getIncidentActions, updateIncidentStatus, assignIncidentDepartment, reviewResponsePlan } from '../services/api';
import type { IncidentView, DashboardSummary } from '../services/api';
import { categoryLabels, departmentLabels, statusLabels } from '../data/civicData';
import { Clock, MapPin, Bot, Filter, RefreshCw, ShieldCheck, UserCog, ServerCrash, Inbox, ArrowRight, Layers, CheckCircle2 } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

const DefaultIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;


export default function OperationsDashboard() {
  const [selectedIncident, setSelectedIncident] = useState<string | null>(null);
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [queueScope, setQueueScope] = useState<'ACTIVE' | 'ALL'>('ACTIVE');
  const [filterCategory, setFilterCategory] = useState('ALL');
  
  const [apiState, setApiState] = useState<'loading' | 'success' | 'empty' | 'error'>('loading');
  const [incidents, setIncidents] = useState<IncidentView[]>([]);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [activeData, setActiveData] = useState<IncidentView | null>(null);
  const [detailError, setDetailError] = useState('');
  const [detailRefresh, setDetailRefresh] = useState(0);
  const [note, setNote] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteMessage, setNoteMessage] = useState('');
  const [department, setDepartment] = useState<Department>('MANUAL_REVIEW');
  const [nextStatus, setNextStatus] = useState<IncidentStatus | ''>('');
  const [allowedStatuses, setAllowedStatuses] = useState<IncidentStatus[]>([]);
  const [planDraft, setPlanDraft] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState(false);
  const actionInFlight = useRef(false);
  const intelligenceTitle = useRef<HTMLHeadingElement>(null);
  async function mutate(action: 'STATUS' | 'ASSIGN' | 'APPROVE' | 'MODIFY' | 'REJECT') {
    if (!activeData || actionInFlight.current) return;
    actionInFlight.current = true; setActionBusy(true); setActionMessage(''); setActionError(false);
    const id = activeData.id;
    try {
      if (action === 'STATUS') {
        if (!nextStatus) return;
        await updateIncidentStatus(id, nextStatus, activeData.updated_at, note || undefined);
      } else if (action === 'ASSIGN') await assignIncidentDepartment(id, department, activeData.updated_at, note || undefined);
      else await reviewResponsePlan(id, action, activeData.updated_at,
        action === 'MODIFY' ? planDraft.split('\n').map(step => step.trim()).filter(Boolean) : undefined, note || undefined);
      setActionMessage(action === 'STATUS' ? 'Status updated.' : action === 'ASSIGN' ? 'Department assigned.' : `Response plan ${action.toLowerCase() === 'modify' ? 'modified; approval required' : action === 'APPROVE' ? 'approved' : 'rejected'}.`);
      try {
        const [detail, actions, rows, totals] = await Promise.all([getIncident(id), getIncidentActions(id), getIncidents(), getDashboardSummary()]);
        setActiveData(detail); setAllowedStatuses(actions.allowed_statuses); setNextStatus('');
        setDepartment(detail.department); setPlanDraft(detail.response_plan.join('\n')); setIncidents(rows); setSummary(totals);
      } catch {setActionError(true); setActionMessage('Action saved, but refreshed data is unavailable. Refresh before another action.'); setActiveData(null); setDetailError('Action was saved, but details could not reload. Retry details before another action.');}
    } catch (error) {setActionError(true); setActionMessage(error instanceof Error ? error.message : 'Action failed.');}
    finally {actionInFlight.current = false; setActionBusy(false);}
  }
  async function saveNote() {
    if (!activeData || noteBusy || !note.trim()) return;
    const identity = activeData.id;
    setNoteBusy(true); setNoteMessage('');
    try {await addOperationalNote(identity, note); setNote(''); setNoteMessage('Operational note saved.');}
    catch (error) {setNoteMessage(error instanceof Error ? error.message : 'Note could not be saved.');}
    finally {setNoteBusy(false);}
  }
  useEffect(() => {
    const controller = new AbortController();
    setApiState('loading');
    Promise.all([getIncidents(controller.signal), getDashboardSummary(controller.signal)])
      .then(([rows, totals]) => {
        if (controller.signal.aborted) return;
        setIncidents(rows); setSummary(totals); setApiState(rows.length ? 'success' : 'empty');
      }).catch(error => {if (!controller.signal.aborted) {setError(error.message); setApiState('error');}});
    return () => controller.abort();
  }, [refresh]);
  useEffect(() => {
    const controller = new AbortController();
    setActiveData(null); setDetailError(''); setNote(''); setNoteMessage(''); setActionMessage(''); setAllowedStatuses([]); setNextStatus('');
    if (selectedIncident) Promise.all([getIncident(selectedIncident, controller.signal), getIncidentActions(selectedIncident, controller.signal)])
      .then(([detail, actions]) => {if (!controller.signal.aborted) {setActiveData(detail); setDepartment(detail.department); setAllowedStatuses(actions.allowed_statuses); setPlanDraft(detail.response_plan.join('\n'));}})
      .catch(error => {if (!controller.signal.aborted) setDetailError(error.message);});
    return () => controller.abort();
  }, [selectedIncident, detailRefresh, refresh]);

  const activeIncidentId = activeData?.id;
  useEffect(() => {
    if (activeIncidentId && window.matchMedia('(max-width: 800px)').matches) {
      intelligenceTitle.current?.focus({preventScroll: true});
      intelligenceTitle.current?.scrollIntoView({block: 'start', behavior: 'auto'});
    }
  }, [activeIncidentId]);

  const filteredIncidents = useMemo(() => {
    return incidents.filter(inc => {
      const matchPriority = filterPriority === 'ALL' || inc.priority === filterPriority;
      const matchCategory = filterCategory === 'ALL' || inc.category === filterCategory;
      const matchScope = queueScope === 'ALL' || !['RESOLVED', 'REJECTED'].includes(inc.status);
      return matchPriority && matchCategory && matchScope;
    });
  }, [filterPriority, filterCategory, incidents, queueScope]);

  const markers = filteredIncidents.filter(incident => incident.mapPosition !== null);
  const busy = noteBusy || actionBusy;
  const closed = activeData && ['RESOLVED', 'REJECTED'].includes(activeData.status);
  return <div className="app-shell operations-shell">
    <AppHeader operations />
    <main id="main-content" className="operations-width">
      <div className="operations-heading"><div><span className="section-tag">Civic operations</span><h1>Command center</h1><p>Review the queue. Understand the incident. Decide the response.</p></div><button disabled={apiState === 'loading' || busy} onClick={() => setRefresh(n => n + 1)} className="button button-secondary"><RefreshCw size={16} />Refresh data</button></div>
      {apiState === 'error' ? <div role="alert" className="surface"><EmptyState icon={ServerCrash} title="The queue is unavailable"><p>{error}</p><button onClick={() => setRefresh(n => n + 1)} className="button button-primary">Try again</button></EmptyState></div> : apiState === 'loading' ? <div role="status" className="surface dashboard-loading"><span className="loading-ring" /><p>Loading incidents and summary...</p></div> : <>
        <dl className="summary-strip"><div><dt>Active incidents</dt><dd>{summary?.total_active ?? '-'}</dd></div><div className="summary-critical"><dt>Critical priority</dt><dd>{summary?.critical ?? '-'}</dd></div><div className="summary-warning"><dt>Awaiting verification</dt><dd>{summary?.awaiting_verification ?? '-'}</dd></div><div className="summary-success"><dt>Resolved</dt><dd>{summary?.resolved ?? '-'}</dd></div></dl>
        <div className="command-layout">
          <section className="surface queue-panel" aria-labelledby="queue-title">
            <div className="queue-heading"><div><h2 id="queue-title">Incident queue</h2><span className="subtle-text">{filteredIncidents.length} in this view</span></div><div className="scope-control" aria-label="Queue view"><button disabled={busy} aria-pressed={queueScope === 'ACTIVE'} onClick={() => setQueueScope('ACTIVE')}>Active</button><button disabled={busy} aria-pressed={queueScope === 'ALL'} onClick={() => setQueueScope('ALL')}>All incidents</button></div></div>
            <div className="queue-filters"><Filter size={16} /><label className="sr-only" htmlFor="filter-priority">Filter priority</label><select id="filter-priority" aria-label="Filter priority" value={filterPriority} disabled={busy} onChange={e => setFilterPriority(e.target.value)} className="field-input"><option value="ALL">All priorities</option><option value="CRITICAL">Critical</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></select><label className="sr-only" htmlFor="filter-category">Filter category</label><select id="filter-category" aria-label="Filter category" value={filterCategory} disabled={busy} onChange={e => setFilterCategory(e.target.value)} className="field-input"><option value="ALL">All categories</option>{Object.entries(categoryLabels).map(([code,label]) => <option key={code} value={code}>{label}</option>)}</select></div>
            <div className="incident-list">
              {!filteredIncidents.length ? <EmptyState icon={Inbox} title={filterPriority !== 'ALL' || filterCategory !== 'ALL' ? 'No matching incidents' : queueScope === 'ACTIVE' ? 'No active incidents' : 'Your queue is clear'}><p>{filterPriority !== 'ALL' || filterCategory !== 'ALL' ? 'Try another category or priority to see more of the queue.' : 'New incidents will appear here when reports are processed and linked.'}</p><button className="text-link" onClick={() => {setFilterPriority('ALL'); setFilterCategory('ALL'); setQueueScope('ALL');}}>View all incidents <ArrowRight size={15} /></button></EmptyState> : filteredIncidents.map(incident => <button key={incident.id} disabled={busy} aria-pressed={selectedIncident === incident.id} aria-label={`Open ${incident.displayId}`} onClick={() => setSelectedIncident(incident.id)} className="incident-row">
                <span className="incident-row-top"><span className={`priority-tag priority-${incident.priority.toLowerCase()}`}>{incident.priority}</span><span className="incident-code">{incident.displayId}</span><ArrowRight size={15} className="row-arrow" /></span>
                <h3>{incident.title}</h3><p className="queue-summary">{incident.summary || 'No summary available.'}</p>
                <span className="incident-row-facts"><span>{incident.categoryLabel}</span><span><Layers size={13} />{incident.report_count} {incident.report_count === 1 ? 'report' : 'reports'}</span></span>
                <span className="incident-row-location"><MapPin size={14} /><span>{incident.location.text}</span></span>
                <span className="incident-row-footer"><span className={`status-tag status-${incident.status.toLowerCase()}`}>{incident.statusLabel}</span><span>{incident.departmentLabel}</span></span><time dateTime={incident.updated_at} className="incident-time"><Clock size={12} />Updated {displayTime(incident.updated_at)}</time>
              </button>)}
            </div>
            <div className="situational-map"><div className="map-heading"><h3><MapPin size={16} />Situational map</h3><span>{markers.length} mapped</span></div>{markers.length ? <div className="map-canvas"><MapContainer center={markers[0].mapPosition!} zoom={12} style={{height:'100%',width:'100%'}}><TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />{markers.map(incident => <Marker key={incident.id} position={incident.mapPosition!}><Popup><strong>{incident.title}</strong><p>{incident.location.text}</p><button disabled={busy} onClick={() => setSelectedIncident(incident.id)} className="text-link">Review incident</button></Popup></Marker>)}</MapContainer></div> : <EmptyState icon={MapPin} compact title="No mapped incidents"><p>Incidents need coordinates to appear here. The queue still includes reports with a written location.</p></EmptyState>}</div>
          </section>
          <section className="surface intelligence-panel" aria-label="Incident intelligence">
            {!selectedIncident ? <EmptyState icon={Layers} title="Select an incident to review"><p>Open a queue item for its summary, supporting signals, private evidence and operational actions.</p><span className="empty-next">Queue <ArrowRight size={15} /> Review <ArrowRight size={15} /> Decide</span></EmptyState> : !activeData ? <div className="detail-loading"><p role={detailError ? 'alert' : 'status'}>{detailError || 'Loading incident intelligence...'}</p>{detailError && <button onClick={() => setDetailRefresh(n => n + 1)} className="button button-secondary">Retry details</button>}</div> : <>
              <div className="intelligence-heading"><span className="incident-code">{activeData.displayId}</span><span className={`priority-tag priority-${activeData.priority.toLowerCase()}`}>{activeData.priority} priority</span><h2 ref={intelligenceTitle} tabIndex={-1} className="intelligence-title">{activeData.title}</h2><p>{activeData.categoryLabel}<span className="inline-separator">/</span><time dateTime={activeData.updated_at}>Updated {displayTime(activeData.updated_at)}</time></p></div>
              <dl className="incident-current"><div><dt>Current status</dt><dd><span className={`status-tag status-${activeData.status.toLowerCase()}`}>{activeData.statusLabel}</span></dd></div><div><dt>Current department</dt><dd>{activeData.departmentLabel}</dd></div><div className="incident-location"><dt>Location</dt><dd><MapPin size={15} />{activeData.location.text}</dd></div></dl>
              <section className="intelligence-section ai-summary"><h3><Bot size={18} />AI summary<span className="source-label">AI-generated</span></h3><p>{activeData.aiSummary}</p></section>
              <dl className="intelligence-metrics"><div><dt>Linked reports</dt><dd>{activeData.report_count}</dd><small>Submissions in this incident</small></div><div><dt>Evidence confidence</dt><dd>{Math.round(activeData.evidence_confidence * 100)}<span>%</span><span className="metric-band">{activeData.evidence.toLowerCase()}</span></dd><small>System confidence estimate</small></div><div><dt>Spam risk</dt><dd>{Math.round(activeData.spam_risk * 100)}<span>%</span><span className={`metric-band ${activeData.spamRisk === 'HIGH' ? 'risk-high' : ''}`}>{activeData.spamRisk.toLowerCase()}</span></dd><small>Separate risk estimate</small></div></dl>
              <section className="intelligence-section"><h3><Layers size={17} />Supporting signals</h3>{visibleSignals(activeData.supporting_signals).length ? <ul className="signals-list">{visibleSignals(activeData.supporting_signals).map((signal,index) => <li key={index}><strong>{signal.label}</strong><p>{signal.detail}</p></li>)}</ul> : <p className="subtle-text">No supporting signals are available for this incident.</p>}<p className="field-help">Grouping decisions and a location-confidence score are not available in this view.</p></section>
              <section className="intelligence-section"><ReportEvidence key={activeData.incident_id} incidentId={activeData.incident_id} /></section>
              <section className="intelligence-section response-review"><div className="review-heading"><h3><ShieldCheck size={18} />Response plan</h3><span className={`approval-tag approval-${activeData.response_plan_status.toLowerCase()}`}>{activeData.response_plan_status === 'PENDING' ? 'Awaiting review' : activeData.response_plan_status === 'MODIFIED' ? 'Modified / approval needed' : activeData.response_plan_status === 'APPROVED' ? 'Human approved' : 'Rejected'}</span></div>
                <div className="review-flow"><span><Bot size={15} />AI recommendation</span><ArrowRight size={14} /><span><UserCog size={15} />Operator review</span><ArrowRight size={14} /><span><CheckCircle2 size={15} />Decision</span></div>
                {activeData.response_plan.length ? <ol className="response-steps">{activeData.response_plan.map((step,index) => <li key={index}>{step}</li>)}</ol> : <p className="subtle-text">No response plan is available. Add a proposed plan for review below.</p>}
                <fieldset disabled={busy || !!closed} className="review-editor"><label htmlFor="response-plan" className="field-label">Review or modify the plan</label><textarea id="response-plan" rows={4} value={planDraft} onChange={e => setPlanDraft(e.target.value)} className="field-input" /><p className="field-help">One step per line. Modified plans need a separate approval.</p>{planDraft !== activeData.response_plan.join('\n') && <p className="inline-warning">Save your changes before approving.</p>}<div className="review-actions"><button disabled={!planDraft.trim()} onClick={() => void mutate('MODIFY')} className="button button-secondary">Save modifications</button><button disabled={!activeData.response_plan.length || !['PENDING','MODIFIED'].includes(activeData.response_plan_status) || planDraft !== activeData.response_plan.join('\n')} onClick={() => void mutate('APPROVE')} className="button button-primary">Approve plan</button><button onClick={() => void mutate('REJECT')} className="button button-quiet">Reject</button></div></fieldset>{closed && <p className="field-help">Plan review is closed for {activeData.statusLabel.toLowerCase()} incidents.</p>}
              </section>
              <section className="intelligence-section operator-decisions"><h3><UserCog size={18} />Human decisions</h3><fieldset disabled={busy} className="operational-fields"><div className="operational-row"><label className="field-label" htmlFor="assign-department">Department</label><div><select id="assign-department" aria-label="Assign department" value={department} onChange={e => setDepartment(e.target.value as Department)} className="field-input">{Object.entries(departmentLabels).map(([code,label]) => <option key={code} value={code}>{label}</option>)}</select><button disabled={!!closed} onClick={() => void mutate('ASSIGN')} className="button button-secondary">Assign department</button></div></div><div className="operational-row"><label htmlFor="next-status" className="field-label">Next status</label><div><select id="next-status" aria-label="Update status" value={nextStatus} onChange={e => setNextStatus(e.target.value as IncidentStatus)} className="field-input"><option value="">Select next status</option>{allowedStatuses.map(code => <option key={code} value={code}>{statusLabels[code]}</option>)}</select><button disabled={!nextStatus} onClick={() => void mutate('STATUS')} className="button button-secondary">Update status</button></div></div></fieldset>{['ASSIGNED','REOPENED'].includes(activeData.status) && activeData.response_plan_status !== 'APPROVED' && <p className="inline-warning">Approve the response plan before moving to In progress.</p>}{nextStatus === 'REJECTED' && <p className="inline-warning">Add a reason in the private notes before rejecting.</p>}{actionBusy && <p role="status" className="subtle-text">Saving your decision...</p>}{actionMessage && <p role={actionError ? 'alert' : 'status'} className={`notice ${actionError ? 'notice-error' : 'notice-success'}`}>{actionMessage}</p>}
                <div className="operational-notes"><label htmlFor="operational-note" className="field-label">Private operational note</label><textarea id="operational-note" rows={3} maxLength={2000} disabled={busy} value={note} onChange={e => setNote(e.target.value)} className="field-input" placeholder="Context for the team, or a reason for your decision..." /><p className="field-help">Notes accompany decisions and are hidden from public tracking.</p><button disabled={busy || !note.trim()} onClick={saveNote} className="button button-secondary">{noteBusy ? 'Saving note...' : 'Save note'}</button>{noteMessage && <p role="status" className="subtle-text">{noteMessage}</p>}</div>
              </section>
            </>}
          </section>
        </div>
      </>}
    </main>
  </div>;
}
