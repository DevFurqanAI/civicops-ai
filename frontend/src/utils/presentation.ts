export function displayTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time unavailable' : new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

export function visibleSignals(signals: Array<Record<string, unknown>>) {
  return signals.flatMap(signal => typeof signal.signal === 'string' && typeof signal.detail === 'string'
    ? [{label: signal.signal.replace(/_/g, ' '), detail: signal.detail}] : []);
}
