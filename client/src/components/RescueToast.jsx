import { useEffect, useRef, useState } from 'react';
import { api } from '../utils/api.js';

const SEEN_KEY = 'salbarkain:seenRescueIds';

function readSeenIds() {
  try {
    const value = JSON.parse(sessionStorage.getItem(SEEN_KEY) || '[]');
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch { return new Set(); }
}

function persistSeenIds(ids) {
  try { sessionStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-500))); } catch { /* Toasts still work if storage is unavailable. */ }
}

function formatAge(value) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return 'just now';
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr${hours === 1 ? '' : 's'} ago`;
}

function safeMunicipality(value) {
  const municipality = typeof value === 'string' ? value.trim() : '';
  return municipality && municipality.toLowerCase() !== 'unspecified' ? municipality : 'Iloilo';
}

export default function RescueToast() {
  const [rescue, setRescue] = useState(null);
  const [visible, setVisible] = useState(false);
  const timers = useRef({ frame: 0, hide: 0, remove: 0 });

  useEffect(() => {
    let alive = true;
    async function refresh() {
      try {
        const { data } = await api.get('/claims/recent-rescues');
        if (!alive) return;
        const items = Array.isArray(data?.data?.rescues) ? data.data.rescues : [];
        const seenIds = readSeenIds();
        const nextRescue = items.find(item => item?.id && !seenIds.has(String(item.id)));
        items.forEach(item => { if (item?.id) seenIds.add(String(item.id)); });
        persistSeenIds(seenIds);
        if (!nextRescue) return;

        window.clearTimeout(timers.current.hide);
        window.clearTimeout(timers.current.remove);
        window.cancelAnimationFrame(timers.current.frame);
        setRescue(nextRescue);
        setVisible(false);
        timers.current.frame = window.requestAnimationFrame(() => {
          setVisible(true);
          timers.current.hide = window.setTimeout(() => {
            setVisible(false);
            timers.current.remove = window.setTimeout(() => setRescue(null), 520);
          }, 5000);
        });
      } catch { /* A temporary API outage should not affect the rest of the page. */ }
    }

    const onRescueCompleted = () => { void refresh(); };
    void refresh();
    const poll = window.setInterval(() => { void refresh(); }, 12_000);
    window.addEventListener('salbarkain:rescue-completed', onRescueCompleted);
    return () => {
      alive = false;
      window.clearInterval(poll);
      window.removeEventListener('salbarkain:rescue-completed', onRescueCompleted);
      window.clearTimeout(timers.current.hide);
      window.clearTimeout(timers.current.remove);
      window.cancelAnimationFrame(timers.current.frame);
    };
  }, []);

  function dismiss() {
    window.clearTimeout(timers.current.hide);
    window.clearTimeout(timers.current.remove);
    window.cancelAnimationFrame(timers.current.frame);
    setVisible(false);
    timers.current.remove = window.setTimeout(() => setRescue(null), 520);
  }

  if (!rescue) return null;
  const name = String(rescue.buyerFirstName || 'A neighbor').trim().split(/\s+/)[0] || 'A neighbor';
  const quantity = Math.max(1, Number(rescue.quantity) || 1);
  const price = Number(rescue.totalPrice) || 0;
  const priceLabel = price > 0 ? `₱${price.toFixed(2)}` : 'Free NGO rescue';
  const municipality = safeMunicipality(rescue.municipality);
  const message = `${name} rescued ${quantity} ${quantity === 1 ? 'pack' : 'packs'} of ${rescue.itemName || 'surplus food'} at ${rescue.storeName || 'a local partner'} (${municipality}) · ${formatAge(rescue.completedAt)} · ${priceLabel}`;

  return <aside key={rescue.id} className={`rescue-toast ${visible ? 'is-visible' : 'is-leaving'}`} role="status" aria-live="polite" aria-label="Recent community rescue">
    <span className="rescue-toast-shimmer" aria-hidden="true" />
    <span className="rescue-toast-avatar" aria-hidden="true">{name.charAt(0).toUpperCase()}</span>
    <span className="rescue-toast-copy">{message}</span>
    <button className="rescue-toast-close" type="button" onClick={dismiss} aria-label="Dismiss rescue update">×</button>
    <span className="rescue-toast-diamond" aria-hidden="true" />
  </aside>;
}
