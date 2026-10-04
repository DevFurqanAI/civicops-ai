import test from 'node:test';
import assert from 'node:assert/strict';
import {adaptIncident, createApiClient} from '../src/services/api.ts';
import type {IncidentResponse} from '../src/services/api.ts';
import {departmentIdentity, departmentSummary, enrichDepartmentIdentity, filterDepartmentIncidents, filtersForSelection, defaultDepartmentFilters} from '../src/utils/departmentDashboard.ts';
import {mapFocus} from '../src/utils/incidentMap.ts';

const base: IncidentResponse = {incident_id: 'one', incident_code: 'INC-01', updated_at: '2026-10-04T12:00:00Z', category: 'SEWERAGE_DRAINAGE',
  title: 'Overflow near school', summary: 'Blocked drain at the school gate', location: {latitude: 31.5, longitude: 74.3, landmark: 'School gate'},
  priority: 'HIGH', evidence_confidence: .8, supporting_signals: [], spam_risk: .1, report_count: 3, department: 'WATER_SANITATION',
  status: 'ASSIGNED', response_plan: ['Inspect drainage'], response_plan_status: 'APPROVED', reported_urgency: 'HIGH'};
const rows = [adaptIncident(base), adaptIncident({...base, incident_id: 'two', incident_code: 'INC-02', category: 'WATER_SUPPLY', status: 'ACCEPTED',
  title: 'Water leak', summary: 'Damaged supply pipe', priority: 'LOW', location: {latitude: null, longitude: null, landmark: 'Market'}}),
  adaptIncident({...base, incident_id: 'three', incident_code: 'INC-03', status: 'IN_PROGRESS', priority: 'CRITICAL'})];

test('trusted department name and account enrichment never change roles or membership', async () => {
  const user = {user_id: 'member', role: 'DEPARTMENT' as const, department_id: 'dept'};
  const enriched = await enrichDepartmentIdentity(user, {account: async () => ({id: 'member', email: 'member@example.test'}),
    department: async id => ({id, display_name: 'Verified department name'})});
  assert.equal(departmentIdentity(enriched, []), 'Verified department name');
  assert.equal(enriched.email, 'member@example.test');
  assert.equal(enriched.role, 'DEPARTMENT'); assert.equal(enriched.department_id, 'dept');
  const forged = await enrichDepartmentIdentity(user, {account: async () => ({id: 'other', email: 'other@example.test'}),
    department: async () => ({id: 'other', display_name: 'Another department'})});
  assert.equal(forged.department_name, null); assert.equal(forged.email, null);
  const unavailable = await enrichDepartmentIdentity(user, {account: async () => {throw Error('Offline');}, department: async () => null});
  assert.equal(departmentIdentity(unavailable, rows), 'Water & sanitation');
  assert.equal(departmentIdentity(unavailable, []), 'Department operations');
  const citizen = {user_id: 'citizen', role: 'CITIZEN' as const};
  assert.deepEqual(await enrichDepartmentIdentity(citizen, {account: async () => {assert.fail('No account lookup');},
    department: async () => {assert.fail('No department lookup');}}), citizen);
});

test('department summary counts come from the authorized queue independently of filters', () => {
  assert.deepEqual(departmentSummary(rows).map(item => item.count), [1, 1, 1, 0, 3]);
  assert.deepEqual(departmentSummary([]).map(item => item.count), [0, 0, 0, 0, 0]);
});

test('department status filter', () => {
  assert.deepEqual(filterDepartmentIncidents(rows, {...defaultDepartmentFilters, status: 'ACCEPTED'}).map(row => row.id), ['two']);
});
test('department priority filter', () => {
  assert.deepEqual(filterDepartmentIncidents(rows, {...defaultDepartmentFilters, priority: 'CRITICAL'}).map(row => row.id), ['three']);
});
test('department category filter', () => {
  assert.deepEqual(filterDepartmentIncidents(rows, {...defaultDepartmentFilters, category: 'WATER_SUPPLY'}).map(row => row.id), ['two']);
});
test('department filters combine with case-insensitive search and reset', () => {
  assert.deepEqual(filterDepartmentIncidents(rows, {status: 'ASSIGNED', priority: 'HIGH', category: 'SEWERAGE_DRAINAGE', search: ' SCHOOL '}).map(row => row.id), ['one']);
  assert.equal(filterDepartmentIncidents(rows, {...defaultDepartmentFilters, search: 'inc-02'})[0].id, 'two');
  assert.equal(filterDepartmentIncidents(rows, {...defaultDepartmentFilters, search: 'damaged'})[0].id, 'two');
  assert.equal(filterDepartmentIncidents(rows, {...defaultDepartmentFilters, search: 'market'})[0].id, 'two');
  assert.equal(filterDepartmentIncidents(rows, {...defaultDepartmentFilters, status: 'ACCEPTED', priority: 'HIGH'}).length, 0);
  assert.deepEqual(filterDepartmentIncidents(rows, {...defaultDepartmentFilters}), rows);
});
test('department map uses only authorized endpoint data; selection and null coordinates remain safe', async () => {
  const api = createApiClient('http://backend', async url => {
    assert.equal(String(url), 'http://backend/api/department/incidents');
    return Response.json([base, {...base, incident_id: 'no-location', location: {latitude: null, longitude: null, landmark: 'Market'}}]);
  });
  const authorized = await api.getDepartmentIncidents();
  assert.deepEqual(mapFocus(authorized, 'one').markers.map(row => row.id), ['one']);
  assert.deepEqual(mapFocus(authorized, 'one').position, [31.5, 74.3]);
  assert.equal(mapFocus(authorized, 'no-location').selectedWithoutCoordinates, true);
  assert.equal(filterDepartmentIncidents(authorized, {...defaultDepartmentFilters, priority: 'LOW'}).length, 0);
  assert.equal(mapFocus(authorized).markers.length, 1); // queue filters do not hide authorized map markers
});
test('shared operator map still handles marker selection and active dataset filtering', () => {
  assert.deepEqual(mapFocus(rows, 'three').position, rows[2].mapPosition);
  assert.equal(mapFocus(rows, 'three').zoom, 15);
  assert.deepEqual(mapFocus(rows.filter(row => row.priority === 'HIGH'), 'one').markers.map(row => row.id), ['one']);
  assert.equal(mapFocus(rows, 'two').selectedWithoutCoordinates, true);
  assert.equal(mapFocus([]).position, null);
});

test('selecting a filtered-out map marker reveals its queue row and synchronizes focus', () => {
  const filters = {...defaultDepartmentFilters, search: 'market'};
  assert.equal(filtersForSelection(rows, filters, 'two'), filters);
  const revealed = filtersForSelection(rows, filters, 'three');
  assert.deepEqual(revealed, defaultDepartmentFilters);
  assert.ok(filterDepartmentIncidents(rows, revealed).some(row => row.id === 'three'));
  assert.deepEqual(mapFocus(rows, 'three').position, rows[2].mapPosition);
});
