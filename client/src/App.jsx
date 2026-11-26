import { lazy, Suspense, useEffect, useState } from 'react';
import { api } from './utils/api.js';
import { getDeviceToken } from './utils/identity.js';
import MarketplacePage from './pages/MarketplacePage.jsx';
import ClaimDrawer from './components/ClaimDrawer.jsx';
import QrPassModal from './components/QrPassModal.jsx';

const PartnerDashboardPage = lazy(() => import('./pages/PartnerDashboardPage.jsx'));

function MealsSavedCounter() {
  const [count, setCount] = useState(null);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try { const { data } = await api.get('/stats/meals-saved'); if (alive) setCount(data.data.mealsSaved); }
      catch { if (alive) setCount(null); }
    };
    refresh(); const timer = window.setInterval(refresh, 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  return <div className="leading-tight" role="status"><span className="block text-xs text-ink/60">Meals saved</span><strong className="mt-1 block text-lg tabular-nums">{count == null ? '—' : new Intl.NumberFormat('en-PH').format(count)}</strong></div>;
}

function AuthModal({ onClose, onLogin }) {
  const [mode, setMode] = useState('login'); const [role, setRole] = useState('merchant'); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [address, setAddress] = useState(''); const [storeName, setStoreName] = useState(''); const [category, setCategory] = useState('bakery'); const [organizationName, setOrganizationName] = useState(''); const [lat, setLat] = useState('10.72'); const [lng, setLng] = useState('122.56'); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const registration = mode === 'register';
    const body = registration ? { role, name, email, password, phone, address, location: { type: 'Point', coordinates: [Number(lng), Number(lat)] }, ...(role === 'merchant' ? { storeName, category } : { organizationName }) } : { email, password };
    try { const { data } = await api.post(registration ? '/auth/register' : '/auth/login', body); onLogin(data.data); }
    catch (err) { setError(err.response?.data?.message || 'Unable to sign in. Check your details and try again.'); }
    finally { setBusy(false); }
  }
  return <div className="overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="dialog w-full max-w-md" role="dialog" aria-modal="true" aria-labelledby="login-title"><button className="close-button" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">Partner access</p><h2 id="login-title" className="mt-2 text-2xl font-semibold">{mode === 'login' ? 'Sign in to SalbarKain' : 'Create a partner account'}</h2><p className="mt-2 text-sm text-muted">Only local merchants and NGO or shelter partners need accounts.</p><div className="mt-5 flex gap-2"><button type="button" className={`filter-pill ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setError(''); }}>Sign in</button><button type="button" className={`filter-pill ${mode === 'register' ? 'active' : ''}`} onClick={() => { setMode('register'); setError(''); }}>Register</button></div><form className="mt-5 grid gap-4" onSubmit={submit}>{mode === 'register' && <><label className="field-label">Account type<select className="field-select" value={role} onChange={e => setRole(e.target.value)}><option value="merchant">Merchant</option><option value="ngo">Verified NGO / shelter</option></select></label><label className="field-label">Contact name<input className="field-input" autoComplete="name" required value={name} onChange={e => setName(e.target.value)} /></label>{role === 'merchant' ? <><label className="field-label">Store name<input className="field-input" required value={storeName} onChange={e => setStoreName(e.target.value)} /></label><label className="field-label">Store category<select className="field-select" value={category} onChange={e => setCategory(e.target.value)}><option value="bakery">Bakery</option><option value="eatery">Eatery / carinderia</option><option value="grocery">Grocery</option><option value="other">Other</option></select></label></> : <label className="field-label">Organization name<input className="field-input" required value={organizationName} onChange={e => setOrganizationName(e.target.value)} /></label>}<label className="field-label">Address<input className="field-input" required minLength="5" value={address} onChange={e => setAddress(e.target.value)} /></label><div className="field-row"><label className="field-label">Latitude<input className="field-input" type="number" step="any" min="-90" max="90" required value={lat} onChange={e => setLat(e.target.value)} /></label><label className="field-label">Longitude<input className="field-input" type="number" step="any" min="-180" max="180" required value={lng} onChange={e => setLng(e.target.value)} /></label></div><p className="form-note">Set the map coordinates for your shop or organization pin.</p></>}<label className="field-label">Email<input className="field-input" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>{mode === 'register' && <label className="field-label">Mobile number<input className="field-input" type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} /></label>}<label className="field-label">Password<input className="field-input" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 10 : undefined} required value={password} onChange={e => setPassword(e.target.value)} />{mode === 'register' && <span className="form-note">Use at least 10 characters.</span>}</label>{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create partner account'}</button></form></section></div>;
}

export default function App() {
  const [session, setSession] = useState(() => { try { return JSON.parse(localStorage.getItem('salbarkain:auth') || 'null'); } catch { return null; } });
  const [loginOpen, setLoginOpen] = useState(false); const [claimBatch, setClaimBatch] = useState(null); const [pickupPass, setPickupPass] = useState(null); const [notice, setNotice] = useState('');
  const [view, setView] = useState('market'); const [marketRefresh, setMarketRefresh] = useState(0);
  if (session?.token) api.defaults.headers.common.Authorization = `Bearer ${session.token}`; else delete api.defaults.headers.common.Authorization;
  function handleLogin(data) { const next = { ...data.user, token: data.token }; api.defaults.headers.common.Authorization = `Bearer ${next.token}`; localStorage.setItem('salbarkain:auth', JSON.stringify(next)); setSession(next); setLoginOpen(false); setView('dashboard'); }
  function logout() { delete api.defaults.headers.common.Authorization; localStorage.removeItem('salbarkain:auth'); setSession(null); setView('market'); }
  async function submitClaim({ buyerName, phone, qty }) {
    try {
      const { data } = await api.post('/claims', { batchId: claimBatch._id || claimBatch.id, qty, buyerName, phone, deviceToken: getDeviceToken() });
      const pass = { ...data.data.claim, batch: claimBatch };
      localStorage.setItem('salbarkain:pickupPass', JSON.stringify(pass)); setClaimBatch(null); setPickupPass(pass);
    } catch (error) {
      if (['BATCH_UNAVAILABLE', 'PICKUP_PASS_EXPIRED'].includes(error.response?.data?.code)) {
        setMarketRefresh(value => value + 1);
        setNotice('That batch just sold out or its pickup window ended. The marketplace is refreshing.');
      }
      throw error;
    }
  }
  return <div className="app-frame">
    <header className="site-header"><a className="brand" href="#market" onClick={() => setView('market')}>SalbarKain<span>.</span></a><nav className="header-nav"><button className={`nav-link ${view === 'market' ? 'is-current' : ''}`} onClick={() => setView('market')}>Marketplace</button><MealsSavedCounter /><div className="header-divider" />{session ? <><button className="nav-link" onClick={() => setView('dashboard')}>{session.role === 'merchant' ? 'Merchant workspace' : 'NGO workspace'}</button><button className="text-button" onClick={logout}>Sign out</button></> : <button className="primary-button compact" onClick={() => setLoginOpen(true)}>Partner sign in</button>}</nav><div className="mobile-count"><MealsSavedCounter /><button className="primary-button compact" onClick={() => session ? setView(view === 'dashboard' ? 'market' : 'dashboard') : setLoginOpen(true)}>{session ? view === 'dashboard' ? 'Browse' : 'Workspace' : 'Partner'}</button></div></header>
    {view === 'dashboard' && session ? <Suspense fallback={<main className="dashboard-shell"><p className="loading-line">Opening your partner workspace…</p></main>}><PartnerDashboardPage session={session} onBrowse={() => setView('market')} onNotice={setNotice} /></Suspense> : <MarketplacePage session={session} onClaim={setClaimBatch} onPartnerSignIn={() => setLoginOpen(true)} onNotice={setNotice} refreshTrigger={marketRefresh} />}
    <footer className="site-footer"><span>SalbarKain</span><span>Local surplus food rescue · Iloilo and Pavia</span><span className="footer-device">No buyer account required</span></footer>
    {loginOpen && <AuthModal onClose={() => setLoginOpen(false)} onLogin={handleLogin} />}
    {claimBatch && <ClaimDrawer batch={claimBatch} onClose={() => setClaimBatch(null)} onSubmit={submitClaim} />}
    {pickupPass && <QrPassModal pass={pickupPass} onClose={() => setPickupPass(null)} />}
    {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
  </div>;
}
