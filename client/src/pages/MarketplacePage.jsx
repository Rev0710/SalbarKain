import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../utils/api.js';
import BatchCard from '../components/BatchCard.jsx';
import ReportModal from '../components/ReportModal.jsx';
import IloiloPartnerPanel from '../components/IloiloPartnerPanel.jsx';
import { BatchSkeletons } from '../components/LoadingSkeletons.jsx';
import { getDeviceToken, getGuestProfile } from '../utils/identity.js';
import { getEffectiveUnitPrice, isFlashDropActive } from '../utils/pricing.js';

const FILTERS = ['All', 'Under ₱30', 'Surprise Magic Bayong', 'Last-Hour Flash Drop', 'Free for NGOs'];
function matchesMunicipality(value = '', selected = 'All Iloilo') {
  if (selected === 'All Iloilo') return true;
  const raw = String(value).trim().toLowerCase();
  const normalized = raw.replace(/^(municipality|city)\s+of\s+/, '').replace(/\s+municipality$/, '').trim();
  if (selected === 'Iloilo City') return raw === 'city of iloilo' || normalized === 'iloilo' || normalized === 'iloilo city';
  return normalized === selected.toLowerCase();
}

function distanceKmFromGeoJson(fromCoords, location) {
  const toCoords = location?.coordinates;
  if (!Array.isArray(fromCoords) || fromCoords.length !== 2 || !Array.isArray(toCoords) || toCoords.length !== 2) return null;
  const normalize = (pair) => {
    const [first, second] = pair.map(Number);
    if (![first, second].every(Number.isFinite)) return null;
    return Math.abs(first) <= 90 && Math.abs(second) > 90 ? [second, first] : [first, second];
  };
  const [fromLng, fromLat] = normalize(fromCoords) || [];
  const [toLng, toLat] = normalize(toCoords) || [];
  if (![fromLng, fromLat, toLng, toLat].every(Number.isFinite)) return null;
  const radians = degrees => degrees * (Math.PI / 180);
  const latitudeDelta = radians(toLat - fromLat);
  const longitudeDelta = radians(toLng - fromLng);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(fromLat)) * Math.cos(radians(toLat)) * Math.sin(longitudeDelta / 2) ** 2;
  const boundedA = Math.min(1, Math.max(0, a));
  return 6371 * 2 * Math.atan2(Math.sqrt(boundedA), Math.sqrt(1 - boundedA));
}

function formatDistance(km) {
  if (!Number.isFinite(km) || km < 0) return '';
  if (km < 1) return `${Math.max(1, Math.round(km * 1000))} m away`;
  return `${km.toFixed(1)} km away`;
}

