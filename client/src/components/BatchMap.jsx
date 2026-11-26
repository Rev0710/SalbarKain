import { useEffect, useRef, useState } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { ILOILO_CENTER, ILOILO_MAP_OPTIONS, isWithinIloilo } from '../utils/iloiloMap.js';

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

export default function BatchMap({ batches, onSelect }) {
  const [tileError, setTileError] = useState(false); const [tilesReady, setTilesReady] = useState(false); const [mapKey, setMapKey] = useState(0);
  const tileLoads = useRef(0); const tileFailures = useRef(0);
  function retryTiles() { tileLoads.current = 0; tileFailures.current = 0; setTileError(false); setTilesReady(false); setMapKey(value => value + 1); }
  const tileEvents = {
    tileload: () => { tileLoads.current += 1; setTilesReady(true); },
    tileerror: () => { tileFailures.current += 1; },
    load: () => { if (tileLoads.current === 0 && tileFailures.current > 0) setTileError(true); },
  };
  return <section className="map-panel" aria-label="Surplus food map"><MapContainer key={mapKey} center={ILOILO_CENTER} zoom={13} {...ILOILO_MAP_OPTIONS} scrollWheelZoom={false} preferCanvas>
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" eventHandlers={tileEvents} />
    <RefreshMapSize />
    <FitBatches batches={batches} />
    {batches.map(batch => {
      const coordinates = batch.merchantId?.location?.coordinates;
      if (!coordinates || coordinates.length !== 2) return null;
      if (!isWithinIloilo(coordinates[1], coordinates[0])) return null;
      const point = [coordinates[1], coordinates[0]];
      return <CircleMarker key={batch._id} center={point} radius={9} pathOptions={{ className: `map-marker ${batch.isDonationOnly ? 'free' : ''}`, color: '#FFFFFF', weight: 2, fillColor: batch.isDonationOnly ? '#D97706' : '#15803D', fillOpacity: 1 }} eventHandlers={{ click: () => onSelect(batch) }}><Popup><p className="map-popup-title">{batch.itemName}</p><p className="map-popup-price">{batch.merchantId?.storeName} · {batch.merchantId?.barangay || 'Barangay unspecified'}, {batch.merchantId?.municipality || ''}</p><p className="map-popup-price">{batch.isDonationOnly ? 'Free for verified NGOs' : `₱${Number(batch.price).toFixed(2)}`}</p></Popup></CircleMarker>;
    })}
  </MapContainer>{!tilesReady && !tileError && <div className="map-tile-status" role="status">Loading Iloilo map…</div>}{tileError && <div className="map-tile-alert" role="alert"><span>Map tiles didn’t load. Your food list is still available.</span><button type="button" className="secondary-button compact" onClick={retryTiles}>Retry map</button></div>}</section>;
}
