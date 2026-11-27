import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../utils/api.js';

export default function ActivateLguPage({ onActivated = () => {}, onGoToLogin = () => {} }) {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!token) { setError('This activation link is missing its secure token.'); setLoading(false); return undefined; }
    api.get(`/auth/verify-invite/${encodeURIComponent(token)}`)
      .then(({ data }) => { if (active) setInvite(data?.data || null); })
      .catch((requestError) => { if (active) setError(requestError.response?.data?.message || 'This activation link could not be verified.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  async function activate(event) {
    event.preventDefault();
    if (password.length < 8) { setError('Use a password with at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('The passwords do not match.'); return; }
    setBusy(true); setError('');
    try {
      const { data } = await api.post('/auth/activate-lgu', { token, password });
      onActivated(data.data);
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'The account could not be activated. Request a fresh invite from the Provincial Super-Admin.');
    } finally { setBusy(false); }
  }

  return <main className="dashboard-shell lgu-activation-shell">
    <section className="panel lgu-activation-card" aria-labelledby="activate-lgu-title">
      <p className="eyebrow">Secure LGU account activation</p>
      <h1 id="activate-lgu-title">Set up your admin access</h1>
      {loading ? <p className="panel-subtitle" role="status">Checking your one-time invitation…</p> : invite ? <>
        <div className="lgu-jurisdiction-card"><span>Invitation verified for</span><strong>{invite.officerName}</strong><span>{invite.email}</span><b>Jurisdiction: {invite.assignedMunicipality === 'ALL' ? 'Iloilo Province' : `Municipality of ${invite.assignedMunicipality}`}</b></div>
        <p className="panel-subtitle">Choose a password to activate your municipal command-center account. This link can only be used once.</p>
        <form className="lgu-activation-form" onSubmit={activate}>
          <label className="field-label">New password<input className="field-input" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label className="field-label">Confirm password<input className="field-input" type="password" autoComplete="new-password" minLength={8} maxLength={72} required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button w-full" type="submit" disabled={busy}>{busy ? 'Activating…' : 'Activate LGU account'}</button>
        </form>
      </> : <>
        <p className="form-error" role="alert">{error || 'This invitation is invalid or expired.'}</p>
        <p className="panel-subtitle">Ask the Iloilo Provincial Super-Admin to send a new invitation.</p>
        <button type="button" className="primary-button" onClick={onGoToLogin}>Go to sign in</button>
      </>}
      <p className="lgu-activation-footnote"><Link to="/">Return to SalbarKain</Link></p>
    </section>
  </main>;
}
