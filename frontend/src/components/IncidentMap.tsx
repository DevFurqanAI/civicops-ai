import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { MapPin } from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import EmptyState from './EmptyState';
import type { IncidentView } from '../services/api';
import { mapFocus } from '../utils/incidentMap';

const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41],
});
const selectedMarkerIcon = L.icon({...markerIcon.options, iconSize: [30, 49], iconAnchor: [15, 49], popupAnchor: [1, -42], className: 'incident-marker-selected'});

function FocusLocation({position, zoom}: {position: [number, number]; zoom: number}) {
  const map = useMap();
  const [latitude, longitude] = position;
  useEffect(() => {map.setView([latitude, longitude], zoom);}, [map, latitude, longitude, zoom]);
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    map.invalidateSize();
    return () => observer.disconnect();
  }, [map]);
  return null;
}

export default function IncidentMap({incidents, selectedId, onSelect, disabled = false}: {
  incidents: IncidentView[]; selectedId?: string | null; onSelect: (id: string) => void; disabled?: boolean;
}) {
  const {markers, position, zoom, selectedWithoutCoordinates} = mapFocus(incidents, selectedId);
  return <div className="situational-map">
    <div className="map-heading"><h3><MapPin size={16} />Incident locations</h3><span>{markers.length} mapped</span></div>
    {selectedWithoutCoordinates && <p className="field-help" role="status">The selected incident has no coordinates. Its written location remains available in the details.</p>}
    {position ? <div className="map-canvas"><MapContainer center={position} zoom={zoom} style={{height: '100%', width: '100%'}}>
      <FocusLocation position={position} zoom={zoom} />
      <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {markers.map(incident => <Marker key={incident.id} position={incident.mapPosition!} icon={incident.id === selectedId ? selectedMarkerIcon : markerIcon}
        zIndexOffset={incident.id === selectedId ? 1000 : 0}
        eventHandlers={{click: () => {if (!disabled) onSelect(incident.id);}}}>
        <Popup><span className="incident-code">{incident.displayId}</span><br /><strong>{incident.title}</strong><p>{incident.categoryLabel}</p><p><span className={`priority-tag priority-${incident.priority.toLowerCase()}`}>{incident.priority}</span> <span className="status-tag">{incident.statusLabel}</span></p><p>{incident.location.text}</p>
          <button disabled={disabled} onClick={() => onSelect(incident.id)} className="text-link">Review incident</button>
        </Popup>
      </Marker>)}
    </MapContainer></div> : <EmptyState icon={MapPin} compact title="No mapped incidents"><p>Incidents need coordinates to appear here. Reports with a written location remain in the queue.</p></EmptyState>}
  </div>;
}
