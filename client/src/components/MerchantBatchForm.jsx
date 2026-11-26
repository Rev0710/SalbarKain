import { useEffect, useState } from 'react';
import imageCompression from 'browser-image-compression';

function localDateTime(value) { const offset = value.getTimezoneOffset() * 60000; return new Date(value.getTime() - offset).toISOString().slice(0, 16); }

export default function MerchantBatchForm({ onCreated, onNotice }) {
  const [itemName, setItemName] = useState(''); const [quantity, setQuantity] = useState(''); const [price, setPrice] = useState(''); const [donation, setDonation] = useState(false);
  const [expiresAt, setExpiresAt] = useState(() => localDateTime(new Date(Date.now() + 2 * 60 * 60 * 1000)));
  const [photo, setPhoto] = useState(null); const [preview, setPreview] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (!photo) { setPreview(''); return undefined; } const url = URL.createObjectURL(photo); setPreview(url); return () => URL.revokeObjectURL(url); }, [photo]);

  function choosePhoto(event) {
    const file = event.target.files?.[0]; setError('');
    if (!file) { setPhoto(null); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setPhoto(null); event.target.value = ''; setError('Choose a JPG, PNG, or WebP photo.'); return; }
    if (file.size > 5 * 1024 * 1024) { setPhoto(null); event.target.value = ''; setError('Choose a photo smaller than 5 MB.'); return; }
    setPhoto(file);
  }

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (!photo) throw new Error('Add one clear photo of the surplus food.');
      if (new Date(expiresAt).getTime() <= Date.now()) throw new Error('Choose a pickup cutoff later than now.');
      if (!donation && (!Number.isFinite(Number(price)) || Number(price) < 0)) throw new Error('Enter a valid discounted price.');
      const compressed = await imageCompression(photo, { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: true });
      const body = new FormData(); body.append('photo', compressed, compressed.name || 'surplus.jpg'); body.append('itemName', itemName.trim()); body.append('quantity', quantity); body.append('price', donation ? '0' : price); body.append('isDonationOnly', String(donation)); body.append('expiresAt', new Date(expiresAt).toISOString());
      await onCreated(body);
      setItemName(''); setQuantity(''); setPrice(''); setPhoto(null); event.currentTarget.reset();
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Could not post this batch.';
      setError(message); onNotice?.(message);
    } finally { setBusy(false); }
  }

  return <section className="panel"><h2>Post surplus in 30 seconds</h2><p className="panel-subtitle">A photo, quantity, price, and pickup cutoff are all a neighbor needs.</p><form className="form-stack" onSubmit={submit}>
    <label className="field-label">Item name<input className="field-input" required maxLength="120" value={itemName} onChange={e => setItemName(e.target.value)} placeholder="e.g. Pandesal pack" /></label>
    <div className="field-row"><label className="field-label">Portions<input className="field-input" type="number" min="1" max="10000" step="1" required value={quantity} onChange={e => setQuantity(e.target.value)} /></label><label className="field-label">Discounted price (₱)<input className="field-input" type="number" min="0" step="0.01" required={!donation} disabled={donation} value={donation ? '0' : price} onChange={e => setPrice(e.target.value)} /></label></div>
    <label className="checkbox-row"><input type="checkbox" checked={donation} onChange={e => setDonation(e.target.checked)} /> Donate this batch to verified NGOs</label>
    <label className="field-label">Pickup cutoff<input className="field-input" type="datetime-local" required min={localDateTime(new Date())} value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /></label>
    <label className="photo-drop">Batch photo · JPG, PNG or WebP<input type="file" accept="image/jpeg,image/png,image/webp" required onChange={choosePhoto} />{preview && <img className="photo-preview" src={preview} alt="Preview of selected surplus batch" />}</label>
    {error && <p className="alert-banner" role="alert">{error}</p>}
    <button className="primary-button w-full" disabled={busy || !photo}>{busy ? 'Compressing and posting…' : 'Post surplus batch'}</button>
  </form></section>;
}
