import { useCallback, useEffect, useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { api } from '../utils/api.js';
import { formatCutoff } from '../utils/time.js';
import MerchantBatchForm from '../components/MerchantBatchForm.jsx';
import MerchantScanner from '../components/MerchantScanner.jsx';
import { InventorySkeletons } from '../components/LoadingSkeletons.jsx';

function VerificationUploadPanel() {
  const [document, setDocument] = useState(null);
  const [storefront, setStorefront] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function submit(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    setError('');
    setDone(false);
    if (!document) return setError('Choose a permit or verification photo.');
    const form = new FormData();
    form.append('verificationDoc', document);
    if (storefront) form.append('storefrontPhoto', storefront);
    setBusy(true);
    try {
      await api.patch('/auth/verification', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      formElement.reset();
      setDocument(null);
      setStorefront(null);
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Your verification documents could not be submitted.');
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel verification-upload">
    <h2>Submit verification documents</h2>
    <p className="panel-subtitle">A clear permit or verification photo lets the Iloilo review team approve your store.</p>
    <form className="form-stack" onSubmit={submit}>
      <label className="field-label">Permit / verification document<input className="field-input" type="file" accept="application/pdf,image/*" required onChange={event => setDocument(event.target.files?.[0] || null)} /></label>
      <label className="field-label">Storefront photo <span className="form-note">Optional</span><input className="field-input" type="file" accept="image/*" onChange={event => setStorefront(event.target.files?.[0] || null)} /></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      {done && <p className="verified-badge" role="status">Documents submitted for review.</p>}
      <button className="primary-button" disabled={busy}>{busy ? 'Submitting…' : 'Submit for review'}</button>
    </form>
  </section>;
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', maximumFractionDigits: 2 }).format(Number(value) || 0);
}

function countdown(deadline, now) {
  const remaining = Math.max(0, new Date(deadline).getTime() - now);
  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function downloadCertificate(storeName, completedRescues) {
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const width = pdf.internal.pageSize.getWidth();
  const height = pdf.internal.pageSize.getHeight();
  pdf.setFillColor(248, 250, 252);
  pdf.rect(0, 0, width, height, 'F');
  pdf.setDrawColor(21, 128, 61);
  pdf.setLineWidth(1.1);
  pdf.rect(12, 12, width - 24, height - 24);
  pdf.setTextColor(21, 128, 61);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13);
  pdf.text('SALBARKAIN · ILOILO FOOD RESCUE', width / 2, 45, { align: 'center' });
  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(30);
  pdf.text('Zero-Waste Partner', width / 2, 68, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(14);
  pdf.text('This certificate recognizes', width / 2, 87, { align: 'center' });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(23);
  pdf.text(String(storeName || 'Local food partner').slice(0, 58), width / 2, 103, { align: 'center' });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(13);
  pdf.text(`for completing ${completedRescues} food rescues and helping reduce surplus waste.`, width / 2, 119, { align: 'center' });
  pdf.setTextColor(100, 116, 139);
  pdf.setFontSize(11);
  pdf.text(`Issued ${new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}`, width / 2, 143, { align: 'center' });
  pdf.save('salbarkain-zero-waste-partner.pdf');
}

function StoreProfilePanel({ profile, onSaved, completedRescues }) {
  const [form, setForm] = useState({ contactNumber: '', defaultClosingTime: '20:30', pickupInstructions: '', defaultAllergens: ['None / Allergen-Free'] });
  const [photo, setPhoto] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [photoPreview, setPhotoPreview] = useState('');

  useEffect(() => {
    if (!profile) return;
    setForm({ contactNumber: profile.contactNumber || '', defaultClosingTime: profile.defaultClosingTime || '20:30', pickupInstructions: profile.pickupInstructions || '', defaultAllergens: profile.defaultAllergens?.length ? profile.defaultAllergens : ['None / Allergen-Free'] });
  }, [profile]);
  useEffect(() => {
    if (!photo) { setPhotoPreview(''); return undefined; }
    const url = URL.createObjectURL(photo); setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  function toggleDefaultAllergen(tag) {
    setForm(current => {
      if (tag === 'None / Allergen-Free') return { ...current, defaultAllergens: ['None / Allergen-Free'] };
      const selected = current.defaultAllergens.filter(value => value !== 'None / Allergen-Free');
      return { ...current, defaultAllergens: selected.includes(tag) ? selected.filter(value => value !== tag) : [...selected, tag] };
    });
  }

  async function save(event) {
    event.preventDefault(); setSaving(true); setError(''); setNotice('');
    const body = new FormData();
    body.append('contactNumber', form.contactNumber);
    body.append('defaultClosingTime', form.defaultClosingTime);
    body.append('pickupInstructions', form.pickupInstructions);
    body.append('defaultAllergens', JSON.stringify(form.defaultAllergens));
    if (photo) body.append('storefrontPhoto', photo);
    try {
      const { data } = await api.patch('/merchants/profile', body, { headers: { 'Content-Type': 'multipart/form-data' } });
      onSaved(data?.data?.profile);
      setPhoto(null);
      setNotice('Store profile saved. New batch forms will use these defaults.');
    } catch (err) { setError(err.response?.data?.message || 'Store profile could not be saved.'); }
    finally { setSaving(false); }
  }

  const verified = profile?.verificationStatus === 'verified';
  const verifyingOffice = profile?.verifiedBy?.municipality === 'ALL' ? 'Iloilo Province LGU' : profile?.verifiedBy?.municipality || profile?.verifiedBy?.name || 'Iloilo LGU';
  return <section className="panel merchant-profile-panel" aria-labelledby="merchant-profile-title">
    <div className="merchant-profile-heading"><div><p className="eyebrow">Store settings</p><h2 id="merchant-profile-title">Store Profile</h2><p className="panel-subtitle">Keep your pickup details current. Buyers see the contact and handoff instructions on their pass.</p></div><span className={`merchant-profile-status ${verified ? 'verified' : 'pending'}`}>{verified ? `Verified by ${verifyingOffice}` : 'Pending LGU review'}</span></div>
    <div className="merchant-profile-identity">
      <div className="merchant-profile-photo">{(photoPreview || profile?.storefrontPhotoUrl) ? <img src={photoPreview || profile.storefrontPhotoUrl} alt={`${profile?.storeName || 'Store'} storefront`} onError={event => { event.currentTarget.hidden = true; }} /> : <span>{(profile?.storeName || 'S').charAt(0).toUpperCase()}</span>}</div>
      <div className="merchant-profile-facts"><h3>{profile?.storeName || 'Your store'}</h3><p>{({ bakery: 'Bakery', eatery: 'Carinderia / Eatery', grocery: 'Minimart / Grocery', other: 'Other food partner' })[profile?.category] || 'Food partner'}</p><p>{[profile?.barangay, profile?.municipality, 'Iloilo'].filter(Boolean).join(', ')}</p>{profile?.address && <p>{profile.address}</p>}{profile?.verificationDocUrl && <a href={profile.verificationDocUrl} target="_blank" rel="noreferrer">View uploaded business permit ↗</a>}</div>
    </div>
    <form className="form-stack merchant-profile-form" onSubmit={save}>
      <label className="field-label">Storefront photo<input className="field-input" type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setPhoto(event.target.files?.[0] || null)} /><span className="form-note">JPG, PNG or WebP · up to 5 MB</span></label>
      <div className="field-row"><label className="field-label">Store contact number<input className="field-input" type="tel" maxLength="24" value={form.contactNumber} onChange={event => setForm(current => ({ ...current, contactNumber: event.target.value }))} placeholder="09XX XXX XXXX" /></label><label className="field-label">Typical closing time<input className="field-input" type="time" required value={form.defaultClosingTime} onChange={event => setForm(current => ({ ...current, defaultClosingTime: event.target.value }))} /></label></div>
      <label className="field-label">Pickup counter instructions<textarea className="field-input" rows="3" maxLength="240" value={form.pickupInstructions} onChange={event => setForm(current => ({ ...current, pickupInstructions: event.target.value }))} placeholder="e.g. Ask for the SalbarKain counter near the bread display" /></label>
      <fieldset className="allergen-picker"><legend>Default batch allergen notices</legend><div>{['None / Allergen-Free', 'Shrimp / Seafood', 'Peanuts / Tree Nuts', 'Dairy', 'Eggs', 'Gluten / Wheat', 'Pork (Non-Halal)'].map(tag => <button key={tag} type="button" aria-pressed={form.defaultAllergens.includes(tag)} className={`allergen-choice ${form.defaultAllergens.includes(tag) ? 'selected' : ''}`} onClick={() => toggleDefaultAllergen(tag)}>{tag}</button>)}</div><p className="form-note">These tags are preselected when you post a new batch.</p></fieldset>
      {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="verified-badge" role="status">{notice}</p>}
      <button className="primary-button" disabled={saving}>{saving ? 'Saving profile…' : 'Save store settings'}</button>
    </form>
    <div className="merchant-profile-recognition"><div><strong>Zero-Waste Partner</strong><span>{completedRescues}/50 rescues · {completedRescues >= 50 ? 'Certificate unlocked' : `${Math.max(0, 50 - completedRescues)} to go`}</span></div><div className="merchant-progress" role="progressbar" aria-label="Zero-Waste Partner milestone progress" aria-valuemin="0" aria-valuemax="50" aria-valuenow={Math.min(50, completedRescues)}><span style={{ width: `${Math.min(100, completedRescues / 50 * 100)}%` }} /></div>{completedRescues >= 50 && <button type="button" className="secondary-button" onClick={() => downloadCertificate(profile?.storeName, completedRescues)}>Download Zero-Waste Storefront Certificate (PDF)</button>}</div>
  </section>;
}

export default function MerchantDashboard({ session, onBrowse, onNotice }) {
  const [batches, setBatches] = useState([]);
  const [restockBatch, setRestockBatch] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [inventoryView, setInventoryView] = useState('active');
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [batchError, setBatchError] = useState('');
  const [completedRescues, setCompletedRescues] = useState(0);
  const [revenueRecovered, setRevenueRecovered] = useState(0);
  const [queue, setQueue] = useState([]);
  const [queueError, setQueueError] = useState('');
  const [queueLoading, setQueueLoading] = useState(true);
  const [busyClaim, setBusyClaim] = useState('');
  const [now, setNow] = useState(Date.now());
  const [profile, setProfile] = useState(null);
  const [profileError, setProfileError] = useState('');
  const [dashboardTab, setDashboardTab] = useState('operations');
  const [reviewsData, setReviewsData] = useState({ averageRating: 0, totalReviews: 0, reviews: [] });
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewsError, setReviewsError] = useState('');
  const isVerified = session.verificationStatus === 'verified' || session.verified === true;

  const reloadBatches = useCallback(async () => {
    setLoadingBatches(true);
    try {
      const { data } = await api.get('/batches/mine');
      setBatches(Array.isArray(data?.data?.batches) ? data.data.batches : []);
      setBatchError('');
    } catch (err) {
      setBatchError(err.response?.data?.message || 'Your batches could not load.');
    } finally {
      setLoadingBatches(false);
    }
  }, []);

  const reloadQueue = useCallback(async () => {
    if (!isVerified) {
      setQueue([]);
      setQueueLoading(false);
      return;
    }
    try {
      const { data } = await api.get('/claims/merchant-active');
      setQueue(Array.isArray(data?.data?.claims) ? data.data.claims : []);
      setQueueError('');
    } catch (err) {
      setQueueError(err.response?.data?.message || 'Reservations could not load.');
    } finally {
      setQueueLoading(false);
    }
  }, [isVerified]);

  const reloadImpact = useCallback(async () => {
    if (!isVerified) return;
    try {
      const { data } = await api.get('/claims/merchant-impact');
      setCompletedRescues(Number(data?.data?.completedRescues) || 0);
      setRevenueRecovered(Number(data?.data?.revenueRecovered) || 0);
    } catch {
      setCompletedRescues(0);
      setRevenueRecovered(0);
    }
  }, [isVerified]);

  const reloadReviews = useCallback(async () => {
    setReviewsLoading(true);
    try {
      const { data } = await api.get('/merchants/reviews');
      setReviewsData({ averageRating: Number(data?.data?.averageRating) || 0, totalReviews: Number(data?.data?.totalReviews) || 0, reviews: Array.isArray(data?.data?.reviews) ? data.data.reviews : [] });
      setReviewsError('');
    } catch (err) { setReviewsError(err.response?.data?.message || 'Customer reviews could not load.'); }
    finally { setReviewsLoading(false); }
  }, []);

  useEffect(() => { void reloadBatches(); }, [reloadBatches]);
  useEffect(() => {
    let alive = true;
    api.get('/merchants/profile').then(({ data }) => { if (alive) { setProfile(data?.data?.profile || null); setProfileError(''); } }).catch(err => { if (alive) setProfileError(err.response?.data?.message || 'Store profile could not load.'); });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    void reloadQueue();
    const timer = window.setInterval(() => void reloadQueue(), 20_000);
    return () => window.clearInterval(timer);
  }, [reloadQueue]);
  useEffect(() => { void reloadImpact(); }, [reloadImpact]);
  useEffect(() => { if (dashboardTab === 'reviews') void reloadReviews(); }, [dashboardTab, reloadReviews]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activeBatches = useMemo(() => batches.filter(batch =>
    ['active', 'sold_out'].includes(batch.status)
    && new Date(batch.expiresAt).getTime() > now
    && new Date(batch.safeUntil || batch.expiresAt).getTime() > now,
  ), [batches, now]);
  const expiredBatches = useMemo(() => batches.filter(batch =>
    batch.status === 'expired' || new Date(batch.expiresAt).getTime() <= now || new Date(batch.safeUntil || batch.expiresAt).getTime() <= now,
  ), [batches, now]);
  const activePacks = activeBatches.reduce((total, batch) => total + Math.max(0, Number(batch.remainingQty) || 0), 0);
  const listedBatches = inventoryView === 'active' ? activeBatches : expiredBatches;
  const milestoneProgress = Math.min(100, (completedRescues / 50) * 100);

  async function createBatch(form) {
    await api.post('/batches', form, { headers: { 'Content-Type': 'multipart/form-data' } });
    setRestockBatch(null);
    setPreviewUrl('');
    await reloadBatches();
    onNotice?.('Your surplus batch is live on the marketplace.');
  }

  function chooseRestock(batch) {
    setRestockBatch(batch);
    setPreviewUrl(typeof batch.photoUrl === 'string' ? batch.photoUrl.trim() : '');
    document.getElementById('merchant-batch-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function confirmHandoff(qrToken) {
    setBusyClaim(qrToken);
    try {
      await api.patch(`/claims/${qrToken}/verify`);
      window.dispatchEvent(new Event('salbarkain:rescue-completed'));
      await Promise.all([reloadQueue(), reloadImpact(), reloadBatches()]);
      onNotice?.('Pickup handed off and verified.');
    } catch (err) {
      onNotice?.(err.response?.data?.message || 'This pickup could not be confirmed.');
      await reloadQueue();
    } finally {
      setBusyClaim('');
    }
  }

  return <main className="dashboard-shell merchant-dashboard">
    <header className="dashboard-heading merchant-heading">
      <div><p className="eyebrow">Merchant operations</p><h1>{session.storeName || 'Your store'}</h1><p>Today’s rescue activity, pickup counter, and surplus inventory.</p></div>
      <button className="secondary-button" onClick={onBrowse}>View marketplace</button>
    </header>

    <div className="merchant-dashboard-tabs" role="tablist" aria-label="Merchant workspace sections">
      <button type="button" role="tab" aria-selected={dashboardTab === 'operations'} className={dashboardTab === 'operations' ? 'active' : ''} onClick={() => setDashboardTab('operations')}>Operations</button>
      <button type="button" role="tab" aria-selected={dashboardTab === 'reviews'} className={dashboardTab === 'reviews' ? 'active' : ''} onClick={() => setDashboardTab('reviews')}>Customer reviews</button>
      <button type="button" role="tab" aria-selected={dashboardTab === 'profile'} className={dashboardTab === 'profile' ? 'active' : ''} onClick={() => setDashboardTab('profile')}>Store profile</button>
    </div>

    {dashboardTab === 'profile' ? <>
      {profileError && <div className="alert-banner" role="alert">{profileError} <button type="button" className="text-button" onClick={() => api.get('/merchants/profile').then(({ data }) => { setProfile(data?.data?.profile || null); setProfileError(''); }).catch(err => setProfileError(err.response?.data?.message || 'Store profile could not load.'))}>Try again</button></div>}
      <StoreProfilePanel profile={profile} onSaved={setProfile} completedRescues={completedRescues} />
    </> : dashboardTab === 'reviews' ? <section className="panel merchant-customer-reviews" aria-labelledby="merchant-reviews-title">
      <div className="merchant-queue-heading"><div><p className="eyebrow">Verified pickups only</p><h2 id="merchant-reviews-title">Customer reviews</h2><p className="panel-subtitle">Feedback from buyers whose pickup was confirmed at your counter.</p></div><button type="button" className="secondary-button compact" onClick={() => void reloadReviews()}>Refresh</button></div>
      <div className="merchant-reviews-summary"><strong>★ {reviewsData.averageRating.toFixed(1)}</strong><span>average from {reviewsData.totalReviews} {reviewsData.totalReviews === 1 ? 'review' : 'reviews'}</span></div>
      {reviewsLoading ? <p className="panel-subtitle">Loading customer feedback…</p> : reviewsError ? <div className="merchant-inline-error" role="alert">{reviewsError}<button className="text-button" onClick={() => void reloadReviews()}>Try again</button></div> : reviewsData.reviews.length === 0 ? <div className="merchant-queue-empty"><strong>No reviews yet</strong><span>After a verified pickup, buyers can rate their food and counter experience.</span></div> : <div className="merchant-review-list">{reviewsData.reviews.map(review => <article className="merchant-review-card" key={review.id}><div className="merchant-review-topline"><strong>{review.buyerFirstName}</strong><span className="merchant-review-stars" aria-label={`${review.rating} out of 5 stars`}>{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span></div><div className="merchant-review-meta">{review.itemName} · {new Date(review.reviewedAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</div><p className="merchant-review-comment">{review.reviewComment || 'Rating submitted without a written comment.'}</p></article>)}</div>}
    </section> : <>

    {!isVerified && <div className="alert-banner verification-banner"><strong>Verification {session.verificationStatus === 'rejected' ? 'needs attention' : 'pending'}.</strong> Your listing and pickup tools unlock after the review team approves your account.</div>}
    {!isVerified && <VerificationUploadPanel />}

    <section className="merchant-kpis" aria-label="Store performance">
      <article className="merchant-kpi"><span>Meals rescued</span><strong>{completedRescues}</strong><small>{(completedRescues * 0.5).toFixed(1)} kg food diverted</small></article>
      <article className="merchant-kpi"><span>Revenue recovered</span><strong>{formatMoney(revenueRecovered)}</strong><small>From completed discounted pickups</small></article>
      <article className="merchant-kpi"><span>Active live packs</span><strong>{activePacks}</strong><small>Available portions on the marketplace</small></article>
      <article className="merchant-kpi merchant-milestone"><div className="merchant-milestone-title"><span>Zero-Waste Partner</span><strong>{completedRescues}/50</strong></div><small>{completedRescues >= 50 ? 'Milestone reached' : `${50 - completedRescues} rescues to certificate`}</small><div className="merchant-progress" role="progressbar" aria-label="Zero-Waste Partner milestone progress" aria-valuemin="0" aria-valuemax="50" aria-valuenow={Math.min(50, completedRescues)}><span style={{ width: `${milestoneProgress}%` }} /></div>{completedRescues >= 50 && <button className="secondary-button merchant-certificate" onClick={() => downloadCertificate(session.storeName, completedRescues)}>Download Certificate (PDF)</button>}</article>
    </section>

    <section className="merchant-operations-hub" aria-labelledby="merchant-operations-title">
      <div className="merchant-section-heading"><div><p className="eyebrow">At the counter</p><h2 id="merchant-operations-title">Live pickup queue &amp; QR verification</h2></div><span className="merchant-queue-count">{queue.length} waiting</span></div>
      <div className="merchant-operations-grid">
        <MerchantScanner onNotice={onNotice} onCompleted={() => Promise.all([reloadQueue(), reloadImpact(), reloadBatches()])} />
        <section className="panel merchant-queue-panel" aria-label="Incoming buyer reservations">
          <div className="merchant-queue-heading"><div><h3>Incoming reservations</h3><p className="panel-subtitle">Confirm pickup after payment at the counter.</p></div><button type="button" className="secondary-button compact" onClick={() => void reloadQueue()}>Refresh</button></div>
          {queueLoading ? <div className="merchant-queue-skeleton" aria-label="Loading reservations"><i /><i /><i /></div> : queueError ? <div className="merchant-inline-error" role="alert">{queueError}<button type="button" className="text-button" onClick={() => void reloadQueue()}>Try again</button></div> : queue.length === 0 ? <div className="merchant-queue-empty"><strong>No buyers waiting</strong><span>New pickup passes will appear here automatically.</span></div> : <div className="merchant-queue-list">{queue.map(claim => {
            const urgent = new Date(claim.pickupDeadline).getTime() - now <= 10 * 60 * 1000;
            return <article className="merchant-reservation" key={claim.id}>
              <div className="merchant-reservation-main"><strong>{claim.buyerName}</strong><span>{claim.itemName} · {claim.qty} {claim.qty === 1 ? 'portion' : 'portions'}</span></div>
              <div className="merchant-reservation-meta"><span className={`merchant-countdown ${urgent ? 'urgent' : ''}`}>{countdown(claim.pickupDeadline, now)}</span><strong>{formatMoney(claim.totalToCollect)}</strong><small>Cash / GCash at counter</small></div>
              <button type="button" className="primary-button compact merchant-handoff" disabled={busyClaim === claim.qrToken} onClick={() => void confirmHandoff(claim.qrToken)}>{busyClaim === claim.qrToken ? 'Confirming…' : 'Confirm handoff'}</button>
            </article>;
          })}</div>}
        </section>
      </div>
    </section>

    <section className="merchant-work-grid" aria-label="Manage surplus">
      <div id="merchant-batch-form"><MerchantBatchForm onCreated={createBatch} onNotice={onNotice} disabled={!isVerified} restockBatch={restockBatch} previewUrl={previewUrl} storeProfile={profile} /></div>
      <section className="panel merchant-inventory-panel">
        <div className="merchant-inventory-heading"><div><h2>Your listed batches</h2><p className="panel-subtitle">Review what is live and repost a previous batch when it returns.</p></div><div className="merchant-inventory-filters" role="group" aria-label="Filter listed batches"><button type="button" className={inventoryView === 'active' ? 'active' : ''} aria-pressed={inventoryView === 'active'} onClick={() => setInventoryView('active')}>Active <span>{activeBatches.length}</span></button><button type="button" className={inventoryView === 'expired' ? 'active' : ''} aria-pressed={inventoryView === 'expired'} onClick={() => setInventoryView('expired')}>Expired / archive <span>{expiredBatches.length}</span></button></div></div>
        {loadingBatches ? <InventorySkeletons /> : batchError ? <div className="merchant-inline-error" role="alert">{batchError}<button type="button" className="text-button" onClick={() => void reloadBatches()}>Try again</button></div> : listedBatches.length === 0 ? <div className="merchant-queue-empty"><strong>{inventoryView === 'active' ? 'No live batches right now' : 'No expired batches to archive'}</strong><span>{inventoryView === 'active' ? 'Post tonight’s surplus and it will appear in the public marketplace.' : 'Past batches will collect here so they do not crowd your live inventory.'}</span></div> : <div className="inventory-list merchant-inventory-list">{listedBatches.map(batch => <article className="inventory-row merchant-inventory-row" key={batch._id}>
          {typeof batch.photoUrl === 'string' && batch.photoUrl.trim() && <img src={batch.photoUrl} alt={batch.itemName} loading="lazy" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = '/demo-images/pandesal.svg'; }} />}
          <div><h3>{batch.itemName}</h3><p>{batch.remainingQty} of {batch.quantity} portions · {batch.isDonationOnly ? 'Free NGO donation' : formatMoney(batch.price)} · until {formatCutoff(batch.expiresAt)}</p></div>
          <span className={`status-tag ${batch.status}`}>{batch.status === 'expired' || new Date(batch.expiresAt).getTime() <= now ? 'Expired' : batch.status === 'sold_out' ? 'Sold out' : 'Active'}</span>
          {inventoryView === 'expired' && <button type="button" className="secondary-button compact" disabled={!isVerified} onClick={() => chooseRestock(batch)}>Repost</button>}
        </article>)}</div>}
      </section>
    </section>
    </>}
  </main>;
}
