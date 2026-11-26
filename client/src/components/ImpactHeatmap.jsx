import { useCallback, useEffect, useState } from 'react';
import { MapContainer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet.heat';
import 'leaflet/dist/leaflet.css';
import { api } from '../utils/api.js';
import { ILOILO_CENTER, ILOILO_MAP_OPTIONS, isWithinIloilo } from '../utils/iloiloMap.js';
import ReliableTileLayer from './ReliableTileLayer.jsx';

function HeatLayer({ points }) {
  const map = useMap();
  useEffect(() => {
    const max = Math.max(1, ...points.map(point => point.weight));
    const layer = L.heatLayer(points.map(point => [point.lat, point.lng, Math.min(1, point.weight / max)]), { radius: 38, blur: 24, maxZoom: 15, gradient: { 0.15: '#F8FAFC', 0.55: '#D97706', 1: '#15803D' } }).addTo(map);
    return () => map.removeLayer(layer);
  }, [map, points]);
  return null;
}

function FitPoints({ points }) {
  const map = useMap();
  useEffect(() => {
    const coordinates = points.filter(point => isWithinIloilo(point.lat, point.lng)).map(point => [point.lat, point.lng]);
    if (coordinates.length > 1) map.fitBounds(coordinates, { padding: [30, 30], maxZoom: 14 });
    else if (coordinates.length === 1) map.setView(coordinates[0], 14);
  }, [map, points]);
  return null;
}

export default function ImpactHeatmap() {
  const [points, setPoints] = useState([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(false);
  const [municipality, setMunicipality] = useState(''); const [barangay, setBarangay] = useState(''); const [filters, setFilters] = useState({});
  const refresh = useCallback(async () => {
    setLoading(true); setError('');
    try { const { data } = await api.get('/impact/heatmap', { params: filters }); setPoints(data.data.points || []); }
    catch (err) { setError(err.response?.data?.message || 'Heatmap data is unavailable.'); }
    finally { setLoading(false); }
  }, [filters]);
  useEffect(() => { refresh(); }, [refresh]);
  const localPoints = points.filter(point => isWithinIloilo(point.lat, point.lng));
  return <section className="panel heatmap-panel"><div><h2>Rescue and demand heatmap</h2><p className="panel-subtitle">Hotspots combine live portions with completed rescues, grouped by the merchant’s municipality and barangay.</p></div><form className="impact-filter-form" onSubmit={event => { event.preventDefault(); setFilters({ ...(municipality.trim() ? { municipality: municipality.trim() } : {}), ...(barangay.trim() ? { barangay: barangay.trim() } : {}) }); }}><input className="field-input" maxLength="100" value={municipality} onChange={event => setMunicipality(event.target.value)} placeholder="All municipalities" aria-label="Filter heatmap by municipality" /><input className="field-input" maxLength="100" value={barangay} onChange={event => setBarangay(event.target.value)} placeholder="All barangays" aria-label="Filter heatmap by barangay" /><button className="secondary-button" disabled={loading}>{loading ? 'Loading…' : 'Apply area'}</button><button className="text-button" type="button" onClick={() => { setMunicipality(''); setBarangay(''); setFilters({}); }}>Clear</button></form>{error && <p className="alert-banner" role="alert">{error}</p>}{localPoints.length === 0 && !loading && <p className="panel-subtitle">No rescue or active listing points match that area yet. The Iloilo map remains available.</p>}<MapContainer center={ILOILO_CENTER} zoom={13} {...ILOILO_MAP_OPTIONS} scrollWheelZoom={false} className="impact-map"><ReliableTileLayer />{localPoints.length > 0 && <><FitPoints points={localPoints} /><HeatLayer points={localPoints} /></>}</MapContainer><div className="heatmap-legend"><span>Lower activity</span><i /><span>Higher activity</span></div></section>;
}
