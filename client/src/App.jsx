import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from './utils/api.js';
import { getDeviceToken } from './utils/identity.js';
import { isWithinIloilo } from './utils/iloiloMap.js';
import MarketplacePage from './pages/MarketplacePage.jsx';
import ClaimDrawer from './components/ClaimDrawer.jsx';
import QrPassModal from './components/QrPassModal.jsx';
import MyImpactModal from './components/MyImpactModal.jsx';
import LocationPicker from './components/LocationPicker.jsx';
import RescueToast from './components/RescueToast.jsx';
import Footer from './components/Footer.jsx';
import HowItWorksPage from './pages/HowItWorksPage.jsx';
import AboutPage from './pages/AboutPage.jsx';

const PartnerDashboardPage = lazy(() => import('./pages/PartnerDashboardPage.jsx'));
const AdminQueue = lazy(() => import('./pages/AdminQueue.jsx'));
const PICKUP_PASS_KEY = 'salbarkain_active_claim';
const LEGACY_PICKUP_PASS_KEY = 'salbarkain:pickupPass';

function readPickupPass() {
  try {
    const pass = JSON.parse(localStorage.getItem(PICKUP_PASS_KEY) || localStorage.getItem(LEGACY_PICKUP_PASS_KEY) || 'null');
    const deadline = new Date(pass?.pickupDeadline).getTime();
    if (!pass?.qrToken || !Number.isFinite(deadline) || deadline <= Date.now()) {
      localStorage.removeItem(PICKUP_PASS_KEY);
      localStorage.removeItem(LEGACY_PICKUP_PASS_KEY);
      return null;
    }
    localStorage.setItem(PICKUP_PASS_KEY, JSON.stringify(pass));
    return pass;
  } catch { return null; }
}

function MealsSavedCounter() {
  const [impact, setImpact] = useState({ mealsSaved: 0, foodDivertedKg: 0, co2PreventedKg: 0 });
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const res = await api.get('/stats/impact');
        const payload = res.data?.data || res.data || {};
        const toMetric = value => { const number = Number(value); return Number.isFinite(number) ? number : 0; };
        const meals = toMetric(payload.mealsSaved ?? payload.totalMeals ?? 0);
        const kg = toMetric(payload.foodDivertedKg ?? payload.foodKg ?? (meals * 0.5).toFixed(1));
        const co2 = toMetric(payload.co2PreventedKg ?? payload.co2eKg ?? (meals * 1.25).toFixed(1));
        if (alive) setImpact({ mealsSaved: meals, foodDivertedKg: kg, co2PreventedKg: co2 });
      } catch {
        if (alive) setImpact({ mealsSaved: 0, foodDivertedKg: 0, co2PreventedKg: 0 });
      }
    };
    refresh(); const timer = window.setInterval(refresh, 60_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  const format = value => new Intl.NumberFormat('en-PH', { maximumFractionDigits: 1 }).format(value);
  return <div className="impact-counter" role="status" title={`Total food rescued across Iloilo (${format(impact.co2PreventedKg)} kg CO₂e prevented)`} aria-label={`Total food rescued across Iloilo: ${format(impact.mealsSaved)} rescued, ${format(impact.foodDivertedKg)} kilograms`}><span className="impact-pill-dot" aria-hidden="true" /><span className="impact-pill-text">{format(impact.mealsSaved)} Rescued · {format(impact.foodDivertedKg)} kg</span></div>;
}

function PasswordField({ mode, value, onChange }) {
  const [visible, setVisible] = useState(false);
  return <label className="field-label">Password<div className="password-control"><input className="field-input password-input" type={visible ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 10 : undefined} required value={value} onChange={onChange} /><button className="password-toggle" type="button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible(show => !show)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{visible ? <><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 002.8 2.8"/><path d="M9.9 5.2A10.7 10.7 0 0112 5c5 0 8.5 4.6 9.5 7a11.8 11.8 0 01-3.1 4.3"/><path d="M6.2 6.2A12.1 12.1 0 002.5 12c1 2.4 4.5 7 9.5 7 1.1 0 2.1-.2 3-.6"/></> : <><path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="3"/></>}</svg></button></div>{mode === 'register' && <span className="form-note">Use at least 10 characters.</span>}</label>;
}

