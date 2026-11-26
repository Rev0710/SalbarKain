import { useEffect } from 'react';
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

function FitBatches({ batches }) {
  const map = useMap();
  useEffect(() => {
    const points = batches.filter(x => x.merchantId?.location?.coordinates?.length === 2).map(x => [x.merchantId.location.coordinates[1], x.merchantId.location.coordinates[0]]);
    if (points.length > 1) map.fitBounds(points, { padding: [38, 38], maxZoom: 14 });
    else if (points.length === 1) map.setView(points[0], 14);
  }, [batches, map]);
  return null;
}

export default function BatchMap({ batches, onSelect }) {
  return <section className="map-panel" aria-label="Surplus food map"><MapContainer center={[10.72, 122.56]} zoom={12} scrollWheelZoom={false} preferCanvas>
    <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
    <FitBatches batches={batches} />
    {batches.map(batch => {
      const coordinates = batch.merchantId?.location?.coordinates;
      if (!coordinates || coordinates.length !== 2) return null;
      const point = [coordinates[1], coordinates[0]];
      return <CircleMarker key={batch._id} center={point} radius={9} pathOptions={{ className: `map-marker ${batch.isDonationOnly ? 'free' : ''}`, color: '#FFFFFF', weight: 2, fillColor: batch.isDonationOnly ? '#D97706' : '#15803D', fillOpacity: 1 }} eventHandlers={{ click: () => onSelect(batch) }}><Popup><p className="map-popup-title">{batch.itemName}</p><p className="map-popup-price">{batch.isDonationOnly ? 'Free for verified NGOs' : `₱${Number(batch.price).toFixed(2)}`}</p></Popup></CircleMarker>;
    })}
  </MapContainer></section>;
}
