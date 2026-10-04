import { getAccessToken } from './session.ts';
import type { TrustedUser } from './session.ts';
import { categoryLabels, departmentLabels, statusLabels } from '../data/civicData.ts';
import type { Category, Department, IncidentStatus, Priority } from '../data/civicData.ts';
import { scoreBand } from '../utils/helpers.ts';

export interface ReportResponse {
  public_id: string; internal_id: string; incident_id: string | null; submission_id: string;
  status: IncidentStatus; ai_status: string; category: Category; reported_urgency: string;
  priority: Priority; evidence_confidence: number; supporting_signals: Array<{signal: string; detail: string; impact: string}>;
  spam_risk: number; idempotent_replay: boolean;
}
export interface IncidentResponse {
  incident_id: string; incident_code: string; updated_at: string; category: Category; title: string; summary: string;
  location: {latitude: number | null; longitude: number | null; landmark: string | null};
  priority: Priority; evidence_confidence: number; supporting_signals: Array<Record<string, unknown>>;
  spam_risk: number; report_count: number; department: Department; status: IncidentStatus;
  response_plan: string[]; response_plan_status: string; reported_urgency: string;
}
export interface DashboardSummary {total_active: number; critical: number; awaiting_verification: number; resolved: number}
export interface CitizenReportInput {
  description: string; language: 'en' | 'ur' | 'ru';
  location: {lat: number; lng: number} | null; landmark: string;
}
export function reportPayload(input: CitizenReportInput, submissionId: string) {
  return {submission_id: submissionId, text: input.description.trim(),
    language: input.language === 'ru' ? 'roman_urdu' : input.language,
    latitude: input.location?.lat ?? null, longitude: input.location?.lng ?? null,
    landmark_text: input.landmark.trim() || null};
}
export interface SubmissionAttempt {signature: string; submissionId: string}
export function prepareSubmission(input: CitizenReportInput, previous: SubmissionAttempt | null): SubmissionAttempt {
  const signature = JSON.stringify(reportPayload(input, ''));
  return previous?.signature === signature ? previous : {signature, submissionId: crypto.randomUUID()};
}
export function adaptReport(report: ReportResponse) {
  return {...report, id: report.public_id, categoryLabel: categoryLabels[report.category], statusLabel: statusLabels[report.status]};
}
export type ReportView = ReturnType<typeof adaptReport>;
export function adaptIncident(incident: IncidentResponse) {
  const {latitude: lat, longitude: lng, landmark} = incident.location;
  const mapPosition: [number, number] | null = typeof lat === 'number' && Number.isFinite(lat) && Math.abs(lat) <= 90
    && typeof lng === 'number' && Number.isFinite(lng) && Math.abs(lng) <= 180 ? [lat, lng] : null;
  return {...incident, id: incident.incident_id, displayId: incident.incident_code,
    categoryLabel: categoryLabels[incident.category], statusLabel: statusLabels[incident.status],
    location: {lat, lng, text: landmark || (mapPosition ? `${lat}, ${lng}` : 'Location not provided')}, mapPosition,
    evidence: scoreBand(incident.evidence_confidence), spamRisk: scoreBand(incident.spam_risk),
    reports: incident.report_count, aiSummary: incident.summary || 'No summary available.',
    suggestedDept: incident.department, departmentLabel: departmentLabels[incident.department]};
}
export type IncidentView = ReturnType<typeof adaptIncident>;
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {super(message); this.name = 'ApiError'; this.status = status;}
}
export function createApiClient(baseUrl: string, fetcher: typeof fetch = fetch, tokenProvider: () => string | null = getAccessToken) {
  async function request<T>(path: string, signal?: AbortSignal, body?: unknown, blobResult = false): Promise<T> {
    const timeout = AbortSignal.timeout(120_000);
    try {
      const token = tokenProvider();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const binary = body instanceof Blob;
      if (body !== undefined) headers['Content-Type'] = binary ? body.type : 'application/json';
      const response = await fetcher(`${baseUrl.replace(/\/$/, '')}/api${path}`, {
        method: body === undefined ? 'GET' : 'POST', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        headers, ...(body === undefined ? {} : {body: binary ? body : JSON.stringify(body)}),
      });
      if (!response.ok) {
        const messages: Record<number, string> = {
          400: 'The backend rejected this request.', 401: 'Sign in again to continue.', 403: 'You do not have permission for this action.', 404: 'No record found for this ID.',
          409: path === '/reports' ? 'This submission ID conflicts with another report. Check your draft before starting a new submission.' : 'This action conflicts with the current record. Refresh before retrying.',
          422: path === '/reports' ? 'Check your report text (at least 3 characters), language and valid coordinates.' : 'Check the action, status, plan and notes before retrying.',
          413: 'Evidence exceeds the permitted size (images 10 MiB; audio 15 MiB).',
          415: 'Unsupported or invalid evidence. Use JPEG/PNG/WebP or supported audio up to five minutes.',
          429: 'The service is busy. Wait a few seconds and retry the same upload.',
          501: 'This action is awaiting database transaction setup.',
          503: path === '/reports' && body !== undefined ? 'The backend could not complete submission. Retry the same draft; it may already be stored.' : 'Backend storage is unavailable. Please retry.',
        };
        throw new ApiError(response.status, messages[response.status] || `Backend request failed (${response.status}). Please retry.`);
      }
      return (blobResult ? await response.blob() : await response.json()) as T;
    } catch (error) {
      if (error instanceof ApiError || signal?.aborted) throw error;
      throw new ApiError(0, timeout.aborted ? (path === '/reports' && body !== undefined ? 'The request timed out. Retry the same draft.' : 'The request timed out. Refresh to check the current record before retrying.') : 'Cannot reach the backend. Check your connection and retry.');
    }
  }
  return {
    getDepartmentIncidents: async (signal?: AbortSignal) => (await request<IncidentResponse[]>('/department/incidents', signal)).map(adaptIncident),
    getDepartmentIncident: async (id: string, signal?: AbortSignal) => adaptIncident(await request<IncidentResponse>(`/department/incidents/${encodeURIComponent(id)}`, signal)),
    getDepartmentActions: (id: string, signal?: AbortSignal) => request<{allowed_statuses: IncidentStatus[]}>(`/department/incidents/${encodeURIComponent(id)}/actions`, signal),
    getDepartmentHistory: (id: string, signal?: AbortSignal) => request<TrackingDetails['history']>(`/department/incidents/${encodeURIComponent(id)}/history`, signal),
    getDepartmentUpdates: (id: string, signal?: AbortSignal) => request<WorkUpdate[]>(`/department/incidents/${encodeURIComponent(id)}/updates`, signal),
    getWorkHistory: (id: string, signal?: AbortSignal) => request<WorkUpdate[]>(`/incidents/${encodeURIComponent(id)}/work-history`, signal),
    updateDepartmentStatus: (id: string, status: IncidentStatus, version: string, notes?: string) => request<OperationResult>(`/department/incidents/${encodeURIComponent(id)}/status`, undefined, {status, expected_updated_at: version, notes}),
    addDepartmentUpdate: (id: string, version: string, notes: string) => request<OperationResult>(`/department/incidents/${encodeURIComponent(id)}/updates`, undefined, {expected_updated_at: version, notes}),
    uploadEvidence: (publicId: string, file: File, uploadId: string) => request<EvidenceItem>(`/reports/${encodeURIComponent(publicId)}/media?upload_id=${encodeURIComponent(uploadId)}&filename=${encodeURIComponent(file.name)}`, undefined, file),
    getEvidence: (publicId: string, signal?: AbortSignal) => request<EvidenceItem[]>(`/reports/${encodeURIComponent(publicId)}/media`, signal),
    getIncidentEvidence: (id: string, signal?: AbortSignal) => request<Array<EvidenceItem & {public_id: string}>>(`/incidents/${encodeURIComponent(id)}/media`, signal),
    getEvidenceContent: (publicId: string, mediaId: string, signal?: AbortSignal) => request<Blob>(`/reports/${encodeURIComponent(publicId)}/media/${encodeURIComponent(mediaId)}`, signal, undefined, true),
    getIncidentActions: (id: string, signal?: AbortSignal) => request<{allowed_statuses: IncidentStatus[]}>(`/incidents/${encodeURIComponent(id)}/actions`, signal),
    updateIncidentStatus: (id: string, status: IncidentStatus, version: string, notes?: string) => request<OperationResult>(`/incidents/${encodeURIComponent(id)}/status`, undefined, {status, expected_updated_at: version, notes}),
    assignIncidentDepartment: (id: string, department: Department, version: string, notes?: string) => request<OperationResult>(`/incidents/${encodeURIComponent(id)}/assign`, undefined, {department, expected_updated_at: version, notes}),
    reviewResponsePlan: (id: string, action: 'APPROVE' | 'MODIFY' | 'REJECT', version: string, response_plan?: string[], notes?: string) => request<OperationResult>(`/incidents/${encodeURIComponent(id)}/response-plan`, undefined, {action, expected_updated_at: version, response_plan, notes}),
    submitFeedback: (public_id: string, incident_id: string, response: 'YES' | 'PARTIALLY' | 'NO') => request<{feedback_id: string; response: string; review_requested: boolean}>('/feedback', undefined, {public_id, incident_id, response}),
    addOperationalNote: (id: string, notes: string) => request<{status: string; created_at: string}>(`/incidents/${encodeURIComponent(id)}/notes`, undefined, {notes}),
    getCurrentUser: (signal?: AbortSignal) => request<TrustedUser>('/auth/me', signal),
    getTrackingDetails: (id: string, signal?: AbortSignal) => request<TrackingDetails>(`/reports/${encodeURIComponent(id)}/tracking`, signal),
    createReport: async (input: CitizenReportInput, submissionId: string, signal?: AbortSignal) => adaptReport(await request<ReportResponse>('/reports', signal, reportPayload(input, submissionId))),
    getReport: async (id: string, signal?: AbortSignal) => adaptReport(await request<ReportResponse>(`/reports/${encodeURIComponent(id)}`, signal)),
    getIncidents: async (signal?: AbortSignal) => (await request<IncidentResponse[]>('/incidents', signal)).map(adaptIncident),
    getIncident: async (id: string, signal?: AbortSignal) => adaptIncident(await request<IncidentResponse>(`/incidents/${encodeURIComponent(id)}`, signal)),
    getDashboardSummary: (signal?: AbortSignal) => request<DashboardSummary>('/dashboard/summary', signal),
  };
}
export const {createReport, getReport, getIncidents, getIncident, getDashboardSummary, getCurrentUser, getTrackingDetails, addOperationalNote, getIncidentActions, updateIncidentStatus, assignIncidentDepartment, reviewResponsePlan, submitFeedback, uploadEvidence, getEvidence, getEvidenceContent, getIncidentEvidence, getDepartmentIncidents, getDepartmentIncident, getDepartmentActions, getDepartmentHistory, getDepartmentUpdates, getWorkHistory, updateDepartmentStatus, addDepartmentUpdate} = createApiClient(import.meta.env?.VITE_API_URL || 'http://127.0.0.1:8000');

export interface EvidenceItem {media_id: string; media_type: 'IMAGE' | 'AUDIO'; mime_type: string; created_at: string; size_bytes: number}

export interface TrackingDetails {
  public_id: string; incident_code: string | null;
  location: {latitude: number | null; longitude: number | null; landmark: string | null};
  history: Array<{old_status: IncidentStatus | null; new_status: IncidentStatus; created_at: string}>;
  can_submit_feedback: boolean; feedback_response: 'YES' | 'PARTIALLY' | 'NO' | null;
}

export interface OperationResult {incident_id: string; updated_at: string}
export interface WorkUpdate {notes: string; created_at: string; action: string}
