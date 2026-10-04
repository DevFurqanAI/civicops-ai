export function scoreBand(value: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  return value < 0.4 ? 'LOW' : value < 0.7 ? 'MEDIUM' : 'HIGH';
}
