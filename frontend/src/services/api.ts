// This file will hold all real backend calls once Ghulam provides the endpoints.
import { mockIncidents } from '../data/mockData';

export const fetchIncidents = async () => {
  // TODO: Replace with real fetch() call when API is ready
  // const response = await fetch('/api/incidents');
  // return response.json();
  
  return mockIncidents; // Returning mock data for now
};