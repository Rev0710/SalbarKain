import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../utils/api.js';
import { isWithinIloilo } from '../utils/iloiloMap.js';
import LocationPicker from '../components/LocationPicker.jsx';
import './AuthPage.css';

const MUNICIPALITIES = ['Iloilo City', 'Pavia', 'Santa Barbara', 'Oton', 'Leganes', 'Zarraga', 'Cabatuan', 'Pototan', 'Passi City', 'Miagao', 'Other Iloilo Municipality'];
const SIGN_IN_ROLES = [
  { value: 'merchant', title: 'Merchant', subtitle: 'Bakery / Eatery', mark: 'M' },
  { value: 'ngo', title: 'NGO / Shelter', subtitle: 'Accredited Relief', mark: 'N' },
  { value: 'admin', title: 'LGU Admin', subtitle: 'MENRO / Gov', mark: 'L' },
];
const REGISTER_ROLES = [
  { value: 'merchant', title: 'Merchant', subtitle: 'Bakery, eatery, or grocery', mark: 'M' },
  { value: 'ngo', title: 'NGO / Shelter', subtitle: 'Accredited relief partner', mark: 'N' },
];
const DEMO_EMAILS = [
  { label: 'Provincial Admin', email: 'admin@salbarkain.ph', role: 'admin' },
  { label: 'Pavia LGU', email: 'pavia.lgu@salbarkain.ph', role: 'admin' },
  { label: 'Verified Merchant', email: 'demo.pavia@salbarkain.test', role: 'merchant' },
  { label: 'Verified NGO', email: 'demo.shelter@salbarkain.test', role: 'ngo' },
];

