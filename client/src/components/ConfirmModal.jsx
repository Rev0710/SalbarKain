import { useEffect, useRef } from 'react';

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'primary',
  isLoading = false,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);
  const cancelHandlerRef = useRef(onCancel);
  const loadingRef = useRef(isLoading);
  cancelHandlerRef.current = onCancel;
  loadingRef.current = isLoading;

  useEffect(() => {
    if (!isOpen) return undefined;
    const previousFocus = document.activeElement;
    cancelRef.current?.focus();
    const onKeyDown = event => {
      if (event.key === 'Escape' && !loadingRef.current) cancelHandlerRef.current?.();
      if (event.key === 'Tab') {
        const buttons = Array.from(document.querySelectorAll('.confirm-modal button:not(:disabled)'));
        if (!buttons.length) return;
        const first = buttons[0]; const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus?.focus?.();
    };
  }, [isOpen]);

  if (!isOpen) return null;
  return <div className="overlay confirm-modal-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && !isLoading && onCancel?.()}>
    <section className="dialog confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title" aria-describedby="confirm-modal-message">
      <div className={`confirm-modal-mark ${variant === 'danger' ? 'is-danger' : ''}`} aria-hidden="true">{variant === 'danger' ? '!' : '?'}</div>
      <h2 id="confirm-modal-title">{title}</h2>
      <p id="confirm-modal-message">{message}</p>
      <div className="confirm-modal-actions">
        <button ref={cancelRef} type="button" className="secondary-button" onClick={onCancel} disabled={isLoading}>{cancelLabel}</button>
        <button type="button" className={`primary-button ${variant === 'danger' ? 'confirm-modal-danger-button' : ''}`} onClick={onConfirm} disabled={isLoading}>
          {isLoading ? 'Please wait…' : confirmLabel}
        </button>
      </div>
    </section>
  </div>;
}
