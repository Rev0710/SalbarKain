import { useEffect, useState } from 'react';
import { api } from '../utils/api.js';

function timeAgo(value, now) {
  const elapsed = Math.max(0, now - new Date(value).getTime());
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return 'Just now';
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours} hr${hours === 1 ? '' : 's'} ago`;
}

export default function RescueTicker() {
  const [rescues, setRescues] = useState([]);
  const [index, setIndex] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    async function refresh(prioritizeLatest = false) {
      try {
        const { data } = await api.get('/claims/recent-rescues');
        if (alive) {
          setRescues(Array.isArray(data?.data?.rescues) ? data.data.rescues : []);
          if (prioritizeLatest) setIndex(0);
        }
      } catch { /* Keep the last successful ticker items during a short outage. */ }
    }
    const onRescueCompleted = () => { void refresh(true); };
    void refresh();
    const poll = window.setInterval(() => { void refresh(false); }, 10_000);
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    window.addEventListener('salbarkain:rescue-completed', onRescueCompleted);
    return () => {
      alive = false;
      window.clearInterval(poll);
      window.clearInterval(clock);
      window.removeEventListener('salbarkain:rescue-completed', onRescueCompleted);
    };
  }, []);

  useEffect(() => {
    if (rescues.length < 2) return undefined;
    const rotation = window.setInterval(() => setIndex(current => (current + 1) % rescues.length), 6000);
    return () => window.clearInterval(rotation);
  }, [rescues.length]);

  const rescue = rescues[index];
  const message = rescue
    ? `Live Rescue: ${rescue.buyerFirstName || 'A community member'} rescued ${rescue.quantity} ${rescue.quantity === 1 ? 'pack' : 'packs'} of ${rescue.itemName} at ${rescue.storeName} (${rescue.municipality}) · ${timeAgo(rescue.completedAt, now)}`
    : 'Live Rescue: Community food pickups will appear here as neighbors collect their rescued meals.';

  return <aside className="rescue-ticker" aria-label="Recent community food rescues">
    <span className="rescue-ticker-dot" aria-hidden="true" />
    <span className="rescue-ticker-live">LIVE</span>
    <span className="rescue-ticker-message" key={rescue?.id || 'empty'} aria-live="polite">{message}</span>
  </aside>;
}
