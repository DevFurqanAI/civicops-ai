import test from 'node:test';
import assert from 'node:assert/strict';
import {createApiClient, adaptIncident, prepareSubmission, reportPayload, ApiError} from '../src/services/api.ts';
import type {IncidentResponse, CitizenReportInput} from '../src/services/api.ts';
import {scoreBand} from '../src/utils/helpers.ts';
const input: CitizenReportInput = {description: ' gutter overflow ', language: 'ru', location: {lat: 31, lng: 74}, landmark: ' school '};
const report = {public_id: 'CV-real', internal_id: 'uuid', incident_id: null, submission_id: 'key', status: 'RECEIVED', ai_status: 'PENDING', category: 'OTHER', reported_urgency: 'Medium', priority: 'MEDIUM', evidence_confidence: .2, supporting_signals: [], spam_risk: .1, idempotent_replay: false};
const incident: IncidentResponse = {incident_id: 'uuid', updated_at: '2026-10-04T12:00:00Z', incident_code: 'INC-real', category: 'SEWERAGE_DRAINAGE', title: 'Drain blocked', summary: 'Overflow', location: {latitude: 31, longitude: 74, landmark: 'School'}, priority: 'HIGH', evidence_confidence: .8, supporting_signals: [], spam_risk: .2, report_count: 2, department: 'WATER_SANITATION', status: 'REOPENED', response_plan: ['Inspect drain'], response_plan_status: 'PENDING_APPROVAL', reported_urgency: 'HIGH'};
test('submission mapping sends only supported text/location fields', () => {
  assert.deepEqual(reportPayload(input, 'key'), {submission_id: 'key', text: 'gutter overflow', language: 'roman_urdu', latitude: 31, longitude: 74, landmark_text: 'school'});
  assert.equal(reportPayload({...input, location: null, landmark: ''}, 'key').latitude, null);
});
test('UUID survives same draft retries; changed draft starts new attempt', () => {
  const first = prepareSubmission(input, null);
  assert.match(first.submissionId, /^[0-9a-f-]{36}$/);
  assert.equal(prepareSubmission(input, first), first);
  assert.notEqual(prepareSubmission({...input, description: 'different issue'}, first).submissionId, first.submissionId);
});
test('numeric evidence and spam remain separate with exact boundaries', () => {
  assert.deepEqual([0, .39, .4, .69, .7, 1].map(scoreBand), ['LOW', 'LOW', 'MEDIUM', 'MEDIUM', 'HIGH', 'HIGH']);
  const view = adaptIncident(incident);
  assert.equal(view.evidence, 'HIGH'); assert.equal(view.spamRisk, 'LOW');
  assert.equal(view.reports, 2); assert.equal(view.id, 'uuid'); assert.equal(view.displayId, 'INC-real');
  assert.equal(view.statusLabel, 'Reopened'); assert.deepEqual(view.mapPosition, [31, 74]);
  assert.equal(adaptIncident({...incident, location: {latitude: null, longitude: null, landmark: null}}).mapPosition, null);
});
test('all five requests use FastAPI paths and real response IDs; pending stays pending', async () => {
  const calls: Array<{url: string; options?: RequestInit}> = [];
  const client = createApiClient('http://backend/', async (url, options) => {
    calls.push({url: String(url), options});
    return Response.json(String(url).includes('dashboard') ? {total_active: 1, critical: 0, awaiting_verification: 1, resolved: 0} : String(url).endsWith('/incidents') ? [incident] : String(url).includes('/incidents/') ? incident : report);
  });
  const created = await client.createReport(input, 'key');
  assert.equal(created.id, 'CV-real'); assert.equal(created.incident_id, null); assert.equal(created.ai_status, 'PENDING');
  await client.getReport('CV-real'); await client.getIncidents(); await client.getIncident('uuid'); await client.getDashboardSummary();
  assert.deepEqual(calls.map(c => c.url), ['http://backend/api/reports', 'http://backend/api/reports/CV-real', 'http://backend/api/incidents', 'http://backend/api/incidents/uuid', 'http://backend/api/dashboard/summary']);
  assert.equal(calls[0].options?.method, 'POST');
  assert.equal(JSON.parse(String(calls[0].options?.body)).submission_id, 'key');
});
for (const status of [404, 409, 422, 503]) test(`HTTP ${status} remains a distinguishable error`, async () => {
  const client = createApiClient('http://backend', async () => Response.json({detail: 'private body'}, {status}));
  await assert.rejects(client.createReport(input, 'key'), error => error instanceof ApiError && error.status === status && !error.message.includes('private body'));
});
test('backend unavailable and empty list are truthful', async () => {
  await assert.rejects(createApiClient('http://backend', async () => {throw new TypeError('fetch failed');}).getIncidents(), error => error instanceof ApiError && error.status === 0);
  assert.deepEqual(await createApiClient('http://backend', async () => Response.json([])).getIncidents(), []);
});

