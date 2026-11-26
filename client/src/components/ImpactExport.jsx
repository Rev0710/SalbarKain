import { useState } from 'react';
import { api } from '../utils/api.js';

export default function ImpactExport({ onNotice }) {
  const [municipality, setMunicipality] = useState(''); const [barangay, setBarangay] = useState(''); const [busy, setBusy] = useState(false);
  async function download(event) {
    event.preventDefault(); setBusy(true);
    try {
      const { data } = await api.get('/impact/export', { params: { ...(municipality.trim() ? { municipality: municipality.trim() } : {}), ...(barangay.trim() ? { barangay: barangay.trim() } : {}) }, responseType: 'blob' });
      const url = URL.createObjectURL(data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'salbarkain-impact-ledger.csv'; anchor.click(); URL.revokeObjectURL(url);
    } catch (err) { onNotice(err.response?.data?.message || 'Impact ledger export failed.'); }
    finally { setBusy(false); }
  }
  return <form className="impact-export" onSubmit={download}><input className="field-input" maxLength="100" value={municipality} onChange={event => setMunicipality(event.target.value)} placeholder="Municipality (optional)" aria-label="Filter impact by municipality" /><input className="field-input" maxLength="100" value={barangay} onChange={event => setBarangay(event.target.value)} placeholder="Barangay (optional)" aria-label="Filter impact by barangay" /><button className="secondary-button" disabled={busy}>{busy ? 'Preparing CSV…' : 'Export impact CSV'}</button></form>;
}
