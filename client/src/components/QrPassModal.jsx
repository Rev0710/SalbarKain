import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { formatTimeLeft } from '../utils/time.js';
import { api } from '../utils/api.js';
import { getDeviceToken } from '../utils/identity.js';

export default function QrPassModal({ pass, onClose }) {
  const [time, setTime] = useState(() => formatTimeLeft(pass.pickupDeadline));
  const [impact, setImpact] = useState(() => { try { return JSON.parse(localStorage.getItem('salbarkain:myImpact') || 'null'); } catch { return null; } });
  const [confirmCancel, setConfirmCancel] = useState(false); const [cancelBusy, setCancelBusy] = useState(false); const [cancelError, setCancelError] = useState('');
  useEffect(() => { const t = setInterval(() => setTime(formatTimeLeft(pass.pickupDeadline)), 1000); return () => clearInterval(t); }, [pass.pickupDeadline]);
  useEffect(() => {
    let alive = true;
    let guest = {};
    try { guest = JSON.parse(localStorage.getItem('salbarkain_guest') || '{}'); } catch { guest = {}; }
    const phone = guest.phone || localStorage.getItem('salbarkain:buyerPhone');
    if (!phone || !navigator.onLine) return () => { alive = false; };
    api.get('/claims/my-impact', { params: { phone, deviceToken: guest.deviceToken || getDeviceToken() } }).then(({ data }) => {
      if (alive) { setImpact(data.data); localStorage.setItem('salbarkain:myImpact', JSON.stringify(data.data)); }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const batch = pass.batch || {};
  const coords = pass.coordinates || batch.merchantId?.location?.coordinates;
  const directions = coords?.length === 2 ? `https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}&travelmode=walking` : `https://www.openstreetmap.org/search?query=${encodeURIComponent(pass.storeAddress || batch.merchantId?.address || pass.storeName || 'Food partner')}`;
  const totalPrice = Number(pass.totalPrice ?? (Number(pass.priceAtClaim || 0) * Number(pass.qty || 1)));
  async function cancelReservation() {
    setCancelBusy(true); setCancelError('');
    try {
      await api.patch(`/claims/${encodeURIComponent(pass.qrToken)}/cancel`, { deviceToken: getDeviceToken() });
      onClose({ cancelled: true });
    } catch (error) { setCancelError(error.response?.data?.message || 'The pickup pass could not be cancelled. Reconnect and try again.'); setConfirmCancel(false); }
    finally { setCancelBusy(false); }
  }
  return <div className="overlay" role="presentation" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="dialog w-full max-w-md text-center" role="dialog" aria-modal="true" aria-labelledby="pass-title"><button className="close-button" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">Your digital pickup pass</p><h2 id="pass-title" className="mt-2 text-2xl font-semibold">Show this QR at pickup</h2><p className={`pass-countdown ${time === '00:00' ? 'expired' : ''}`} role="timer" aria-label="Time remaining">{time}</p><div className="pass-qr"><QRCodeSVG value={pass.qrToken} size={190} level="M" includeMargin /></div><p className="text-sm font-semibold">{batch.isMagicBayong ? 'Surprise Magic Bayong' : batch.itemName || pass.itemName || 'Surplus batch'} · {batch.merchantId?.storeName || pass.storeName || 'Food partner'}</p>{(pass.storeAddress || batch.merchantId?.address) && <p className="mt-1 text-xs text-muted">{pass.storeAddress || batch.merchantId.address}</p>}<p className="mt-1 text-xs text-muted">{totalPrice > 0 ? `Pay ₱${totalPrice.toFixed(2)} by cash or GCash at the store counter. ` : 'Free pickup. '}Pickup before the timer ends.</p>{impact && <div className="pass-impact"><strong>{impact.tier || 'Rookie Food Saver'}</strong><span>{Number(impact.rescues || 0)} completed rescues · ₱{Number(impact.moneySaved || 0).toFixed(2)} saved · {Number(impact.co2eKg || 0).toFixed(2)} kg CO₂e diverted</span></div>}<p className="offline-pass-note">Saved on this device and available offline.</p><a className="primary-button mt-5 w-full" href={directions} target="_blank" rel="noreferrer">Open walking directions</a>{cancelError && <p className="form-error mt-3" role="alert">{cancelError}</p>}{confirmCancel ? <div className="cancel-pass-confirm" role="group" aria-label="Confirm pickup cancellation"><p>Cancel this reservation? The portions will return to the marketplace and this QR pass will stop working.</p><div><button type="button" className="secondary-button" disabled={cancelBusy} onClick={() => setConfirmCancel(false)}>Keep pass</button><button type="button" className="cancel-pass-button" disabled={cancelBusy} onClick={cancelReservation}>{cancelBusy ? 'Cancelling…' : 'Yes, cancel reservation'}</button></div></div> : <button type="button" className="cancel-pass-button mt-3 w-full" disabled={time === '00:00' || cancelBusy} onClick={() => setConfirmCancel(true)}>Cancel pickup reservation</button>}<p className="mt-4"><span className="pass-code">Pass {pass.qrToken.slice(0, 12)}…</span></p></section></div>;
}
