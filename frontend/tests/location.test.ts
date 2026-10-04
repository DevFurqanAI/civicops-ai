import test from 'node:test';
import assert from 'node:assert/strict';
import {reportPayload, adaptIncident, createApiClient} from '../src/services/api.ts';
import type {IncidentResponse, CitizenReportInput} from '../src/services/api.ts';
import {mapFocus} from '../src/utils/incidentMap.ts';
const landmark = 'Near Nishtar Hospital, Multan';
const draft: CitizenReportInput = {description: 'Overflowing drain', language: 'en', location: null, landmark};
for (const [label, location, text, expected] of [
  ['manual only', null, landmark, {landmark_text: landmark, latitude: null, longitude: null}],
  ['GPS only', {lat: 30.2, lng: 71.4}, '', {landmark_text: null, latitude: 30.2, longitude: 71.4}],
  ['manual and GPS', {lat: 30.2, lng: 71.4}, landmark, {landmark_text: landmark, latitude: 30.2, longitude: 71.4}],
  ['no location', null, '', {landmark_text: null, latitude: null, longitude: null}],
  ['blank manual location', null, '   ', {landmark_text: null, latitude: null, longitude: null}],
] as const) {
  test(`location payload preserves independent manual/GPS values: ${label}`, () => {
    const body = reportPayload({...draft, location, landmark: text}, 'submission');
    assert.deepEqual({landmark_text: body.landmark_text, latitude: body.latitude, longitude: body.longitude}, expected);
    assert.equal(draft.landmark, landmark);
  });
}
const incident: IncidentResponse = {incident_id: 'id', incident_code: 'INC-1', updated_at: '2026-10-04T12:00:00Z', category: 'SEWERAGE_DRAINAGE',
  title: 'Drain overflow', summary: 'Overflow outside hospital', location: {latitude: null, longitude: null, landmark}, priority: 'HIGH',
  evidence_confidence: .6, supporting_signals: [], spam_risk: .1, report_count: 1, department: 'WATER_SANITATION', status: 'ASSIGNED',
  response_plan: [], response_plan_status: 'PENDING', reported_urgency: 'HIGH'};
test('operator and department detail adapters retain manual location and exclude only its marker', async () => {
  const api = createApiClient('http://backend', async () => Response.json(incident));
  for (const detail of [await api.getIncident('id'), await api.getDepartmentIncident('id')]) {
    assert.equal(detail.location.text, landmark); assert.equal(detail.mapPosition, null);
    const gps = adaptIncident({...incident, incident_id: 'gps', location: {latitude: 30.2, longitude: 71.4, landmark: null}});
    assert.deepEqual(mapFocus([detail, gps]).markers.map(row => row.id), ['gps']);
  }
});
