import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { formatTimeLeft } from '../utils/time.js';

export default function QrPassModal({ pass, onClose }) {
  const [time, setTime] = useState(() => formatTimeLeft(pass.pickupDeadline));
  useEffect(() => { const t = setInterval(() => setTime(formatTimeLeft(pass.pickupDeadline)), 1000); return () => clearInterval(t); }, [pass.pickupDeadline]);
  const batch = pass.batch || {};
  const coords = batch.merchantId?.location?.coordinates;
  const directions = coords?.length === 2 ? `https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}&travelmode=walking` : `https://www.openstreetmap.org/search?query=${encodeURIComponent(batch.merchantId?.address || batch.merchantId?.storeName || 'Iloilo')}`;
  return <div className="overlay" role="presentation" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="dialog w-full max-w-md text-center" role="dialog" aria-modal="true" aria-labelledby="pass-title"><button className="close-button" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">Your digital pickup pass</p><h2 id="pass-title" className="mt-2 text-2xl font-semibold">Show this QR at pickup</h2><p className={`pass-countdown ${time === '00:00' ? 'expired' : ''}`} role="timer" aria-label="Time remaining">{time}</p><div className="pass-qr"><QRCodeSVG value={pass.qrToken} size={190} level="M" includeMargin /></div><p className="text-sm font-semibold">{batch.itemName || 'Surplus batch'} · {batch.merchantId?.storeName || 'Food partner'}</p><p className="mt-1 text-xs text-muted">Pickup before the timer ends. Pay at the store counter if applicable.</p><a className="primary-button mt-5 w-full" href={directions} target="_blank" rel="noreferrer">Get walking directions</a><p className="mt-4"><span className="pass-code">Pass {pass.qrToken.slice(0, 12)}…</span></p></section></div>;
}
