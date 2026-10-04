import { Image as ImageIcon, Headphones, LockKeyhole } from 'lucide-react';
import EmptyState from './EmptyState';
import { useEffect, useState } from 'react';
import { getEvidence, getIncidentEvidence, getEvidenceContent } from '../services/api';
import type { EvidenceItem } from '../services/api';

export default function ReportEvidence({publicId, incidentId}: {publicId?: string; incidentId?: string}) {
  const [items, setItems] = useState<Array<EvidenceItem & {public_id?: string}>>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [preview, setPreview] = useState<{url: string; type: string} | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setItems([]); setPreview(null);
    const load = incidentId ? getIncidentEvidence(incidentId, controller.signal) : getEvidence(publicId!, controller.signal);
    void load.then(items => {if (!controller.signal.aborted) setItems(items);})
      .catch(() => {if (!controller.signal.aborted) setError('Private evidence is unavailable for this report.');})
      .finally(() => {if (!controller.signal.aborted) setLoading(false);});
    return () => controller.abort();
  }, [publicId, incidentId]);
  useEffect(() => () => {if (preview) URL.revokeObjectURL(preview.url);}, [preview]);
  async function open(item: EvidenceItem & {public_id?: string}) {
    if (busy) return;
    setBusy(true); setError('');
    try {setPreview({url: URL.createObjectURL(await getEvidenceContent(item.public_id || publicId!, item.media_id)), type: item.media_type});}
    catch {setError('Evidence could not be loaded. Please retry.');}
    finally {setBusy(false);}
  }
  return <div className="report-evidence">
    <h3><LockKeyhole size={17} />Private evidence</h3>
    {loading && <p role="status" className="subtle-text">Loading evidence...</p>}
    {error && <p role="alert" className="notice notice-error">{error}</p>}
    {!loading && !error && !items.length && <EmptyState icon={ImageIcon} compact title="No evidence attached"><p>Text reports can stand on their own. Only saved photos and voice evidence appear here.</p></EmptyState>}
    <div className="saved-evidence-list">{items.map((item,index) => <button key={item.media_id} disabled={busy} onClick={() => void open(item)} className="saved-evidence-button">{item.media_type === 'IMAGE' ? <ImageIcon size={19} /> : <Headphones size={19} />}<span>{busy ? 'Loading...' : `${item.media_type === 'IMAGE' ? 'Image' : 'Voice evidence'} ${index + 1}`}<small>Private attachment</small></span></button>)}</div>
    {preview && <div className="saved-evidence-preview">{preview.type === 'IMAGE' ? <img src={preview.url} alt="Report evidence" /> : <audio src={preview.url} controls />}</div>}
  </div>;
}
