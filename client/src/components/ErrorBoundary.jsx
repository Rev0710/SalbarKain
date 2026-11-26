import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) {
    // Keep details in the browser console for local debugging; never render traces or user data.
    if (import.meta.env.DEV) console.error('SalbarKain screen error:', error, info.componentStack);
  }
  render() {
    if (this.state.failed) return <main className="error-screen" role="alert"><div className="error-screen-card"><p className="eyebrow">A brief interruption</p><h1>That page hit a snag.</h1><p>Nothing was charged. Reload the marketplace or return to the page and try again.</p><div className="error-screen-actions"><button className="primary-button" onClick={() => window.location.reload()}>Reload marketplace</button><button className="secondary-button" onClick={() => window.location.assign('/')}>Return to marketplace</button></div></div></main>;
    return this.props.children;
  }
}
