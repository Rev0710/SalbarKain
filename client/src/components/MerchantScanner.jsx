import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../utils/api.js';

const SCANNER_ID = 'salbarkain-qr-reader';

export default function MerchantScanner({ onNotice, onCompleted }) {
  const scannerRef = useRef(null);
  const busyRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [manualToken, setManualToken] = useState('');
  const [feedback, setFeedback] = useState({ kind: '', text: '' });

  async function stopScanner() {
    const scanner = scannerRef.current;
    if (scanner?.isScanning) await scanner.stop().catch(() => {});
    scanner?.clear?.();
    scannerRef.current = null;
    setScanning(false);
  }

  async function verify(rawToken) {
    if (busyRef.current) return false;
    const token = String(rawToken || '').trim();
    if (!/^[a-f0-9]{64}$/i.test(token)) {
      setFeedback({ kind: 'error', text: 'Enter a valid 64-character pickup QR token.' });
      return false;
    }
    busyRef.current = true;
    setFeedback({ kind: '', text: '' });
    try {
      const { data } = await api.patch(`/claims/${token}/verify`);
      const claim = data.data.claim;
      setFeedback({ kind: 'success', text: `Pickup verified for ${claim.buyerName} · ${claim.qty} portion(s).` });
      setManualToken('');
      onNotice?.('Pickup completed and verified.');
      await stopScanner();
      await onCompleted?.();
      return true;
    } catch (err) {
      setFeedback({ kind: 'error', text: err.response?.data?.message || 'This pass could not be verified for this store.' });
      return false;
    } finally {
      busyRef.current = false;
    }
  }

  async function startScanner() {
    setFeedback({ kind: '', text: '' });
    try {
      const scanner = new Html5Qrcode(SCANNER_ID, { verbose: false });
      scannerRef.current = scanner;
      await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 }, aspectRatio: 1 }, decoded => { void verify(decoded); }, () => {});
      setScanning(true);
    } catch {
      setFeedback({ kind: 'error', text: 'Camera unavailable. Allow camera access on this secure page, or enter the token manually.' });
      await stopScanner();
    }
  }

  useEffect(() => () => {
    const scanner = scannerRef.current;
    if (scanner?.isScanning) scanner.stop().catch(() => {}).finally(() => scanner.clear());
  }, []);

  return <section className="panel scanner-panel merchant-scanner-panel" aria-labelledby="merchant-scanner-heading">
    <div className="merchant-scanner-heading"><div><h3 id="merchant-scanner-heading">Counter verification</h3><p>Scan the buyer’s QR pass or enter its token.</p></div><span className="scanner-live-mark"><i /> Secure</span></div>
    <div className="merchant-scanner-viewfinder">
      <span className="scanner-corner top-left" aria-hidden="true" /><span className="scanner-corner top-right" aria-hidden="true" /><span className="scanner-corner bottom-left" aria-hidden="true" /><span className="scanner-corner bottom-right" aria-hidden="true" />
      <div id={SCANNER_ID} className="scanner-box" />
      {!scanning && <div className="merchant-scanner-placeholder"><span aria-hidden="true">▦</span><strong>Camera scanner is ready</strong><small>Keep the QR inside the frame</small></div>}
    </div>
    <button type="button" className="primary-button merchant-camera-toggle" onClick={scanning ? stopScanner : startScanner}>{scanning ? 'Stop camera scanner' : 'Start camera scanner'}</button>
    <form className="merchant-manual-verify" onSubmit={event => { event.preventDefault(); void verify(manualToken); }}>
      <label htmlFor="merchant-manual-token">Manual QR token entry</label>
      <div><input id="merchant-manual-token" className="field-input" value={manualToken} onChange={event => setManualToken(event.target.value)} autoComplete="off" spellCheck="false" placeholder="Paste pickup token" /><button type="submit" className="secondary-button" disabled={!manualToken.trim() || busyRef.current}>Verify pass</button></div>
    </form>
    {feedback.text && <div className={`scanner-feedback ${feedback.kind}`} role="status">{feedback.text}</div>}
  </section>;
}
