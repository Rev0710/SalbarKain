import { useCallback, useEffect, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import 'leaflet/dist/leaflet.css';
import { api } from '../utils/api.js';
import { ILOILO_CENTER, ILOILO_MAP_OPTIONS, isWithinIloilo } from '../utils/iloiloMap.js';

const TABS = [
  ['overview', 'Overview'], ['verifications', 'Permit verification'], ['flagged', 'Trust & safety'],
  ['ledger', 'MENRO impact ledger'], ['leaderboard', 'Zero-waste partners'],
];

function HeatLayer({ features }) {
  const map = useMap();
  useEffect(() => {
    const points = features.flatMap(feature => {
      const [lng, lat] = feature.geometry?.coordinates || [];
      return isWithinIloilo(lat, lng) ? [[lat, lng, Math.max(0.1, Math.min(1, Number(feature.properties?.weight || 1) / 50))]] : [];
    });
    const layer = L.heatLayer(points, { radius: 36, blur: 24, maxZoom: 16, gradient: { 0.15: '#F8FAFC', 0.55: '#D97706', 1: '#15803D' } }).addTo(map);
    return () => map.removeLayer(layer);
  }, [features, map]);
  return null;
}

function MapPins({ features }) {
  return features.map((feature, index) => {
    const [lng, lat] = feature.geometry?.coordinates || [];
    if (!isWithinIloilo(lat, lng)) return null;
    const point = [lat, lng];
    const info = feature.properties || {};
    return <CircleMarker key={`${info.storeName || 'partner'}-${index}`} center={point} radius={6} pathOptions={{ color: '#FFFFFF', weight: 2, fillColor: '#15803D', fillOpacity: 1 }}><Popup>{info.storeName || 'Food partner'} · {info.barangay || ''}, {info.municipality || ''}</Popup></CircleMarker>;
  });
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat('en-PH', { maximumFractionDigits: digits }).format(Number(value || 0));
}

function OfficerForm({ onCreated }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', municipality: 'Pavia' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await api.post('/admin/create-officer', form); setForm({ name: '', email: '', password: '', municipality: 'Pavia' }); onCreated(); }
    catch (err) { setError(err.response?.data?.message || 'Could not create this municipal officer.'); }
    finally { setBusy(false); }
  }
  return <details className="admin-officer-panel"><summary>Create municipal admin</summary><form className="admin-officer-form" onSubmit={submit}>
    <label className="field-label">Officer name<input className="field-input" required minLength="2" maxLength="100" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
    <label className="field-label">Email<input className="field-input" type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
    <label className="field-label">Temporary password<input className="field-input" type="password" minLength="10" required value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>
    <label className="field-label">Municipality<select className="field-select" value={form.municipality} onChange={e => setForm({ ...form, municipality: e.target.value })}>{['Iloilo City', 'Pavia', 'Santa Barbara', 'Oton', 'Leganes', 'Zarraga', 'Cabatuan', 'Pototan', 'Passi City', 'Miagao'].map(place => <option key={place}>{place}</option>)}</select></label>
    {error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button" disabled={busy}>{busy ? 'Creating…' : 'Create officer'}</button>
  </form></details>;
}

export default function AdminQueue({ session, onNotice }) {
  const [tab, setTab] = useState('overview'); const [overview, setOverview] = useState(null);
  const [applicants, setApplicants] = useState([]); const [flagged, setFlagged] = useState([]); const [leaderboard, setLeaderboard] = useState({ merchants: [], ngos: [] });
  const [selected, setSelected] = useState(null); const [documentUrl, setDocumentUrl] = useState(''); const [rejectionReason, setRejectionReason] = useState('');
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(''); const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [o, v, f, l] = await Promise.all([
        api.get('/admin/overview'), api.get('/admin/verifications'), api.get('/admin/flagged'), api.get('/admin/leaderboard'),
      ]);
      setOverview(o.data.data); setApplicants(v.data.data.applicants || []); setFlagged(f.data.data.batches || []); setLeaderboard(l.data.data || { merchants: [], ngos: [] });
    } catch (err) { setError(err.response?.data?.message || 'Admin command center could not load.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let active = true; setDocumentUrl('');
    if (selected?.hasVerificationDocument) api.get(`/admin/verifications/${selected.id}/document`).then(({ data }) => { if (active) setDocumentUrl(data.data.url); }).catch(() => { if (active) setDocumentUrl(''); });
    return () => { active = false; };
  }, [selected]);

  async function reviewApplicant(decision) {
    setBusy(selected.id);
    try { await api.patch(`/admin/verifications/${selected.id}`, { decision, rejectionReason }); setSelected(null); setRejectionReason(''); await load(); onNotice(decision === 'approve' ? 'Partner approved and enabled.' : 'Application rejected with a recorded reason.'); }
    catch (err) { onNotice(err.response?.data?.message || 'The application review could not be saved.'); }
    finally { setBusy(''); }
  }
  async function reviewFlag(batchId, action) {
    setBusy(batchId);
    try { await api.patch(`/admin/flagged/${batchId}`, { action }); await load(); onNotice(action === 'restore' ? 'Listing restored.' : 'Merchant suspended and active listings withdrawn.'); }
    catch (err) { onNotice(err.response?.data?.message || 'The flagged listing action could not be saved.'); }
    finally { setBusy(''); }
  }
  async function exportLedger() {
    try { const { data } = await api.get('/admin/export-menro', { responseType: 'blob' }); const url = URL.createObjectURL(data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'salbarkain-menro-impact.csv'; anchor.click(); URL.revokeObjectURL(url); }
    catch (err) { onNotice(err.response?.data?.message || 'MENRO export could not be downloaded.'); }
  }

  const jurisdiction = overview?.jurisdiction?.label || (session.assignedMunicipality === 'ALL' ? 'Iloilo Province (All LGUs)' : `Municipality of ${session.assignedMunicipality || 'Iloilo'}`);
  const kpis = overview?.kpis || {};
  return <main className="dashboard-shell admin-command-center">
    <header className="admin-command-header"><div><p className="eyebrow">Multi-LGU · MENRO command center</p><h1>SalbarKain Admin</h1><p>Verification, food rescue, and barangay impact for your jurisdiction.</p></div><span className="admin-jurisdiction">Jurisdiction: {jurisdiction}</span></header>
    <div className="admin-tabs" role="tablist" aria-label="Admin command center sections">{TABS.map(([key, label]) => <button key={key} role="tab" aria-selected={tab === key} className={`filter-pill ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button>)}<button className="secondary-button" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    {error && <p className="alert-banner" role="alert">{error}</p>}
    {tab === 'overview' && <>
      <section className="admin-kpi-grid">{[
        ['Meals rescued', `${formatNumber(kpis.mealsSaved)} packs`], ['Food diverted', `${formatNumber(kpis.foodDivertedKg, 1)} kg`], ['CO₂e prevented', `${formatNumber(kpis.co2PreventedKg, 1)} kg`],
        ['Verified merchants', formatNumber(kpis.verifiedMerchantsCount)], ['Pending reviews', formatNumber(kpis.pendingReviewsCount)], ['Flagged listings', formatNumber(kpis.flaggedCount)],
      ].map(([label, value]) => <article className="panel admin-kpi" key={label}><span>{label}</span><strong>{value}</strong></article>)}</section>
      <section className="panel admin-map-panel"><div><h2>Iloilo waste and rescue heatmap</h2><p className="panel-subtitle">Merchant rescue and active surplus activity inside Iloilo Province.</p></div><MapContainer center={ILOILO_CENTER} zoom={13} {...ILOILO_MAP_OPTIONS} scrollWheelZoom={false} className="admin-command-map"><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><HeatLayer features={overview?.heatmap?.features || []} /><MapPins features={overview?.heatmap?.features || []} /></MapContainer></section>
      {overview?.jurisdiction?.assignedMunicipality === 'ALL' && <OfficerForm onCreated={async () => { await load(); onNotice('Municipal admin account created.'); }} />}
    </>}
    {tab === 'verifications' && <section className="admin-review-grid"><section className="panel"><h2>KYB verification queue <span className="admin-count">{applicants.length}</span></h2>{applicants.length ? applicants.map(user => <button key={user.id} className={`admin-applicant ${selected?.id === user.id ? 'selected' : ''}`} onClick={() => { setSelected(user); setRejectionReason(''); }}><strong>{user.storeName || user.organizationName}</strong><span>{user.role} · {user.verificationStatus}</span><small>{user.barangay}, {user.municipality}</small></button>) : <div className="empty-state"><h2>Queue is clear</h2><p>New pending applications in your jurisdiction appear here.</p></div>}</section><section className="panel"><h2>Application review</h2>{!selected ? <p className="panel-subtitle">Select an application to inspect its document, storefront, and location.</p> : <><div className="admin-details"><div><strong>{selected.storeName || selected.organizationName}</strong><p>{selected.name} · {selected.role}</p><p>{selected.email}{selected.phone ? ` · ${selected.phone}` : ''}</p><p>{selected.address}</p><p>{selected.barangay}, {selected.municipality}</p>{selected.storefrontPhotoUrl && <img className="storefront-preview" src={selected.storefrontPhotoUrl} alt="Submitted storefront" />}</div><div className="permit-viewer">{documentUrl ? <iframe title="Private verification document" src={documentUrl} /> : <p>{selected.hasVerificationDocument ? 'Opening submitted document…' : 'No verification file attached.'}</p>}</div></div>{selected.verificationStatus === 'rejected' && selected.rejectionReason && <p className="form-note">Previous reason: {selected.rejectionReason}</p>}<label className="field-label admin-rejection-label">Rejection reason<textarea className="field-input" maxLength="300" value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} placeholder="Required when rejecting" /></label><div className="flex gap-2 mt-4"><button className="primary-button" disabled={busy === selected.id || !selected.hasVerificationDocument} onClick={() => reviewApplicant('approve')}>Approve partner</button><button className="secondary-button" disabled={busy === selected.id || rejectionReason.trim().length < 3} onClick={() => reviewApplicant('reject')}>Reject</button></div></>}</section></section>}
    {tab === 'flagged' && <section className="panel"><h2>Flagged listings and safety strikes</h2><p className="panel-subtitle">Review listings hidden by community reports or food-safety reports.</p>{flagged.length ? <div className="inventory-list">{flagged.map(batch => <article key={batch._id} className="inventory-row"><img src={batch.photoUrl} alt="" /><div><h3>{batch.itemName}</h3><p>{batch.merchantId?.storeName || 'Local food partner'} · {batch.merchantId?.barangay}, {batch.merchantId?.municipality}</p><p>{batch.foodSafetyFlagged ? `${batch.spoilageReportCount} food-safety reports` : `${batch.reportCount} community reports`} · {formatNumber(batch.remainingQty)} portions</p></div><div className="admin-flag-actions"><button className="primary-button compact" disabled={busy === batch._id} onClick={() => reviewFlag(batch._id, 'restore')}>Restore</button><button className="secondary-button compact" disabled={busy === batch._id} onClick={() => reviewFlag(batch._id, 'suspend')}>Suspend merchant</button></div></article>)}</div> : <div className="empty-state"><h2>No flagged listings</h2><p>Nothing hidden in this jurisdiction needs review.</p></div>}</section>}
    {tab === 'ledger' && <section className="panel"><div className="admin-ledger-heading"><div><h2>MENRO barangay impact ledger</h2><p className="panel-subtitle">Completed rescues grouped by municipality and barangay.</p></div><button className="primary-button" onClick={exportLedger}>Download MENRO CSV</button></div>{overview?.ledger?.length ? <div className="admin-table-wrap"><table className="admin-impact-table"><thead><tr><th>Municipality</th><th>Barangay</th><th>Meals rescued</th><th>Food diverted (kg)</th><th>CO₂e prevented (kg)</th></tr></thead><tbody>{overview.ledger.map(row => <tr key={`${row.municipality}-${row.barangay}`}><td>{row.municipality}</td><td>{row.barangay}</td><td>{formatNumber(row.mealsSaved)}</td><td>{formatNumber(row.foodDivertedKg, 2)}</td><td>{formatNumber(row.co2PreventedKg, 2)}</td></tr>)}</tbody></table></div> : <div className="empty-state"><h2>No completed rescues yet</h2><p>Rescue totals will appear here after pickup passes are verified.</p></div>}</section>}
    {tab === 'leaderboard' && <div className="admin-leaderboard-grid">{[['Zero-waste merchants · 50+ rescued packs', leaderboard.merchants, 'storeName'], ['Community NGOs · 100+ rescued packs', leaderboard.ngos, 'name']].map(([title, rows, label]) => <section className="panel" key={title}><h2>{title}</h2>{rows.length ? <ol className="admin-leaderboard">{rows.map((row, index) => <li key={row.id}><span className="admin-rank">{index + 1}</span><div><strong>{row[label]}</strong><small>{row.barangay}, {row.municipality}</small></div><b>{formatNumber(row.rescues)} packs</b></li>)}</ol> : <div className="empty-state"><p>No partners have reached this recognition tier in this jurisdiction yet.</p></div>}</section>)}</div>}
  </main>;
}
