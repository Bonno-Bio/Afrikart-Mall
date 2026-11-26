import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="container" style={{ padding: '70px 0 90px', textAlign: 'center' }}>
      <div style={{ fontSize: 64, fontWeight: 800, letterSpacing: '-.05em', color: 'var(--navy)' }}>404</div>
      <h2 style={{ margin: '10px 0 8px' }}>That page does not exist</h2>
      <p className="muted" style={{ marginBottom: 20 }}>The link may be old, or the listing may have sold out and been removed.</p>
      <div className="row" style={{ justifyContent: 'center', gap: 10 }}>
        <Link to="/" className="btn btn-primary">Go to the homepage</Link>
        <Link to="/search" className="btn btn-ghost">Search products</Link>
      </div>
    </div>
  )
}