export default function MarketplacePage({ session, onClaim, onPartnerSignIn, onNotice, refreshTrigger = 0 }) {
  const navigate = useNavigate();
  const [batches, setBatches] = useState([]); const [partners, setPartners] = useState([]); const [partnerError, setPartnerError] = useState(''); const [filter, setFilter] = useState('All'); const [municipality, setMunicipality] = useState('All Iloilo'); const [loading, setLoading] = useState(true); const [partnersLoading, setPartnersLoading] = useState(true); const [error, setError] = useState(''); const [isRefreshing, setIsRefreshing] = useState(false); const [pullState, setPullState] = useState('idle'); const [selected, setSelected] = useState(null);
  const touchStartY = useRef(null);
  const touchDeltaY = useRef(0);
  const [now, setNow] = useState(Date.now());
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [userCoords, setUserCoords] = useState(null);
  const [locationStatus, setLocationStatus] = useState('idle');
  const [reportBatch, setReportBatch] = useState(null);
  const [reportBusy, setReportBusy] = useState(false);
  const hasLoadedBatches = useRef(false);
  const origin = useMemo(() => userCoords ? { lng: userCoords[0], lat: userCoords[1] } : null, [userCoords]);
  const refresh = useCallback(async (signal, point) => {
    if (!hasLoadedBatches.current) setLoading(true);
    setError('');
    try { const params = point ? { lat: point.lat, lng: point.lng, radius: 50000, limit: 100 } : { limit: 100 }; const { data } = await api.get('/batches', { params, signal }); setBatches(Array.isArray(data?.data?.batches) ? data.data.batches : []); hasLoadedBatches.current = true; }
    catch (err) { if (err.code !== 'ERR_CANCELED') setError(err.response?.data?.message || 'The live marketplace is unavailable. Try again shortly.'); }
    finally { hasLoadedBatches.current = true; setLoading(false); }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setPartnersLoading(true); setPartnerError('');
    api.get('/batches/partners', { signal: controller.signal })
      .then(({ data }) => setPartners(Array.isArray(data?.data?.partners) ? data.data.partners : []))
      .catch((err) => { if (err.code !== 'ERR_CANCELED') { setPartnerError(err.response?.data?.message || 'Verified partner locations are temporarily unavailable.'); setPartners([]); } })
      .finally(() => { if (!controller.signal.aborted) setPartnersLoading(false); });
    return () => controller.abort();
  }, [refreshTrigger]);
  useEffect(() => { const c = new AbortController(); refresh(c.signal, origin); return () => c.abort(); }, [refresh, refreshTrigger, session?.token, origin]);
  useEffect(() => { const online = () => setOffline(false); const offlineEvent = () => setOffline(true); window.addEventListener('online', online); window.addEventListener('offline', offlineEvent); return () => { window.removeEventListener('online', online); window.removeEventListener('offline', offlineEvent); }; }, []);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 15_000); return () => window.clearInterval(timer); }, []);

  function locateMe() {
    if (locationStatus === 'locating') return;
    setLocationStatus('locating');
    if (!navigator.geolocation?.getCurrentPosition) {
      setUserCoords(null);
      setLocationStatus('denied');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => {
        const lat = Number(position.coords.latitude);
        const lng = Number(position.coords.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          setUserCoords(null);
          setLocationStatus('denied');
          return;
        }
        setUserCoords([lng, lat]);
        setLocationStatus('active');
      },
      () => {
        setUserCoords(null);
        setLocationStatus('denied');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }
  const refreshMarketplace = useCallback(async () => {
    if (isRefreshing) return;
    const controller = new AbortController();
    setIsRefreshing(true);
    setPullState('refreshing');
    setPartnersLoading(true);
    setPartnerError('');
    try {
      await Promise.all([
        refresh(controller.signal, origin),
        api.get('/batches/partners', { signal: controller.signal })
          .then(({ data }) => setPartners(Array.isArray(data?.data?.partners) ? data.data.partners : []))
          .catch((err) => {
            if (err.code !== 'ERR_CANCELED') {
              setPartnerError(err.response?.data?.message || 'Verified partner locations are temporarily unavailable.');
              setPartners([]);
            }
          })
          .finally(() => setPartnersLoading(false)),
      ]);
    } finally {
      setIsRefreshing(false);
      setPullState('idle');
    }
  }, [isRefreshing, origin, refresh]);

  function onTouchStart(event) {
    if (window.scrollY !== 0 || event.touches.length !== 1 || isRefreshing) {
      touchStartY.current = null;
      return;
    }
    touchStartY.current = event.touches[0].clientY;
    touchDeltaY.current = 0;
  }

  function onTouchMove(event) {
    if (touchStartY.current === null || window.scrollY !== 0 || event.touches.length !== 1) return;
    const delta = event.touches[0].clientY - touchStartY.current;
    touchDeltaY.current = Math.max(0, delta);
    if (delta > 0) setPullState(delta > 75 ? 'ready' : 'pulling');
    else setPullState('idle');
  }

  function onTouchEnd() {
    const shouldRefresh = touchStartY.current !== null && touchDeltaY.current > 75 && window.scrollY === 0;
    touchStartY.current = null;
    touchDeltaY.current = 0;
    if (shouldRefresh) void refreshMarketplace();
    else if (pullState !== 'refreshing') setPullState('idle');
  }

  function onTouchCancel() {
    touchStartY.current = null;
    touchDeltaY.current = 0;
    if (!isRefreshing) setPullState('idle');
  }
  const townBatches = useMemo(() => batches.filter(batch => matchesMunicipality(batch.merchantId?.municipality, municipality)), [batches, municipality]);
  const visible = useMemo(() => {
    const matching = townBatches.filter(batch => {
      const flashActive = Boolean(batch.isFlashDropEnabled && new Date(batch.expiresAt).getTime() - now <= 30 * 60 * 1000);
      return filter === 'All'
        || (filter === 'Under ₱30' && !batch.isDonationOnly && Number(batch.price) < 30)
        || (filter === 'Surprise Magic Bayong' && batch.isMagicBayong)
        || (filter === 'Last-Hour Flash Drop' && flashActive)
        || (filter === 'Free for NGOs' && batch.isDonationOnly);
    });
    if (!userCoords) return matching;
    return matching.map(batch => ({ ...batch, distanceKm: distanceKmFromGeoJson(userCoords, batch.merchantId?.location) }))
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }, [townBatches, filter, now, userCoords]);
  function claim(batch) { const isVerifiedNgo = session?.role === 'ngo' && (session?.verificationStatus === 'verified' || session?.verified === true); const flashActive = isFlashDropActive(batch); const priorityActive = batch.ngoPriorityUntil && new Date(batch.ngoPriorityUntil).getTime() > Date.now(); if ((batch.isDonationOnly || priorityActive) && !isVerifiedNgo) { onNotice(batch.isDonationOnly ? 'NGO Donation Only. This batch is reserved for verified NGO and shelter accounts.' : `Reserved for Verified NGOs until ${new Date(batch.ngoPriorityUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`); if (batch.isDonationOnly && !session) onPartnerSignIn(); return; } onClaim({ ...batch, verifiedNgo: isVerifiedNgo, flashActive, quotePrice: getEffectiveUnitPrice(batch, Date.now(), { verifiedNgo: isVerifiedNgo }) }); }
  async function submitReport({ type, note, photoProof }) {
    if (!reportBatch || reportBusy) return;
    setReportBusy(true);
    try {
      const batch = reportBatch;
      const guest = getGuestProfile();
      const body = new FormData();
      body.append('deviceToken', getDeviceToken()); body.append('phone', guest.phone || '');
      body.append('reason', type); body.append('note', note || '');
      if (photoProof) body.append('photoProof', photoProof, photoProof.name || 'report-proof.jpg');
      const { data } = await api.patch(`/batches/${batch._id}/report`, body, { headers: { 'Content-Type': 'multipart/form-data' } });
      onNotice(data.data.hidden ? 'This listing has been hidden and sent for review.' : type === 'spoilage' ? 'Food safety report recorded.' : 'Thanks. Your report was recorded.');
      if (data.data.hidden) setBatches(current => current.filter(item => item._id !== batch._id));
      setReportBatch(null);
    } catch (err) { onNotice(err.response?.data?.message || 'This listing could not be reported right now.'); }
    finally { setReportBusy(false); }
  }
  const selectOnMap = useCallback(batch => { setSelected(batch._id); document.querySelector(`[data-batch="${batch._id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, []);
  const [mobileTab, setMobileTab] = useState('list');
  function resetFilters() { setFilter('All'); setMunicipality('All Iloilo'); }
  function postSurplus() { if (session?.role === 'merchant') navigate('/workspace'); else onPartnerSignIn(); }
  return <main className="market-shell" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchCancel}>
    {pullState !== 'idle' && <div className="pull-refresh-indicator" role="status" aria-live="polite">{isRefreshing && <span className="market-refresh-icon animate-spin" aria-hidden="true">↻</span>}{isRefreshing ? 'Updating Iloilo listings...' : pullState === 'ready' ? 'Release to refresh live surplus...' : 'Pull down to refresh live surplus...'}</div>}
    {offline && <div className="alert-banner mb-4" role="alert">You’re offline. Reconnect to refresh batches and make a pickup reservation.</div>}
    <div className="market-heading">
      <div><p className="eyebrow">Local food rescue · Philippines</p><h1>Good food, close by.</h1><p>Discover surplus from nearby food partners wherever you are.</p></div>
      <div className={`location-label location-${locationStatus}`} aria-live="polite">
        {locationStatus === 'locating' ? <button type="button" className="location-action locating" disabled><svg className="location-spinner" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="3" strokeDasharray="42 16" /></svg>Locating...</button> : <>
          {locationStatus === 'active' && <span className="live-dot" aria-hidden="true" />}
          <span>{locationStatus === 'active' ? 'Sorted near your location' : 'Sorted by latest'}</span>
          {locationStatus !== 'denied' && <button type="button" className={`location-action ${locationStatus === 'idle' ? 'primary' : ''}`} onClick={locateMe}>{locationStatus === 'idle' ? 'Locate me' : 'Update'}</button>}
        </>}
      </div>
    </div>
    {locationStatus === 'denied' && <div className="location-denied-notice" role="status"><span>Location blocked — enable GPS in browser settings</span><button type="button" onClick={locateMe}>Retry</button></div>}
    <div className="market-filter-toolbar"><div className="filter-row" role="group" aria-label="Filter food batches">{FILTERS.map(label => <button key={label} className={`filter-pill ${filter === label ? 'active' : ''}`} aria-pressed={filter === label} onClick={() => setFilter(label)}>{label}</button>)}</div><button type="button" className="market-refresh-button" onClick={() => void refreshMarketplace()} disabled={isRefreshing} aria-label={isRefreshing ? 'Updating marketplace' : 'Refresh marketplace'}><span className={`market-refresh-icon ${isRefreshing ? 'animate-spin' : ''}`} aria-hidden="true">↻</span><span>{isRefreshing ? 'Updating' : 'Refresh'}</span></button></div>
    <div className="mobile-market-tabs" role="tablist" aria-label="Marketplace view"><button role="tab" aria-selected={mobileTab === 'map'} className={mobileTab === 'map' ? 'active' : ''} onClick={() => setMobileTab('map')}>Partner hubs</button><button role="tab" aria-selected={mobileTab === 'list'} className={mobileTab === 'list' ? 'active' : ''} onClick={() => setMobileTab('list')}>Batches <span>{visible.length}</span></button></div>
    <div className="market-grid"><section className={`batch-list ${mobileTab === 'map' ? 'mobile-market-hidden' : ''}`} aria-label="Available surplus batches">{loading && <BatchSkeletons />}{error && <div className="empty-state" role="alert"><h2>Marketplace paused</h2><p>{error}</p><button className="secondary-button mt-4" onClick={() => void refreshMarketplace()}>Try again</button></div>}{!loading && !error && visible.length === 0 && <section className="evening-empty-state" aria-labelledby="evening-empty-title"><p className="eyebrow">Iloilo evening rescue schedule</p><h2 id="evening-empty-title">No batches match these filters yet</h2><p>Local bakeries and eateries typically post surplus between <strong>7:00 PM and 9:00 PM</strong>, near closing time.</p><div className="evening-schedule-window"><span>Typical drop window</span><strong>7:00–9:00 PM</strong></div><div className="evening-empty-actions"><button type="button" className="secondary-button" onClick={resetFilters}>Reset filters</button><button type="button" className="text-button" onClick={postSurplus}>Merchant? Post a batch</button></div></section>}{visible.map(batch => <div key={batch._id} data-batch={batch._id} className={selected === batch._id ? 'ring-2 ring-forest rounded-lg' : ''}><BatchCard batch={batch} isNgo={session?.role === 'ngo' && (session?.verificationStatus === 'verified' || session?.verified === true)} distanceLabel={formatDistance(batch.distanceKm)} onClaim={claim} onSignIn={onPartnerSignIn} onReport={setReportBatch} /></div>)}</section><div className={mobileTab === 'list' ? 'mobile-market-hidden' : ''}><IloiloPartnerPanel partners={partners} fallbackBatches={batches} loading={partnersLoading} error={partnerError} selectedMunicipality={municipality} onMunicipalityChange={setMunicipality} userCoords={userCoords} distanceKmFromGeoJson={distanceKmFromGeoJson} formatDistance={formatDistance} /></div></div>
    <ReportModal isOpen={Boolean(reportBatch)} batch={reportBatch} isLoading={reportBusy} onSubmit={submitReport} onCancel={() => { if (!reportBusy) setReportBatch(null); }} />
  </main>;
}
