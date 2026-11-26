import { Link } from 'react-router-dom';
import { useTextReveal } from '../utils/useTextReveal.js';

const figures = [
  { value: '~288 tons/day', label: 'Biodegradable and organic waste generated in Iloilo City (UNDP Philippines, 2026)' },
  { value: '1,717 metric tons/day', label: 'Food wasted in the Philippines (DOST-FNRI)' },
  { value: '2.95 million tonnes/year', label: 'Estimated Philippine food waste (UNEP)' },
  { value: '20.3%–22.6%', label: 'Families reporting involuntary hunger (SWS, 2026)' },
];

export default function AboutPage() {
  const titleRef = useTextReveal(); const statsRef = useTextReveal();
  return <main className="public-shell"><section className="public-hero"><p className="eyebrow">About SalbarKain · “Rescue Food”</p><h1 ref={titleRef}>A neighborhood loop for surplus food.</h1><p>We help local merchants share safe unsold food with nearby households and verified community shelters.</p></section><section className="public-section public-grid"><article className="public-card"><p className="eyebrow">Our mission</p><h2>Less waste, easier access.</h2><p>Eliminate daily commercial food waste while making nutritious meals accessible to every household and shelter.</p></article><article className="public-card"><p className="eyebrow">Our vision</p><h2>Rescue food in every community.</h2><p>Build zero-waste circular food ecosystems across every Philippine barangay and municipality.</p></article></section><section className="public-section"><h2 ref={statsRef}>Why food rescue matters</h2><div className="research-grid">{figures.map(item => <article className="research-card" key={item.value}><strong>{item.value}</strong><span>{item.label}</span></article>)}</div><p className="form-note mt-3">Research figures supplied for the SalbarKain civic-tech pilot; local totals vary by source, year, and measurement method.</p></section><section className="public-section about-quote"><strong>A ₱0-cost civic impact model.</strong><p className="mt-2">The platform uses free hosting tiers, open map data, and a transparent impact ledger to help LGUs and MENRO teams see food rescued and emissions diverted.</p><Link className="secondary-button mt-4 inline-flex" to="/how-it-works">See how it works</Link></section></main>;
}
