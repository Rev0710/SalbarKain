import { Link } from 'react-router-dom';
import { useTextReveal } from '../utils/useTextReveal.js';

const steps = [
  { title: 'Food partners post', detail: 'Verified merchants add a photo, portions, price, pickup cutoff, and clear storage and allergen information. Smart Restock reuses yesterday’s details.' },
  { title: 'Neighbors reserve', detail: 'Buyers browse nearby listings without an account, reserve with a name and mobile number, and keep a 45-minute QR pickup pass on their device.' },
  { title: 'NGOs collect', detail: 'Verified shelters can reserve donation batches and get first access during optional 15-minute priority windows.' },
];

export default function HowItWorksPage() {
  const titleRef = useTextReveal(); const safetyRef = useTextReveal();
  return <main className="public-shell"><section className="public-hero"><p className="eyebrow">Three steps, one local loop</p><h1 ref={titleRef}>Good food finds a table.</h1><p>SalbarKain connects verified food partners with neighbors and shelters before safe pickup time runs out.</p><Link className="primary-button mt-5 inline-flex" to="/">Explore live batches</Link></section><section className="public-section"><h2>How it works</h2><div className="public-grid">{steps.map((step, index) => <article className="public-card" key={step.title}><p className="eyebrow">Step 0{index + 1}</p><h3>{step.title}</h3><p>{step.detail}</p></article>)}</div></section><section className="public-section"><h2 ref={safetyRef}>Food safety stays visible</h2><div className="public-grid"><article className="public-card"><h3>Clear handling details</h3><p>Every batch lists storage type, consume-within guidance, allergens, ingredients when supplied, and the merchant’s safe-until time.</p></article><article className="public-card"><h3>Pickup cutoff enforced</h3><p>New listings need a future pickup window. Claims and merchant scans stop when the pickup or food-safe cutoff has passed.</p></article><article className="public-card"><h3>Pay at the counter</h3><p>Paid batches are settled at the verified storefront. SalbarKain takes no in-app payments and sends no buyer-store DMs.</p></article></div></section></main>;
}
