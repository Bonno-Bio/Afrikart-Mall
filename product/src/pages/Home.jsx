import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, money0 } from '../lib/api'
import { useStore } from '../state'
import { Icon } from '../components/icons'
import { MediaTile, ProductCard, Section, Stars, Price, MiniMedia } from '../components/ui'

function Hero({ home }) {
  const { city } = useStore()
  const feature = home.deals?.[0]
  return (
    <div className="hero">
      <div className="hero-grid">
        <div className="hero-main">
          <div className="hero-badge">
            <span style={{ color: '#43d39e' }}>●</span> Delivering to {city} tomorrow
          </div>
          <div className="hero-content">
            <div className="eyebrow">Afrikart Express</div>
            <h1>Order today.<br />It&apos;s at your door tomorrow.</h1>
            <p>
              {home.stats.products} products from {home.stats.sellers} verified Botswana sellers —
              delivered by our own riders, free over P400, with returns collected from your door.
            </p>
            <div className="hero-cta">
              <Link to="/search" className="btn btn-primary">Start shopping</Link>
              <Link to="/search?deal=1" className="btn btn-ghost">Today&apos;s deals</Link>
            </div>
          </div>
          {feature && (
            <Link to={`/p/${feature.id}`} style={{
              position: 'absolute', right: 26, bottom: 26, width: 150, height: 150, borderRadius: 12,
              overflow: 'hidden', border: '2px solid rgba(255,255,255,.25)', zIndex: 3,
            }}>
              <MediaTile glyph={feature.glyph} category={feature.category} title={feature.title} compact />
            </Link>
          )}
        </div>

        <div className="hero-side">
          <Link to="/search?deal=1" className="hero-card">
            <MiniMedia glyph="tag" category="home-kitchen" title="deals" />
            <div>
              <h4>Deals of the day</h4>
              <span>Up to 30% off, while stock lasts</span>
            </div>
          </Link>
          <Link to="/search?express=1" className="hero-card">
            <MiniMedia glyph="bolt" category="phones-tech" title="express" />
            <div>
              <h4>Afrikart Express</h4>
              <span>Next-day in Gaborone, tracked</span>
            </div>
          </Link>
          <Link to="/search?category=solar-power" className="hero-card">
            <MiniMedia glyph="sun" category="solar-power" title="solar" />
            <div>
              <h4>Solar &amp; power</h4>
              <span>Inverters, panels, batteries in stock</span>
            </div>
          </Link>
          <Link to="/seller" className="hero-card">
            <MiniMedia glyph="building" category="groceries" title="seller" />
            <div>
              <h4>Sell on Afrikart</h4>
              <span>Reach customers in all 10 districts</span>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}

const PROMISES = [
  { icon: 'truck', t: 'Next-day delivery', s: 'Gaborone, Tlokweng & Mogoditshane' },
  { icon: 'return', t: 'Returns from your door', s: 'Rider collects within 48 hours' },
  { icon: 'shield', t: 'Verified sellers only', s: 'Every merchant checked before listing' },
  { icon: 'pin', t: '16 pickup points', s: 'Collect for P10, anywhere we deliver' },
]

export default function Home() {
  const { user } = useStore()
  const [home, setHome] = useState(null)

  useEffect(() => {
    api('/home').then(setHome).catch(() => {})
  }, [user])

  if (!home) {
    return (
      <div className="container" style={{ padding: '30px 0 60px' }}>
        <div className="skeleton" style={{ height: 380, borderRadius: 10 }} />
        <div className="grid-products mt24">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 280, borderRadius: 10 }} />)}
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <Hero home={home} />

      <div className="promises">
        {PROMISES.map((p) => (
          <div className="promise" key={p.t}>
            <span className="promise-ico"><Icon name={p.icon} size={17} /></span>
            <div>
              <b>{p.t}</b>
              <span>{p.s}</span>
            </div>
          </div>
        ))}
      </div>

      <Section title="Today's deals" subtitle="Ends midnight" link="/search?deal=1">
        <div className="grid-products">
          {home.deals.slice(0, 4).map((p) => <ProductCard key={p.id} p={p} />)}
        </div>
      </Section>

      {home.buyAgain.length > 0 && (
        <Section title="Buy it again" subtitle="Based on your orders" link="/account#orders" linkLabel="Your orders">
          <div className="grid-products">
            {home.buyAgain.slice(0, 4).map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        </Section>
      )}

      {home.rails.filter((r) => r.products.length > 0).map((rail) => (
        <Section key={rail.category.slug} title={rail.category.name} subtitle={rail.category.blurb}
                 link={`/search?category=${rail.category.slug}`}>
          <div className="grid-products">
            {rail.products.map((p) => <ProductCard key={p.id} p={p} />)}
          </div>
        </Section>
      ))}

      <Section title="Best sellers this month" subtitle="Ranked by units sold" link="/search?sort=popular">
        <div className="rail-scroll">
          {home.bestSellers.map((p) => (
            <div key={p.id} style={{ minWidth: 0 }}>
              <ProductCard p={p} />
            </div>
          ))}
        </div>
      </Section>

      <section className="section">
        <div style={{
          display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, background: 'linear-gradient(120deg,#0b2138,#164066 70%,#1d5a86)',
          borderRadius: 12, overflow: 'hidden', color: '#fff',
        }}>
          <div style={{ padding: '34px 34px' }}>
            <div className="eyebrow" style={{ color: '#ffcf8a' }}>For sellers</div>
            <h2 style={{ fontSize: 27, marginBottom: 10, letterSpacing: '-.03em' }}>
              Your shop, without the shop.
            </h2>
            <p style={{ color: '#b9ccdd', fontSize: 14, maxWidth: '48ch', marginBottom: 20 }}>
              List on Afrikart and we handle payment, delivery, returns and customer support.
              Store your stock in our Gaborone fulfilment centre and every order is picked, packed
              and delivered by us — you just watch the sales come in.
            </p>
            <div className="row wrap">
              <Link to="/seller" className="btn btn-primary">Open a seller account</Link>
              <Link to="/help" className="btn btn-ghost" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.28)' }}>
                See the fee schedule
              </Link>
            </div>
          </div>
          <div style={{ background: 'rgba(255,255,255,.06)', padding: 24, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
            {[
              ['12%', 'commission on item value'],
              ['+6%', 'only if we store, pack and deliver it'],
              ['P0', 'to list. No monthly subscription.'],
            ].map(([n, l]) => (
              <div key={l} className="row" style={{ gap: 14 }}>
                <b style={{ fontSize: 22, color: '#ffcf8a', minWidth: 62, letterSpacing: '-.03em' }}>{n}</b>
                <span style={{ fontSize: 13.5, color: '#cfe0ee' }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}