function PasswordField({ mode, value, onChange }) {
  const [visible, setVisible] = useState(false);
  return <label className="auth-field"><span className="auth-field-label">Password</span><div className="auth-input-wrap"><input className="auth-input auth-password-input" type={visible ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'register' ? 10 : undefined} required value={value} onChange={onChange} /><button className="password-toggle auth-password-toggle" type="button" aria-label={visible ? 'Hide password' : 'Show password'} aria-pressed={visible} onClick={() => setVisible(show => !show)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{visible ? <><path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 002.8 2.8"/><path d="M9.9 5.2A10.7 10.7 0 0112 5c5 0 8.5 4.6 9.5 7a11.8 11.8 0 01-3.1 4.3"/><path d="M6.2 6.2A12.1 12.1 0 012.5 12c1 2.4 4.5 7 9.5 7 1.1 0 2.1-.2 3-.6"/></> : <><path d="M2.5 12s3.5-7 9.5-7 9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z"/><circle cx="12" cy="12" r="3"/></>}</svg></button></div>{mode === 'register' && <span className="auth-help">Use at least 10 characters.</span>}</label>;
}

function RoleCard({ role, selected, onSelect }) {
  return <button type="button" className={`auth-role-card ${selected ? 'is-selected' : ''}`} aria-pressed={selected} onClick={() => onSelect(role.value)}><span className="auth-role-mark" aria-hidden="true">{role.mark}</span><span className="auth-role-copy"><strong>{role.title}</strong><small>{role.subtitle}</small></span><span className="auth-role-indicator" aria-hidden="true" /></button>;
}

export default function AuthPage({ onClose = () => {}, onLogin = () => {} }) {
  const [mode, setMode] = useState('login');
  const [role, setRole] = useState('merchant');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [name, setName] = useState(''); const [phone, setPhone] = useState('');
  const [address, setAddress] = useState(''); const [barangay, setBarangay] = useState('');
  const [municipality, setMunicipality] = useState('Iloilo City'); const [storeName, setStoreName] = useState('');
  const [category, setCategory] = useState('bakery'); const [organizationName, setOrganizationName] = useState('');
  const [lat, setLat] = useState(''); const [lng, setLng] = useState(''); const [located, setLocated] = useState(null);
  const [verificationDoc, setVerificationDoc] = useState(null); const [storefrontPhoto, setStorefrontPhoto] = useState(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);

  function switchMode(nextMode) {
    setMode(nextMode);
    if (nextMode === 'register' && role === 'admin') setRole('merchant');
    if (nextMode === 'login') setRole('merchant');
    setError('');
  }
  function changePin(latitude, longitude) {
    if (latitude !== '' && longitude !== '' && !isWithinIloilo(Number(latitude), Number(longitude))) { setError('Choose a pin within Iloilo Province.'); return; }
    setLat(latitude === '' ? '' : Number(latitude).toFixed(6));
    setLng(longitude === '' ? '' : Number(longitude).toFixed(6));
    setLocated(null); setError('');
  }
  function locateMe() {
    if (!navigator.geolocation) { setError('This browser does not provide location access. Tap the map to choose a pin.'); return; }
    navigator.geolocation.getCurrentPosition(position => {
      const point = { lat: position.coords.latitude, lng: position.coords.longitude };
      if (!isWithinIloilo(point.lat, point.lng)) { setError('Your current location is outside Iloilo Province. Choose a pin within Iloilo instead.'); return; }
      setLat(point.lat.toFixed(6)); setLng(point.lng.toFixed(6)); setLocated(point); setError('');
    }, () => setError('Location permission was unavailable. Tap the map to choose a pin.'), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }
  function fillDemo(address, demoRole) { setEmail(address); setPassword(''); setRole(demoRole); setError(''); }
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
    try {
      const { data } = await api.post(registration ? '/auth/register' : '/auth/login', body, registration ? { headers: { 'Content-Type': 'multipart/form-data' } } : undefined);
      if (!registration && data?.data?.user?.role !== role) {
        const actualRole = data?.data?.user?.role === 'admin' ? 'LGU Admin' : data?.data?.user?.role === 'ngo' ? 'NGO / Shelter' : 'Merchant';
        setError(`This account is registered as ${actualRole}. Select that role and sign in again.`);
        return;
      }
      onLogin(data.data);
    } catch (requestError) { setError(requestError.response?.data?.message || 'Unable to sign in. Check your details and try again.'); }
    finally { setBusy(false); }
  }

  return <div className="overlay auth-overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="auth-portal" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <aside className="auth-showcase">
        <div className="auth-glow auth-glow-one" aria-hidden="true" /><div className="auth-glow auth-glow-two" aria-hidden="true" />
        <div className="auth-showcase-top"><span className="auth-network-mark" aria-hidden="true">S.</span><span className="auth-network-label">Iloilo Civic Food Rescue Network</span></div>
        <div className="auth-showcase-content"><p className="auth-showcase-kicker">A verified local network</p><h2>Turning Iloilo’s daily closing surplus into verified community meals.</h2>
          <div className="auth-trust-list">
            <article className="auth-trust-item"><span className="auth-trust-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 3l7 3v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6l7-3z"/><path d="M8.5 12l2.2 2.2 4.8-5"/></svg></span><span><strong>KYB &amp; Permit Verified</strong><small>Protecting local diners and partner storefronts.</small></span></article>
            <article className="auth-trust-item"><span className="auth-trust-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><path d="M14 14h2v2h-2zm4 0h2v2h-2zm-4 4h2v2h-2zm4 2h2"/></svg></span><span><strong>3-Second Smart Restock</strong><small>Built for busy bakers and carinderia kitchens.</small></span></article>
            <article className="auth-trust-item"><span className="auth-trust-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20.5 3.5C12 3.7 6.3 6 5 11c-.8 3.1 1.2 5.8 4.3 5.4 5.1-.7 8-6.5 11.2-12.9z"/><path d="M3 21c2.5-5.6 6.2-8.8 11.4-11.4"/></svg></span><span><strong>RA 9003 MENRO Telemetry</strong><small>Automated municipal food and CO₂e impact tracking.</small></span></article>
          </div>
        </div>
        <p className="auth-showcase-footnote">Everyday buyers never need an account—only partner storefronts, accredited NGOs, and LGU officers sign in here.</p>
      </aside>

      <div className="auth-workspace">
        <Link className="auth-back-link" to="/" onClick={onClose}><span aria-hidden="true">←</span> Back to Explore</Link>
        <button className="auth-close-button" type="button" onClick={onClose} aria-label="Close sign in">×</button>
        <header className="auth-workspace-header"><p className="auth-eyebrow">Partner portal</p><h1 id="auth-title">{mode === 'login' ? 'Welcome back, Partner' : 'Join the SalbarKain Network'}</h1><p>{mode === 'login' ? 'Access your verified partner workspace.' : 'Register your local organization to help rescue Iloilo surplus.'}</p></header>
        <div className="auth-mode-switch" role="tablist" aria-label="Authentication mode"><button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'is-active' : ''} onClick={() => switchMode('login')}>Sign in</button><button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'is-active' : ''} onClick={() => switchMode('register')}>Register</button></div>

        {mode === 'login' ? <>
          <div className="auth-role-grid" role="group" aria-label="Choose your account type">{SIGN_IN_ROLES.map(item => <RoleCard key={item.value} role={item} selected={role === item.value} onSelect={value => { setRole(value); setError(''); }} />)}</div>
          {role === 'admin' && <div className="auth-civic-notice"><span aria-hidden="true">!</span><p>Restricted to Iloilo Provincial &amp; Municipal LGU officers. Municipal admins activate via an official invite link.</p></div>}
          <form className="auth-form" onSubmit={submit}>
            <label className="auth-field"><span className="auth-field-label">Email address</span><input className="auth-input" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@organization.ph" /></label>
            <PasswordField mode={mode} value={password} onChange={event => setPassword(event.target.value)} />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : 'Sign in to your workspace'}<span aria-hidden="true">→</span></button>
            <div className="auth-demo-bar"><div><strong>Hackathon Demo Quick-Fill</strong><small>Fills the account email and role; enter the stage password privately.</small></div><div className="auth-demo-buttons">{DEMO_EMAILS.map(demo => <button type="button" key={demo.email} onClick={() => fillDemo(demo.email, demo.role)}>{demo.label}</button>)}</div></div>
          </form>
        </> : <form className="auth-form auth-register-form" onSubmit={submit}>
          <div className="auth-register-selector" role="group" aria-label="Choose account type">{REGISTER_ROLES.map(item => <RoleCard key={item.value} role={item} selected={role === item.value} onSelect={value => { setRole(value); setError(''); }} />)}</div>
          <section className="auth-form-group"><div className="auth-form-group-heading"><span>01</span><div><h2>Partner details</h2><p>Your organization contact and storefront information.</p></div></div>
            <label className="auth-field"><span className="auth-field-label">Contact name</span><input className="auth-input" autoComplete="name" required value={name} onChange={event => setName(event.target.value)} /></label>
            {role === 'merchant' ? <><label className="auth-field"><span className="auth-field-label">Store name</span><input className="auth-input" required value={storeName} onChange={event => setStoreName(event.target.value)} /></label><label className="auth-field"><span className="auth-field-label">Business category</span><select className="auth-input" value={category} onChange={event => setCategory(event.target.value)}><option value="bakery">Bakery</option><option value="eatery">Eatery / carinderia</option><option value="grocery">Grocery</option><option value="other">Other</option></select></label></> : <label className="auth-field"><span className="auth-field-label">Organization name</span><input className="auth-input" required value={organizationName} onChange={event => setOrganizationName(event.target.value)} /></label>}
            <label className="auth-field"><span className="auth-field-label">Email address</span><input className="auth-input" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} /></label><label className="auth-field"><span className="auth-field-label">Mobile number</span><input className="auth-input" type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} /></label><PasswordField mode={mode} value={password} onChange={event => setPassword(event.target.value)} />
          </section>
          <section className="auth-form-group"><div className="auth-form-group-heading"><span>02</span><div><h2>Iloilo location</h2><p>Set the partner address and choose its map pin.</p></div></div>
            <div className="auth-address-row"><label className="auth-field"><span className="auth-field-label">Province</span><input className="auth-input" value="Iloilo" readOnly /></label><label className="auth-field"><span className="auth-field-label">Municipality / City</span><select className="auth-input" required value={municipality} onChange={event => setMunicipality(event.target.value)}>{MUNICIPALITIES.map(place => <option value={place} key={place}>{place}</option>)}</select></label></div>
            <label className="auth-field"><span className="auth-field-label">Barangay</span><input className="auth-input" required minLength="2" maxLength="100" value={barangay} onChange={event => setBarangay(event.target.value)} /></label><label className="auth-field"><span className="auth-field-label">Street address</span><input className="auth-input" required minLength="5" maxLength="300" value={address} onChange={event => setAddress(event.target.value)} /></label>
            <div className="auth-pin-heading"><span>Store / shelter map pin</span><button className="auth-locate-button" type="button" onClick={locateMe}>Use my location</button></div><LocationPicker lat={lat} lng={lng} onChange={changePin} located={located} />
            <div className="auth-address-row"><label className="auth-field"><span className="auth-field-label">Latitude</span><input className="auth-input" type="number" step="any" min="10.4" max="11.6" required value={lat} onChange={event => changePin(event.target.value, lng)} /></label><label className="auth-field"><span className="auth-field-label">Longitude</span><input className="auth-input" type="number" step="any" min="122.05" max="123.35" required value={lng} onChange={event => changePin(lat, event.target.value)} /></label></div>
          </section>
          <section className="auth-form-group"><div className="auth-form-group-heading"><span>03</span><div><h2>Verification documents</h2><p>Submit a permit so the Iloilo admin team can review your application.</p></div></div>
            <label className="auth-field"><span className="auth-field-label">Permit / verification document</span><span className="auth-help">Mayor’s Permit, Barangay Business Clearance, or Sanitary Permit · PDF or photo, up to 8 MB.</span><input className="auth-file-input" type="file" accept="application/pdf,image/*" required onChange={event => setVerificationDoc(event.target.files?.[0] || null)} /></label>
            <label className="auth-field"><span className="auth-field-label">Storefront photo <span className="auth-optional">Optional</span></span><input className="auth-file-input" type="file" accept="image/*" onChange={event => setStorefrontPhoto(event.target.files?.[0] || null)} /></label><p className="auth-review-note">Your account will remain pending until your documents are reviewed.</p>
          </section>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="auth-submit" type="submit" disabled={busy}>{busy ? 'Submitting application…' : 'Submit verification application'}<span aria-hidden="true">→</span></button>
        </form>}
        <p className="auth-workspace-footnote">Protected partner access · Everyday buyers can explore without signing in.</p>
      </div>
    </section>
  </div>;
}
