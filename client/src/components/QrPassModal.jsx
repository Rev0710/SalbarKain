import { useCallback, useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { formatTimeLeft } from '../utils/time.js';
import { api } from '../utils/api.js';
import { getDeviceToken } from '../utils/identity.js';

const ACTIVE_PASS_KEY = 'salbarkain_active_claim';
const LEGACY_PASS_KEY = 'salbarkain:pickupPass';
const TERMINAL_STATUSES = new Set(['completed', 'recalled', 'expired', 'cancelled']);

function rankFor(rescues) {
  return rescues >= 50 ? 'Master Salbar Champion' : rescues >= 10 ? 'Eco-Warrior' : rescues >= 1 ? 'Rookie Food Saver' : 'New Food Saver';
}

export default function QrPassModal({ pass, onClose, onStatusChange }) {
  const [time, setTime] = useState(() => formatTimeLeft(pass.pickupDeadline));
  const [claimStatus, setClaimStatus] = useState(pass.status || 'pending');
  const [impact, setImpact] = useState(() => { try { return JSON.parse(localStorage.getItem('salbarkain:myImpact') || 'null'); } catch { return null; } });
  const [celebrationRank, setCelebrationRank] = useState('Rookie Food Saver');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [copiedCode, setCopiedCode] = useState(false);
  const handledTerminal = useRef(false);
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;
  const terminal = TERMINAL_STATUSES.has(claimStatus);

  const refreshImpact = useCallback(async () => {
    let guest = {};
    try { guest = JSON.parse(localStorage.getItem('salbarkain_guest') || '{}'); } catch { guest = {}; }
    const phone = guest.phone || localStorage.getItem('salbarkain:buyerPhone');
    if (!phone || !navigator.onLine) return null;
    try {
      const { data } = await api.get('/claims/my-impact', { params: { phone, deviceToken: guest.deviceToken || getDeviceToken() } });
      const nextImpact = data?.data || null;
      if (nextImpact) {
        setImpact(nextImpact);
        localStorage.setItem('salbarkain:myImpact', JSON.stringify(nextImpact));
        setCelebrationRank(nextImpact.tier || rankFor(Number(nextImpact.rescues) || 0));
      }
      return nextImpact;
    } catch { return null; }
  }, []);

  useEffect(() => {
    if (claimStatus !== 'pending') return undefined;
    const timer = window.setInterval(() => setTime(formatTimeLeft(pass.pickupDeadline)), 1000);
    return () => window.clearInterval(timer);
  }, [claimStatus, pass.pickupDeadline]);

  useEffect(() => {
    if (claimStatus !== 'pending' || !pass.qrToken) return undefined;
    let alive = true;
    async function pollStatus() {
      try {
        const { data } = await api.get(`/claims/${encodeURIComponent(pass.qrToken)}/status`);
        const status = data?.data?.status;
        if (alive && typeof status === 'string' && status !== claimStatus) setClaimStatus(status);
      } catch { /* Keep the pass visible if the network is temporarily unavailable. */ }
    }
    void pollStatus();
    const timer = window.setInterval(pollStatus, 3000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [claimStatus, pass.qrToken]);

  useEffect(() => {
    if (!terminal || handledTerminal.current) return;
    handledTerminal.current = true;
    localStorage.removeItem(ACTIVE_PASS_KEY);
    localStorage.removeItem(LEGACY_PASS_KEY);
    onStatusChangeRef.current?.({ status: claimStatus });
    if (claimStatus === 'completed') {
      window.dispatchEvent(new Event('salbarkain:rescue-completed'));
      let previousRescues = Number(impact?.rescues) || 0;
      try {
        const cached = JSON.parse(localStorage.getItem('salbarkain:myImpact') || 'null');
        previousRescues = Number(cached?.rescues) || previousRescues;
      } catch { /* Use the in-memory impact total. */ }
      setCelebrationRank(rankFor(previousRescues + 1));
      void refreshImpact();
    }
  }, [claimStatus, impact?.rescues, refreshImpact, terminal]);

  useEffect(() => { void refreshImpact(); }, [refreshImpact]);

  const batch = pass.batch || {};
  const coords = pass.coordinates || batch.merchantId?.location?.coordinates;
  const directions = coords?.length === 2 ? `https://www.google.com/maps/dir/?api=1&destination=${coords[1]},${coords[0]}&travelmode=walking` : `https://www.openstreetmap.org/search?query=${encodeURIComponent(pass.storeAddress || batch.merchantId?.address || pass.storeName || 'Food partner')}`;
  const itemName = batch.isMagicBayong ? 'Surprise Magic Bayong' : batch.itemName || pass.itemName || 'Surplus batch';
  const quantity = Number(pass.quantity || pass.qty || 1);
  const storeName = batch.merchantId?.storeName || pass.storeName || 'Food partner';
  const totalPrice = Number(pass.totalPrice ?? (Number(pass.priceAtClaim || 0) * quantity));
  const displayToken = String(pass.qrToken || '').trim().toUpperCase();

  async function copyPickupCode() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(displayToken);
      else {
        const helper = document.createElement('textarea');
        helper.value = displayToken;
        helper.style.position = 'fixed';
        helper.style.opacity = '0';
        document.body.appendChild(helper);
        helper.select();
        document.execCommand('copy');
        helper.remove();
      }
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 1800);
    } catch { setCopiedCode(false); }
  }

  async function cancelReservation() {
    setCancelBusy(true);
    setCancelError('');
    try {
      await api.patch(`/claims/${encodeURIComponent(pass.qrToken)}/cancel`, { deviceToken: getDeviceToken() });
      localStorage.removeItem(ACTIVE_PASS_KEY);
      localStorage.removeItem(LEGACY_PASS_KEY);
      onClose({ cancelled: true, status: 'cancelled' });
    } catch (error) {
      setCancelError(error.response?.data?.message || 'The pickup pass could not be cancelled. Reconnect and try again.');
      setConfirmCancel(false);
    } finally { setCancelBusy(false); }
  }

  const isCompleted = claimStatus === 'completed';
  const terminalTitle = isCompleted ? 'Pickup verified & rescued!' : claimStatus === 'expired' ? 'Pickup pass expired' : claimStatus === 'recalled' ? 'Pickup pass recalled' : 'Reservation cancelled';
  const terminalCopy = isCompleted
    ? `You rescued ${quantity} ${quantity === 1 ? 'pack' : 'packs'} of ${itemName}!`
    : claimStatus === 'expired' ? 'This pickup window has ended. You can browse the marketplace for another batch.'
      : claimStatus === 'recalled' ? 'This pickup pass is no longer valid. Please check the marketplace for updates.'
        : 'This reservation is no longer active. You can claim another batch when you are ready.';

  return <div className="overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose(terminal ? { status: claimStatus } : undefined)}>
    <section className={`dialog w-full max-w-md text-center ${isCompleted ? 'pass-complete-dialog' : ''}`} role="dialog" aria-modal="true" aria-labelledby="pass-title">
      {terminal ? <>
        <div className={`pass-result-icon ${isCompleted ? 'success' : ''}`} aria-hidden="true">{isCompleted ? '✓' : claimStatus === 'expired' ? '⌛' : '•'}</div>
        <p className="eyebrow">{isCompleted ? 'Community rescue complete' : 'Pickup pass update'}</p>
        <h2 id="pass-title" className="pass-result-title">{terminalTitle}</h2>
        <p className="pass-result-copy">{terminalCopy}</p>
        {isCompleted && <div className="pass-impact pass-impact-complete"><strong>{celebrationRank || impact?.tier || 'Rookie Food Saver'}</strong><span>{Number(impact?.rescues || 0)} completed rescues · {Number(impact?.foodKg || 0).toFixed(1)} kg food saved</span></div>}
        <button type="button" className="primary-button mt-5 w-full" onClick={() => onClose({ status: claimStatus, completed: isCompleted })}>Done</button>
      </> : <>
        <button className="close-button" onClick={() => onClose()} aria-label="Close">×</button>
        <p className="eyebrow">Your digital pickup pass</p>
        <h2 id="pass-title" className="mt-2 text-2xl font-semibold">Show this QR at pickup</h2>
        <p className={`pass-countdown ${time === '00:00' ? 'expired' : ''}`} role="timer" aria-label="Time remaining">{time}</p>
        <div className="pass-qr"><QRCodeSVG value={displayToken} size={190} level="M" includeMargin /></div>
        <div className="pickup-code-block"><span>Pickup code</span><div><code>{displayToken}</code><button type="button" className="secondary-button compact" onClick={copyPickupCode}>{copiedCode ? 'Copied' : 'Copy code'}</button></div></div>
        <p className="text-sm font-semibold">{itemName} · {storeName}</p>
        {(pass.storeAddress || batch.merchantId?.address) && <p className="mt-1 text-xs text-muted">{pass.storeAddress || batch.merchantId.address}</p>}
        <p className="mt-1 text-xs text-muted">{totalPrice > 0 ? `Pay ₱${totalPrice.toFixed(2)} by cash or GCash at the store counter. ` : 'Free pickup. '}Pickup before the timer ends.</p>
        {impact && <div className="pass-impact"><strong>{impact.tier || 'New Food Saver'}</strong><span>{Number(impact.rescues || 0)} completed rescues · ₱{Number(impact.moneySaved || 0).toFixed(2)} saved · {Number(impact.co2eKg || 0).toFixed(2)} kg CO₂e diverted</span></div>}
        <p className="offline-pass-note">Saved on this device and available offline.</p>
        <a className="primary-button mt-5 w-full" href={directions} target="_blank" rel="noreferrer">Open walking directions</a>
        {cancelError && <p className="form-error mt-3" role="alert">{cancelError}</p>}
        {confirmCancel ? <div className="cancel-pass-confirm" role="group" aria-label="Confirm pickup cancellation"><p>Cancel this reservation? The portions will return to the marketplace and this QR pass will stop working.</p><div><button type="button" className="secondary-button" disabled={cancelBusy} onClick={() => setConfirmCancel(false)}>Keep pass</button><button type="button" className="cancel-pass-button" disabled={cancelBusy} onClick={cancelReservation}>{cancelBusy ? 'Cancelling…' : 'Yes, cancel reservation'}</button></div></div> : <button type="button" className="cancel-pass-button mt-3 w-full" disabled={time === '00:00' || cancelBusy} onClick={() => setConfirmCancel(true)}>Cancel pickup reservation</button>}
        {time === '00:00' && <p className="mt-2 text-xs text-muted" role="status">Checking whether this pickup pass has expired…</p>}
        <p className="mt-4"><span className="pass-code">Show the QR or give this code to the merchant.</span></p>
      </>}
    </section>
  </div>;
}
