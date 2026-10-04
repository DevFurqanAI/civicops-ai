import { useEffect, useState } from 'react';
import { getWorkHistory } from '../services/api';
import type { WorkUpdate } from '../services/api';
import { displayTime } from '../utils/presentation';

export default function DepartmentWorkHistory({incidentId, version}: {incidentId: string; version: string}) {
  const [rows, setRows] = useState<WorkUpdate[]>([]);
  const [state, setState] = useState('Loading work updates...');
  useEffect(() => {
    const controller = new AbortController();
    setRows([]); setState('Loading work updates...');
    void getWorkHistory(incidentId, controller.signal).then(rows => {
      if (!controller.signal.aborted) {setRows(rows); setState(rows.length ? '' : 'No department work updates recorded.');}
    }).catch(() => {if (!controller.signal.aborted) setState('Work updates unavailable. Refresh before reviewing completion.');});
    return () => controller.abort();
  }, [incidentId, version]);
  return <section className="intelligence-section"><h3>Department work updates</h3>{state && <p role="status">{state}</p>}<ul className="signals-list">{rows.map((row, index) => <li key={index}><time>{displayTime(row.created_at)}</time><p>{row.notes}</p></li>)}</ul></section>;
}