test('retry after storage failure sends same UUID and recognizes durable replay', async () => {
  const attempt = prepareSubmission(input, null);
  const bodies: string[] = [];
  const client = createApiClient('http://backend', async (_url, options) => {
    bodies.push(String(options?.body));
    return bodies.length === 1 ? Response.json({}, {status: 503}) : Response.json({...report, submission_id: attempt.submissionId, idempotent_replay: true});
  });
  await assert.rejects(client.createReport(input, attempt.submissionId), ApiError);
  const replay = await client.createReport(input, prepareSubmission(input, attempt).submissionId);
  assert.equal(bodies[0], bodies[1]); assert.equal(replay.idempotent_replay, true); assert.equal(replay.id, 'CV-real');
});
test('English and Urdu language codes are unchanged', () => {
  assert.equal(reportPayload({...input, language: 'en'}, 'key').language, 'en');
  assert.equal(reportPayload({...input, language: 'ur'}, 'key').language, 'ur');
});

test('operator mutations send versions and feedback sends only linked report identifiers', async () => {
  const calls: Array<{url: string; body: Record<string,unknown>}> = [];
  const client = createApiClient('http://backend', async (url, options) => {
    calls.push({url: String(url), body: options?.body ? JSON.parse(String(options.body)) : {}});
    return Response.json(String(url).endsWith('/actions') ? {allowed_statuses: ['VERIFIED']} : {incident_id: 'uuid', updated_at: incident.updated_at});
  }, () => 'test-token');
  await client.updateIncidentStatus('uuid', 'VERIFIED', incident.updated_at, 'private note');
  await client.assignIncidentDepartment('uuid', 'WATER_SUPPLY', incident.updated_at);
  await client.reviewResponsePlan('uuid', 'MODIFY', incident.updated_at, ['Inspect drain']);
  await client.reviewResponsePlan('uuid', 'APPROVE', incident.updated_at);
  await client.submitFeedback('CV-real', 'uuid', 'NO');
  assert.equal(calls[0].body.expected_updated_at, incident.updated_at);
  assert.equal(calls[1].body.department, 'WATER_SUPPLY');
  assert.deepEqual(calls[2].body.response_plan, ['Inspect drain']);
  assert.equal('response_plan' in calls[3].body, false);
  assert.deepEqual(calls[4].body, {public_id: 'CV-real', incident_id: 'uuid', response: 'NO'});
  assert.ok(calls.every(call => !('actor_id' in call.body) && !('role' in call.body)));
});


test('media uses binary authenticated uploads and protected byte downloads', async () => {
  const calls: Array<{url:string; options:RequestInit}> = [];
  const client = createApiClient('https://backend.example', (async (url, options) => {
    calls.push({url:String(url), options:options!});
    return options?.method === 'POST' ? new Response(JSON.stringify({media_id:'image-id',media_type:'IMAGE'}), {status:201}) : new Response(new Blob(['image'],{type:'image/jpeg'}));
  }) as typeof fetch, () => 'test-token');
  const image = new File(['image'],'photo.png',{type:'image/png'});
  await client.uploadEvidence('CV-test',image,'upload-uuid');
  assert.equal(calls[0].options.body,image);
  assert.deepEqual(calls[0].options.headers,{Authorization:'Bearer test-token','Content-Type':'image/png'});
  assert.match(calls[0].url,/upload_id=upload-uuid&filename=photo.png/);
  assert.equal(await (await client.getEvidenceContent('CV-test','image-id')).text(),'image');
});
