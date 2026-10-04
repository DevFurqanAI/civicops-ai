export interface ReportPayload {
  id: string;
  description: string;
  category: string;
  location: { lat: number; lng: number; text: string };
  status: 'Received' | 'Under Review' | 'Resolved';
  timestamp: string;
}

export const categories = [
  "Infrastructure (Potholes, Water)",
  "Sanitation (Garbage, Sewers)",
  "Security (Theft, Suspicious Activity)",
  "Emergency (Fire, Medical)",
  "Harrasment or Bullying",
  "Robery or Snatching(bag,mobile,laptop)",
  "Other"
];