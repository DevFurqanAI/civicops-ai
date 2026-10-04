import test from 'node:test';
import assert from 'node:assert/strict';
import {mapFocus, validMapPosition} from '../src/utils/incidentMap.ts';
import {createApiClient} from '../src/services/api.ts';

test('map only plots valid coordinates and focuses a selected incident', () => {
  const incidents = [{id: 'one', mapPosition: [31.5, 74.3] as [number, number]},
    {id: 'two', mapPosition: [32, 75] as [number, number]}, {id: 'missing', mapPosition: null}];
  assert.deepEqual(mapFocus(incidents, 'two').position, [32, 75]);
  assert.equal(mapFocus(incidents, 'two').zoom, 12);
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
import {focusMapSelection, createMapResizeHandler} from '../src/utils/incidentMap.ts';

test('selection inside the viewport and repeated StrictMode focus do not request another tile grid', () => {
  const pans: Array<[number, number]> = [];
  let visible = true;
  const map = {contains: () => visible, panTo: (position: [number, number]) => {pans.push(position); visible = true;}};
  focusMapSelection(map, [31.5, 74.3]);
  focusMapSelection(map, null); // filtering/clearing selection preserves viewport
  assert.equal(pans.length, 0);
  visible = false;
  focusMapSelection(map, [32, 75]);
  focusMapSelection(map, [32, 75]); // StrictMode replay, same viewport
  assert.deepEqual(pans, [[32, 75]]);
  focusMapSelection(map, [NaN, 75]);
  assert.equal(pans.length, 1);
});

test('resize invalidation is coalesced, skips unchanged/hidden containers and cancels on unmount', () => {
  let invalidations = 0;
  let nextId = 0;
  const callbacks = new Map<number, () => void>();
  const resize = createMapResizeHandler(() => invalidations++, callback => {callbacks.set(++nextId, callback); return nextId;}, id => {callbacks.delete(id);});
  resize.resize(500, 320); resize.resize(500, 320); resize.resize(501, 320);
  assert.equal(callbacks.size, 1);
  callbacks.get(1)!(); callbacks.delete(1);
  assert.equal(invalidations, 1);
  resize.resize(501, 320); resize.resize(0, 0); resize.resize(501, 320);
  assert.equal(callbacks.size, 0);
  resize.resize(600, 320); resize.dispose();
  assert.equal(callbacks.size, 0);
  assert.equal(invalidations, 1);
});
