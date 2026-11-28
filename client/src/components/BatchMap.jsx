import { useCallback, useEffect, useMemo, useState } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, Popup, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { ILOILO_CENTER, ILOILO_MAP_OPTIONS, isWithinIloilo } from '../utils/iloiloMap.js';
import ReliableTileLayer from './ReliableTileLayer.jsx';
import OfflineIloiloLayer from './OfflineIloiloLayer.jsx';

function FitBatches({ batches }) {
  const map = useMap();
  useEffect(() => {
    const points = batches.filter(x => x.merchantId?.location?.coordinates?.length === 2)
      .map(x => [x.merchantId.location.coordinates[1], x.merchantId.location.coordinates[0]])
      .filter(([latitude, longitude]) => isWithinIloilo(latitude, longitude));
    if (points.length > 1) map.fitBounds(points, { padding: [38, 38], maxZoom: 14 });
    else if (points.length === 1) map.setView(points[0], 14);
  }, [batches, map]);
  return null;
}

function RefreshMapSize() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    const refresh = () => requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refresh);
    observer?.observe(container);
    window.addEventListener('resize', refresh);
    refresh();
    return () => { observer?.disconnect(); window.removeEventListener('resize', refresh); };
  }, [map]);
  return null;
}

function usePartnerPin(isFree) {
  return useMemo(() => L.divIcon({
    className: 'iloilo-map-pin-wrap',
    html: `<span class="iloilo-map-pin ${isFree ? 'is-free' : ''}" aria-hidden="true"><svg viewBox="0 0 28 36" role="img"><path d="M14 1C6.82 1 1 6.82 1 14c0 9.25 13 21 13 21s13-11.75 13-21C27 6.82 21.18 1 14 1Z"/><circle cx="14" cy="14" r="5"/></svg></span>`,
    iconSize: [30, 40], iconAnchor: [15, 38], popupAnchor: [0, -35],
  }), [isFree]);
}

function BatchPin({ batch, onSelect }) {
  const icon = usePartnerPin(Boolean(batch.isDonationOnly));
  const coordinates = batch.merchantId?.location?.coordinates;
  if (!coordinates || coordinates.length !== 2 || !isWithinIloilo(coordinates[1], coordinates[0])) return null;
  return <Marker position={[coordinates[1], coordinates[0]]} icon={icon} eventHandlers={{ click: () => onSelect(batch) }}>
    <Popup><p className="map-popup-title">{batch.itemName}</p><p className="map-popup-price">{batch.merchantId?.storeName} · {batch.merchantId?.barangay || 'Barangay unspecified'}, {batch.merchantId?.municipality || ''}</p><p className="map-popup-price">{batch.isDonationOnly ? 'Free for verified NGOs' : `₱${Number(batch.price).toFixed(2)}`}</p></Popup>
  </Marker>;
}

export default function BatchMap({ batches, onSelect = () => {} }) {
  const [tileError, setTileError] = useState(false); const [tilesReady, setTilesReady] = useState(false); const [mapKey, setMapKey] = useState(0);
  const reportTileStatus = useCallback(status => { setTilesReady(status === 'ready'); setTileError(status === 'error'); }, []);
  function retryTiles() { setTileError(false); setTilesReady(false); setMapKey(value => value + 1); }
  return <section className="map-panel" aria-label="Surplus food map"><MapContainer key={mapKey} center={ILOILO_CENTER} zoom={13} {...ILOILO_MAP_OPTIONS} scrollWheelZoom={false} preferCanvas>
    <OfflineIloiloLayer />
    <ReliableTileLayer retryKey={mapKey} onStatus={reportTileStatus} />
    <RefreshMapSize />
    <FitBatches batches={batches} />
    {batches.map(batch => <BatchPin key={batch._id} batch={batch} onSelect={onSelect} />)}
  </MapContainer>{!tilesReady && !tileError && <div className="map-tile-status" role="status">Showing Iloilo guide while live streets load…</div>}{tileError && <div className="map-tile-alert" role="alert"><span>Showing the offline Iloilo map. Live streets are temporarily unavailable.</span><button type="button" className="secondary-button compact" onClick={retryTiles}>Retry live map</button></div>}</section>;
}
