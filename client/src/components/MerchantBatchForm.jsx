import { useEffect, useState } from 'react';
import imageCompression from 'browser-image-compression';

const ALLERGENS = ['None / Allergen-Free', 'Shrimp / Seafood', 'Peanuts / Tree Nuts', 'Dairy', 'Eggs', 'Gluten / Wheat', 'Pork (Non-Halal)'];
function localDateTime(value) { const offset = value.getTimezoneOffset() * 60000; return new Date(value.getTime() - offset).toISOString().slice(0, 16); }

export default function MerchantBatchForm({ onCreated, onNotice, disabled = false, restockBatch = null }) {
  const [itemName, setItemName] = useState(''); const [quantity, setQuantity] = useState(''); const [price, setPrice] = useState(''); const [donation, setDonation] = useState(false);
  const [storageType, setStorageType] = useState('room_temp_baked'); const [consumeWithin, setConsumeWithin] = useState('tonight'); const [allergens, setAllergens] = useState(['None / Allergen-Free']); const [ngoPriorityEnabled, setNgoPriorityEnabled] = useState(false);
  const [flashDrop, setFlashDrop] = useState(false); const [magicBayong, setMagicBayong] = useState(false); const [originalPrice, setOriginalPrice] = useState(''); const [retailValue, setRetailValue] = useState(''); const [freshnessAttested, setFreshnessAttested] = useState(false);
  const [keyIngredients, setKeyIngredients] = useState('');
  const [expiresAt, setExpiresAt] = useState(() => localDateTime(new Date(Date.now() + 2 * 60 * 60 * 1000)));
  const [safeUntil, setSafeUntil] = useState(() => localDateTime(new Date(Date.now() + 4 * 60 * 60 * 1000)));
  const [photo, setPhoto] = useState(null); const [preview, setPreview] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!restockBatch) return;
    setItemName(restockBatch.itemName || ''); setPrice(restockBatch.price == null ? '' : String(restockBatch.price)); setDonation(Boolean(restockBatch.isDonationOnly));
    setStorageType(restockBatch.storageType || 'room_temp_baked'); setConsumeWithin(restockBatch.consumeWithin || 'tonight'); setAllergens(restockBatch.allergens?.length ? restockBatch.allergens : ['None / Allergen-Free']);
    setNgoPriorityEnabled(false); setPhoto(null); setError('');
    setFlashDrop(false); setMagicBayong(false); setOriginalPrice(''); setRetailValue(''); setFreshnessAttested(false); setKeyIngredients(restockBatch.keyIngredients || '');
  }, [restockBatch]);

  useEffect(() => {
    if (!photo) { setPreview(restockBatch?.photoUrl || ''); return undefined; }
    const url = URL.createObjectURL(photo); setPreview(url); return () => URL.revokeObjectURL(url);
  }, [photo, restockBatch?.photoUrl]);

  function choosePhoto(event) {
    const file = event.target.files?.[0]; setError('');
    if (!file) { setPhoto(null); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setPhoto(null); event.target.value = ''; setError('Choose a JPG, PNG, or WebP photo.'); return; }
    if (file.size > 5 * 1024 * 1024) { setPhoto(null); event.target.value = ''; setError('Choose a photo smaller than 5 MB.'); return; }
    setPhoto(file);
  }

  function toggleAllergen(tag) {
    setAllergens(current => {
      if (tag === 'None / Allergen-Free') return ['None / Allergen-Free'];
      const withoutNone = current.filter(value => value !== 'None / Allergen-Free');
      return withoutNone.includes(tag) ? withoutNone.filter(value => value !== tag) : [...withoutNone, tag];
    });
  }

  async function submit(event) {
    event.preventDefault(); const formElement = event.currentTarget; setBusy(true); setError('');
    try {
      if (!photo && !restockBatch) throw new Error('Add one clear food photo or choose a previous batch to repost.');
      if (new Date(expiresAt).getTime() <= Date.now()) throw new Error('Choose a pickup cutoff later than now.');
      if (new Date(expiresAt).getTime() < Date.now() + 15 * 60 * 1000) throw new Error('Pickup cutoff must be at least 15 minutes from now.');
      if (new Date(safeUntil).getTime() < new Date(expiresAt).getTime()) throw new Error('Safe until must be at or after the pickup cutoff.');
      if (!freshnessAttested) throw new Error('Confirm this food was prepared or baked today and is safe for consumption.');
      if (!allergens.length) throw new Error('Choose an allergen tag, including “None / Allergen-Free” if appropriate.');
      if (!donation && (!Number.isFinite(Number(price)) || Number(price) < 0)) throw new Error('Enter a valid discounted price.');
      if (originalPrice && Number(originalPrice) < Number(price)) throw new Error('Original price must be at least the discounted price.');
      if (magicBayong && (!Number.isFinite(Number(retailValue)) || Number(retailValue) <= Number(price))) throw new Error('Estimated retail value must be higher than the Bayong price.');
      const body = new FormData();
      if (photo) { const compressed = await imageCompression(photo, { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: true }); body.append('photo', compressed, compressed.name || 'surplus.jpg'); }
      if (restockBatch) body.append('restockBatchId', restockBatch._id);
      body.append('itemName', itemName.trim()); body.append('quantity', quantity); body.append('price', donation ? '0' : price); body.append('isDonationOnly', String(donation)); body.append('expiresAt', new Date(expiresAt).toISOString());
      body.append('storageType', storageType); body.append('consumeWithin', consumeWithin); body.append('allergens', JSON.stringify(allergens)); body.append('ngoPriorityEnabled', String(ngoPriorityEnabled));
      body.append('safeUntil', new Date(safeUntil).toISOString()); body.append('freshnessAttested', String(freshnessAttested)); body.append('isFlashDropEnabled', String(flashDrop)); body.append('isMagicBayong', String(magicBayong)); body.append('originalPrice', originalPrice); body.append('retailValue', magicBayong ? retailValue : ''); body.append('keyIngredients', keyIngredients);
      await onCreated(body);
      setItemName(''); setQuantity(''); setPrice(''); setDonation(false); setStorageType('room_temp_baked'); setConsumeWithin('tonight'); setAllergens(['None / Allergen-Free']); setNgoPriorityEnabled(false); setFlashDrop(false); setMagicBayong(false); setOriginalPrice(''); setRetailValue(''); setFreshnessAttested(false); setKeyIngredients(''); setExpiresAt(localDateTime(new Date(Date.now() + 2 * 60 * 60 * 1000))); setSafeUntil(localDateTime(new Date(Date.now() + 4 * 60 * 60 * 1000))); setPhoto(null); formElement.reset();
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Could not post this batch.';
      setError(message); onNotice?.(message);
    } finally { setBusy(false); }
  }

  return <section className="panel"><div className="form-heading-row"><div><h2>{restockBatch ? 'Repost previous batch' : 'Post surplus in 30 seconds'}</h2><p className="panel-subtitle">Add tonight’s quantity and cutoff. Food safety tags help buyers choose safely.</p></div></div><form className="form-stack" onSubmit={submit}>
    <fieldset className="form-stack contents" disabled={disabled}>
      <label className="field-label">Item name<input className="field-input" required maxLength="120" value={itemName} onChange={e => setItemName(e.target.value)} placeholder="e.g. Pandesal pack" /></label>
      <div className="field-row"><label className="field-label">Portions<input className="field-input" type="number" min="1" max="10000" step="1" required value={quantity} onChange={e => setQuantity(e.target.value)} /></label><label className="field-label">Discounted price (₱)<input className="field-input" type="number" min="0" step="0.01" required={!donation} disabled={donation} value={donation ? '0' : price} onChange={e => setPrice(e.target.value)} /></label></div>
      {!donation && <label className="field-label">Original price for savings tracking (₱)<input className="field-input" type="number" min={price || 0} step="0.01" value={originalPrice} onChange={e => setOriginalPrice(e.target.value)} placeholder="Optional" /></label>}
      <label className="checkbox-row"><input type="checkbox" checked={donation} onChange={e => { setDonation(e.target.checked); if (e.target.checked) setNgoPriorityEnabled(false); }} /> Donate this batch to verified NGOs</label>
      <label className="checkbox-row"><input type="checkbox" checked={flashDrop} onChange={e => setFlashDrop(e.target.checked)} /> Auto-discount in final 30 minutes</label>
      <p className="form-note">Price drops by 50% for buyers. Verified NGOs can claim remaining flash portions free.</p>
      <label className="checkbox-row"><input type="checkbox" checked={magicBayong} onChange={e => setMagicBayong(e.target.checked)} /> List as Surprise Magic Bayong (mixed end-of-night leftovers)</label>
      {magicBayong && <label className="field-label">Estimated retail value (₱)<input className="field-input" type="number" min="0.01" step="0.01" required value={retailValue} onChange={e => setRetailValue(e.target.value)} placeholder="e.g. 75" /></label>}
      <div className="field-row"><label className="field-label">Storage type<select className="field-select" required value={storageType} onChange={e => setStorageType(e.target.value)}><option value="room_temp_baked">Room Temp / Baked Goods</option><option value="refrigerated_cooked">Refrigerated / Cooked Meal</option></select></label><label className="field-label">Consume within<select className="field-select" required value={consumeWithin} onChange={e => setConsumeWithin(e.target.value)}><option value="2_hours">2 Hours</option><option value="tonight">Tonight</option><option value="24_hours">24 Hours</option></select></label></div>
      <fieldset className="allergen-picker"><legend>Allergens and food safety tags</legend><div>{ALLERGENS.map(tag => <button key={tag} type="button" aria-pressed={allergens.includes(tag)} className={`allergen-choice ${allergens.includes(tag) ? 'selected' : ''}`} onClick={() => toggleAllergen(tag)}>{tag}</button>)}</div></fieldset>
      <label className="field-label">Key ingredients <span className="form-note">Optional · 100 characters max</span><input className="field-input" maxLength="100" value={keyIngredients} onChange={e => setKeyIngredients(e.target.value)} placeholder="e.g. flour, egg, milk, shrimp" /></label>
      <label className="checkbox-row"><input type="checkbox" checked={ngoPriorityEnabled} disabled={donation} onChange={e => setNgoPriorityEnabled(e.target.checked)} /> Give verified NGOs a 15-minute priority window</label>
      <p className="form-note">During the first 15 minutes, only verified NGO partners can claim. Any remaining portions then open to other buyers. Free donation-only batches always remain NGO-only.</p>
      <label className="field-label">Pickup cutoff<input className="field-input" type="datetime-local" required min={localDateTime(new Date())} value={expiresAt} onChange={e => setExpiresAt(e.target.value)} /></label>
      <label className="field-label">Food safe until<input className="field-input" type="datetime-local" required min={expiresAt} value={safeUntil} onChange={e => setSafeUntil(e.target.value)} /><span className="form-note">Must be at or after pickup cutoff.</span></label>
      <label className="safety-acknowledgement"><input type="checkbox" checked={freshnessAttested} onChange={e => setFreshnessAttested(e.target.checked)} required /><span>Prepared/Baked Today — Safe for Consumption</span></label>
      <label className="photo-drop">{restockBatch ? 'Saved batch photo · select a new photo to replace it' : 'Batch photo · JPG, PNG or WebP'}<input type="file" accept="image/jpeg,image/png,image/webp" required={!restockBatch} onChange={choosePhoto} />{preview && <img className="photo-preview" src={preview} alt="Preview of selected surplus batch" />}</label>
      {error && <p className="alert-banner" role="alert">{error}</p>}
      <button className="primary-button w-full" disabled={busy || (!photo && !restockBatch)}>{busy ? 'Compressing and posting…' : restockBatch ? 'Repost batch' : 'Post surplus batch'}</button>
    </fieldset>
  </form></section>;
}
