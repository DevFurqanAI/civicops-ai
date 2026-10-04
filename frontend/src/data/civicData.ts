export const categoryLabels = {
  SEWERAGE_DRAINAGE: 'Sewerage & drainage', WASTE_SANITATION: 'Waste & sanitation',
  WATER_SUPPLY: 'Water supply', ELECTRICITY: 'Electricity', STREET_LIGHTING: 'Street lighting',
  ROAD_DAMAGE: 'Road damage', GAS_UTILITIES: 'Gas utilities', PARKS_HORTICULTURE: 'Parks & horticulture',
  STRAY_ANIMALS_SAFETY: 'Stray animals & safety', OTHER: 'Other / manual review',
} as const;
export const departmentLabels = {
  WATER_SANITATION: 'Water & sanitation', WATER_SUPPLY: 'Water supply', WASTE_MANAGEMENT: 'Waste management',
  ROAD_MAINTENANCE: 'Road maintenance', PUBLIC_LIGHTING: 'Public lighting', ELECTRICITY_UTILITY: 'Electricity utility',
  GAS_UTILITY: 'Gas utility', PARKS_HORTICULTURE: 'Parks & horticulture', ANIMAL_CONTROL: 'Animal control', MANUAL_REVIEW: 'Manual review',
} as const;
export const statusLabels = {
  RECEIVED: 'Received', VERIFIED: 'Verified', ASSIGNED: 'Assigned', ACCEPTED: 'Accepted', IN_PROGRESS: 'In progress',
  RESOLVED_PENDING_VERIFICATION: 'Awaiting resolution verification',
  RESOLVED: 'Resolved', REOPENED: 'Reopened', REJECTED: 'Rejected', NEEDS_REVIEW: 'Needs review',
} as const;
export type Category = keyof typeof categoryLabels;
export type Department = keyof typeof departmentLabels;
export type IncidentStatus = keyof typeof statusLabels;
export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
