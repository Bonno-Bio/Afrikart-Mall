import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Icon } from './icons'
import { useStore } from '../state'
import { api } from '../lib/api'

const TOWNS = ['Gaborone', 'Tlokweng', 'Mogoditshane', 'Francistown', 'Maun', 'Palapye', 'Serowe', 'Kanye', 'Molepolole', 'Lobatse', 'Selibe-Phikwe', 'Mahalapye']

function SearchBar() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') || '')
  const [sug, setSug] = useState([])
  const [open, setOpen] = useState(false)
  const timer = useRef()
  const box = useRef()

  useEffect(() => { setQ(params.get('q') || '') }, [params])

  useEffect(() => {
    const onDoc = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const change = (v) => {
    setQ(v)
    clearTimeout(timer.current)
    if (!v.trim()) { setSug([]); setOpen(false); return }
    timer.current = setTimeout(() => {
      api(`/suggest?q=${encodeURIComponent(v)}`).then((d) => { setSug(d.suggestions); setOpen(d.suggestions.length > 0) }).catch(() => {})
    }, 140)
  }

  const submit = (e) => {
    e?.preventDefault()
    setOpen(false)
    nav(`/search?q=${encodeURIComponent(q)}`)
  }

  return (
    <form className="searchbar" onSubmit={submit} ref={box} style={{ position: 'relative' }}>
      <select className="search-select" aria-label="Category" defaultValue="all" onChange={(e) => {
        const v = e.target.value
        if (v !== 'all') nav(`/search?category=${v}${q ? `&q=${encodeURIComponent(q)}` : ''}`)
      }}>
        <option value="all">All</option>
        <option value="baby-mother">Baby</option>
        <option value="hair-beauty">Beauty</option>
        <option value="phones-tech">Tech</option>
        <option value="home-kitchen">Home</option>
        <option value="groceries">Groceries</option>
        <option value="solar-power">Solar</option>
        <option value="fashion">Fashion</option>
        <option value="diy-auto">DIY</option>
      </select>
      <input
        className="search-input"
        placeholder="Search Afrikart — nappies, weave, inverter, blanket…"
        value={q}
        onChange={(e) => change(e.target.value)}
        onFocus={() => sug.length && setOpen(true)}
        aria-label="Search products"
      />
      <button className="search-btn" type="submit" aria-label="Search"><Icon name="search" size={19} strokeWidth={2.2} /></button>

      {open && sug.length > 0 && (
        <div style={{
          position: 'absolute', top: 46, left: 0, right: 0, background: '#fff', borderRadius: 8,
          boxShadow: 'var(--shadow-lg)', overflow: 'hidden', zIndex: 60, color: 'var(--ink)',
        }}>
          {sug.map((s, i) => (
            <button key={i} type="button"
              onClick={() => { setQ(s); setOpen(false); nav(`/search?q=${encodeURIComponent(s)}`) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                padding: '9px 14px', border: 0, background: 'transparent', fontSize: 13.5,
                borderBottom: i === sug.length - 1 ? 0 : '1px solid var(--line-2)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-2)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <Icon name="search" size={14} style={{ color: 'var(--muted-2)' }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</span>
            </button>
          ))}
        </div>
      )}
    </form>
  )
}

export default function Layout({ children }) {
  const { user, cartCount, categories, city, setCity, toasts } = useStore()
  const nav = useNavigate()

  return (
    <div className="app">
      <div className="topbar">
        <div className="container topbar-inner">
          <span className="topbar-loc">
            <span className="dot" />
            <Icon name="pin" size={13} />
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              style={{ background: 'transparent', border: 0, color: '#fff', fontWeight: 600, fontSize: 12, outline: 'none', cursor: 'pointer' }}
            >
              {TOWNS.map((t) => <option key={t} value={t} style={{ color: '#0a1726' }}>{t}</option>)}
            </select>
          </span>
          <span className="topbar-spacer" />
          <Link to="/seller">Sell on Afrikart</Link>
          <Link to="/account#orders">Track an order</Link>
          <Link to="/help">Help</Link>
        </div>
      </div>

      <header className="header">
        <div className="container header-inner">
          <Link to="/" className="logo" aria-label="Afrikart Mall home">
            <span className="logo-mark">A</span>
            <span className="logo-text">
              <b>afrikart</b>
              <span>Mall · Botswana</span>
            </span>
          </Link>

          <SearchBar />

          <div className="header-actions">
            <Link to={user ? '/account' : '/signin'} className="haction">
              <span className="haction-label">{user ? 'Hello,' : 'Sign in'}</span>
              <span className="haction-value">
                <Icon name="user" size={15} />
                {user ? user.name.split(' ')[0] : 'Account'}
              </span>
            </Link>
            <Link to="/account#orders" className="haction">
              <span className="haction-label">Returns</span>
              <span className="haction-value">&amp; Orders</span>
            </Link>
            <Link to="/cart" className="haction" style={{ position: 'relative' }} aria-label={`Cart, ${cartCount} items`}>
              <span className="cart-count">{cartCount}</span>
              <span className="haction-label">Your</span>
              <span className="haction-value"><Icon name="cart" size={18} /> Cart</span>
            </Link>
          </div>
        </div>
      </header>

      <nav className="subnav">
        <div className="container subnav-inner">
          <Link to="/search" className="subnav-link all"><Icon name="menu" size={15} /> All</Link>
          <Link to="/search?deal=1" className="subnav-link" style={{ color: '#ffcf8a', fontWeight: 700 }}>Today&apos;s Deals</Link>
          {categories.map((c) => (
            <Link key={c.slug} to={`/search?category=${c.slug}`} className="subnav-link">{c.name}</Link>
          ))}
        </div>
      </nav>

      <main className="main">{children}</main>

      <footer className="footer">
        <div className="footer-top" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} style={{ cursor: 'pointer' }}>
          Back to top ↑
        </div>
        <div className="container">
          <div className="footer-cols">
            <div>
              <h4>Shop on Afrikart</h4>
              {categories.slice(0, 5).map((c) => <Link key={c.slug} to={`/search?category=${c.slug}`}>{c.name}</Link>)}
              <Link to="/search?deal=1">Today&apos;s Deals</Link>
            </div>
            <div>
              <h4>Your account</h4>
              <Link to="/account">Your account</Link>
              <Link to="/account#orders">Your orders</Link>
              <Link to="/saved">Your list</Link>
              <Link to="/cart">Your cart</Link>
              <Link to="/help">Delivery &amp; returns</Link>
            </div>
            <div>
              <h4>Sell with us</h4>
              <Link to="/seller">Open a seller account</Link>
              <Link to="/seller">Afrikart Fulfilment</Link>
              <Link to="/seller">Seller fees</Link>
              <Link to="/seller">Advertise your products</Link>
            </div>
            <div>
              <h4>Afrikart</h4>
              <Link to="/help">About Afrikart</Link>
              <Link to="/help">Careers</Link>
              <Link to="/help">Privacy &amp; data protection</Link>
              <Link to="/help">Consumer rights</Link>
              <Link to="/help">Contact us</Link>
            </div>
          </div>
          <div className="footer-bottom">
            <div className="row wrap" style={{ gap: 14 }}>
              <span style={{ fontWeight: 800, color: '#fff', letterSpacing: '.02em' }}>afrikart</span>
              <span>© {new Date().getFullYear()} Afrikart Mall (Pty) Ltd · Gaborone, Botswana</span>
            </div>
            <div className="pay-chips">
              <span className="pay-chip">Visa</span>
              <span className="pay-chip">Mastercard</span>
              <span className="pay-chip">Orange Money</span>
              <span className="pay-chip">MyZaka</span>
              <span className="pay-chip">Smega</span>
              <span className="pay-chip">Cash on delivery</span>
            </div>
          </div>
        </div>
      </footer>

      <div className="toast-wrap">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            <Icon name="check" size={15} />
            {t.message}
          </div>
        ))}
      </div>
    </div>
  )
}
