import { useMemo, useState } from 'react';
import { safeImageUrl } from '../utils/safeImageUrl.js';

const MUNICIPALITIES = ['All Iloilo', 'Iloilo City', 'Pavia', 'Santa Barbara', 'Oton', 'Leganes'];

function canonicalMunicipality(value = '') {
  const raw = String(value).trim().toLowerCase();
  const stripped = raw.replace(/^(municipality|city)\s+of\s+/, '').replace(/\s+municipality$/, '').trim();
  if (raw === 'city of iloilo' || stripped === 'iloilo' || stripped === 'iloilo city') return 'Iloilo City';
  return MUNICIPALITIES.find((name) => name !== 'All Iloilo' && name.toLowerCase() === stripped) || String(value).trim();
}

function cleanLocationPart(value = '') {
  return String(value).replace(/\bunspecified\b/gi, '').replace(/[\s,·-]+/g, ' ').trim();
}

function partnerLocation(store) {
  const barangay = cleanLocationPart(store.barangay);
  const municipality = cleanLocationPart(store.municipality);
  if (barangay && municipality) return [barangay, canonicalMunicipality(municipality)].join(' · ');
  return cleanLocationPart(store.address) || 'Iloilo Province';
}

function fromBatches(batches) {
  const stores = new Map();
  for (const batch of batches) {
    const merchant = batch.merchantId;
    if (!merchant?._id) continue;
    const id = String(merchant._id);
    const current = stores.get(id) || {
      _id: id,
      storeName: merchant.storeName || 'Verified food partner',
      address: merchant.address || '',
      barangay: merchant.barangay || '',
      municipality: merchant.municipality || '',
      location: merchant.location,
      storefrontPhotoUrl: merchant.storefrontPhotoUrl || '',
      verificationStatus: 'verified',
      activeBatchCount: 0,
      activePackCount: 0,
      closesAt: null,
    };
    current.activeBatchCount += 1;
    current.activePackCount += Math.max(0, Number(batch.remainingQty) || 0);
    if (!current.closesAt || new Date(batch.expiresAt) < new Date(current.closesAt)) current.closesAt = batch.expiresAt;
    stores.set(id, current);
  }
  return [...stores.values()];
}

function navigateUrl(store) {
  const coordinates = store.location?.coordinates;
  if (Array.isArray(coordinates) && coordinates.length === 2 && coordinates.every(Number.isFinite)) {
    return `https://www.google.com/maps/search/?api=1&query=${coordinates[1]},${coordinates[0]}`;
  }
  const address = [cleanLocationPart(store.address), cleanLocationPart(store.barangay), cleanLocationPart(store.municipality), 'Iloilo'].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || store.storeName)}`;
}

function formatTime(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export default function IloiloPartnerPanel({ partners, fallbackBatches, loading, error, selectedMunicipality, onMunicipalityChange, userCoords, distanceKmFromGeoJson, formatDistance }) {
  const directory = useMemo(() => {
    const listed = Array.isArray(partners) ? partners : [];
    const fallback = fromBatches(Array.isArray(fallbackBatches) ? fallbackBatches : []);
    const merged = new Map(listed.map((store) => [String(store._id), store]));
    for (const store of fallback) if (!merged.has(String(store._id))) merged.set(String(store._id), store);
    return [...merged.values()];
  }, [partners, fallbackBatches]);
  const filtered = useMemo(() => {
    const matching = directory.filter((store) => selectedMunicipality === 'All Iloilo' || canonicalMunicipality(store.municipality) === selectedMunicipality);
    if (!userCoords) return matching;
    return matching.map(store => ({ ...store, distanceKm: distanceKmFromGeoJson(userCoords, store.location) }))
      .sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity));
  }, [directory, selectedMunicipality, userCoords, distanceKmFromGeoJson]);
  const activeBatchesIn = municipality => directory.reduce((total, store) => total + (municipality === 'All Iloilo' || canonicalMunicipality(store.municipality) === municipality ? Math.max(0, Number(store.activeBatchCount) || 0) : 0), 0);
  return <aside className="partner-hub-shell" aria-label="Iloilo surplus hubs and pickup radar">
    <div className="partner-hub-header">
      <div><p className="eyebrow">Iloilo surplus hubs</p><h2>Partner storefronts &amp; barangay radar</h2><p className="partner-hub-subtitle">Verified food partners across Iloilo City and nearby municipalities.</p></div>
    </div>
    <div className="partner-municipality-row" role="group" aria-label="Filter partners by municipality">
      {MUNICIPALITIES.map((municipality) => <button key={municipality} type="button" className={`partner-municipality-pill ${selectedMunicipality === municipality ? 'active' : ''}`} aria-pressed={selectedMunicipality === municipality} onClick={() => onMunicipalityChange(municipality)}>{municipality}<span>{activeBatchesIn(municipality)}</span></button>)}
    </div>
    <div className="partner-radar-list" aria-live="polite">
      {loading && <p className="partner-radar-note" role="status">Loading verified food partners…</p>}
      {error && !directory.length && <p className="partner-radar-note" role="status">Partner locations could not load just now. Try refreshing the marketplace.</p>}
      {!loading && !filtered.length && <div className="partner-radar-empty"><h3>No verified partners in this filter yet</h3><p>Verified local bakeries, eateries, groceries, and shelters will appear here.</p></div>}
      {filtered.map((store) => {
        const activePacks = Math.max(0, Number(store.activePackCount) || 0);
        const activeBatchCount = Math.max(0, Number(store.activeBatchCount) || 0);
        const closesAt = store.closesAt ? new Date(store.closesAt) : null;
        const urgent = activeBatchCount > 0 && closesAt && closesAt.getTime() - Date.now() <= 45 * 60 * 1000;
        return <article className="partner-store-row" key={store._id}>
          <div className="partner-store-main">
            <div className="partner-store-name-line">{safeImageUrl(store.storefrontPhotoUrl) && <img className="partner-store-avatar" src={safeImageUrl(store.storefrontPhotoUrl)} alt="" loading="lazy" onError={(event) => { event.currentTarget.hidden = true; event.currentTarget.nextElementSibling.hidden = false; }} />}<span className="partner-store-avatar partner-store-avatar-fallback" aria-hidden="true" hidden={Boolean(safeImageUrl(store.storefrontPhotoUrl))}>{(store.storeName || 'S').trim().charAt(0).toUpperCase()}</span><h3 title={store.storeName}>{store.storeName || 'Verified food partner'}</h3><span className="partner-verified" title="KYB verified">✓ Verified</span></div>
            <p className="partner-store-location">{partnerLocation(store)}{Number.isFinite(store.distanceKm) && <span className="partner-distance"> · {formatDistance(store.distanceKm)}</span>}</p>
            <p className={`partner-store-status ${urgent ? 'urgent' : activeBatchCount ? 'available' : 'upcoming'}`}>
              {activeBatchCount > 0 ? `${activePacks} ${activePacks === 1 ? 'pack' : 'packs'} active · Closes ${formatTime(store.closesAt) || 'soon'}` : 'Next drop window · 7:00–9:00 PM'}
            </p>
          </div>
          <a className="partner-navigate" href={navigateUrl(store)} target="_blank" rel="noreferrer" aria-label={`Navigate to ${store.storeName || 'partner store'}`}>Navigate <span aria-hidden="true">↗</span></a>
        </article>;
      })}
      {!loading && !error && <p className="partner-radar-footnote">Evening drop times are a guide. Check a batch’s pickup cutoff before travelling.</p>}
    </div>
  </aside>;
}
