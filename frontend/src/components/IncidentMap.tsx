import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { MapPin } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import EmptyState from './EmptyState';
import type { IncidentView } from '../services/api';
import { mapFocus, focusMapSelection, createMapResizeHandler } from '../utils/incidentMap';

const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});
const selectedMarkerIcon = L.icon({...markerIcon.options, iconSize: [30, 49], iconAnchor: [15, 49], popupAnchor: [1, -42], className: 'incident-marker-selected'});

function FocusLocation({position}: {position: [number, number] | null}) {
  const map = useMap();
  const latitude = position?.[0], longitude = position?.[1];
  useEffect(() => {
    focusMapSelection({contains: point => map.getBounds().contains(point),
      panTo: point => {map.panTo(point, {animate: false});}},
      latitude === undefined || longitude === undefined ? null : [latitude, longitude]);
  }, [map, latitude, longitude]);
  useEffect(() => {
    const resize = createMapResizeHandler(() => map.invalidateSize({pan: false, debounceMoveend: true}),
      callback => requestAnimationFrame(callback), frame => cancelAnimationFrame(frame));
    const observer = new ResizeObserver(entries => {
      const size = entries[0]?.contentRect;
      if (size) resize.resize(size.width, size.height);
    });
    observer.observe(map.getContainer());
    return () => {observer.disconnect(); resize.dispose();};
  }, [map]);
  return null;
}

export default function IncidentMap({incidents, selectedId, onSelect, disabled = false}: {
  incidents: IncidentView[]; selectedId?: string | null; onSelect: (id: string) => void; disabled?: boolean;
}) {
  const {markers, position, selectedWithoutCoordinates} = mapFocus(incidents, selectedId);
  // Initialize once from real coordinates; never destroy the map on empty filters.
  const [initialPosition, setInitialPosition] = useState(position);
  useEffect(() => {if (!initialPosition && position) setInitialPosition(position);}, [initialPosition, position]);
  const selectedPosition = markers.find(incident => incident.id === selectedId)?.mapPosition ?? null;
  return <div className="situational-map">
    <div className="map-heading"><h3><MapPin size={16} />Incident locations</h3><span>{markers.length} mapped</span></div>
    {selectedWithoutCoordinates && <p className="field-help" role="status">The selected incident has no coordinates. Its written location remains available in the details.</p>}
    {initialPosition && <div className="map-canvas" hidden={!position}><MapContainer center={initialPosition} zoom={12} style={{height: '100%', width: '100%'}}>
      <FocusLocation position={selectedPosition} />
      <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {markers.map(incident => <Marker key={incident.id} position={incident.mapPosition!} icon={incident.id === selectedId ? selectedMarkerIcon : markerIcon}
        zIndexOffset={incident.id === selectedId ? 1000 : 0}
        eventHandlers={{click: () => {if (!disabled) onSelect(incident.id);}}}>
        <Popup><span className="incident-code">{incident.displayId}</span><br /><strong>{incident.title}</strong><p>{incident.categoryLabel}</p><p><span className={`priority-tag priority-${incident.priority.toLowerCase()}`}>{incident.priority}</span> <span className="status-tag">{incident.statusLabel}</span></p><p>{incident.location.text}</p>
          <button disabled={disabled} onClick={() => onSelect(incident.id)} className="text-link">Review incident</button>
        </Popup>
      </Marker>)}
    </MapContainer></div>}
    {!position && <EmptyState icon={MapPin} compact title="No mapped incidents"><p>Incidents need coordinates to appear here. Reports with a written location remain in the queue.</p></EmptyState>}
  </div>;
}
