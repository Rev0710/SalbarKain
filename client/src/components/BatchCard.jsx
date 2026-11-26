import { useEffect, useState } from 'react';
import { formatTimeLeft } from '../utils/time.js';

export default function BatchCard({ batch, isNgo, onClaim, onSignIn }) {
  const [time, setTime] = useState(() => formatTimeLeft(batch.expiresAt));
  useEffect(() => { const timer = setInterval(() => setTime(formatTimeLeft(batch.expiresAt)), 1000); return () => clearInterval(timer); }, [batch.expiresAt]);
  const free = Boolean(batch.isDonationOnly);
  const disabled = time === '00:00';
  return <article className="batch-card">
    <img className="batch-card-photo" src={batch.photoUrl} alt={batch.itemName} loading="lazy" />
    <div className="batch-card-info">
      <div className="batch-item"><h2 title={batch.itemName}>{batch.itemName}</h2><p title={batch.merchantId?.storeName}>{batch.merchantId?.storeName || 'Local food partner'}</p></div>
      <div className="batch-bottom"><div className="batch-price">{free ? <span className="free-badge">Free for NGOs</span> : `₱${Number(batch.price).toFixed(2)}`}</div><div className="urgency-action"><span className="countdown" aria-label={`${time} until pickup cutoff`}>{time}</span><button className="claim-button" disabled={disabled || (free && !isNgo)} onClick={() => free && !isNgo ? onSignIn() : onClaim(batch)}>{free && !isNgo ? 'NGO only' : disabled ? 'Closed' : 'Claim batch'}</button></div></div>
    </div>
  </article>;
}
