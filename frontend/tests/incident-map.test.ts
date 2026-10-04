import test from 'node:test';
import assert from 'node:assert/strict';
import {mapFocus, validMapPosition} from '../src/utils/incidentMap.ts';
import {createApiClient} from '../src/services/api.ts';

test('map only plots valid coordinates and focuses a selected incident', () => {
  const incidents = [{id: 'one', mapPosition: [31.5, 74.3] as [number, number]},
    {id: 'two', mapPosition: [32, 75] as [number, number]}, {id: 'missing', mapPosition: null}];
  assert.deepEqual(mapFocus(incidents, 'two').position, [32, 75]);
  assert.equal(mapFocus(incidents, 'two').zoom, 15);
  assert.equal(mapFocus(incidents, 'one').markers.length, 2);
  assert.equal(mapFocus(incidents, 'missing').selectedWithoutCoordinates, true);
  assert.deepEqual(mapFocus(incidents, 'missing').position, [31.5, 74.3]);
  assert.equal(mapFocus([{id: 'missing', mapPosition: null}], 'missing').position, null);
  assert.equal(mapFocus([]).markers.length, 0);
  assert.equal(validMapPosition([0, 0]), true);
  for (const position of [null, [91, 0], [0, -181], [NaN, 0], [0, Infinity]] as Array<[number, number] | null>) {
    assert.equal(validMapPosition(position), false);
  }
});

test('operator assign and release uses a single versioned backend request', async () => {
  const calls: unknown[] = [];
  const api = createApiClient('http://backend', async (_url, init) => {
    calls.push(JSON.parse(String(init?.body)));
    return Response.json({status: 'ASSIGNED'});
  }, () => 'operator-token');
  await api.assignIncidentDepartment('incident', 'WATER_SANITATION', 'version', 'Release to team', true);
  assert.deepEqual(calls, [{department: 'WATER_SANITATION', expected_updated_at: 'version', notes: 'Release to team', release: true}]);
});
