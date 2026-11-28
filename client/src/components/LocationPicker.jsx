import { useEffect, useMemo } from 'react';
import L from 'leaflet';
import { MapContainer, Marker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { ILOILO_CENTER, ILOILO_MAP_OPTIONS, isWithinIloilo } from '../utils/iloiloMap.js';
import ReliableTileLayer from './ReliableTileLayer.jsx';
import OfflineIloiloLayer from './OfflineIloiloLayer.jsx';

function PinEvents({ onChange, onLocate }) {
  const map = useMap();
  useMapEvents({ click(event) { if (isWithinIloilo(event.latlng.lat, event.latlng.lng)) onChange(event.latlng.lat, event.latlng.lng); } });
  useEffect(() => {
    if (onLocate && isWithinIloilo(onLocate.lat, onLocate.lng)) {
      map.flyTo([onLocate.lat, onLocate.lng], 15, { duration: 0.6 });
      onChange(onLocate.lat, onLocate.lng);
    }
  }, [map, onLocate, onChange]);
  return null;
}

function RefreshMapSize() {
  const map = useMap();
  useEffect(() => {
    const container = map.getContainer();
    let frame;
    const refresh = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refresh);
    observer?.observe(container);
    window.addEventListener('resize', refresh);
    refresh();
    return () => { window.cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', refresh); };
  }, [map]);
  return null;
}

export default function LocationPicker({ lat, lng, onChange, located }) {
  const latitude = Number(lat); const longitude = Number(lng);
  const valid = lat !== '' && lng !== '' && isWithinIloilo(latitude, longitude);
  const center = valid ? [latitude, longitude] : ILOILO_CENTER;
  const pin = useMemo(() => L.divIcon({ className: 'iloilo-map-pin-wrap', html: '<span class="iloilo-map-pin" aria-hidden="true"><svg viewBox="0 0 28 36"><path d="M14 1C6.82 1 1 6.82 1 14c0 9.25 13 21 13 21s13-11.75 13-21C27 6.82 21.18 1 14 1Z"/><circle cx="14" cy="14" r="5"/></svg></span>', iconSize: [30, 40], iconAnchor: [15, 38] }), []);
  return <div className="location-picker"><MapContainer center={center} zoom={valid ? 14 : 13} {...ILOILO_MAP_OPTIONS} scrollWheelZoom className="location-picker-map"><OfflineIloiloLayer /><ReliableTileLayer /><RefreshMapSize /><PinEvents onChange={onChange} onLocate={located} />{valid && <Marker position={center} icon={pin} />}</MapContainer><p className="form-note">Tap the map to place your store or organization pin within Iloilo Province.</p></div>;
}
