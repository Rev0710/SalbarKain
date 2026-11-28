import { Component, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CircleMarker, MapContainer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { api } from '../utils/api.js';
import { ILOILO_CENTER, ILOILO_MAP_OPTIONS, isWithinIloilo } from '../utils/iloiloMap.js';
import ReliableTileLayer from '../components/ReliableTileLayer.jsx';
import OfflineIloiloLayer from '../components/OfflineIloiloLayer.jsx';
import { safeImageUrl } from '../utils/safeImageUrl.js';

const TABS = [
  ['overview', 'Municipal overview'], ['verifications', 'KYB & account status'], ['flagged', 'Trust & safety'],
  ['ledger', 'MENRO impact ledger'], ['leaderboard', 'Zero-waste partners'], ['officers', 'LGU Officers'],
];
const ACCOUNT_FILTERS = [
  ['pending', 'Pending review'], ['verified', 'Verified'], ['rejected-suspended', 'Rejected / suspended'], ['all', 'All accounts'],
];
const emptyLeaderboard = () => ({ merchants: [], ngos: [] });
const asArray = (value) => Array.isArray(value) ? value : [];
const asObject = (value) => value && typeof value === 'object' && !Array.isArray(value) ? value : {};
const asText = (value, fallback = '—') => typeof value === 'string' && value.trim() ? value : fallback;
const delay = (ms) => new Promise(resolve => window.setTimeout(resolve, ms));

function responseData(response) { return asObject(asObject(response?.data).data); }
function isAuthError(error) { return [401, 403].includes(error?.response?.status); }
function isWakeError(error) { return !error?.response || [502, 503, 504].includes(error.response.status); }

function MapPins({ features }) {
  return asArray(features).map((feature, index) => {
    const coordinates = asArray(feature?.geometry?.coordinates);
    const lng = Number(coordinates[0]); const lat = Number(coordinates[1]);
    if (!isWithinIloilo(lat, lng)) return null;
    const info = asObject(feature?.properties);
    const icon = L.divIcon({ className: 'iloilo-map-pin-wrap', html: '<span class="iloilo-map-pin" aria-hidden="true"><svg viewBox="0 0 28 36"><path d="M14 1C6.82 1 1 6.82 1 14c0 9.25 13 21 13 21s13-11.75 13-21C27 6.82 21.18 1 14 1Z"/><circle cx="14" cy="14" r="5"/></svg></span>', iconSize: [30, 40], iconAnchor: [15, 38], popupAnchor: [0, -35] });
    return <Marker key={`${asText(info.storeName, 'partner')}-${index}`} position={[lat, lng]} icon={icon}><Popup>{asText(info.storeName, 'Food partner')} · {asText(info.barangay, '')}, {asText(info.municipality, '')}</Popup></Marker>;
  });
}

function HotspotCircles({ features }) {
  return asArray(features).map((feature, index) => {
    const coordinates = asArray(feature?.geometry?.coordinates);
    const lng = Number(coordinates[0]); const lat = Number(coordinates[1]);
    if (!isWithinIloilo(lat, lng)) return null;
    const weight = Math.max(1, Number(feature?.properties?.weight) || 1);
    return <CircleMarker key={`hotspot-${index}`} center={[lat, lng]} radius={Math.min(15, 5 + Math.sqrt(weight))} pathOptions={{ color: '#D97706', weight: 1.5, fillColor: '#D97706', fillOpacity: 0.22 }} interactive={false} />;
  });
}

function RefreshOverviewMap() {
  const map = useMap();
  useEffect(() => {
    let frame;
    const refresh = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refresh);
    observer?.observe(map.getContainer());
    window.addEventListener('resize', refresh);
    refresh();
    return () => { window.cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', refresh); };
  }, [map]);
  return null;
}

function FocusMapArea({ area }) {
  const map = useMap();
  useEffect(() => {
    if (Array.isArray(area?.coordinates) && area.coordinates.length === 2 && area.coordinates.every(Number.isFinite)) {
      map.flyTo(area.coordinates, 14, { duration: 0.45 });
    }
  }, [area, map]);
  return null;
}

function formatNumber(value, digits = 0) {
  const numeric = Number(value);
  return new Intl.NumberFormat('en-PH', { maximumFractionDigits: digits }).format(Number.isFinite(numeric) ? numeric : 0);
}

class AdminMapBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { console.error('Admin heatmap failed:', error?.message || 'Unknown map error'); }
  render() {
    if (this.state.failed) return this.props.fallback || <div className="empty-state admin-map-empty" role="status"><h3>Iloilo map is unavailable</h3><p>The Barangay Grid is still available for this overview.</p></div>;
    return this.props.children;
  }
}

