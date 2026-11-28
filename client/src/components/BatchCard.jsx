import { useEffect, useState } from 'react';
import { formatTimeLeft } from '../utils/time.js';
import { safeImageUrl } from '../utils/safeImageUrl.js';

export default function BatchCard({ batch, isNgo, distanceLabel = '', onClaim, onSignIn, onReport }) {
  const [now, setNow] = useState(Date.now());
  const [time, setTime] = useState(() => formatTimeLeft(batch.expiresAt));
  useEffect(() => { const timer = setInterval(() => { setNow(Date.now()); setTime(formatTimeLeft(batch.expiresAt)); }, 1000); return () => clearInterval(timer); }, [batch.expiresAt]);
  const free = Boolean(batch.isDonationOnly);
  const flashActive = batch.isFlashDropEnabled && new Date(batch.expiresAt).getTime() - now <= 30 * 60 * 1000;
  const priorityActive = Boolean(batch.ngoPriorityUntil && new Date(batch.ngoPriorityUntil).getTime() > now);
  const ngoPriorityLocked = Boolean(priorityActive && !isNgo);
  const shownPrice = flashActive ? Number((Number(batch.price || 0) * 0.5).toFixed(2)) : Number(batch.price);
  const remaining = Math.max(0, Number(batch.remainingQty) || 0);
  const total = Math.max(remaining, Number(batch.quantity) || remaining);
  const disabled = time === '00:00';
  const barangay = String(batch.merchantId?.barangay || '').replace(/\bunspecified\b/gi, '').trim();
  const municipality = String(batch.merchantId?.municipality || '').replace(/\bunspecified\b/gi, '').trim();
  const merchantLocation = barangay || municipality || 'Iloilo Province';
  const photoUrl = safeImageUrl(batch.photoUrl) || '/demo-images/pandesal.svg';
  const storePhotoUrl = safeImageUrl(batch.merchantId?.storefrontPhotoUrl);
  return <article className="batch-card">
    <img className="batch-card-photo" src={photoUrl} alt={batch.itemName} loading="lazy" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = '/demo-images/pandesal.svg'; }} />
    <div className="batch-card-info">
      <div className="batch-item"><h2 title={batch.itemName}>{batch.isMagicBayong ? 'Surprise Magic Bayong' : batch.itemName}</h2><p className="batch-merchant-line" title={`${batch.merchantId?.storeName || 'Local food partner'} · ${merchantLocation}${distanceLabel ? ` · ${distanceLabel}` : ''}`}>
        {storePhotoUrl
          ? <><img className="store-logo-avatar" src={storePhotoUrl} alt="" loading="lazy" onError={event => { event.currentTarget.hidden = true; event.currentTarget.nextElementSibling.hidden = false; }} /><span className="store-logo-avatar store-logo-fallback" aria-hidden="true" hidden>{(batch.merchantId?.storeName || 'L').trim().charAt(0).toUpperCase()}</span></>
          : <span className="store-logo-avatar store-logo-fallback" aria-hidden="true">{(batch.merchantId?.storeName || 'L').trim().charAt(0).toUpperCase()}</span>}
        <span>{batch.merchantId?.storeName || 'Local food partner'}</span>
        <span className="merchant-rating-pill">{Number(batch.merchantId?.totalReviews) > 0 ? <>★ {Number(batch.merchantId.averageRating || 0).toFixed(1)} ({batch.merchantId.totalReviews})</> : 'New Partner'}</span>
        <span>· {merchantLocation}</span>
        {distanceLabel && <span className="batch-distance">· {distanceLabel}</span>}
      </p></div>
      <div className="batch-bottom"><div className="batch-price">{free || (flashActive && isNgo) ? <span className="free-badge">Free for NGOs</span> : <>{flashActive && <span className="flash-badge">Flash Drop · 50% off</span>}{batch.originalPrice != null && <del className="text-muted mr-1">₱{Number(batch.originalPrice).toFixed(2)}</del>}₱{shownPrice.toFixed(2)}</>}{ngoPriorityLocked && <span className="ngo-priority-badge">NGO priority until {new Date(batch.ngoPriorityUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>}<span className={`batch-stock ${remaining <= 2 ? 'low-stock' : ''}`}>{remaining} of {total} remaining</span></div><div className="urgency-action"><span className="countdown" aria-label={`${time} until pickup cutoff`}>{time}</span><button className="claim-button" disabled={disabled || remaining === 0 || ngoPriorityLocked} onClick={() => onClaim(batch)}>{disabled || remaining === 0 ? 'Closed' : ngoPriorityLocked ? 'Reserved for NGOs' : free && !isNgo ? 'NGO sign-in' : 'View & Claim'}</button></div></div>
      <button className="report-link" onClick={() => onReport(batch)} aria-label={`Report ${batch.itemName}`} title="Report this listing">⚑</button>
    </div>
  </article>;
}
