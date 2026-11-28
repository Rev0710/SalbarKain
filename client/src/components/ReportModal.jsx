import { useEffect, useRef, useState } from 'react';

const REPORT_TYPES = [
  {
    value: 'spoilage',
    title: 'Spoiled / Expired / Unsafe Food',
    description: 'Food smells off, is past safe consumption time, or poses an allergen hazard (priority 2-strike auto-hide).',
  },
  {
    value: 'general',
    title: 'Misleading Listing / Store Closed',
    description: 'Wrong price, inaccurate quantity, or storefront is already closed (3-flag community review).',
  },
];

export default function ReportModal({ isOpen, batch, isLoading = false, onSubmit, onCancel }) {
  const [type, setType] = useState('');
  const [note, setNote] = useState('');
  const firstOptionRef = useRef(null);
  const cancelRef = useRef(onCancel);
  const loadingRef = useRef(isLoading);
  cancelRef.current = onCancel;
  loadingRef.current = isLoading;
  useEffect(() => {
    if (isOpen) { setType(''); setNote(''); }
  }, [isOpen, batch?._id]);
  useEffect(() => {
    if (!isOpen) return undefined;
    firstOptionRef.current?.focus();
    const onKeyDown = event => {
      if (event.key === 'Escape' && !loadingRef.current) cancelRef.current?.();
      if (event.key === 'Tab') {
        const controls = Array.from(document.querySelectorAll('.report-modal button:not(:disabled), .report-modal textarea'));
        if (!controls.length) return;
        const first = controls[0]; const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);
  if (!isOpen || !batch) return null;

  const storeName = batch.merchantId?.storeName || batch.storeName || 'Local food partner';
  return <div className="overlay report-modal-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && !isLoading && onCancel?.()}>
    <section className="dialog report-modal" role="dialog" aria-modal="true" aria-labelledby="report-modal-title" aria-describedby="report-modal-subtitle">
      <p className="eyebrow">Community food safety</p>
      <h2 id="report-modal-title">Report Food Listing</h2>
      <p id="report-modal-subtitle" className="report-modal-subtitle">{batch.itemName || 'Surplus listing'} · {storeName}</p>
      <fieldset className="report-type-options">
        <legend className="sr-only">Choose a report reason</legend>
        {REPORT_TYPES.map((option, index) => <button ref={index === 0 ? firstOptionRef : null} key={option.value} type="button" className={`report-type-card ${type === option.value ? `selected-${option.value}` : ''}`} aria-pressed={type === option.value} onClick={() => setType(option.value)}>
          <span className="report-type-radio" aria-hidden="true">{type === option.value ? '✓' : ''}</span>
          <span><strong>{option.title}</strong><small>{option.description}</small></span>
        </button>)}
      </fieldset>
      <label className="field-label report-note-label">Optional note<textarea className="field-input" value={note} onChange={event => setNote(event.target.value)} maxLength={140} rows={3} placeholder="Add brief details for LGU reviewers (optional)" /><small>{note.length}/140 characters</small></label>
      <div className="report-modal-actions">
        <button type="button" className="secondary-button" onClick={onCancel} disabled={isLoading}>Cancel</button>
        <button type="button" className="report-submit-button" disabled={!type || isLoading} onClick={() => onSubmit?.({ type, note: note.trim() })}>{isLoading ? 'Submitting…' : 'Submit Report'}</button>
      </div>
    </section>
  </div>;
}