function AdminSkeleton() {
  return <div className="admin-skeleton" aria-label="Loading admin command center" aria-busy="true"><div className="admin-skeleton-kpis">{[1, 2, 3, 4].map(item => <div key={item} className="admin-skeleton-block" />)}</div><div className="admin-skeleton-block admin-skeleton-content" /><div className="admin-skeleton-block admin-skeleton-content" /></div>;
}

function LguInviteManager({ onNotice }) {
  const municipalities = ['Iloilo City', 'Pavia', 'Santa Barbara', 'Oton', 'Leganes', 'Zarraga', 'Cabatuan', 'Pototan', 'Passi City', 'Miagao', 'Other Iloilo Municipality'];
  const [form, setForm] = useState({ officerName: '', email: '', assignedMunicipality: 'Pavia' });
  const [officers, setOfficers] = useState([]); const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [invite, setInvite] = useState(null); const [copied, setCopied] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { const { data } = await api.get('/admin/lgu-officers'); setOfficers(asArray(data?.data?.officers)); setError(''); }
    catch (requestError) { setError(requestError.response?.data?.message || 'Municipal LGU officers could not be loaded.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(''); setInvite(null);
    try {
      const { data } = await api.post('/admin/invite-lgu', form);
      setInvite(data?.data || null); setForm(current => ({ ...current, officerName: '', email: '' }));
      await load();
      onNotice(data?.data?.emailSent ? 'LGU invitation email sent.' : 'Invite created. Copy the activation link to share it securely.');
    } catch (requestError) { setError(requestError.response?.data?.message || 'The LGU invitation could not be created.'); }
    finally { setBusy(false); }
  }
  async function copyLink() {
    try { await navigator.clipboard.writeText(invite.inviteUrl); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }
    catch { setError('Copy was blocked by the browser. Select and copy the activation link below.'); }
  }
  return <div className="admin-invite-layout">
    <section className="panel"><h2>Invite a municipal LGU admin</h2><p className="panel-subtitle">Only the Provincial Super-Admin can issue these one-time invitations. The officer sets their own password from the link, which expires after 24 hours.</p>
      <form className="admin-officer-form" onSubmit={submit}>
        <label className="field-label">Officer / office name<input className="field-input" required minLength="2" maxLength="100" value={form.officerName} onChange={event => setForm({ ...form, officerName: event.target.value })} /></label>
        <label className="field-label">Official email<input className="field-input" type="email" required maxLength="254" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>
        <label className="field-label">Assigned Iloilo municipality<select className="field-select" value={form.assignedMunicipality} onChange={event => setForm({ ...form, assignedMunicipality: event.target.value })}>{municipalities.map(place => <option key={place} value={place}>{place}</option>)}</select></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button" type="submit" disabled={busy}>{busy ? 'Creating secure invite…' : 'Send LGU Invite'}</button>
      </form>
      {invite?.inviteUrl && <div className="lgu-invite-confirmation" role="status"><strong>{invite.emailSent ? 'Invite email sent via SMTP.' : 'Invite is ready to share.'}</strong><p>{invite.message}</p><div className="lgu-invite-copy-row"><input aria-label="LGU activation link" className="field-input" readOnly value={invite.inviteUrl} onFocus={event => event.target.select()} /><button className="secondary-button" type="button" onClick={copyLink}>{copied ? 'Copied' : 'Copy activation link'}</button></div><small>Single-use · expires {new Date(invite.officer?.inviteExpires).toLocaleString()}</small></div>}
    </section>
    <section className="panel"><div className="admin-ledger-heading"><div><h2>Municipal LGU officers</h2><p className="panel-subtitle">Pending invitations and active municipal admin accounts across Iloilo.</p></div><button className="secondary-button compact" type="button" onClick={load} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh list'}</button></div>
      {loading ? <p className="panel-subtitle" role="status">Loading municipal admins…</p> : officers.length ? <div className="admin-account-list">{officers.map(officer => { const status = officer.verificationStatus === 'verified' ? 'Active' : officer.inviteExpires && new Date(officer.inviteExpires) < new Date() ? 'Invite expired' : 'Pending activation'; return <article className="admin-account-row" key={officer.id}><div className="admin-account-main"><strong>{asText(officer.officerName, 'LGU officer')}</strong><span>{asText(officer.email)} · {asText(officer.assignedMunicipality)}</span><small>{officer.createdAt ? `Added ${new Date(officer.createdAt).toLocaleDateString()}` : 'Date unavailable'}</small></div><span className={`admin-status-badge ${status === 'Active' ? 'verified' : 'pending'}`}>{status}</span></article>; })}</div> : <div className="empty-state"><h3>No municipal officers yet</h3><p>Invited officers will appear here until they activate their accounts.</p></div>}
    </section>
  </div>;
}
function statusLabel(value) {
  const status = value === 'verified' ? 'verified' : ['rejected', 'suspended'].includes(value) ? value : 'pending';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function VerificationDialog({ user, documentUrl, rejectionReason, setRejectionReason, busy, onClose, onDecision }) {
  if (!user) return null;
  const organization = asText(user.storeName || user.organizationName, 'Partner account');
  return <div className="overlay admin-modal-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="dialog admin-verification-modal" role="dialog" aria-modal="true" aria-labelledby="admin-review-title">
      <button className="close-button" onClick={onClose} aria-label="Close application review">×</button>
      <p className="eyebrow">KYB application review</p><h2 id="admin-review-title">{organization}</h2>
      <div className="admin-modal-details"><div><span className="status-tag">{statusLabel(user.verificationStatus)}</span><p><strong>{asText(user.role)}</strong> · {asText(user.name)}</p><p>{asText(user.email)}{user.phone ? ` · ${user.phone}` : ''}</p><p>{asText(user.address)}</p><p>{asText(user.barangay, 'Unspecified')}, {asText(user.municipality, 'Unspecified')}</p><p>Registered {user.createdAt && Number.isFinite(new Date(user.createdAt).getTime()) ? new Date(user.createdAt).toLocaleDateString() : 'date unavailable'}</p>
        {safeImageUrl(user.storefrontPhotoUrl) && <a href={safeImageUrl(user.storefrontPhotoUrl)} target="_blank" rel="noreferrer"><img className="storefront-preview" src={safeImageUrl(user.storefrontPhotoUrl)} alt={`Storefront for ${organization}`} /></a>}
      </div><div className="permit-viewer"><h3>Permit / verification document</h3>{documentUrl ? <><a className="secondary-button compact" href={documentUrl} target="_blank" rel="noreferrer">Open document in new tab</a><iframe title="Private verification document" src={documentUrl} />{documentUrl.match(/\.(png|jpe?g|webp)(\?|$)/i) && <a href={documentUrl} target="_blank" rel="noreferrer"><img className="admin-permit-image" src={documentUrl} alt="Uploaded verification document" /></a>}</> : <p>{user.hasVerificationDocument ? 'Loading the private document…' : 'No verification document was attached.'}</p>}</div></div>
      <label className="field-label admin-rejection-label">Reason for rejection or suspension<textarea className="field-input" maxLength="300" value={rejectionReason} onChange={event => setRejectionReason(event.target.value)} placeholder="Required to reject; optional to suspend" /></label>
      <div className="admin-modal-actions"><button className="primary-button" disabled={busy || !user.hasVerificationDocument} onClick={() => onDecision('approve')}>Approve & verify</button><button className="secondary-button" disabled={busy || rejectionReason.trim().length < 3} onClick={() => onDecision('reject')}>Reject application</button><button className="secondary-button admin-suspend-button" disabled={busy} onClick={() => onDecision('suspend')}>Suspend account</button></div>
    </section>
  </div>;
}

export default function AdminQueue({ session = {}, onNotice = () => {} }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [overviewMapView, setOverviewMapView] = useState('map');
  const [focusedArea, setFocusedArea] = useState(null);
  const [overview, setOverview] = useState({});
  const [verifications, setVerifications] = useState([]);
  const [flaggedBatches, setFlaggedBatches] = useState([]);
  const [activeBatches, setActiveBatches] = useState([]);
  const [activeBatchesAvailable, setActiveBatchesAvailable] = useState(false);
  const [menroStats, setMenroStats] = useState([]);
  const [leaderboard, setLeaderboard] = useState(emptyLeaderboard);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [selected, setSelected] = useState(null); const [documentUrl, setDocumentUrl] = useState(''); const [rejectionReason, setRejectionReason] = useState('');
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [waking, setWaking] = useState(false);

  const load = useCallback(async ({ manual = false } = {}) => {
    setLoading(true); setError(''); setWaking(false);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const [overviewResponse, verificationsResponse, flaggedResponse, leaderboardResponse, batchResponse] = await Promise.all([
          api.get('/admin/overview'), api.get('/admin/verifications?status=all'), api.get('/admin/flagged'), api.get('/admin/leaderboard'),
          api.get('/batches', { params: { limit: 100 } }).catch(() => null),
        ]);
        const overviewData = responseData(overviewResponse);
        const verificationData = responseData(verificationsResponse);
        const flaggedData = responseData(flaggedResponse);
        const leaderboardData = responseData(leaderboardResponse);
        const batchData = responseData(batchResponse);
        const ledger = asArray(overviewData.ledger);
        const features = asArray(overviewData.heatmap?.features).filter(feature => feature?.geometry?.type === 'Point');
        setOverview({ ...overviewData, ledger, heatmap: { ...asObject(overviewData.heatmap), features } });
        setMenroStats(ledger);
        setVerifications(asArray(verificationData.applicants));
        setFlaggedBatches(asArray(flaggedData.batches));
        setActiveBatches(asArray(batchData.batches));
        setActiveBatchesAvailable(Boolean(batchResponse));
        setLeaderboard({ merchants: asArray(leaderboardData.merchants), ngos: asArray(leaderboardData.ngos) });
        setLoading(false); setWaking(false); return true;
      } catch (loadError) {
        if (isAuthError(loadError)) { setLoading(false); navigate('/login', { replace: true }); return false; }
        if (isWakeError(loadError) && attempt === 0) { setWaking(true); await delay(1700); continue; }
        setError(isWakeError(loadError)
          ? 'The LGU server is still waking up. Please retry in a moment.'
          : loadError?.response?.data?.message || 'Admin command center could not load.');
        setLoading(false); setWaking(false); return false;
      }
    }
    setLoading(false); return false;
  }, [navigate]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    let active = true; setDocumentUrl('');
    if (selected?.hasVerificationDocument && selected.id) {
      api.get(`/admin/verifications/${encodeURIComponent(selected.id)}/document`).then(({ data }) => {
        if (active) setDocumentUrl(typeof data?.data?.url === 'string' ? data.data.url : '');
      }).catch(() => { if (active) setDocumentUrl(''); });
    }
    return () => { active = false; };
  }, [selected]);

  async function reviewApplicant(decision) {
    if (!selected?.id) return;
    setBusy(selected.id);
    try {
      await api.patch(`/admin/verifications/${encodeURIComponent(selected.id)}`, { decision, rejectionReason: rejectionReason.trim() });
      setSelected(null); setRejectionReason(''); await load();
      onNotice(decision === 'approve' ? 'Partner verified and enabled.' : decision === 'suspend' ? 'Account suspended; active listings withdrawn.' : 'Application rejected with a recorded reason.');
    } catch (actionError) { onNotice(actionError.response?.data?.message || 'The account status could not be saved.'); }
    finally { setBusy(''); }
  }

  async function reviewFlag(batchId, action) {
    if (!batchId) return;
    setBusy(batchId);
    try { await api.patch(`/admin/flagged/${encodeURIComponent(batchId)}`, { action }); await load(); onNotice(action === 'restore' ? 'Listing restored.' : 'Merchant suspended and active listings withdrawn.'); }
    catch (actionError) { onNotice(actionError.response?.data?.message || 'The flagged listing action could not be saved.'); }
    finally { setBusy(''); }
  }

  async function setCertification(row, certified) {
    if (!row?.id) return;
    setBusy(row.id);
    try { await api.patch(`/admin/leaderboard/${encodeURIComponent(row.id)}/certification`, { certified }); await load(); onNotice(certified ? 'Zero-waste recognition issued.' : 'Zero-waste recognition revoked.'); }
    catch (actionError) { onNotice(actionError.response?.data?.message || 'Recognition status could not be changed.'); }
    finally { setBusy(''); }
  }

  async function exportLedger() {
    try {
      const { data } = await api.get('/admin/export-menro', { responseType: 'blob' });
      const url = URL.createObjectURL(data); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'salbarkain-menro-impact.csv'; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (exportError) { onNotice(exportError.response?.data?.message || 'MENRO export could not be downloaded.'); }
  }

  const jurisdiction = asText(overview.jurisdiction?.label, session.assignedMunicipality === 'ALL' || !session.assignedMunicipality ? 'Iloilo Province (All LGUs)' : `Municipality of ${session.assignedMunicipality}`);
  const kpis = asObject(overview.kpis); const features = asArray(overview.heatmap?.features);
  const pendingCount = Number(kpis.pendingReviewsCount ?? verifications.filter(user => (user?.verificationStatus || (user?.verified ? 'verified' : 'pending')) === 'pending').length) || 0;
  const safetyReviewCount = flaggedBatches.filter(batch => batch?.foodSafetyFlagged).length;
  const scopedActiveBatches = activeBatches.filter(batch => session.assignedMunicipality === 'ALL' || !session.assignedMunicipality || String(batch?.merchantId?.municipality || '').trim().toLowerCase() === String(session.assignedMunicipality).trim().toLowerCase());
  const barangayRows = useMemo(() => {
    const rows = new Map();
    for (const item of asArray(menroStats)) {
      const barangay = asText(item?.barangay, 'Unspecified');
      const municipality = asText(item?.municipality, 'Iloilo Province');
      const key = `${municipality.toLowerCase()}|${barangay.toLowerCase()}`;
      rows.set(key, { key, barangay, municipality, mealsSaved: Number(item?.mealsSaved) || 0, foodDivertedKg: Number(item?.foodDivertedKg) || 0, activeStores: 0, coordinates: null });
    }
    for (const feature of features) {
      const props = asObject(feature?.properties);
      const coordinates = asArray(feature?.geometry?.coordinates);
      const lng = Number(coordinates[0]); const lat = Number(coordinates[1]);
      const barangay = asText(props.barangay, 'Unspecified');
      const municipality = asText(props.municipality, 'Iloilo Province');
      const key = `${municipality.toLowerCase()}|${barangay.toLowerCase()}`;
      if (!rows.has(key)) rows.set(key, { key, barangay, municipality, mealsSaved: 0, foodDivertedKg: 0, activeStores: 0, coordinates: null });
      if (!rows.get(key).coordinates && isWithinIloilo(lat, lng)) rows.get(key).coordinates = [lat, lng];
    }
    for (const batch of scopedActiveBatches) {
      const barangay = asText(batch?.merchantId?.barangay, 'Unspecified');
      const municipality = asText(batch?.merchantId?.municipality, 'Iloilo Province');
      const key = `${municipality.toLowerCase()}|${barangay.toLowerCase()}`;
      if (!rows.has(key)) rows.set(key, { key, barangay, municipality, mealsSaved: 0, foodDivertedKg: 0, activeStores: 0, coordinates: null });
      const coordinates = asArray(batch?.merchantId?.location?.coordinates);
      if (!rows.get(key).coordinates && coordinates.length === 2 && isWithinIloilo(Number(coordinates[1]), Number(coordinates[0]))) rows.get(key).coordinates = [Number(coordinates[1]), Number(coordinates[0])];
      const activeMerchantIds = rows.get(key).activeMerchantIds || new Set();
      activeMerchantIds.add(String(batch?.merchantId?._id || batch?.merchantId?.id || batch?.merchantId?.storeName || ''));
      rows.get(key).activeMerchantIds = activeMerchantIds;
    }
    return [...rows.values()].map(row => ({ ...row, activeStores: row.activeMerchantIds?.size || 0 })).sort((a, b) => b.foodDivertedKg - a.foodDivertedKg || b.activeStores - a.activeStores).slice(0, 6);
  }, [menroStats, features, scopedActiveBatches]);
  const maxBarangayKg = Math.max(1, ...barangayRows.map(row => row.foodDivertedKg));
  const filteredAccounts = useMemo(() => verifications.filter(user => {
    const status = user?.verificationStatus || (user?.verified ? 'verified' : 'pending');
    if (statusFilter === 'rejected-suspended') return status === 'rejected' || status === 'suspended';
    return statusFilter === 'all' || status === statusFilter;
  }), [verifications, statusFilter]);

  return <main className="dashboard-shell admin-command-center">
    <header className="admin-command-header"><div><p className="eyebrow">Multi-LGU · MENRO command center</p><h1>SalbarKain Admin</h1><p>Verification, food rescue, and barangay impact for your jurisdiction.</p></div><span className="admin-jurisdiction">Jurisdiction: {jurisdiction}</span></header>
    <div className="admin-tabs" role="tablist" aria-label="Admin command center sections">{TABS.filter(([key]) => key !== 'officers' || session.assignedMunicipality === 'ALL').map(([key, label]) => { const count = key === 'verifications' ? pendingCount : key === 'flagged' ? flaggedBatches.length : 0; return <button key={key} type="button" role="tab" aria-selected={tab === key} className={`filter-pill ${tab === key ? 'active' : ''}`} onClick={() => { if (key === 'verifications') setStatusFilter('pending'); setTab(key); }}><span>{label}</span>{count > 0 && <span className="admin-tab-count" aria-label={`${count} items need review`}>{formatNumber(count)}</span>}</button>; })}<button type="button" className="secondary-button" onClick={() => load({ manual: true })} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh'}</button></div>
    {waking && <div className="alert-banner admin-wake-banner" role="status"><span>Waking up LGU server—retrying…</span><button className="secondary-button compact" onClick={() => load({ manual: true })} disabled={loading}>Retry now</button></div>}
    {error && <div className="alert-banner admin-error-banner" role="alert"><span>{error}</span><button className="secondary-button compact" onClick={() => load({ manual: true })} disabled={loading}>Retry</button></div>}
    {loading ? <AdminSkeleton /> : <>
      {tab === 'overview' && <>
        <section className="admin-kpi-grid">
          <article className="panel admin-kpi"><span>Total meals rescued</span><strong>{formatNumber(kpis.mealsSaved)} packs</strong><small className="admin-kpi-note admin-kpi-positive">+100% landfill diverted</small></article>
          <article className="panel admin-kpi"><span>Food waste diverted</span><strong>{formatNumber(kpis.foodDivertedKg, 1)} kg</strong><small className="admin-kpi-note">RA 9003 organic diversion tally</small></article>
          <article className="panel admin-kpi"><span>CO₂e prevented</span><strong>{formatNumber(kpis.co2PreventedKg, 1)} kg</strong><small className="admin-kpi-note">UNEP 1.25 kg CO₂e / pack factor</small></article>
          <button type="button" className={`panel admin-kpi admin-kpi-action ${pendingCount > 0 ? 'is-pending' : ''}`} disabled={pendingCount === 0} onClick={() => { setStatusFilter('pending'); setTab('verifications'); }}><span>Pending KYB approvals</span><strong>{formatNumber(pendingCount)}</strong><small className="admin-kpi-note">{pendingCount > 0 ? 'Review now →' : 'No applications waiting'}</small></button>
        </section>

        <section className="admin-intelligence-grid">
          <article className="panel admin-intelligence-map">
            <div className="admin-intelligence-heading"><div><p className="eyebrow">Municipal intelligence</p><h2>Iloilo food rescue & surplus map</h2><p className="panel-subtitle">Verified partner locations and rescue activity inside your jurisdiction.</p></div><div className="admin-map-toggle" role="group" aria-label="Overview map display"><button type="button" className={overviewMapView === 'map' ? 'active' : ''} aria-pressed={overviewMapView === 'map'} onClick={() => setOverviewMapView('map')}>Heatmap & pins</button><button type="button" className={overviewMapView === 'grid' ? 'active' : ''} aria-pressed={overviewMapView === 'grid'} onClick={() => setOverviewMapView('grid')}>Barangay grid</button></div></div>
            {overviewMapView === 'map' ? <AdminMapBoundary fallback={<div className="admin-barangay-grid" role="status"><p className="admin-grid-note">Live map is unavailable right now. Iloilo rescue data remains available below.</p>{barangayRows.length ? barangayRows.map(row => <article key={row.key}><div><strong>{row.barangay}</strong><span>{row.municipality}</span></div><b>{formatNumber(row.foodDivertedKg, 1)} kg</b></article>) : <p className="admin-grid-note">No barangay activity has been recorded yet. The overview and export remain available.</p>}</div>}><div className="admin-command-map-wrap"><MapContainer center={focusedArea?.coordinates || ILOILO_CENTER} zoom={focusedArea?.coordinates ? 14 : 12} {...ILOILO_MAP_OPTIONS} scrollWheelZoom={false} className="admin-command-map"><OfflineIloiloLayer /><ReliableTileLayer /><RefreshOverviewMap /><FocusMapArea area={focusedArea} /><HotspotCircles features={features} /><MapPins features={features} /></MapContainer>{!features.length && <div className="admin-map-empty-note">No partner coordinates yet · showing the Iloilo offline guide</div>}</div></AdminMapBoundary> : <div className="admin-barangay-grid">{barangayRows.length ? barangayRows.map(row => <button type="button" className="admin-grid-cell" key={row.key} onClick={() => { setFocusedArea(row); setOverviewMapView('map'); }}><div><strong>{row.barangay}</strong><span>{row.municipality}</span></div><b>{formatNumber(row.foodDivertedKg, 1)} kg</b><div className="admin-grid-bar-track"><span style={{ width: `${Math.max(row.foodDivertedKg ? 7 : 0, row.foodDivertedKg / maxBarangayKg * 100)}%` }} /></div><small>{formatNumber(row.mealsSaved)} packs rescued · {activeBatchesAvailable ? formatNumber(row.activeStores) : '—'} active stores</small><span className="admin-grid-open">View on map →</span></button>) : <div className="admin-grid-empty"><h3>No barangay activity yet</h3><p>Rescue totals and verified storefronts will appear here as partners use the network.</p></div>}</div>}
            <div className="admin-map-legend"><span><i className="admin-legend-pin" /> Verified partner</span><span><i className="admin-legend-hotspot" /> Rescue hotspot</span><span>{formatNumber(features.length)} partner locations</span></div>
          </article>

          <aside className="admin-intelligence-side">
            <section className="panel admin-breakdown-card"><div className="admin-section-heading"><div><p className="eyebrow">Area performance</p><h2>Barangay impact breakdown</h2></div><span className="admin-count">Top {barangayRows.length}</span></div>{barangayRows.length ? <ol className="admin-breakdown-list">{barangayRows.map((row, index) => <li key={row.key}><div className="admin-breakdown-top"><span className="admin-breakdown-rank">{index + 1}</span><div><strong>{row.barangay}</strong><small>{row.municipality}</small></div><b>{formatNumber(row.foodDivertedKg, 1)} kg</b></div><div className="admin-grid-bar-track"><span style={{ width: `${Math.max(row.foodDivertedKg ? 7 : 0, row.foodDivertedKg / maxBarangayKg * 100)}%` }} /></div><small className="admin-breakdown-meta">{activeBatchesAvailable ? formatNumber(row.activeStores) : '—'} active stores · {formatNumber(row.mealsSaved)} packs rescued</small></li>)}</ol> : <div className="admin-grid-empty"><p>No barangay rescue records yet. The list fills as pickups are verified.</p></div>}</section>

            <section className="panel admin-action-card"><div><p className="eyebrow">For action</p><h2>LGU priority alerts</h2></div><ul className="admin-action-list"><li><span className={`admin-action-dot ${pendingCount ? 'urgent' : ''}`} /><div><strong>{pendingCount ? `${formatNumber(pendingCount)} merchant / NGO KYB ${pendingCount === 1 ? 'permit awaits' : 'permits await'} review` : 'No KYB permits awaiting review'}</strong><small>{pendingCount ? 'Account verification is needed before approved partners can post.' : 'Verification queue is clear.'}</small></div>{pendingCount > 0 && <button type="button" onClick={() => { setStatusFilter('pending'); setTab('verifications'); }}>Review</button>}</li><li><span className={`admin-action-dot ${safetyReviewCount ? 'urgent' : ''}`} /><div><strong>{safetyReviewCount ? `${formatNumber(safetyReviewCount)} listing${safetyReviewCount === 1 ? '' : 's'} need food-safety review` : '0 active food-safety alerts'}</strong><small>{safetyReviewCount ? 'Open Trust & Safety to inspect reported listings.' : 'No active food-safety reports require action.'}</small></div>{safetyReviewCount > 0 && <button type="button" onClick={() => setTab('flagged')}>Review</button>}</li></ul><div className="admin-export-action"><div><strong>RA 9003 MENRO report</strong><small>Download current jurisdiction totals as a CSV file.</small></div><button type="button" className="primary-button compact" onClick={exportLedger}>Export CSV</button></div></section>
          </aside>
        </section>
      </>}

      {tab === 'verifications' && <section className="panel"><div className="admin-ledger-heading"><div><h2>KYB documents & account status</h2><p className="panel-subtitle">Review submitted documents and manage partner access within your jurisdiction.</p></div><span className="admin-count">{filteredAccounts.length} accounts</span></div><div className="admin-status-filters" role="group" aria-label="Filter accounts by status">{ACCOUNT_FILTERS.map(([key, label]) => <button key={key} type="button" className={`filter-pill ${statusFilter === key ? 'active' : ''}`} aria-pressed={statusFilter === key} onClick={() => setStatusFilter(key)}>{label}</button>)}</div>
        {filteredAccounts.length ? <div className="admin-account-list">{filteredAccounts.map((user, index) => <article className="admin-account-row" key={user?.id || `account-${index}`}><div className="admin-account-main"><strong>{asText(user?.storeName || user?.organizationName, asText(user?.name, 'Partner account'))}</strong><span>{user?.role === 'ngo' ? 'NGO / shelter' : user?.role === 'merchant' ? 'Merchant' : 'Partner'} · {asText(user?.municipality, 'Municipality unavailable')} · {asText(user?.barangay, 'Barangay unavailable')}</span><small>{user?.createdAt && Number.isFinite(new Date(user.createdAt).getTime()) ? `Registered ${new Date(user.createdAt).toLocaleDateString()}` : 'Registration date unavailable'}</small></div><span className={`admin-status-badge ${user?.verificationStatus || (user?.verified ? 'verified' : 'pending')}`}>{statusLabel(user?.verificationStatus || (user?.verified ? 'verified' : 'pending'))}</span><button type="button" className="secondary-button compact" onClick={() => { setSelected(user); setRejectionReason(''); }}>Review permit & status</button></article>)}</div> : <div className="empty-state"><h2>No accounts in this status</h2><p>Choose another filter or refresh the admin workspace.</p></div>}</section>}

      {tab === 'flagged' && <section className="panel"><h2>Trust, safety & flagged listings</h2><p className="panel-subtitle">Review listings hidden by the 3-flag community rule or food-safety reports.</p>{flaggedBatches.length ? <div className="inventory-list">{flaggedBatches.map((batch, index) => <article key={batch?._id || `flagged-${index}`} className="inventory-row"><img src={safeImageUrl(batch?.photoUrl) || '/demo-images/pandesal.svg'} alt={batch?.itemName ? `Photo of ${batch.itemName}` : 'Flagged batch'} /><div><h3>{asText(batch?.itemName, 'Surplus listing')}</h3><p>{asText(batch?.merchantId?.storeName, 'Local food partner')} · {asText(batch?.merchantId?.barangay, '')}, {asText(batch?.merchantId?.municipality, '')}</p><p>{batch?.foodSafetyFlagged ? `${formatNumber(batch?.spoilageReportCount)} food-safety reports` : `${formatNumber(batch?.reportCount)} community reports`} · {formatNumber(batch?.remainingQty)} portions remaining</p><span className="admin-status-badge pending">{batch?.foodSafetyFlagged ? 'Food safety review' : 'Community flagged'}</span></div><div className="admin-flag-actions"><button type="button" className="primary-button compact" disabled={busy === batch?._id} onClick={() => reviewFlag(batch?._id, 'restore')}>Clear flags & restore</button><button type="button" className="secondary-button compact admin-suspend-button" disabled={busy === batch?._id} onClick={() => reviewFlag(batch?._id, 'suspend')}>Remove & suspend merchant</button></div></article>)}</div> : <div className="empty-state"><h2>No flagged listings</h2><p>Nothing hidden in this jurisdiction needs review.</p></div>}</section>}

      {tab === 'ledger' && <section className="panel"><div className="admin-ledger-heading"><div><h2>MENRO barangay impact ledger</h2><p className="panel-subtitle">Completed rescues grouped by municipality and barangay.</p></div><button type="button" className="primary-button" onClick={exportLedger}>Download MENRO CSV</button></div>{menroStats.length ? <div className="admin-table-wrap"><table className="admin-impact-table"><thead><tr><th>Municipality</th><th>Barangay</th><th>Completed rescues</th><th>Food diverted (kg)</th><th>CO₂e prevented (kg)</th></tr></thead><tbody>{menroStats.map((row, index) => <tr key={`${asText(row?.municipality, 'municipality')}-${asText(row?.barangay, 'barangay')}-${index}`}><td>{asText(row?.municipality)}</td><td>{asText(row?.barangay)}</td><td>{formatNumber(row?.mealsSaved)}</td><td>{formatNumber(row?.foodDivertedKg, 2)}</td><td>{formatNumber(row?.co2PreventedKg, 2)}</td></tr>)}</tbody></table></div> : <div className="empty-state"><h2>No completed rescues yet</h2><p>Rescue totals will appear here after pickup passes are verified.</p></div>}</section>}

      {tab === 'officers' && session.assignedMunicipality === 'ALL' && <LguInviteManager onNotice={onNotice} />}

      {tab === 'leaderboard' && <div className="admin-leaderboard-grid">{[
        ['Verified merchants · 50+ rescued packs', asArray(leaderboard.merchants), 'storeName'], ['Verified NGOs · 100+ rescued packs', asArray(leaderboard.ngos), 'name'],
      ].map(([title, rows, label]) => <section className="panel" key={title}><h2>{title}</h2>{rows.length ? <ol className="admin-leaderboard">{rows.map((row, index) => <li key={row?.id || `${title}-${index}`}><span className="admin-rank">{index + 1}</span><div><strong>{asText(row?.[label], 'Partner')}</strong><small>{asText(row?.barangay, 'Unspecified')}, {asText(row?.municipality, 'Unspecified')}</small></div><b>{formatNumber(row?.rescues)} packs</b><button type="button" className="secondary-button compact" disabled={busy === row?.id} onClick={() => setCertification(row, row?.zeroWasteCertified !== true)}>{row?.zeroWasteCertified ? 'Revoke badge' : 'Issue badge'}</button><span className={`admin-certification ${row?.zeroWasteCertified ? 'is-certified' : ''}`}>{row?.zeroWasteCertified ? 'Certified Iloilo Zero-Waste Partner' : 'Not certified'}</span></li>)}</ol> : <div className="empty-state"><p>No partners have reached this recognition tier in this jurisdiction yet.</p></div>}</section>)}</div>}
    </>}
    <VerificationDialog user={selected} documentUrl={documentUrl} rejectionReason={rejectionReason} setRejectionReason={setRejectionReason} busy={Boolean(busy === selected?.id)} onClose={() => { setSelected(null); setDocumentUrl(''); }} onDecision={reviewApplicant} />
  </main>;
}
