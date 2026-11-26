import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api.js';
import BatchCard from '../components/BatchCard.jsx';
import BatchMap from '../components/BatchMap.jsx';
import { BatchSkeletons } from '../components/LoadingSkeletons.jsx';

const FILTERS = ['All', 'Under ₱30', 'Free for NGOs'];
export default function MarketplacePage({ session, onClaim, onPartnerSignIn, onNotice, refreshTrigger = 0 }) {
  const [batches, setBatches] = useState([]); const [filter, setFilter] = useState('All'); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [refreshKey, setRefreshKey] = useState(0); const [selected, setSelected] = useState(null);
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const refresh = useCallback(async (signal) => {
    setLoading(true); setError('');
    try { const { data } = await api.get('/batches', { params: { lat: 10.72, lng: 122.56, radius: 50000, limit: 50 }, signal }); setBatches(data.data.batches || []); }
    catch (err) { if (err.code !== 'ERR_CANCELED') setError(err.response?.data?.message || 'The live marketplace is unavailable. Try again shortly.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const c = new AbortController(); refresh(c.signal); return () => c.abort(); }, [refresh, refreshKey, refreshTrigger, session?.token]);
  useEffect(() => { const online = () => setOffline(false); const offlineEvent = () => setOffline(true); window.addEventListener('online', online); window.addEventListener('offline', offlineEvent); return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offlineEvent); }; }, []);
  const visible = useMemo(() => batches.filter(batch => filter === 'All' || (filter === 'Under ₱30' ? !batch.isDonationOnly && Number(batch.price) < 30 : batch.isDonationOnly)), [batches, filter]);
  function claim(batch) { if (batch.isDonationOnly && !(session?.role === 'ngo' && session?.verified)) { onNotice('Donation-only batches are reserved for verified NGO and shelter accounts.'); onPartnerSignIn(); return; } onClaim(batch); }
  const selectOnMap = useCallback(batch => { setSelected(batch._id); document.querySelector(`[data-batch="${batch._id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, []);
  const [mobileTab, setMobileTab] = useState('list');
  return <main className="market-shell">{offline && <div className="alert-banner mb-4" role="alert">You’re offline. Reconnect to refresh batches and make a pickup reservation.</div>}<div className="market-heading"><div><p className="eyebrow">Iloilo City · Pavia</p><h1>Good food, close by.</h1><p>Claim surplus directly from local food partners before pickup closes.</p></div><div className="location-label"><span className="live-dot" /> Live nearby batches <button className="text-button" onClick={() => setRefreshKey(x => x + 1)} aria-label="Refresh batches">↻</button></div></div>
    <div className="filter-row" role="group" aria-label="Filter food batches">{FILTERS.map(label => <button key={label} className={`filter-pill ${filter === label ? 'active' : ''}`} aria-pressed={filter === label} onClick={() => setFilter(label)}>{label}</button>)}</div>
    <div className="mobile-market-tabs" role="tablist" aria-label="Marketplace view"><button role="tab" aria-selected={mobileTab === 'map'} className={mobileTab === 'map' ? 'active' : ''} onClick={() => setMobileTab('map')}>Map</button><button role="tab" aria-selected={mobileTab === 'list'} className={mobileTab === 'list' ? 'active' : ''} onClick={() => setMobileTab('list')}>Batches <span>{visible.length}</span></button></div>
    <div className="market-grid"><section className={`batch-list ${mobileTab === 'map' ? 'mobile-market-hidden' : ''}`} aria-label="Available surplus batches">{loading && <BatchSkeletons />}{error && <div className="empty-state" role="alert"><h2>Marketplace paused</h2><p>{error}</p><button className="secondary-button mt-4" onClick={() => setRefreshKey(x => x + 1)}>Try again</button></div>}{!loading && !error && visible.length === 0 && <div className="empty-state"><h2>No batches in this view yet</h2><p>Try another filter or check back near closing time. New surplus appears here as partners post.</p><button className="secondary-button mt-4" onClick={() => setRefreshKey(x => x + 1)}>Refresh marketplace</button></div>}{visible.map(batch => <div key={batch._id} data-batch={batch._id} className={selected === batch._id ? 'ring-2 ring-forest rounded-lg' : ''}><BatchCard batch={batch} isNgo={session?.role === 'ngo' && session?.verified} onClaim={claim} onSignIn={onPartnerSignIn} /></div>)}</section><div className={mobileTab === 'list' ? 'mobile-market-hidden' : ''}><BatchMap batches={visible} onSelect={selectOnMap} /></div></div></main>;
}
