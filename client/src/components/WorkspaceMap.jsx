import { useEffect, useState } from 'react';
import { api } from '../utils/api.js';
import BatchMap from './BatchMap.jsx';

export default function WorkspaceMap({ role }) {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api.get('/batches', { params: { limit: 100 } })
      .then(({ data }) => { if (active) setBatches(Array.isArray(data?.data?.batches) ? data.data.batches : []); })
      .catch(() => { if (active) setError('Live batch pins could not load. The Iloilo basemap is still available.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  return <section className="panel workspace-map-panel"><div><h2>Iloilo food rescue map</h2><p className="panel-subtitle">{role === 'ngo' ? 'See nearby food partners and active community surplus.' : 'See active surplus listings and their partner locations.'}</p></div>{loading && <p className="form-note" role="status">Loading local listings…</p>}{error && <p className="form-note" role="status">{error}</p>}<BatchMap batches={batches} /></section>;
}
