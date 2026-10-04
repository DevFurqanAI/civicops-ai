export function validMapPosition(position: [number, number] | null): position is [number, number] {
  return position !== null && Number.isFinite(position[0]) && Math.abs(position[0]) <= 90
    && Number.isFinite(position[1]) && Math.abs(position[1]) <= 180;
}

export function mapFocus<T extends {id: string; mapPosition: [number, number] | null}>(incidents: T[], selectedId?: string | null) {
  const markers = incidents.filter(incident => validMapPosition(incident.mapPosition));
  const selected = incidents.find(incident => incident.id === selectedId);
  const focus = selected && validMapPosition(selected.mapPosition) ? selected : markers[0];
  return {markers, position: focus?.mapPosition ?? null, zoom: focus?.id === selectedId ? 15 : 12,
    selectedWithoutCoordinates: Boolean(selected && !validMapPosition(selected.mapPosition))};
}
