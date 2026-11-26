import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false, message: '' }; }
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error, info) {
    const message = typeof error?.message === 'string' ? error.message : 'Unknown React rendering error';
    console.error('SalbarKain runtime error:', message);
    if (import.meta.env.DEV && info?.componentStack) console.error('SalbarKain component stack:', info.componentStack);
    this.setState({ message });
  }
  render() {
    if (this.state.failed) return <main className="error-screen" role="alert"><div className="error-screen-card"><p className="eyebrow">A brief interruption</p><h1>That page hit a snag.</h1><p>The page couldn’t load. Reload it or return to the marketplace and try again.</p>{this.state.message && <details className="error-technical-details"><summary>Technical details</summary><code>{this.state.message}</code></details>}<div className="error-screen-actions"><button className="primary-button" onClick={() => window.location.reload()}>Reload page</button><button className="secondary-button" onClick={() => window.location.assign('/')}>Return to marketplace</button></div></div></main>;
    return this.props.children;
  }
}
