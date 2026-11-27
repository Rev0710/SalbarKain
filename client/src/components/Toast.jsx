import { useEffect, useRef, useState } from 'react';

export default function Toast({ message, onDismiss }) {
  const [leaving, setLeaving] = useState(false);
  const dismissRef = useRef(onDismiss);

  useEffect(() => { dismissRef.current = onDismiss; }, [onDismiss]);

  useEffect(() => {
    if (!message) return undefined;
    setLeaving(false);
    const leaveTimer = window.setTimeout(() => setLeaving(true), 4650);
    const dismissTimer = window.setTimeout(() => dismissRef.current?.(), 5000);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(dismissTimer);
    };
  }, [message]);

  if (!message) return null;
  const isWarning = /could not|couldn't|failed|error|unavailable|expired|sold out/i.test(message);

  return <aside className={`app-toast ${leaving ? 'is-leaving' : 'is-visible'}`} role="status" aria-live="polite">
    <span className="app-toast-shimmer" aria-hidden="true" />
    <span className={`app-toast-icon ${isWarning ? 'warning' : ''}`} aria-hidden="true">{isWarning ? '!' : '✓'}</span>
    <span className="app-toast-copy">{message}</span>
    <button type="button" className="app-toast-close" onClick={onDismiss} aria-label="Dismiss notification">×</button>
    <span className="app-toast-diamond" aria-hidden="true" />
  </aside>;
}
