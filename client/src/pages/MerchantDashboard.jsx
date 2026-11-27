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

export default function MerchantDashboard({ session, onBrowse, onNotice }) {
  const [batches, setBatches] = useState([]);
  const [restockBatch, setRestockBatch] = useState(null);
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

  useEffect(() => { void reloadBatches(); }, [reloadBatches]);
  useEffect(() => {
    void reloadQueue();
    const timer = window.setInterval(() => void reloadQueue(), 20_000);
    return () => window.clearInterval(timer);
  }, [reloadQueue]);
  useEffect(() => { void reloadImpact(); }, [reloadImpact]);
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
    await reloadBatches();
    onNotice?.('Your surplus batch is live on the marketplace.');
  }

  function chooseRestock(batch) {
    setRestockBatch(batch);
    document.getElementById('merchant-batch-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function confirmHandoff(qrToken) {
    setBusyClaim(qrToken);
    try {
      await api.patch(`/claims/${qrToken}/verify`);
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
      <div id="merchant-batch-form"><MerchantBatchForm onCreated={createBatch} onNotice={onNotice} disabled={!isVerified} restockBatch={restockBatch} /></div>
      <section className="panel merchant-inventory-panel">
        <div className="merchant-inventory-heading"><div><h2>Your listed batches</h2><p className="panel-subtitle">Review what is live and repost a previous batch when it returns.</p></div><div className="merchant-inventory-filters" role="group" aria-label="Filter listed batches"><button type="button" className={inventoryView === 'active' ? 'active' : ''} aria-pressed={inventoryView === 'active'} onClick={() => setInventoryView('active')}>Active <span>{activeBatches.length}</span></button><button type="button" className={inventoryView === 'expired' ? 'active' : ''} aria-pressed={inventoryView === 'expired'} onClick={() => setInventoryView('expired')}>Expired / archive <span>{expiredBatches.length}</span></button></div></div>
        {loadingBatches ? <InventorySkeletons /> : batchError ? <div className="merchant-inline-error" role="alert">{batchError}<button type="button" className="text-button" onClick={() => void reloadBatches()}>Try again</button></div> : listedBatches.length === 0 ? <div className="merchant-queue-empty"><strong>{inventoryView === 'active' ? 'No live batches right now' : 'No expired batches to archive'}</strong><span>{inventoryView === 'active' ? 'Post tonight’s surplus and it will appear in the public marketplace.' : 'Past batches will collect here so they do not crowd your live inventory.'}</span></div> : <div className="inventory-list merchant-inventory-list">{listedBatches.map(batch => <article className="inventory-row merchant-inventory-row" key={batch._id}>
          <img src={batch.photoUrl} alt={batch.itemName} loading="lazy" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = '/demo-images/pandesal.svg'; }} />
          <div><h3>{batch.itemName}</h3><p>{batch.remainingQty} of {batch.quantity} portions · {batch.isDonationOnly ? 'Free NGO donation' : formatMoney(batch.price)} · until {formatCutoff(batch.expiresAt)}</p></div>
          <span className={`status-tag ${batch.status}`}>{batch.status === 'expired' || new Date(batch.expiresAt).getTime() <= now ? 'Expired' : batch.status === 'sold_out' ? 'Sold out' : 'Active'}</span>
          {inventoryView === 'expired' && <button type="button" className="secondary-button compact" disabled={!isVerified} onClick={() => chooseRestock(batch)}>Repost</button>}
        </article>)}</div>}
      </section>
    </section>
  </main>;
}
