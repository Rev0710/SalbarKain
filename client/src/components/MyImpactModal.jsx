import { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import { api } from '../utils/api.js';
import { getDeviceToken } from '../utils/identity.js';

export default function MyImpactModal({ session, onClose }) {
  const [impact, setImpact] = useState(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(true);
  useEffect(() => {
    let active = true;
    const body = session?.role === 'merchant' || session?.role === 'ngo' ? {} : { phone: localStorage.getItem('salbarkain:buyerPhone') || '', deviceToken: getDeviceToken() };
    api.post('/impact/mine', body).then(({ data }) => { if (active) { setImpact(data.data); localStorage.setItem('salbarkain:myImpact', JSON.stringify(data.data)); } }).catch(err => { if (active) setError(err.response?.data?.message || 'Your personal impact could not load.'); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [session]);
  function downloadCertificate() {
    if (!impact?.certificateUnlocked) return;
    const pdf = new jsPDF({ orientation: 'landscape' });
    pdf.setTextColor(21, 128, 61); pdf.setFontSize(30); pdf.text('Certified Zero-Waste Storefront', 148, 70, { align: 'center' });
    pdf.setTextColor(15, 23, 42); pdf.setFontSize(18); pdf.text(session?.storeName || 'SalbarKain Partner Store', 148, 95, { align: 'center' });
    pdf.setFontSize(13); pdf.text('Awarded for completing 50 or more verified food rescues.', 148, 115, { align: 'center' });
    pdf.setFontSize(11); pdf.text(`${impact.rescues} completed pickups · ${impact.mealPacks} meal packs rescued`, 148, 132, { align: 'center' });
    pdf.save('salbarkain-zero-waste-certificate.pdf');
  }
  return <div className="overlay" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}><section className="dialog w-full max-w-md" role="dialog" aria-modal="true" aria-labelledby="impact-title"><button className="close-button" onClick={onClose} aria-label="Close">×</button><p className="eyebrow">Your SalbarKain impact</p><h2 id="impact-title" className="mt-2 text-2xl font-semibold">Rescue profile</h2>{busy ? <p className="panel-subtitle mt-4">Loading your personal rescue totals…</p> : error ? <p className="alert-banner mt-4" role="alert">{error}</p> : <><div className="tier-card"><span>Food Saver tier</span><strong>{impact.tier}</strong></div><div className="impact-stat-grid"><div><strong>{impact.rescues}</strong><span>pickups</span></div><div><strong>{impact.mealPacks}</strong><span>meal packs</span></div><div><strong>₱{Number(impact.moneySaved).toFixed(2)}</strong><span>estimated saved</span></div><div><strong>{impact.co2eKg} kg</strong><span>CO₂e diverted</span></div></div>{impact.roleBadge && <p className="hero-badge">{impact.roleBadge}</p>}{impact.certificateUnlocked && <button className="primary-button w-full mt-4" onClick={downloadCertificate}>Download storefront certificate</button>}</>}</section></div>;
}