function AuthModal({ onClose, onLogin }) {
  const [mode, setMode] = useState('login'); const [role, setRole] = useState('merchant'); const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [name, setName] = useState(''); const [phone, setPhone] = useState(''); const [address, setAddress] = useState(''); const [barangay, setBarangay] = useState(''); const [municipality, setMunicipality] = useState('Iloilo City'); const [storeName, setStoreName] = useState(''); const [category, setCategory] = useState('bakery'); const [organizationName, setOrganizationName] = useState(''); const [lat, setLat] = useState(''); const [lng, setLng] = useState(''); const [located, setLocated] = useState(null); const [verificationDoc, setVerificationDoc] = useState(null); const [storefrontPhoto, setStorefrontPhoto] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  function changePin(latitude, longitude) {
    if (latitude !== '' && longitude !== '' && !isWithinIloilo(Number(latitude), Number(longitude))) {
      setError('Choose a pin within Iloilo Province.');
      return;
    }
    setLat(latitude === '' ? '' : Number(latitude).toFixed(6)); setLng(longitude === '' ? '' : Number(longitude).toFixed(6)); setLocated(null); setError('');
  }
  function locateMe() { if (!navigator.geolocation) { setError('This browser does not provide location access. Tap the map to choose a pin.'); return; } navigator.geolocation.getCurrentPosition(position => { const point = { lat: position.coords.latitude, lng: position.coords.longitude }; if (!isWithinIloilo(point.lat, point.lng)) { setError('Your current location is outside Iloilo Province. Choose a pin within Iloilo instead.'); return; } setLat(point.lat.toFixed(6)); setLng(point.lng.toFixed(6)); setLocated(point); setError(''); }, () => setError('Location permission was unavailable. Tap the map to choose a pin.'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }); }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    const registration = mode === 'register';
    let body = { email, password };
    if (registration) {
      if (!lat || !lng || !isWithinIloilo(Number(lat), Number(lng))) { setError('Choose your location on the map within Iloilo Province.'); setBusy(false); return; }
      if (!verificationDoc) { setError('Upload a permit or organization verification document to apply.'); setBusy(false); return; }
      body = new FormData();
      Object.entries({ role, name, email, password, phone, address, barangay, municipality, location: JSON.stringify({ type: 'Point', coordinates: [Number(lng), Number(lat)] }), ...(role === 'merchant' ? { storeName, category } : { organizationName }) }).forEach(([key, value]) => body.append(key, value));
      body.append('verificationDoc', verificationDoc);
      if (storefrontPhoto) body.append('storefrontPhoto', storefrontPhoto);
    }
    try { const { data } = await api.post(registration ? '/auth/register' : '/auth/login', body, registration ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined); onLogin(data.data); }
    catch (err) { setError(err.response?.data?.message || 'Unable to sign in. Check your details and try again.'); }
    finally { setBusy(false); }
  }
  return <div className="overlay" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}><section className="dialog auth-dialog w-full max-w-md" role="dialog" aria-modal="true" aria-labelledby="login-title"><button className="close-button" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">Partner access</p><h2 id="login-title" className="mt-2 text-2xl font-semibold">{mode === 'login' ? 'Sign in to SalbarKain' : 'Create a partner account'}</h2><p className="mt-2 text-sm text-muted">Only local merchants and NGO or shelter partners need accounts.</p><div className="mt-5 flex gap-2"><button type="button" className={`filter-pill ${mode === 'login' ? 'active' : ''}`} onClick={() => { setMode('login'); setError(''); }}>Sign in</button><button type="button" className={`filter-pill ${mode === 'register' ? 'active' : ''}`} onClick={() => { setMode('register'); setError(''); }}>Register</button></div>{mode === 'login' && import.meta.env.VITE_DEMO_LOGIN_PASSWORD && <div className="admin-demo-logins"><span>Demo login fill</span><button type="button" className="filter-pill" onClick={() => { setEmail('admin@salbarkain.ph'); setPassword(import.meta.env.VITE_DEMO_LOGIN_PASSWORD); setError(''); }}>Provincial admin</button><button type="button" className="filter-pill" onClick={() => { setEmail('pavia.lgu@salbarkain.ph'); setPassword(import.meta.env.VITE_DEMO_LOGIN_PASSWORD); setError(''); }}>Pavia admin</button></div>}<form className="mt-5 grid gap-4" onSubmit={submit}>{mode === 'register' && <><label className="field-label">Account type<select className="field-select" value={role} onChange={e => setRole(e.target.value)}><option value="merchant">Merchant</option><option value="ngo">NGO / shelter</option></select></label><label className="field-label">Contact name<input className="field-input" autoComplete="name" required value={name} onChange={e => setName(e.target.value)} /></label>{role === 'merchant' ? <><label className="field-label">Store name<input className="field-input" required value={storeName} onChange={e => setStoreName(e.target.value)} /></label><label className="field-label">Store category<select className="field-select" value={category} onChange={e => setCategory(e.target.value)}><option value="bakery">Bakery</option><option value="eatery">Eatery / carinderia</option><option value="grocery">Grocery</option><option value="other">Other</option></select></label></> : <label className="field-label">Organization name<input className="field-input" required value={organizationName} onChange={e => setOrganizationName(e.target.value)} /></label>}<div className="field-row"><label className="field-label">Province<input className="field-input" value="Iloilo" readOnly /></label><label className="field-label">Municipality / City<select className="field-select" required value={municipality} onChange={e => setMunicipality(e.target.value)}><option value="Iloilo City">Iloilo City</option><option value="Pavia">Pavia</option><option value="Santa Barbara">Santa Barbara</option><option value="Oton">Oton</option><option value="Leganes">Leganes</option><option value="Zarraga">Zarraga</option><option value="Cabatuan">Cabatuan</option><option value="Pototan">Pototan</option><option value="Passi City">Passi City</option><option value="Miagao">Miagao</option><option value="Other Iloilo Municipality">Other Iloilo Municipality</option></select></label></div><label className="field-label">Barangay<input className="field-input" required minLength="2" maxLength="100" value={barangay} onChange={e => setBarangay(e.target.value)} /></label><label className="field-label">Street address<input className="field-input" required minLength="5" value={address} onChange={e => setAddress(e.target.value)} /></label><div className="flex items-center justify-between gap-3"><p className="form-note">Choose the pin for your store or shelter.</p><button type="button" className="secondary-button compact" onClick={locateMe}>Use my location</button></div><LocationPicker lat={lat} lng={lng} onChange={changePin} located={located} /><div className="field-row"><label className="field-label">Latitude<input className="field-input" type="number" step="any" min="10.4" max="11.6" required value={lat} onChange={e => changePin(e.target.value, lng)} /></label><label className="field-label">Longitude<input className="field-input" type="number" step="any" min="122.05" max="123.35" required value={lng} onChange={e => changePin(lat, e.target.value)} /></label></div><label className="field-label">Permit / verification photo <span className="form-note">For checking, any photo is okay · up to 8 MB</span><input className="field-input" type="file" accept="application/pdf,image/*" required onChange={e => setVerificationDoc(e.target.files?.[0] || null)} /></label><label className="field-label">Storefront photo <span className="form-note">Optional · any photo</span><input className="field-input" type="file" accept="image/*" onChange={e => setStorefrontPhoto(e.target.files?.[0] || null)} /></label><p className="form-note">Your account starts pending while an admin reviews these details.</p></>}<label className="field-label">Email<input className="field-input" type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} /></label>{mode === 'register' && <label className="field-label">Mobile number<input className="field-input" type="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} /></label>}<PasswordField mode={mode} value={password} onChange={e => setPassword(e.target.value)} />{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Submit verification application'}</button></form></section></div>;
}

function AppShell() {
  const location = useLocation(); const navigate = useNavigate();
  const [session, setSession] = useState(() => { try { return JSON.parse(localStorage.getItem('salbarkain:auth') || 'null'); } catch { return null; } });
  const [loginOpen, setLoginOpen] = useState(false); const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false); const [impactOpen, setImpactOpen] = useState(false); const [claimBatch, setClaimBatch] = useState(null); const [pickupPass, setPickupPass] = useState(null); const [savedPass, setSavedPass] = useState(readPickupPass); const [notice, setNotice] = useState('');
  const [marketRefresh, setMarketRefresh] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const view = location.pathname === '/about' ? 'about' : location.pathname === '/how-it-works' ? 'how' : location.pathname === '/admin' ? 'admin' : location.pathname === '/login' ? 'login' : location.pathname === '/workspace' ? 'dashboard' : 'market';
  if (session?.token) api.defaults.headers.common.Authorization = `Bearer ${session.token}`; else delete api.defaults.headers.common.Authorization;
  useEffect(() => { if ((location.pathname === '/login' || location.pathname === '/admin') && !session) setLoginOpen(true); }, [location.pathname, session]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      setSavedPass(current => {
        if (!current) return current;
        const deadline = new Date(current.pickupDeadline).getTime();
        if (Number.isFinite(deadline) && deadline > Date.now()) return current;
        localStorage.removeItem(PICKUP_PASS_KEY);
        localStorage.removeItem(LEGACY_PICKUP_PASS_KEY);
        return null;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);
  function handleLogin(data) { const next = { ...data.user, token: data.token }; api.defaults.headers.common.Authorization = `Bearer ${next.token}`; localStorage.setItem('salbarkain:auth', JSON.stringify(next)); setSession(next); setLoginOpen(false); setMobileMenuOpen(false); navigate(next.role === 'admin' ? '/admin' : '/workspace'); }
  function requestLogout() { setMobileMenuOpen(false); setLogoutConfirmOpen(true); }
  function logout() { delete api.defaults.headers.common.Authorization; localStorage.removeItem('salbarkain:auth'); setSession(null); setMobileMenuOpen(false); setLogoutConfirmOpen(false); navigate('/'); }
  function handlePickupStatusChange(result) {
    if (!['completed', 'expired', 'cancelled', 'recalled'].includes(result?.status)) return;
    localStorage.removeItem(PICKUP_PASS_KEY);
    localStorage.removeItem(LEGACY_PICKUP_PASS_KEY);
    setSavedPass(null);
    setMarketRefresh(value => value + 1);
    if (result.status === 'completed') setNotice('Pickup verified. Your rescue is now part of the Iloilo community tally.');
  }
  async function submitClaim({ buyerName, phone, qty, safetyAcknowledged }) {
    try {
      const { data } = await api.post('/claims', { batchId: claimBatch._id || claimBatch.id, qty, buyerName, phone, deviceToken: getDeviceToken(), safetyAcknowledged });
      const claim = data.data.claim;
      const coordinates = claimBatch.merchantId?.location?.coordinates || null;
      const pass = { id: claim.id, qrToken: claim.qrToken, batchId: claim.batchId, qty: claim.qty, quantity: claim.qty, priceAtClaim: claim.priceAtClaim, totalPrice: Number((Number(claim.priceAtClaim || 0) * Number(claim.qty || 1)).toFixed(2)), pickupDeadline: claim.pickupDeadline, status: claim.status, itemName: claimBatch.itemName, storeName: claimBatch.merchantId?.storeName || 'Local food partner', storeAddress: claimBatch.merchantId?.address || '', storeContactNumber: claimBatch.merchantId?.contactNumber || '', pickupInstructions: claimBatch.merchantId?.pickupInstructions || '', coordinates, batch: claimBatch };
      savePass(pass); setClaimBatch(null); setPickupPass(pass); setMarketRefresh(value => value + 1);
    } catch (error) {
      if (['BATCH_UNAVAILABLE', 'PICKUP_PASS_EXPIRED', 'BATCH_EXPIRED'].includes(error.response?.data?.code)) {
        setMarketRefresh(value => value + 1);
        setNotice('That batch just sold out or its pickup window ended. The marketplace is refreshing.');
      }
      throw error;
    }
  }
  function savePass(pass) { localStorage.setItem(PICKUP_PASS_KEY, JSON.stringify(pass)); localStorage.removeItem(LEGACY_PICKUP_PASS_KEY); setSavedPass(pass); }
  return <div className="app-frame min-h-screen flex flex-col bg-[#F8FAFC]">
    <header className="site-header">
      <div className="nav-inner">
        <Link className="brand" to="/">SalbarKain<span>.</span></Link>
        <nav className="header-nav" aria-label="Main navigation">
          <Link className={view === 'market' ? 'nav-link is-current' : 'nav-link'} to="/">Explore</Link>
          <Link className={view === 'how' ? 'nav-link is-current' : 'nav-link'} to="/how-it-works">How it works</Link>
          <Link className={view === 'about' ? 'nav-link is-current' : 'nav-link'} to="/about">About</Link>
        </nav>
        <div className="header-actions">
          <MealsSavedCounter />
          <button className="text-button" onClick={() => setImpactOpen(true)}>My impact</button>
          {session ? <>
            <Link className="header-role-link" to={session.role === 'admin' ? '/admin' : '/workspace'}>
              <span className={`role-pill role-${session.role}`}>{session.role === 'admin' ? 'LGU Admin' : session.role === 'merchant' ? 'Merchant' : 'Verified NGO'}</span>
              <span className="header-role-destination">{session.role === 'admin' ? 'Command center' : 'Workspace'}</span>
            </Link>
            <button className="text-button" onClick={requestLogout}>Sign out</button>
          </> : <button className="primary-button compact" onClick={() => setLoginOpen(true)}>Merchant / NGO login</button>}
        </div>
        <div className="mobile-count">
          <MealsSavedCounter />
          <button type="button" className="mobile-menu-toggle" aria-expanded={mobileMenuOpen} aria-controls="mobile-navigation" aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setMobileMenuOpen(open => !open)}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={mobileMenuOpen ? 'M6 6l12 12M18 6L6 18' : 'M4 6h16M4 12h16M4 18h16'} /></svg>
          </button>
          {mobileMenuOpen && <nav className="mobile-menu" id="mobile-navigation" aria-label="Mobile navigation">
            <Link to="/" onClick={() => setMobileMenuOpen(false)}>Explore</Link>
            <Link to="/how-it-works" onClick={() => setMobileMenuOpen(false)}>How it works</Link>
            <Link to="/about" onClick={() => setMobileMenuOpen(false)}>About</Link>
            {session ? <>
              <Link to={session.role === 'admin' ? '/admin' : '/workspace'} onClick={() => setMobileMenuOpen(false)}>{session.role === 'admin' ? 'Admin command center' : session.role === 'merchant' ? 'Merchant workspace' : 'NGO workspace'}</Link>
              <button type="button" onClick={() => { setMobileMenuOpen(false); setImpactOpen(true); }}>My impact</button>
              <button type="button" onClick={requestLogout}>Sign out</button>
            </> : <>
              <button type="button" onClick={() => { setMobileMenuOpen(false); setImpactOpen(true); }}>My impact</button>
              <button className="primary-button" type="button" onClick={() => { setMobileMenuOpen(false); setLoginOpen(true); }}>Merchant / NGO login</button>
            </>}
            {savedPass && <button type="button" onClick={() => { setMobileMenuOpen(false); setPickupPass(savedPass); }}>My Active QR Pass</button>}
          </nav>}
        </div>
      </div>
    </header>
    <div className="app-main flex-1 pb-20">
      {view === 'admin' ? session?.role === 'admin' ? <Suspense fallback={<main className="dashboard-shell"><p className="loading-line">Opening the admin command center…</p></main>}><AdminQueue session={session} onNotice={setNotice} /></Suspense> : <main className="dashboard-shell"><section className="panel"><h1>Admin access required</h1><p className="panel-subtitle">Sign in with an administrator account to open this command center.</p><button className="primary-button" onClick={() => setLoginOpen(true)}>Sign in</button></section></main> : view === 'dashboard' && session ? <Suspense fallback={<main className="dashboard-shell"><p className="loading-line">Opening your partner workspace…</p></main>}><PartnerDashboardPage session={session} onBrowse={() => navigate('/')} onNotice={setNotice} onSavePass={savePass} onPassStatusChange={handlePickupStatusChange} /></Suspense> : view === 'how' ? <HowItWorksPage /> : view === 'about' ? <AboutPage /> : <MarketplacePage session={session} onClaim={setClaimBatch} onPartnerSignIn={() => setLoginOpen(true)} onNotice={setNotice} refreshTrigger={marketRefresh} />}
    </div>
    {savedPass && <button type="button" className="active-pass-fab" onClick={() => setPickupPass(savedPass)}>My Active QR Pass</button>}
    <RescueToast />
    <Footer />
    {loginOpen && <AuthModal onClose={() => setLoginOpen(false)} onLogin={handleLogin} />}
    {logoutConfirmOpen && <div className="overlay logout-confirm-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && setLogoutConfirmOpen(false)}><section className="dialog logout-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="logout-confirm-title" aria-describedby="logout-confirm-copy"><p className="eyebrow">Account session</p><h2 id="logout-confirm-title">Sign out of SalbarKain?</h2><p id="logout-confirm-copy">You can sign back in anytime to manage your store and pickup queue.</p><div className="logout-confirm-actions"><button type="button" className="secondary-button" onClick={() => setLogoutConfirmOpen(false)}>Stay signed in</button><button type="button" className="primary-button" onClick={logout}>Sign out</button></div></section></div>}
    {impactOpen && <MyImpactModal session={session} onClose={() => setImpactOpen(false)} />}
    {claimBatch && <ClaimDrawer batch={claimBatch} onClose={() => setClaimBatch(null)} onSubmit={submitClaim} />}
    {pickupPass && <QrPassModal pass={pickupPass} onStatusChange={handlePickupStatusChange} onClose={(result) => { setPickupPass(null); if (result?.cancelled) { localStorage.removeItem(PICKUP_PASS_KEY); localStorage.removeItem(LEGACY_PICKUP_PASS_KEY); setSavedPass(null); setMarketRefresh(value => value + 1); setNotice('Pickup cancelled. The portions are back in the marketplace.'); } else if (result?.status) { localStorage.removeItem(PICKUP_PASS_KEY); localStorage.removeItem(LEGACY_PICKUP_PASS_KEY); setSavedPass(null); } }} />}
    {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}
  </div>;
}

export default function App() { return <BrowserRouter><AppShell /></BrowserRouter>; }
