import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../utils/api.js';

const SCANNER_ID = 'salbarkain-qr-reader';
const FILE_READER_ID = 'salbarkain-qr-file-reader';

function normalizeCode(value) {
  const token = String(value || '').trim();
  if (/^[A-HJ-NP-Z2-9]{6}$/i.test(token)) return token.toUpperCase();
  if (/^[a-f0-9]{64}$/i.test(token)) return token.toLowerCase();
  return '';
}

function formatMoney(value) {
  const amount = Number(value) || 0;
  return amount > 0 ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount) : 'Free NGO rescue';
}

export default function MerchantScanner({ onNotice, onCompleted }) {
  const scannerRef = useRef(null);
  const fileScannerRef = useRef(null);
  const busyRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [fileBusy, setFileBusy] = useState(false);
  const [feedback, setFeedback] = useState({ kind: '', text: '' });

  async function stopScanner() {
    const scanner = scannerRef.current;
    if (scanner?.isScanning) await scanner.stop().catch(() => {});
    scanner?.clear?.();
    scannerRef.current = null;
    setScanning(false);
  }

  async function loadPreview(rawToken) {
    if (busyRef.current) return;
    const token = normalizeCode(rawToken);
    if (!token) {
      setFeedback({ kind: 'error', text: 'That QR does not contain a valid SalbarKain pickup code.' });
      return;
    }
    busyRef.current = true;
    setPreviewBusy(true);
    setFeedback({ kind: '', text: '' });
    try {
      await stopScanner();
      const { data } = await api.get(`/claims/${encodeURIComponent(token)}/preview`);
      setPreview(data?.data?.claim || null);
      setCode('');
    } catch (err) {
      setFeedback({ kind: 'error', text: err.response?.data?.message || 'This pickup code could not be opened for your store.' });
    } finally {
      setPreviewBusy(false);
      busyRef.current = false;
    }
  }

  async function readQrImage(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setFeedback({ kind: 'error', text: 'Choose an image that contains the buyer’s QR code.' });
      return;
    }
    setFeedback({ kind: '', text: '' });
    setFileBusy(true);
    try {
      await stopScanner();
      const scanner = new Html5Qrcode(FILE_READER_ID, { verbose: false });
      fileScannerRef.current = scanner;
      const decodedToken = await scanner.scanFile(file, false);
      await loadPreview(decodedToken);
    } catch {
      setFeedback({ kind: 'error', text: 'No pickup QR code was found in that image. Try a clear screenshot or photo.' });
    } finally {
      fileScannerRef.current?.clear?.();
      fileScannerRef.current = null;
      setFileBusy(false);
    }
  }

  async function confirmHandoff() {
    if (!preview?.qrToken || confirmBusy) return;
    setConfirmBusy(true);
    setFeedback({ kind: '', text: '' });
    try {
      const { data } = await api.patch(`/claims/${encodeURIComponent(preview.qrToken)}/verify`);
      const claim = data.data.claim;
      setPreview(null);
      setFeedback({ kind: 'success', text: `Pickup verified for ${claim.buyerName} · ${claim.qty} portion(s).` });
      window.dispatchEvent(new Event('salbarkain:rescue-completed'));
      onNotice?.('Pickup completed and verified.');
      await onCompleted?.();
    } catch (err) {
      setFeedback({ kind: 'error', text: err.response?.data?.message || 'This pass could not be verified for this store.' });
      setPreview(null);
    } finally { setConfirmBusy(false); }
  }

  async function startScanner() {
    setFeedback({ kind: '', text: '' });
    try {
      const scanner = new Html5Qrcode(SCANNER_ID, { verbose: false });
      scannerRef.current = scanner;
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 }, aspectRatio: 1 }, decoded => { void loadPreview(decoded); }, () => {});
      setScanning(true);
    } catch {
      setFeedback({ kind: 'error', text: 'Camera unavailable. Allow camera access on this secure page, or upload a QR image.' });
      await stopScanner();
    }
  }

  useEffect(() => () => {
    const scanner = scannerRef.current;
    if (scanner?.isScanning) scanner.stop().catch(() => {}).finally(() => scanner.clear());
    fileScannerRef.current?.clear?.();
  }, []);

  return <section className="panel scanner-panel merchant-scanner-panel" aria-labelledby="merchant-scanner-heading">
    <div className="merchant-scanner-heading"><div><h3 id="merchant-scanner-heading">Counter verification</h3><p>Scan or enter the buyer’s pickup code. Confirm the details before handoff.</p></div><span className="scanner-live-mark"><i /> Secure</span></div>
    <div className="merchant-scanner-viewfinder">
      <span className="scanner-corner top-left" aria-hidden="true" /><span className="scanner-corner top-right" aria-hidden="true" /><span className="scanner-corner bottom-left" aria-hidden="true" /><span className="scanner-corner bottom-right" aria-hidden="true" />
      <div id={SCANNER_ID} className="scanner-box" />
      {!scanning && <div className="merchant-scanner-placeholder"><span aria-hidden="true">▦</span><strong>Camera scanner is ready</strong><small>Keep the QR inside the frame</small></div>}
    </div>
    <button type="button" className="primary-button merchant-camera-toggle" onClick={scanning ? stopScanner : startScanner}>{scanning ? 'Stop camera scanner' : 'Start camera scanner'}</button>

    <div className="merchant-fallback-options">
      <label className="qr-image-upload" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); void readQrImage(event.dataTransfer.files?.[0]); }}>
        <span className="qr-fallback-icon" aria-hidden="true">▧</span>
        <strong>{fileBusy ? 'Reading image…' : 'Upload QR image'}</strong>
        <small>Choose or drop a screenshot</small>
        <input type="file" accept="image/*" disabled={fileBusy || previewBusy} onChange={event => { void readQrImage(event.target.files?.[0]); event.currentTarget.value = ''; }} />
      </label>
      <form className="merchant-code-entry" onSubmit={event => { event.preventDefault(); void loadPreview(code); }}>
        <label htmlFor="merchant-pickup-code">6-character pickup code</label>
        <input id="merchant-pickup-code" className="field-input" maxLength={6} minLength={6} autoComplete="off" spellCheck="false" value={code} onChange={event => setCode(event.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g, ''))} placeholder="K7M9P2" />
        <button type="submit" className="secondary-button" disabled={code.length !== 6 || previewBusy}>{previewBusy ? 'Checking…' : 'Verify code'}</button>
      </form>
    </div>
    <div id={FILE_READER_ID} className="qr-file-reader" aria-hidden="true" />
    {feedback.text && <div className={`scanner-feedback ${feedback.kind}`} role="status">{feedback.text}</div>}

    {preview && <div className="overlay merchant-handoff-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && setPreview(null)}>
      <section className="dialog merchant-handoff-dialog" role="dialog" aria-modal="true" aria-labelledby="handoff-title" aria-describedby="handoff-details">
        <button type="button" className="close-button" aria-label="Close pickup preview" onClick={() => setPreview(null)}>×</button>
        <p className="eyebrow">Confirm counter handoff</p>
        <h2 id="handoff-title">Pickup details</h2>
        <p className="panel-subtitle">Check the reservation and collect payment before confirming.</p>
        <dl id="handoff-details" className="handoff-detail-list">
          <div><dt>Buyer</dt><dd>{preview.buyerName}</dd></div>
          <div><dt>Item</dt><dd>{preview.itemName} · {preview.quantity} {preview.quantity === 1 ? 'portion' : 'portions'}</dd></div>
          <div><dt>Amount to collect</dt><dd>{formatMoney(preview.totalToCollect)}</dd></div>
          <div><dt>Pickup deadline</dt><dd>{new Date(preview.pickupDeadline).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</dd></div>
        </dl>
        <div className="handoff-dialog-actions"><button type="button" className="secondary-button" disabled={confirmBusy} onClick={() => setPreview(null)}>Back</button><button type="button" className="primary-button" disabled={confirmBusy} onClick={() => void confirmHandoff()}>{confirmBusy ? 'Confirming…' : 'Confirm handoff'}</button></div>
      </section>
    </div>}
  </section>;
}
