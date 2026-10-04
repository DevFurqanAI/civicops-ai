export function validMapPosition(position: [number, number] | null): position is [number, number] {
  return position !== null && Number.isFinite(position[0]) && Math.abs(position[0]) <= 90
    && Number.isFinite(position[1]) && Math.abs(position[1]) <= 180;
}

export function mapFocus<T extends {id: string; mapPosition: [number, number] | null}>(incidents: T[], selectedId?: string | null) {
  const markers = incidents.filter(incident => validMapPosition(incident.mapPosition));
  const selected = incidents.find(incident => incident.id === selectedId);
  const focus = selected && validMapPosition(selected.mapPosition) ? selected : markers[0];
  return {markers, position: focus?.mapPosition ?? null, zoom: 12,
    selectedWithoutCoordinates: Boolean(selected && !validMapPosition(selected.mapPosition))};
}

// Keep the viewport when filtering/refreshing. Only explicit selection may pan,
// and selecting an already visible marker never changes zoom or reloads a grid.
export function focusMapSelection(map: {contains(position: [number, number]): boolean; panTo(position: [number, number]): void}, position: [number, number] | null) {
  if (validMapPosition(position) && !map.contains(position)) map.panTo(position);
}

export function createMapResizeHandler(invalidate: () => void, schedule: (callback: () => void) => number, cancel: (id: number) => void) {
  let width = 0, height = 0, frame: number | null = null;
  return {
    resize(nextWidth: number, nextHeight: number) {
      if (nextWidth <= 0 || nextHeight <= 0 || (width === nextWidth && height === nextHeight)) return;
      width = nextWidth; height = nextHeight;
      if (frame === null) frame = schedule(() => {frame = null; invalidate();});
    },
    dispose() {if (frame !== null) cancel(frame); frame = null;},
  };
}
