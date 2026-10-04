import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {mapTilerTiles} from '../src/utils/mapTiles.ts';
import * as mapLogic from '../src/utils/incidentMap.ts';
import {adaptIncident} from '../src/services/api.ts';
import type {IncidentResponse} from '../src/services/api.ts';

const require = createRequire(import.meta.url);
const React = require('react');
const {renderToStaticMarkup} = require('react-dom/server');
const ts = require('typescript');
const source = readFileSync(new URL('../src/components/IncidentMap.tsx', import.meta.url), 'utf8');
function renderMap(key: string | undefined, incident: IncidentResponse) {
  // Render the real shared component without a browser/network. Only Leaflet DOM
  // primitives are replaced; React state and the provider/marker logic are real.
  const code = ts.transpileModule(source.replace('import.meta.env.VITE_MAPTILER_API_KEY', JSON.stringify(key) ?? 'undefined'),
    {compilerOptions: {module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true}}).outputText;
  const exports: Record<string, unknown> = {};
  runInNewContext(code, {exports, require: (name: string) => {
    if (name === 'react-leaflet') return {
      MapContainer: (props: {children: unknown}) => React.createElement('div', {'data-map': true}, props.children),
      TileLayer: (props: {url: string}) => React.createElement('span', {'data-tiles': props.url}),
      Marker: (props: {children: unknown; zIndexOffset: number}) => React.createElement('span', {'data-selected-marker': props.zIndexOffset === 1000}, props.children),
      Popup: (props: {children: unknown}) => React.createElement('div', {}, props.children), useMap: () => ({}),
    };
    if (name === 'leaflet') return {icon: (options: unknown) => ({options})};
    if (name.endsWith('.css')) return {};
    if (name === './EmptyState') return {default: (props: {title: string; children: unknown}) => React.createElement('div', {}, props.title, props.children), __esModule: true};
    if (name === '../utils/incidentMap') return mapLogic;
    if (name === '../utils/mapTiles') return {mapTilerTiles};
    return require(name);
  }});
  return renderToStaticMarkup(React.createElement(exports.default, {incidents: [adaptIncident(incident)], selectedId: incident.incident_id, onSelect: () => {}}));
}
const incident: IncidentResponse = {incident_id: 'real-id', incident_code: 'INC-1', updated_at: '2026-10-04T12:00:00Z', category: 'WATER_SUPPLY',
  title: 'Water leak', summary: 'Leaking supply pipe', location: {latitude: 31.5, longitude: 74.3, landmark: 'School gate'}, priority: 'HIGH',
  evidence_confidence: .8, supporting_signals: [], spam_risk: .1, report_count: 2, department: 'WATER_SUPPLY', status: 'ASSIGNED',
  response_plan: ['Inspect leak'], response_plan_status: 'APPROVED', reported_urgency: 'HIGH'};

test('MapTiler Streets URL is stable, encoded and uses the documented 256px Leaflet options', () => {
  const tiles = mapTilerTiles(' test+key&value ');
  assert.equal(tiles?.url, 'https://api.maptiler.com/maps/streets-v4/256/{z}/{x}/{y}.png?key=test%2Bkey%26value');
  assert.equal(tiles?.tileSize, 256); assert.equal(tiles?.zoomOffset, 0);
  assert.equal(tiles?.crossOrigin, true); assert.equal(tiles?.minZoom, 1);
  assert.ok(tiles?.attribution.includes('MapTiler') && tiles.attribution.includes('OpenStreetMap contributors'));
  assert.deepEqual(mapTilerTiles('test-key'), mapTilerTiles('test-key'));
});
for (const dashboard of ['operator', 'department']) {
  test(`${dashboard} shared map renders one map/layer and keeps selected marker and popup`, () => {
    const html = renderMap('test-key', incident);
    assert.equal((html.match(/data-map="true"/g) || []).length, 1);
    assert.equal((html.match(/data-tiles=/g) || []).length, 1);
    assert.ok(html.includes('api.maptiler.com/maps/streets-v4/256/'));
    assert.ok(html.includes('data-selected-marker="true"'));
    assert.ok(html.includes('School gate') && html.includes('INC-1') && html.includes('Water leak'));
    assert.ok(!html.includes('tile.openstreetmap.org'));
  });
}
test('missing MapTiler key renders no tile requests while marker/detail selection remains available', () => {
  for (const key of [undefined, '', '   ']) {
    assert.equal(mapTilerTiles(key), null);
    const html = renderMap(key, incident);
    assert.ok(html.includes('configure VITE_MAPTILER_API_KEY'));
    assert.ok(!html.includes('data-tiles='));
    assert.ok(html.includes('data-map="true"') && html.includes('data-selected-marker="true"') && html.includes('Review incident'));
  }
});
test('missing coordinates retain the map empty state without a tile layer', () => {
  const html = renderMap('test-key', {...incident, location: {latitude: null, longitude: null, landmark: 'School gate'}});
  assert.ok(html.includes('No mapped incidents'));
  assert.ok(!html.includes('data-map=') && !html.includes('data-tiles='));
});
