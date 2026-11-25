import { useId } from 'react'
import { Link } from 'react-router-dom'
import { Icon, categoryHue } from './icons'
import { money, priceParts, discountPct } from '../lib/api'
import { useStore } from '../state'

/* ---------------------------------------------------------------- media
   Supplier photography is a real operational problem in this market, so the
   platform ships a deterministic generated tile per product until a real
   photograph is uploaded. Same product always renders the same tile.        */
function hash(str) {
  let h = 0
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0
  return h
}

export function MediaTile({ glyph = 'box', category = '', title = '', compact = false }) {
  const uid = useId().replace(/:/g, '')
  const base = categoryHue[category] ?? 210
  const h = hash(title || glyph)
  const hue = (base + (h % 24) - 12 + 360) % 360
  const rot = compact ? 0 : (h % 14) - 7
  return (
    <svg viewBox="0 0 400 400" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`g${uid}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={`hsl(${hue} 42% 94%)`} />
          <stop offset="55%" stopColor={`hsl(${hue} 34% 88%)`} />
          <stop offset="100%" stopColor={`hsl(${hue} 30% 82%)`} />
        </linearGradient>
        <radialGradient id={`r${uid}`} cx="0.3" cy="0.2" r="0.9">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <pattern id={`d${uid}`} width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="1.4" cy="1.4" r="1.1" fill={`hsl(${hue} 30% 72%)`} opacity="0.28" />
        </pattern>
      </defs>
      <rect width="400" height="400" fill={`url(#g${uid})`} />
      <rect width="400" height="400" fill={`url(#d${uid})`} />
      <rect width="400" height="400" fill={`url(#r${uid})`} />
      <circle cx="322" cy="86" r="92" fill={`hsl(${hue} 55% 96%)`} opacity="0.55" />
      <circle cx="322" cy="86" r="60" fill={`hsl(${hue} 45% 90%)`} opacity="0.5" />
      <g transform={`translate(200 200) rotate(${rot}) translate(-200 -200) scale(1)`}>
        <g transform="translate(140 140) scale(5)" stroke={`hsl(${hue} 32% 44%)`} strokeWidth="0.85" fill="none"
           strokeLinecap="round" strokeLinejoin="round" opacity="0.92">
          <GlyphShape glyph={glyph} />
        </g>
      </g>
      {!compact && (
        <text x="26" y="376" fontSize="15" fill={`hsl(${hue} 30% 40%)`} fontFamily="Inter, sans-serif"
              letterSpacing="2.4" opacity="0.65" fontWeight="700">
          AFRIKART
        </text>
      )}
    </svg>
  )
}

function GlyphShape({ glyph }) {
  const p = {
    stroller: <><path d="M4 5h3l2.2 8.4A2.5 2.5 0 0 0 11.6 15h6.2" /><path d="M20 8a6 6 0 0 0-6-6v7h6z" /><circle cx="8" cy="19" r="1.7" /><circle cx="17" cy="19" r="1.7" /></>,
    sparkle: <><path d="M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.7l-1.6-5.5L5 10.6 10.4 9z" /><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></>,
    phone: <><rect x="6" y="2.5" width="12" height="19" rx="2.6" /><path d="M10.5 18.5h3" /></>,
    home: <><path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" /></>,
    basket: <><path d="M3 9h18l-1.6 10a2 2 0 0 1-2 1.7H6.6a2 2 0 0 1-2-1.7z" /><path d="m8 9 3-5M16 9l-3-5" /><path d="M9.5 13v4M14.5 13v4" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></>,
    shirt: <path d="M8 3 4 5.5 6 10l2-1v11h8V9l2 1 2-4.5L16 3l-2 2h-4z" />,
    wrench: <path d="M15 3a5 5 0 0 0-4.6 7L3 17.4 6.6 21l7.4-7.4A5 5 0 1 0 15 3z" />,
  }[glyph]
  return p || <><path d="M12 3 3 7.5v9L12 21l9-4.5v-9z" /><path d="m3 7.5 9 4.5 9-4.5" /></>
}

export function MiniMedia({ glyph, category, title, style }) {
  return (
    <div className="mini-media" style={{ overflow: 'hidden', ...style }}>
      <MediaTile glyph={glyph} category={category} title={title} compact />
    </div>
  )
}

/* ---------------------------------------------------------------- stars */
export function Stars({ value = 0, count, showValue = true, size = 13 }) {
  const full = Math.round(value)
  return (
    <span className="stars" title={`${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} viewBox="0 0 24 24" width={size} height={size}
             fill={i <= full ? 'currentColor' : 'none'}
             stroke="currentColor" strokeWidth="1.6"
             className={i <= full ? 'star-on' : 'star-off'}>
          <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.9-5.2 2.9 1-5.9L3.5 9.7l5.9-.8z" />
        </svg>
      ))}
      {showValue && value > 0 && <span style={{ marginLeft: 5, fontSize: 11.5, color: 'var(--muted)' }}>{value}</span>}
      {count != null && <span style={{ marginLeft: 5, fontSize: 11.5, color: 'var(--muted-2)' }}>({count})</span>}
    </span>
  )
}

/* ---------------------------------------------------------------- price */
export function Price({ value, list, size }) {
  const { int, dec } = priceParts(value)
  const cls = size === 'lg' ? 'price price-lg' : size === 'sm' ? 'price price-sm' : 'price'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', flexWrap: 'wrap' }}>
      <span className={cls}>
        <span className="price-sym">P</span>
        <span className="price-int">{int}</span>
        <span className="price-dec">.{dec}</span>
      </span>
      {list && list > value ? <span className="price-list">P{money(list)}</span> : null}
    </span>
  )
}

/* ---------------------------------------------------------------- product card */
export function ProductCard({ p }) {
  const { addToCart, toggleSaved, saved } = useStore()
  const off = discountPct(p.price, p.listPrice)
  const isSaved = saved.some((s) => s.id === p.id)
  return (
    <div className="card">
      <Link to={`/p/${p.id}`} className="card-media">
        {off > 0 && <span className="card-badge"><span className="deal-tag">-{off}%</span></span>}
        {p.express && (
          <span style={{ position: 'absolute', bottom: 9, left: 9, zIndex: 2 }} className="card-express">
            <Icon name="bolt" size={11} fill="currentColor" /> EXPRESS
          </span>
        )}
        <MediaTile glyph={p.glyph} category={p.category} title={p.title} />
      </Link>
      <div className="card-body">
        <span className="card-brand">{p.brand}</span>
        <Link to={`/p/${p.id}`} className="card-title">{p.title}</Link>
        <Stars value={p.rating} count={p.ratingCount} />
        <div className="card-foot">
          <div>
            <Price value={p.price} list={p.listPrice} />
            {p.stock > 0 && p.stock <= 12 && <div className="tiny" style={{ color: '#a06613' }}>Only {p.stock} left</div>}
            {p.stock === 0 && <div className="tiny" style={{ color: 'var(--red)' }}>Out of stock</div>}
          </div>
          <button
            className="btn btn-primary btn-sm"
            style={{ padding: '6px 9px', borderRadius: 999 }}
            title={isSaved ? 'Saved' : 'Save for later'}
            onClick={(e) => { e.preventDefault(); toggleSaved(p) }}
          >
            <Icon name="heart" size={14} fill={isSaved ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- small bits */
export function Section({ title, subtitle, link, linkLabel = 'See all', children }) {
  return (
    <section className="section">
      <div className="section-head">
        <div>
          <div className="section-title">{title}{subtitle && <small>{subtitle}</small>}</div>
        </div>
        {link && <Link className="section-link" to={link}>{linkLabel} →</Link>}
      </div>
      {children}
    </section>
  )
}

export function Empty({ title, children, action }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {children && <p style={{ maxWidth: 420, margin: '0 auto 16px' }}>{children}</p>}
      {action}
    </div>
  )
}

export function Spinner({ dark }) {
  return <span className={dark ? 'spinner dark' : 'spinner'} />
}

export function Kpi({ label, value, sub, accent }) {
  return (
    <div className={accent ? 'kpi kpi-accent' : 'kpi'}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  )
}

export function BarChart({ series, format = (v) => `P${Math.round(v)}` }) {
  const max = Math.max(1, ...series.map((s) => s.value))
  return (
    <div className="chart">
      {series.map((s) => (
        <div className="chart-col" key={s.day} title={`${s.day}: ${format(s.value)}`}>
          <div className="chart-bar" style={{ height: `${Math.max(2, (s.value / max) * 100)}%` }} />
          <span className="chart-label">{s.day}</span>
        </div>
      ))}
    </div>
  )
}

export function QtyBox({ value, onChange, max = 99 }) {
  return (
    <div className="qty">
      <button type="button" onClick={() => onChange(Math.max(1, value - 1))} aria-label="Decrease">−</button>
      <span>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} aria-label="Increase">+</button>
    </div>
  )
}
