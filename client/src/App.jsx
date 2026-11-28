import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from './utils/api.js';
import { getDeviceToken } from './utils/identity.js';
import MarketplacePage from './pages/MarketplacePage.jsx';
import ClaimDrawer from './components/ClaimDrawer.jsx';
import QrPassModal from './components/QrPassModal.jsx';
import MyImpactModal from './components/MyImpactModal.jsx';
import Toast from './components/Toast.jsx';
import AuthPage from './pages/AuthPage.jsx';
import RescueToast from './components/RescueToast.jsx';
import Footer from './components/Footer.jsx';
import HowItWorksPage from './pages/HowItWorksPage.jsx';
import AboutPage from './pages/AboutPage.jsx';
const ActivateLguPage = lazy(() => import('./pages/ActivateLguPage.jsx'));

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

function AppShell() {
  const location = useLocation(); const navigate = useNavigate();
  const [session, setSession] = useState(() => { try { return JSON.parse(localStorage.getItem('salbarkain:auth') || 'null'); } catch { return null; } });
  const [loginOpen, setLoginOpen] = useState(false); const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false); const [impactOpen, setImpactOpen] = useState(false); const [claimBatch, setClaimBatch] = useState(null); const [pickupPass, setPickupPass] = useState(null); const [savedPass, setSavedPass] = useState(readPickupPass); const [notice, setNotice] = useState('');
  const [marketRefresh, setMarketRefresh] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const view = location.pathname === '/about' ? 'about' : location.pathname === '/how-it-works' ? 'how' : location.pathname === '/admin' ? 'admin' : location.pathname === '/activate-lgu' ? 'activate-lgu' : location.pathname === '/login' ? 'login' : location.pathname === '/workspace' ? 'dashboard' : 'market';
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
  function handleSessionProfileUpdate(profile) {
    setSession(current => {
      if (!current) return current;
      const next = { ...current, ...profile, token: current.token };
      localStorage.setItem('salbarkain:auth', JSON.stringify(next));
      return next;
    });
  }
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
  async function submitClaim({ buyerName, phone, qty, quantity, safetyAcknowledged }) {
    try {
      const requestedQty = Number(quantity ?? qty ?? 1);
      const { data } = await api.post('/claims', { batchId: claimBatch._id || claimBatch.id, quantity: requestedQty, buyerName, phone, deviceToken: getDeviceToken(), safetyAcknowledged });
      const claim = data.data.claim;
      const coordinates = claimBatch.merchantId?.location?.coordinates || null;
      const claimQuantity = Number(claim.quantity || claim.qty || requestedQty);
      const pass = { id: claim.id, qrToken: claim.qrToken, batchId: claim.batchId, qty: claimQuantity, quantity: claimQuantity, priceAtClaim: claim.priceAtClaim, totalPrice: Number(claim.totalPrice ?? (Number(claim.priceAtClaim || 0) * claimQuantity)), pickupDeadline: claim.pickupDeadline, status: claim.status, itemName: claimBatch.itemName, storeName: claimBatch.merchantId?.storeName || 'Local food partner', storeAddress: claimBatch.merchantId?.address || '', storeContactNumber: claimBatch.merchantId?.contactNumber || '', pickupInstructions: claimBatch.merchantId?.pickupInstructions || '', storeLogoUrl: claimBatch.merchantId?.storefrontPhotoUrl || '', coordinates, batch: claimBatch };
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
      {view === 'activate-lgu' ? <Suspense fallback={<main className="dashboard-shell"><p className="loading-line">Opening secure activation…</p></main>}><ActivateLguPage onActivated={handleLogin} onGoToLogin={() => navigate('/login')} /></Suspense> : view === 'admin' ? session?.role === 'admin' ? <Suspense fallback={<main className="dashboard-shell"><p className="loading-line">Opening the admin command center…</p></main>}><AdminQueue session={session} onNotice={setNotice} /></Suspense> : <main className="dashboard-shell"><section className="panel"><h1>Admin access required</h1><p className="panel-subtitle">Sign in with an administrator account to open this command center.</p><button className="primary-button" onClick={() => setLoginOpen(true)}>Sign in</button></section></main> : view === 'dashboard' && session ? <Suspense fallback={<main className="dashboard-shell"><p className="loading-line">Opening your partner workspace…</p></main>}><PartnerDashboardPage session={session} onBrowse={() => navigate('/')} onNotice={setNotice} onSavePass={savePass} onPassStatusChange={handlePickupStatusChange} onSessionUpdate={handleSessionProfileUpdate} /></Suspense> : view === 'how' ? <HowItWorksPage /> : view === 'about' ? <AboutPage /> : <MarketplacePage session={session} onClaim={setClaimBatch} onPartnerSignIn={() => setLoginOpen(true)} onNotice={setNotice} refreshTrigger={marketRefresh} />}
    </div>
    {savedPass && <button type="button" className="active-pass-fab" onClick={() => setPickupPass(savedPass)}>My Active QR Pass</button>}
    <RescueToast />
    <Footer />
    {loginOpen && <AuthPage onClose={() => setLoginOpen(false)} onLogin={handleLogin} />}
    {logoutConfirmOpen && <div className="overlay logout-confirm-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && setLogoutConfirmOpen(false)}><section className="dialog logout-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="logout-confirm-title" aria-describedby="logout-confirm-copy"><p className="eyebrow">Account session</p><h2 id="logout-confirm-title">Sign out of SalbarKain?</h2><p id="logout-confirm-copy">You can sign back in anytime to manage your store and pickup queue.</p><div className="logout-confirm-actions"><button type="button" className="secondary-button" onClick={() => setLogoutConfirmOpen(false)}>Stay signed in</button><button type="button" className="primary-button" onClick={logout}>Sign out</button></div></section></div>}
    {impactOpen && <MyImpactModal session={session} onClose={() => setImpactOpen(false)} />}
    {claimBatch && <ClaimDrawer batch={claimBatch} verifiedNgo={session?.role === 'ngo' && (session?.verificationStatus === 'verified' || session?.verified === true)} onClose={() => setClaimBatch(null)} onSubmit={submitClaim} />}
    {pickupPass && <QrPassModal pass={pickupPass} onStatusChange={handlePickupStatusChange} onClose={(result) => { setPickupPass(null); if (result?.cancelled) { localStorage.removeItem(PICKUP_PASS_KEY); localStorage.removeItem(LEGACY_PICKUP_PASS_KEY); setSavedPass(null); setMarketRefresh(value => value + 1); setNotice('Pickup cancelled. The portions are back in the marketplace.'); } else if (result?.status) { localStorage.removeItem(PICKUP_PASS_KEY); localStorage.removeItem(LEGACY_PICKUP_PASS_KEY); setSavedPass(null); } }} />}
    <Toast message={notice} onDismiss={() => setNotice('')} />
  </div>;
}

export default function App() { return <BrowserRouter><AppShell /></BrowserRouter>; }
