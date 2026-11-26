import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api.js';
import BatchCard from '../components/BatchCard.jsx';
import BatchMap from '../components/BatchMap.jsx';
import { BatchSkeletons } from '../components/LoadingSkeletons.jsx';
import { getDeviceToken } from '../utils/identity.js';

const FILTERS = ['All', 'Under ₱30', 'Magic Bayong', 'Free for NGOs'];
export default function MarketplacePage({ session, onClaim, onPartnerSignIn, onNotice, refreshTrigger = 0 }) {
  const [batches, setBatches] = useState([]); const [filter, setFilter] = useState('All'); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [refreshKey, setRefreshKey] = useState(0); const [selected, setSelected] = useState(null);
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [origin, setOrigin] = useState(null); const [locationMessage, setLocationMessage] = useState('');
  const refresh = useCallback(async (signal, point) => {
    setLoading(true); setError('');
    try { const params = point ? { lat: point.lat, lng: point.lng, radius: 50000, limit: 50 } : { limit: 100 }; const { data } = await api.get('/batches', { params, signal }); setBatches(data.data.batches || []); }
    catch (err) { if (err.code !== 'ERR_CANCELED') setError(err.response?.data?.message || 'The live marketplace is unavailable. Try again shortly.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { navigator.geolocation?.getCurrentPosition(position => setOrigin({ lat: position.coords.latitude, lng: position.coords.longitude }), () => setLocationMessage('Showing recent surplus across all areas. Turn on location to sort by nearby stores.'), { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }); }, []);
  useEffect(() => { const c = new AbortController(); refresh(c.signal, origin); return () => c.abort(); }, [refresh, refreshKey, refreshTrigger, session?.token, origin]);
  useEffect(() => { const online = () => setOffline(false); const offlineEvent = () => setOffline(true); window.addEventListener('online', online); window.addEventListener('offline', offlineEvent); return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offlineEvent); }; }, []);
  const visible = useMemo(() => batches.filter(batch => filter === 'All' || (filter === 'Under ₱30' ? !batch.isDonationOnly && Number(batch.price) < 30 : filter === 'Magic Bayong' ? batch.isMagicBayong : batch.isDonationOnly)), [batches, filter]);
  function claim(batch) { const isVerifiedNgo = session?.role === 'ngo' && session?.verified; if (batch.isDonationOnly && !isVerifiedNgo) { onNotice('Donation-only batches are reserved for verified NGO and shelter accounts.'); if (!session) onPartnerSignIn(); return; } const flashActive = batch.isFlashDropEnabled && new Date(batch.expiresAt).getTime() - Date.now() <= 30 * 60 * 1000; onClaim({ ...batch, verifiedNgo: isVerifiedNgo, flashActive, quotePrice: flashActive && isVerifiedNgo ? 0 : flashActive ? Number((Number(batch.price || 0) * 0.5).toFixed(2)) : Number(batch.price || 0) }); }
  async function report(batch) {
    try {
      const answer = window.prompt('Report type: enter 1 for spoiled / unsafe food (auto-hides after 2 reports), or 2 for another listing concern.', '1');
      if (answer === null) return;
      const spoilage = answer.trim() === '1';
      const { data } = await api.patch(`/batches/${batch._id}/report`, { deviceToken: getDeviceToken(), reason: spoilage ? 'spoilage' : 'general' });
      onNotice(data.data.hidden ? 'This listing has been hidden and sent for review.' : spoilage ? 'Food safety report recorded.' : 'Thanks. Your report was recorded.');
      if (data.data.hidden) setBatches(current => current.filter(item => item._id !== batch._id));
    } catch (err) { onNotice(err.response?.data?.message || 'This listing could not be reported right now.'); }
  }
  const selectOnMap = useCallback(batch => { setSelected(batch._id); document.querySelector(`[data-batch="${batch._id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, []);
  const [mobileTab, setMobileTab] = useState('list');
  return <main className="market-shell">{offline && <div className="alert-banner mb-4" role="alert">You’re offline. Reconnect to refresh batches and make a pickup reservation.</div>}<div className="market-heading"><div><p className="eyebrow">Local food rescue · Philippines</p><h1>Good food, close by.</h1><p>Discover surplus from nearby food partners wherever you are.</p></div><div className="location-label"><span className="live-dot" /> {origin ? 'Sorted near your location' : 'Recent surplus across all areas'} <button className="text-button" onClick={() => { setOrigin(null); setLocationMessage('Allow location access in your browser to sort by nearest food partners.'); navigator.geolocation?.getCurrentPosition(position => { setOrigin({ lat: position.coords.latitude, lng: position.coords.longitude }); setLocationMessage(''); }, () => {}, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 }); }} aria-label="Use my location">Locate me</button><button className="text-button" onClick={() => setRefreshKey(x => x + 1)} aria-label="Refresh batches">↻</button></div></div>{locationMessage && <p className="form-note mb-3">{locationMessage}</p>}
    <div className="filter-row" role="group" aria-label="Filter food batches">{FILTERS.map(label => <button key={label} className={`filter-pill ${filter === label ? 'active' : ''}`} aria-pressed={filter === label} onClick={() => setFilter(label)}>{label}</button>)}</div>
    <div className="mobile-market-tabs" role="tablist" aria-label="Marketplace view"><button role="tab" aria-selected={mobileTab === 'map'} className={mobileTab === 'map' ? 'active' : ''} onClick={() => setMobileTab('map')}>Map</button><button role="tab" aria-selected={mobileTab === 'list'} className={mobileTab === 'list' ? 'active' : ''} onClick={() => setMobileTab('list')}>Batches <span>{visible.length}</span></button></div>
    <div className="market-grid"><section className={`batch-list ${mobileTab === 'map' ? 'mobile-market-hidden' : ''}`} aria-label="Available surplus batches">{loading && <BatchSkeletons />}{error && <div className="empty-state" role="alert"><h2>Marketplace paused</h2><p>{error}</p><button className="secondary-button mt-4" onClick={() => setRefreshKey(x => x + 1)}>Try again</button></div>}{!loading && !error && visible.length === 0 && <div className="empty-state"><h2>No batches in this view yet</h2><p>Try another filter or check back near closing time. New surplus appears here as partners post.</p><button className="secondary-button mt-4" onClick={() => setRefreshKey(x => x + 1)}>Refresh marketplace</button></div>}{visible.map(batch => <div key={batch._id} data-batch={batch._id} className={selected === batch._id ? 'ring-2 ring-forest rounded-lg' : ''}><BatchCard batch={batch} isNgo={session?.role === 'ngo' && session?.verified} onClaim={claim} onSignIn={onPartnerSignIn} onReport={report} /></div>)}</section><div className={mobileTab === 'list' ? 'mobile-market-hidden' : ''}><BatchMap batches={visible} onSelect={selectOnMap} /></div></div></main>;
}
