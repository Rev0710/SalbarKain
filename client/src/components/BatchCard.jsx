import { useEffect, useState } from 'react';
import { formatTimeLeft } from '../utils/time.js';

export default function BatchCard({ batch, isNgo, onClaim, onSignIn, onReport }) {
  const [now, setNow] = useState(Date.now());
  const [time, setTime] = useState(() => formatTimeLeft(batch.expiresAt));
  useEffect(() => { const timer = setInterval(() => { setNow(Date.now()); setTime(formatTimeLeft(batch.expiresAt)); }, 1000); return () => clearInterval(timer); }, [batch.expiresAt]);
  const free = Boolean(batch.isDonationOnly);
  const flashActive = batch.isFlashDropEnabled && new Date(batch.expiresAt).getTime() - now <= 30 * 60 * 1000;
  const shownPrice = flashActive ? Number((Number(batch.price || 0) * 0.5).toFixed(2)) : Number(batch.price);
  const disabled = time === '00:00';
  return <article className="batch-card">
    <img className="batch-card-photo" src={batch.photoUrl} alt={batch.itemName} loading="lazy" />
    <div className="batch-card-info">
      <div className="batch-item"><h2 title={batch.itemName}>{batch.isMagicBayong ? `Surprise Magic Bayong` : batch.itemName}</h2><p title={batch.merchantId?.storeName}>{batch.merchantId?.storeName || 'Local food partner'}</p></div>
      <div className="batch-bottom"><div className="batch-price">{free || (flashActive && isNgo) ? <span className="free-badge">Free for NGOs</span> : <>{flashActive && <span className="flash-badge">Flash Drop</span>}{batch.originalPrice != null && <del className="text-muted mr-1">₱{Number(batch.originalPrice).toFixed(2)}</del>}₱{shownPrice.toFixed(2)}</>}</div><div className="urgency-action"><span className="countdown" aria-label={`${time} until pickup cutoff`}>{time}</span><button className="claim-button" disabled={disabled} onClick={() => onClaim(batch)}>{disabled ? 'Closed' : free && !isNgo ? 'NGO sign-in' : 'Claim batch'}</button></div></div>
      <button className="report-link" onClick={() => onReport(batch)} aria-label={`Report ${batch.itemName}`} title="Report this listing">⚑</button>
    </div>
  </article>;
}
