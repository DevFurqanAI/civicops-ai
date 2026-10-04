export interface ReportPayload {
  id: string;
  description: string;
  category: string;
  location: { lat: number; lng: number; text: string };
  status: 'Received' | 'Under Review' | 'Resolved';
  timestamp: string;
}


export const mockIncidents = [
  { id: 'INC-901', title: 'Severe Flooding on Main Road', category: 'Infrastructure', priority: 'CRITICAL', status: 'Under Review', location: { lat: 31.5204, lng: 74.3587, text: 'Gulberg III' }, evidence: 'HIGH', reports: 14, spamRisk: 'LOW', aiConfidence: 94, aiSummary: "Multiple visual reports confirm severe waterlogging. Immediate dispatch of WASA drainage units recommended.", suggestedDept: 'WASA', independentReports: 12 },
  { id: 'INC-902', title: 'Suspicious Activity Reported', category: 'Security', priority: 'HIGH', status: 'Assigned', location: { lat: 31.5497, lng: 74.3436, text: 'Liberty Market' }, evidence: 'MEDIUM', reports: 3, spamRisk: 'LOW', aiConfidence: 78, aiSummary: "Audio analysis detected raised voices. Matching patterns with 2 recent reports.", suggestedDept: 'Police', independentReports: 3 },
  { id: 'INC-903', title: 'Broken Streetlights', category: 'Maintenance', priority: 'LOW', status: 'Received', location: { lat: 31.4697, lng: 74.2728, text: 'Johar Town' }, evidence: 'LOW', reports: 5, spamRisk: 'HIGH', aiConfidence: 45, aiSummary: "Multiple identical reports originating from the same device IP. Flagged for manual review.", suggestedDept: 'LDA', independentReports: 1 }
];

export const categories = [
  "Infrastructure (Potholes, Water)",
  "Sanitation (Garbage, Sewers)",
  "Security (Theft, Suspicious Activity)",
  "Emergency (Fire, Medical)",
  "Harrasment or Bullying",
  "Robery or Snatching(bag,mobile,laptop)",
  "Other"
];