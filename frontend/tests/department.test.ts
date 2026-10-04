import test from 'node:test';
import assert from 'node:assert/strict';
import { operatorAccess, departmentAccess, loginDestination, createSessionController } from '../src/services/session.ts';
import type { AuthState, TrustedUser } from '../src/services/session.ts';
import { createApiClient, adaptIncident, ApiError } from '../src/services/api.ts';
import type { IncidentResponse } from '../src/services/api.ts';

const department: TrustedUser = {user_id: 'department-user', role: 'DEPARTMENT', department_id: 'trusted-department'};
const state: AuthState = {user: department, loading: false, error: ''};
const incident: IncidentResponse = {incident_id: 'uuid', incident_code: 'INC-real', updated_at: '2026-10-04T12:00:00Z',
  category: 'WATER_SUPPLY', title: 'Leak', summary: 'Water leak', location: {latitude: null, longitude: null, landmark: 'School gate'},
  priority: 'HIGH', evidence_confidence: .8, supporting_signals: [], spam_risk: .1, report_count: 2, department: 'WATER_SUPPLY',
  status: 'RESOLVED_PENDING_VERIFICATION', response_plan: ['Inspect leak'], response_plan_status: 'APPROVED', reported_urgency: 'HIGH'};

test('department route allows only verified department membership and operator route denies departments', () => {
  assert.equal(departmentAccess(state), 'allowed');
  assert.equal(operatorAccess(state), 'denied');
  assert.equal(departmentAccess({...state, loading: true}), 'loading');
  assert.equal(departmentAccess({...state, user: null}), 'login');
  assert.equal(departmentAccess({...state, user: {...department, department_id: null}}), 'denied');
  for (const role of ['CITIZEN', 'OPERATOR', 'ADMIN'] as const) {
    assert.equal(departmentAccess({...state, user: {user_id: 'user', role}}), 'denied');
  }
  assert.equal(loginDestination('DEPARTMENT', '/operator/dashboard'), '/department/dashboard');
  assert.equal(loginDestination('CITIZEN', '/department/dashboard'), '/');
  assert.equal(loginDestination('DEPARTMENT', '//untrusted.invalid'), '/department/dashboard');
});

test('department session restoration validates membership and remains isolated from operators', async () => {
  const controller = createSessionController({restore: async () => 'token', subscribe: () => () => {},
    signIn: async () => 'token', signOut: async () => {}, loadUser: async () => department});
  const stop = controller.start();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(departmentAccess(controller.getSnapshot()), 'allowed');
  assert.equal(operatorAccess(controller.getSnapshot()), 'denied');
  await controller.logout();
  assert.equal(departmentAccess(controller.getSnapshot()), 'login'); stop();
  const invalid = createSessionController({restore: async () => 'token', subscribe: () => () => {},
    signIn: async () => 'token', signOut: async () => {}, loadUser: async () => ({...department, department_id: null})});
  const stopInvalid = invalid.start(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(invalid.getSnapshot().user, null); stopInvalid();
});

test('department requests use FastAPI, bearer identity and version without supplying department or role', async () => {
  const calls: Array<{url: string; body: unknown}> = [];
  const client = createApiClient('http://backend', async (url, init) => {
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer department-token');
    calls.push({url: String(url), body: init?.body ? JSON.parse(String(init.body)) : null});
    return Response.json(String(url).endsWith('/status') || init?.method === 'POST' ? {incident_id: 'uuid', updated_at: 'new'}
      : String(url).endsWith('/incidents') ? [incident] : String(url).endsWith('/actions') ? {allowed_statuses: []}
      : String(url).endsWith('/history') || String(url).endsWith('/updates') ? [] : incident);
  }, () => 'department-token');
  assert.equal((await client.getDepartmentIncidents())[0].statusLabel, 'Awaiting resolution verification');
  await client.getDepartmentIncident('uuid'); await client.getDepartmentActions('uuid');
  await client.getDepartmentHistory('uuid'); await client.getDepartmentUpdates('uuid');
  await client.updateDepartmentStatus('uuid', 'ACCEPTED', 'version');
  await client.addDepartmentUpdate('uuid', 'version', 'Crew arrived');
  assert.ok(calls.every(call => call.url.startsWith('http://backend/api/department/incidents')));
  assert.deepEqual(calls.at(-2)?.body, {status: 'ACCEPTED', expected_updated_at: 'version'});
  assert.deepEqual(calls.at(-1)?.body, {expected_updated_at: 'version', notes: 'Crew arrived'});
  assert.equal(adaptIncident({...incident, status: 'ACCEPTED'}).statusLabel, 'Accepted');
});

test('department authorization and stale-update errors stay truthful', async () => {
  for (const status of [401, 403, 404, 409, 503]) {
    const client = createApiClient('http://backend', async () => Response.json({}, {status}));
    await assert.rejects(client.updateDepartmentStatus('uuid', 'ACCEPTED', 'version'), error => error instanceof ApiError && error.status === status);
  }
});
