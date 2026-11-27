import { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import { api } from '../utils/api.js';
import { getDeviceToken } from '../utils/identity.js';

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function money(value) {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 2 }).format(asNumber(value));
}

function Stat({ value, label }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}

export default function MyImpactModal({ session, onClose }) {
  const [impact, setImpact] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const role = session?.role || 'guest';
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setBusy(true);
    setError('');
    async function loadImpact() {
      try {
        let result;
        if (role === 'merchant') {
          const { data } = await api.get('/claims/merchant-impact');
          result = { role, ...(data?.data || {}) };
        } else if (role === 'ngo') {
          const { data } = await api.post('/impact/mine', {});
          result = { role, ...(data?.data || {}) };
        } else if (role === 'admin') {
          const { data } = await api.get('/admin/overview');
          const overview = data?.data || {};
          result = { role, jurisdiction: overview.jurisdiction, ...(overview.kpis || {}) };
        } else {
          const body = { phone: localStorage.getItem('salbarkain:buyerPhone') || '', deviceToken: getDeviceToken() };
          const { data } = await api.post('/impact/mine', body);
          result = { role, ...(data?.data || {}) };
          localStorage.setItem('salbarkain:myImpact', JSON.stringify(result));
        }
        if (active) setImpact(result);
      } catch (loadError) {
        if (active) setError(loadError.response?.data?.message || 'Your live impact could not load. Please try again.');
      } finally {
        if (active) setBusy(false);
      }
    }
    void loadImpact();
    return () => { active = false; };
  }, [role, session?.id, reloadKey]);

  function downloadCertificate() {
    if (role !== 'merchant' || asNumber(impact?.completedRescues) < 50) return;
    const pdf = new jsPDF({ orientation: 'landscape' });
    pdf.setTextColor(21, 128, 61); pdf.setFontSize(30); pdf.text('Certified Zero-Waste Storefront', 148, 70, { align: 'center' });
    pdf.setTextColor(15, 23, 42); pdf.setFontSize(18); pdf.text(session?.organizationName || session?.storeName || 'SalbarKain Partner Store', 148, 95, { align: 'center' });
    pdf.setFontSize(13); pdf.text('Awarded for completing 50 or more verified food rescues.', 148, 115, { align: 'center' });
    pdf.setFontSize(11); pdf.text(String(asNumber(impact.completedRescues)) + ' completed rescues', 148, 132, { align: 'center' });
    pdf.save('salbarkain-zero-waste-certificate.pdf');
  }

  function retry() {
    setImpact(null);
    setError('');
    setBusy(true);
    setReloadKey(value => value + 1);
  }

  const merchantRescues = asNumber(impact?.completedRescues);
  const ngoPacks = asNumber(impact?.mealPacks);
  const adminJurisdiction = impact?.jurisdiction?.label || (impact?.jurisdiction?.assignedMunicipality === 'ALL' ? 'Iloilo Province (All LGUs)' : impact?.jurisdiction?.assignedMunicipality || 'Assigned LGU');
  const guestImpact = impact?.role === 'guest' ? impact : null;

  return <div className="overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
    <section className="dialog w-full max-w-md role-impact-dialog" role="dialog" aria-modal="true" aria-labelledby="impact-title">
      <button className="close-button" onClick={onClose} aria-label="Close">×</button>
      {role === 'merchant' ? <>
        <p className="eyebrow">Store environmental impact</p><h2 id="impact-title" className="mt-2 text-2xl font-semibold">{session?.organizationName || session?.storeName || 'Your store'}</h2>
        {busy ? <p className="panel-subtitle mt-4">Loading live store totals…</p> : error ? <div className="impact-load-error" role="alert"><p>{error}</p><button type="button" className="secondary-button" onClick={retry}>Retry</button></div> : impact && <>
          <p className="impact-tier-pill">Zero-Waste Partner Progress: {merchantRescues}/50 rescues</p>
          <div className="impact-stat-grid">
            <Stat value={merchantRescues} label="Completed rescues" />
            <Stat value={(merchantRescues * 0.5).toFixed(1) + ' kg'} label="Food waste diverted" />
            <Stat value={money(impact.revenueRecovered)} label="Revenue recovered" />
            <Stat value={(merchantRescues * 1.25).toFixed(1) + ' kg'} label="CO₂e prevented" />
          </div>
          {merchantRescues >= 50 && <button className="primary-button w-full mt-4" onClick={downloadCertificate}>Download Zero-Waste Certificate</button>}
        </>}
      </> : role === 'ngo' ? <>
        <p className="eyebrow">Community hunger impact</p><h2 id="impact-title" className="mt-2 text-2xl font-semibold">{session?.organizationName || 'NGO / Shelter'}</h2>
        {busy ? <p className="panel-subtitle mt-4">Loading live organization totals…</p> : error ? <div className="impact-load-error" role="alert"><p>{error}</p><button type="button" className="secondary-button" onClick={retry}>Retry</button></div> : impact && <>
          <p className="impact-tier-pill">Community Hunger Hero Progress: {Math.min(100, ngoPacks)}/100 packs</p>
          <div className="impact-stat-grid">
            <Stat value={ngoPacks} label="Bulk packs rescued" />
            <Stat value={ngoPacks} label="Meals distributed" />
            <Stat value={asNumber(impact.foodKg).toFixed(1) + ' kg'} label="Food diverted" />
            <Stat value={asNumber(impact.co2eKg).toFixed(1) + ' kg'} label="CO₂e prevented" />
          </div>
          {ngoPacks >= 100 && <p className="hero-badge mt-4">Community Hunger Hero</p>}
        </>}
      </> : role === 'admin' ? <>
        <p className="eyebrow">Jurisdiction civic impact</p><h2 id="impact-title" className="mt-2 text-2xl font-semibold">{adminJurisdiction}</h2>
        {busy ? <p className="panel-subtitle mt-4">Loading jurisdiction totals…</p> : error ? <div className="impact-load-error" role="alert"><p>{error}</p><button type="button" className="secondary-button" onClick={retry}>Retry</button></div> : impact && <div className="impact-stat-grid">
          <Stat value={asNumber(impact.mealsSaved)} label="Total meals rescued" />
          <Stat value={asNumber(impact.foodDivertedKg).toFixed(1) + ' kg'} label="Food diverted" />
          <Stat value={asNumber(impact.co2PreventedKg).toFixed(1) + ' kg'} label="CO₂e prevented" />
        </div>}
      </> : <>
        <p className="eyebrow">Your SalbarKain impact</p><h2 id="impact-title" className="mt-2 text-2xl font-semibold">Citizen Rescue Profile</h2>
        {busy ? <p className="panel-subtitle mt-4">Loading your personal rescue totals…</p> : error ? <div className="impact-load-error" role="alert"><p>{error}</p><button type="button" className="secondary-button" onClick={retry}>Retry</button></div> : guestImpact && <>
          <div className="tier-card"><span>Food Saver tier</span><strong>{guestImpact.tier}</strong></div>
          <div className="impact-stat-grid"><Stat value={asNumber(guestImpact.rescues)} label="Pickups" /><Stat value={asNumber(guestImpact.mealPacks)} label="Meal packs" /><Stat value={money(guestImpact.moneySaved)} label="Estimated saved" /><Stat value={asNumber(guestImpact.co2eKg).toFixed(1) + ' kg'} label="CO₂e diverted" /></div>
          {guestImpact.roleBadge && <p className="hero-badge">{guestImpact.roleBadge}</p>}
        </>}
      </>}
    </section>
  </div>;
}
