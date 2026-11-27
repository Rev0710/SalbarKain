import { useEffect, useRef, useState } from 'react';
import { TileLayer } from 'react-leaflet';

// The standard keyless OpenStreetMap tile service is used for the live layer.
const TILE_PROVIDERS = [
  {
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
];

export default function ReliableTileLayer({ onStatus, retryKey = 0 }) {
  const [providerIndex, setProviderIndex] = useState(0);
  const [status, setStatus] = useState('loading');
  const tileCounts = useRef({ loaded: 0, failed: 0 });
  const failedOver = useRef(false);
  const activeProvider = TILE_PROVIDERS[providerIndex];

  useEffect(() => {
    setProviderIndex(0);
    setStatus('loading');
  }, [retryKey]);

  useEffect(() => {
    tileCounts.current = { loaded: 0, failed: 0 };
    failedOver.current = false;
    setStatus('loading');
    const timeout = window.setTimeout(() => {
      if (tileCounts.current.loaded === 0) advanceProvider();
    }, 8000);
    return () => window.clearTimeout(timeout);
    // Provider changes start a new tile request batch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providerIndex, retryKey]);

  useEffect(() => { onStatus?.(status); }, [onStatus, status]);

  function advanceProvider() {
    if (failedOver.current) return;
    failedOver.current = true;
    if (providerIndex >= TILE_PROVIDERS.length - 1) { setStatus('error'); return; }
    setStatus('loading');
    setProviderIndex(current => Math.min(current + 1, TILE_PROVIDERS.length - 1));
  }

  const eventHandlers = {
    tileload() {
      tileCounts.current.loaded += 1;
      setStatus('ready');
    },
    tileerror() {
      tileCounts.current.failed += 1;
    },
    load() {
      if (tileCounts.current.loaded > 0) setStatus('ready');
      else if (tileCounts.current.failed > 0) advanceProvider();
    },
  };

  return <TileLayer key={`${providerIndex}-${retryKey}`} url={activeProvider.url} attribution={activeProvider.attribution} eventHandlers={eventHandlers} />;
}
