import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../utils/api.js';

const SCANNER_ID = 'salbarkain-qr-reader';
export default function MerchantScanner({ onNotice }) {
  const scannerRef = useRef(null); const busyRef = useRef(false); const [scanning, setScanning] = useState(false); const [feedback, setFeedback] = useState({ kind: '', text: '' });
  async function stopScanner() { const scanner = scannerRef.current; if (scanner?.isScanning) { await scanner.stop().catch(() => {}); } scanner?.clear?.(); scannerRef.current = null; setScanning(false); }
  async function verify(decoded) {
    if (busyRef.current) return; const token = decoded.trim();
    if (!/^[a-f0-9]{64}$/i.test(token)) { setFeedback({ kind: 'error', text: 'Invalid pickup pass. Ask the buyer to open their current QR pass.' }); return; }
    busyRef.current = true;
    try { const { data } = await api.patch(`/claims/${token}/verify`); setFeedback({ kind: 'success', text: `Pickup verified for ${data.data.claim.buyerName} · ${data.data.claim.qty} item(s).` }); onNotice?.('Pickup completed and verified.'); await stopScanner(); }
    catch (err) { setFeedback({ kind: 'error', text: err.response?.data?.message || 'Pass could not be verified for this store.' }); }
    finally { busyRef.current = false; }
  }
  async function startScanner() {
    setFeedback({ kind: '', text: '' });
    try { const scanner = new Html5Qrcode(SCANNER_ID, { verbose: false }); scannerRef.current = scanner; await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 230, height: 230 }, aspectRatio: 1 }, verify, () => {}); setScanning(true); }
    catch { setFeedback({ kind: 'error', text: 'Camera is unavailable. Allow camera access or use a secure HTTPS page.' }); await stopScanner(); }
  }
  useEffect(() => () => { const scanner = scannerRef.current; if (scanner?.isScanning) scanner.stop().catch(() => {}).finally(() => scanner.clear()); }, []);
  return <section className="panel scanner-panel"><h2>Verify a pickup pass</h2><p className="panel-subtitle">Scan the buyer’s QR at the counter. A pass can only be completed by its issuing store.</p><div id={SCANNER_ID} className="scanner-box" /><div className="mt-3 flex gap-2">{!scanning ? <button className="secondary-button" onClick={startScanner}>Open camera scanner</button> : <button className="secondary-button" onClick={stopScanner}>Stop scanner</button>}</div>{feedback.text && <div className={`scanner-feedback ${feedback.kind}`} role="status">{feedback.text}</div>}</section>;
}
