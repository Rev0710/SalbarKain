import { useEffect, useState } from 'react';
import { getDeviceToken, getGuestProfile, saveGuestProfile } from '../utils/identity.js';
import { api } from '../utils/api.js';
import { safeImageUrl } from '../utils/safeImageUrl.js';

const MAX_GUEST_QTY = 5;

export default function ClaimDrawer({ batch, onClose, onSubmit, verifiedNgo = false }) {
  const [name, setName] = useState(() => getGuestProfile().name);
  const [phone, setPhone] = useState(() => getGuestProfile().phone);
  const [qty, setQty] = useState(1);
  const [safetyAcknowledged, setSafetyAcknowledged] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [merchantReviews, setMerchantReviews] = useState([]);

  const donationOnly = Boolean(batch.isDonationOnly);
  const isNgo = Boolean(verifiedNgo || batch.verifiedNgo);
  const remaining = Math.max(0, Number(batch.remainingQty) || 0);
  const maxQty = isNgo ? remaining : Math.min(remaining, MAX_GUEST_QTY);
  const flashActive = Boolean(batch.isFlashDropEnabled && new Date(batch.expiresAt).getTime() - now <= 30 * 60 * 1000);
  const unitPrice = donationOnly || (flashActive && isNgo) ? 0 : flashActive ? Number((Number(batch.price || 0) * 0.5).toFixed(2)) : Number(batch.price || 0);
  const orderTotal = Number((unitPrice * qty).toFixed(2));
  const priorityActive = Boolean(batch.ngoPriorityUntil && new Date(batch.ngoPriorityUntil).getTime() > now);
  const ngoReserved = Boolean((donationOnly || priorityActive) && !isNgo);
  const merchant = batch.merchantId || {};
  const merchantName = merchant.storeName || 'Local food partner';
  const merchantLocation = [merchant.barangay, merchant.municipality, 'Iloilo'].filter(value => value && !/^unspecified$/i.test(String(value).trim())).join(', ');

  useEffect(() => {
    function onKeyDown(event) { if (event.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setQty(current => Math.max(1, Math.min(current, maxQty || 1)));
  }, [maxQty]);
  useEffect(() => {
    const merchantId = merchant._id;
    if (!merchantId) return undefined;
    let alive = true;
    api.get(`/merchants/${encodeURIComponent(merchantId)}/reviews`)
      .then(({ data }) => { if (alive) setMerchantReviews(Array.isArray(data?.data?.reviews) ? data.data.reviews : []); })
      .catch(() => { if (alive) setMerchantReviews([]); });
    return () => { alive = false; };
  }, [merchant._id]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    saveGuestProfile({ name, phone });
    try {
      await onSubmit({ buyerName: name.trim(), phone: phone.trim(), qty: Number(qty), quantity: Number(qty), safetyAcknowledged, deviceToken: getDeviceToken() });
    } catch (submitError) {
      const code = submitError.response?.data?.code;
      setError(['BATCH_UNAVAILABLE', 'PICKUP_PASS_EXPIRED', 'BATCH_EXPIRED'].includes(code)
        ? 'This batch just sold out or its safe pickup window ended. Choose another available batch.'
        : submitError.response?.data?.message || 'We could not reserve that batch. Please try again.');
    } finally { setBusy(false); }
  }

  function changeQuantity(next) {
    setQty(Math.max(1, Math.min(maxQty || 1, Number(next) || 1)));
  }

  const storageLabel = ({ room_temp_baked: 'Room Temp / Baked Goods', refrigerated_cooked: 'Refrigerated / Cooked Meal' })[batch.storageType] || 'Ask the store about storage';
  const consumeLabel = ({ '2_hours': '2 Hours', tonight: 'Tonight', '24_hours': '24 Hours' })[batch.consumeWithin] || 'Follow the posted pickup cutoff';
  const storePhotoUrl = safeImageUrl(merchant.storefrontPhotoUrl);

  return <div className="overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="dialog drawer" role="dialog" aria-modal="true" aria-labelledby="claim-title">
      <button className="close-button" onClick={onClose} aria-label="Close">×</button>
      <p className="eyebrow">Food details and pickup</p>
      <h2 id="claim-title" className="mt-2 text-2xl font-semibold">{batch.isMagicBayong ? 'Surprise Magic Bayong' : batch.itemName}</h2>
      {batch.isMagicBayong && <p className="form-note">Contents / assortment: {batch.itemName}</p>}
      <div className="claim-store-identity">
        {storePhotoUrl
          ? <><img className="store-logo-avatar" src={storePhotoUrl} alt={`${merchantName} logo`} onError={event => { event.currentTarget.hidden = true; event.currentTarget.nextElementSibling.hidden = false; }} /><span className="store-logo-avatar store-logo-fallback" aria-hidden="true" hidden>{merchantName.trim().charAt(0).toUpperCase()}</span></>
          : <span className="store-logo-avatar store-logo-fallback" aria-hidden="true">{merchantName.trim().charAt(0).toUpperCase()}</span>}
        <div><strong>{merchantName}</strong>{merchantLocation && <span>{merchantLocation}</span>}</div>
      </div>
      <p className="claim-price-line">{donationOnly || (flashActive && isNgo) ? 'Free for verified NGOs' : `₱${unitPrice.toFixed(2)} per pack`}{flashActive && !donationOnly && <span className="flash-badge ml-2">Flash Drop</span>}</p>
      {batch.merchantId?.averageRating > 0 && <p className="merchant-rating-pill">★ {Number(batch.merchantId.averageRating).toFixed(1)} · {batch.merchantId.totalReviews || 0} verified reviews</p>}
      {merchantReviews.length > 0 && <section className="public-merchant-reviews" aria-label="Recent verified buyer reviews"><h3>Recent verified reviews</h3>{merchantReviews.map(review => <article key={review.id}><div><strong>{review.buyerFirstName}</strong><span className="merchant-review-stars" aria-label={`${review.rating} out of 5 stars`}>{'★'.repeat(review.rating)}</span></div>{review.reviewComment && <p>{review.reviewComment}</p>}</article>)}</section>}
      {batch.isMagicBayong && <p className="form-note">Mixed end-of-night leftovers · estimated retail value ₱{Number(batch.retailValue || 0).toFixed(2)}</p>}
      {ngoReserved && <p className="priority-note reservation-lock" role="status">{donationOnly ? 'NGO Donation Only' : `Reserved for Verified NGOs until ${new Date(batch.ngoPriorityUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}</p>}
      <section className="food-safety-block" aria-label="Food safety details">
        <h3>Storage and allergens</h3><p>{storageLabel} · Consume within {consumeLabel}</p>
        {batch.safeUntil && <p>Safe until {new Date(batch.safeUntil).toLocaleString()}</p>}
        <div className="allergen-tags">{(batch.allergens?.length ? batch.allergens : ['Safety details unavailable']).map(tag => <span key={tag} className="allergen-tag">{tag}</span>)}</div>
        {batch.keyIngredients && <p>Key ingredients: {batch.keyIngredients}</p>}
        {priorityActive && <p className="priority-note">NGO priority is active for the first 15 minutes. This listing opens to other buyers at {new Date(batch.ngoPriorityUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</p>}
      </section>
      <form className="mt-6 grid gap-4" onSubmit={submit}>
        <fieldset className="quantity-stepper" disabled={busy || maxQty < 1}>
          <legend>Choose quantity <span>({isNgo ? `${remaining} available` : `up to ${MAX_GUEST_QTY} per buyer`})</span></legend>
          <div className="quantity-stepper-controls">
            <button type="button" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => changeQuantity(qty - 1)}>−</button>
            <input aria-label="Pickup quantity" type="number" min="1" max={maxQty} step="1" inputMode="numeric" value={qty} onChange={event => changeQuantity(event.target.value)} />
            <button type="button" aria-label="Increase quantity" disabled={qty >= maxQty} onClick={() => changeQuantity(qty + 1)}>+</button>
          </div>
        </fieldset>
        <label className="field-label">Full Name<input className="field-input" autoComplete="name" minLength="2" maxLength="100" required value={name} onChange={event => setName(event.target.value)} /></label>
        <label className="field-label">Mobile Number<input className="field-input" type="tel" autoComplete="tel" inputMode="numeric" pattern="09[0-9]{9}" maxLength="11" required value={phone} onChange={event => setPhone(event.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="09XXXXXXXXX" /></label>
        <label className="safety-acknowledgement"><input type="checkbox" checked={safetyAcknowledged} onChange={event => setSafetyAcknowledged(event.target.checked)} required /><span>I have reviewed the allergen and storage information.</span></label>
        <p className="form-note">Your details stay on this device for faster claiming. One active pickup at a time per device or mobile number.</p>
        {error && <p className="alert-banner" role="alert">{error}</p>}
        <div className="order-total-summary" role="status" aria-live="polite">{donationOnly ? 'Free NGO Donation' : orderTotal === 0 ? `Free for verified NGOs (${qty} ${qty === 1 ? 'pack' : 'packs'})` : `Total to pay at counter: ₱${orderTotal.toFixed(2)} (${qty} ${qty === 1 ? 'pack' : 'packs'})`}</div>
        <button className="primary-button w-full" disabled={busy || !safetyAcknowledged || ngoReserved || maxQty < 1}>{busy ? 'Reserving…' : ngoReserved ? 'Reserved for verified NGOs' : donationOnly ? 'Reserve donation' : 'Get pickup pass'}</button>
      </form>
    </section>
  </div>;
}
