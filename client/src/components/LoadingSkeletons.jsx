export function BatchSkeletons({ count = 4 }) {
  return <div className="skeleton-list" aria-label="Loading available batches" aria-busy="true" role="status">{Array.from({ length: count }, (_, index) => <div className="skeleton-card" key={index}><span className="skeleton skeleton-photo" /><span className="skeleton-copy"><i className="skeleton skeleton-title" /><i className="skeleton skeleton-store" /><i className="skeleton skeleton-action" /></span></div>)}</div>;
}

export function InventorySkeletons({ count = 3 }) {
  return <div className="skeleton-list" aria-label="Loading inventory" aria-busy="true" role="status">{Array.from({ length: count }, (_, index) => <div className="skeleton-card inventory-skeleton" key={index}><span className="skeleton skeleton-photo" /><span className="skeleton-copy"><i className="skeleton skeleton-title" /><i className="skeleton skeleton-store" /></span></div>)}</div>;
}
