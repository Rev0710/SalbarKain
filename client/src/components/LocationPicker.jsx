import { useEffect } from 'react';
import { CircleMarker, MapContainer, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { ILOILO_CENTER, ILOILO_MAP_OPTIONS, isWithinIloilo } from '../utils/iloiloMap.js';
import ReliableTileLayer from './ReliableTileLayer.jsx';

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

export default function LocationPicker({ lat, lng, onChange, located }) {
  const latitude = Number(lat); const longitude = Number(lng);
  const valid = lat !== '' && lng !== '' && isWithinIloilo(latitude, longitude);
  const center = valid ? [latitude, longitude] : ILOILO_CENTER;
  return <div className="location-picker"><MapContainer center={center} zoom={valid ? 14 : 13} {...ILOILO_MAP_OPTIONS} scrollWheelZoom className="location-picker-map"><ReliableTileLayer /><PinEvents onChange={onChange} onLocate={located} />{valid && <CircleMarker center={center} radius={8} pathOptions={{ color: '#FFFFFF', weight: 2, fillColor: '#15803D', fillOpacity: 1 }} />}</MapContainer><p className="form-note">Tap the map to place your store or organization pin within Iloilo Province.</p></div>;
}
