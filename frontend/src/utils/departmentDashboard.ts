import type {IncidentView} from '../services/api.ts';
import type {TrustedUser} from '../services/session.ts';
import type {Category, IncidentStatus, Priority} from '../data/civicData.ts';

export const defaultDepartmentFilters = {status: 'ALL', priority: 'ALL', category: 'ALL', search: ''} as const;
export interface DepartmentFilters {status: IncidentStatus | 'ALL'; priority: Priority | 'ALL'; category: Category | 'ALL'; search: string}
export function filterDepartmentIncidents(rows: IncidentView[], filters: DepartmentFilters) {
  const search = filters.search.trim().toLocaleLowerCase();
  return rows.filter(row => (filters.status === 'ALL' || row.status === filters.status)
    && (filters.priority === 'ALL' || row.priority === filters.priority)
    && (filters.category === 'ALL' || row.category === filters.category)
    && (!search || [row.id, row.displayId, row.title, row.summary, row.location.text].join(' ').toLocaleLowerCase().includes(search)));
}
export function filtersForSelection(rows: IncidentView[], filters: DepartmentFilters, selectedId: string): DepartmentFilters {
  return filterDepartmentIncidents(rows, filters).some(row => row.id === selectedId) ? filters : {...defaultDepartmentFilters};
}
export function departmentSummary(rows: IncidentView[]) {
  return [{label: 'New assignments', status: 'ASSIGNED'}, {label: 'Accepted', status: 'ACCEPTED'},
    {label: 'In progress', status: 'IN_PROGRESS'}, {label: 'Pending verification', status: 'RESOLVED_PENDING_VERIFICATION'},
    {label: 'Total active', status: null}].map(item => ({...item, count: item.status ? rows.filter(row => row.status === item.status).length : rows.length}));
}
export function departmentIdentity(user: TrustedUser | null, rows: IncidentView[]) {
  return user?.role === 'DEPARTMENT' ? user.department_name?.trim() || rows[0]?.departmentLabel || 'Department operations' : 'Department operations';
}
// Display enrichment only. Role/membership still come exclusively from FastAPI.
// Optional catalog/Auth failures must not alter trusted permissions or block login.
export async function enrichDepartmentIdentity(user: TrustedUser, reads: {
  account(): Promise<{id: string; email?: string} | null>;
  department(id: string): Promise<{id: string; display_name: string} | null>;
}): Promise<TrustedUser> {
  if (user.role !== 'DEPARTMENT' || !user.department_id) return user;
  const [account, department] = await Promise.allSettled([reads.account(), reads.department(user.department_id)]);
  return {...user,
    email: account.status === 'fulfilled' && account.value?.id === user.user_id ? account.value.email : null,
    department_name: department.status === 'fulfilled' && department.value?.id === user.department_id ? department.value.display_name : null};
}
