import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, money, dateShort, discountPct } from '../lib/api'
import { useStore } from '../state'
import { Icon } from '../components/icons'
import { MediaTile, ProductCard, Price, QtyBox, Stars, Empty } from '../components/ui'

function ReviewForm({ productId, onDone }) {
  const { user, toast } = useStore()
  const [rating, setRating] = useState(5)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)

  if (!user) {
    return (
      <div className="panel-body" style={{ borderTop: '1px solid var(--line-2)' }}>
        <p className="muted" style={{ fontSize: 13 }}>
          <Link to="/signin" style={{ color: 'var(--navy-3)', fontWeight: 700 }}>Sign in</Link> to write a review.
          Only verified buyers get the “Verified purchase” badge.
        </p>
      </div>
    )
  }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      await api(`/products/${productId}/reviews`, { method: 'POST', body: { rating, title, body } })
      toast('Review published')
      setTitle(''); setBody(''); setRating(5)
      onDone()
    } catch (err) {
      toast(err.message, 'err')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel-body" onSubmit={submit} style={{ borderTop: '1px solid var(--line-2)' }}>
      <div style={{ fontWeight: 750, marginBottom: 10 }}>Write a review</div>
      <div className="row" style={{ gap: 6, marginBottom: 10 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button type="button" key={n} onClick={() => setRating(n)} style={{ border: 0, background: 'transparent', padding: 0 }}>
            <svg viewBox="0 0 24 24" width="22" height="22" fill={n <= rating ? 'currentColor' : 'none'}
                 stroke="currentColor" strokeWidth="1.5" style={{ color: n <= rating ? 'var(--saffron-2)' : '#cfd8e2' }}>
              <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.9-5.2 2.9 1-5.9L3.5 9.7l5.9-.8z" />
            </svg>
          </button>
        ))}
      </div>
      <div className="field">
        <input className="input" placeholder="Headline (optional)" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={70} />
      </div>
      <div className="field">
        <textarea className="textarea" placeholder="What was it like? Did it arrive on time? Was it what the listing promised?"
                  value={body} onChange={(e) => setBody(e.target.value)} maxLength={600} />
      </div>
      <button className="btn btn-dark" disabled={busy || body.trim().length < 10}>
        {busy ? 'Publishing…' : 'Publish review'}
      </button>
    </form>
  )
}

export default function Product() {
  const { id } = useParams()
  const nav = useNavigate()
  const { addToCart, toggleSaved, saved, user } = useStore()
  const [data, setData] = useState(null)
  const [qty, setQty] = useState(1)
  const [tab, setTab] = useState('desc')
  const [thumb, setThumb] = useState(0)

  const load = () => api(`/products/${id}`).then(setData).catch(() => setData(null))
  useEffect(() => { setData(null); setQty(1); setThumb(0); load(); window.scrollTo({ top: 0 }) }, [id])

  if (data === null) {
    return <div className="container" style={{ padding: 30 }}><div className="skeleton" style={{ height: 480, borderRadius: 10 }} /></div>
  }
  if (data === undefined || !data.product) {
    return <div className="container"><Empty title="We could not find that product" action={<Link className="btn btn-dark" to="/search">Back to shopping</Link>} /></div>
  }

  const p = data.product
  const off = discountPct(p.price, p.listPrice)
  const isSaved = saved.some((s) => s.id === p.id)

  const buyNow = () => { addToCart(p, qty, true); nav('/checkout') }

  return (
    <div className="container">
      <div className="breadcrumb">
        <Link to="/">Home</Link>
        <Icon name="chevronRight" size={12} />
        <Link to={`/search?category=${p.category}`}>{p.categoryName}</Link>
        <Icon name="chevronRight" size={12} />
        <span style={{ color: 'var(--ink)' }}>{p.brand}</span>
      </div>

      <div className="pdp">
        <div className="pdp-media">
          <div style={{ aspectRatio: '1 / 1', position: 'relative' }}>
            <MediaTile glyph={p.glyph} category={p.category} title={p.title} />
            {p.express && (
              <span className="card-express" style={{ position: 'absolute', top: 12, right: 12 }}>
                <Icon name="bolt" size={11} fill="currentColor" /> EXPRESS
              </span>
            )}
          </div>
          <div className="pdp-thumbs">
            {[0, 1, 2, 3].map((i) => (
              <button key={i} className={thumb === i ? 'pdp-thumb active' : 'pdp-thumb'} onClick={() => setThumb(i)} style={{ padding: 0, background: 'none' }}>
                <MediaTile glyph={i === 1 ? 'box' : p.glyph} category={p.category} title={p.title + i} compact />
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="pdp-brand">{p.brand}</div>
          <h1 className="pdp-title">{p.title}</h1>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
            <Stars value={p.rating} count={p.ratingCount} />
            <a href="#reviews" className="tiny" style={{ color: 'var(--navy-3)' }}>{data.reviewTotal} ratings</a>
            <span className="tiny muted">·</span>
            <span className="tiny muted">{p.sold} sold</span>
          </div>

          <div className="pdp-divider" />

          <div className="row" style={{ gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {off > 0 && <span className="deal-tag" style={{ fontSize: 12, padding: '4px 8px' }}>-{off}% deal</span>}
            <Price value={p.price} list={p.listPrice} size="lg" />
          </div>
          <p className="tiny muted" style={{ marginTop: 6 }}>
            Price includes 14% VAT · Free delivery on orders over P400
          </p>

          <div className="pdp-divider" />

          <ul className="bullets">
            {(p.bullets || []).map((b, i) => <li key={i}>{b}</li>)}
          </ul>

          <div className="pdp-divider" />

          <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--line)', marginBottom: 14 }}>
            {[['desc', 'Description'], ['spec', 'Details'], ['reviews', `Reviews (${data.reviewTotal})`]].map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                border: 0, background: 'none', padding: '9px 14px', fontSize: 13, fontWeight: 700,
                color: tab === k ? 'var(--ink)' : 'var(--muted)',
                borderBottom: tab === k ? '2px solid var(--saffron-2)' : '2px solid transparent', marginBottom: -1,
              }}>{l}</button>
            ))}
          </div>

          {tab === 'desc' && (
            <>
              <p className="pdp-desc">{p.description}</p>
              {p.tags?.length > 0 && (
                <div className="row wrap" style={{ gap: 6, marginTop: 14 }}>
                  {p.tags.map((t) => (
                    <Link key={t} to={`/search?q=${encodeURIComponent(t)}`} className="badge badge-grey">#{t}</Link>
                  ))}
                </div>
              )}
            </>
          )}

          {tab === 'spec' && (
            <table className="spec-table">
              <tbody>
                <tr><td>Brand</td><td>{p.brand}</td></tr>
                <tr><td>Department</td><td>{p.categoryName}</td></tr>
                <tr><td>Sold by</td><td>{p.seller?.name}</td></tr>
                <tr><td>Fulfilled by</td><td>{p.seller?.fulfilment}</td></tr>
                <tr><td>Available from</td><td>{p.seller?.city}</td></tr>
                <tr><td>Delivery</td><td>{p.express ? 'Afrikart Express — next day in Gaborone' : 'Standard courier — 2 to 5 working days'}</td></tr>
                <tr><td>Returns</td><td>7 days, collected from your door</td></tr>
                <tr><td>Stock status</td><td>{data.stockLine}</td></tr>
                <tr><td>Listed</td><td>{dateShort(p.createdAt)}</td></tr>
              </tbody>
            </table>
          )}

          {tab === 'reviews' && (
            <div id="reviews">
              <div className="review-summary">
                <div>
                  <div className="row" style={{ gap: 8 }}>
                    <span style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-.04em' }}>{p.rating || '—'}</span>
                    <div>
                      <Stars value={p.rating} showValue={false} />
                      <div className="tiny muted">{data.reviewTotal} global ratings</div>
                    </div>
                  </div>
                </div>
                <div>
                  {data.distribution.map((d) => (
                    <div className="dist-row" key={d.star}>
                      <span style={{ width: 34, fontSize: 11.5 }}>{d.star} star</span>
                      <span className="dist-bar">
                        <span className="dist-fill" style={{ width: `${data.reviewTotal ? (d.count / data.reviewTotal) * 100 : 0}%` }} />
                      </span>
                      <span style={{ width: 26, textAlign: 'right', color: 'var(--muted-2)' }}>{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt16">
                {data.reviews.map((r) => (
                  <div className="review" key={r.id}>
                    <div className="review-head">
                      <Stars value={r.rating} showValue={false} />
                      <span className="review-title">{r.title}</span>
                    </div>
                    <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                      <span className="tiny" style={{ fontWeight: 700 }}>{r.author}</span>
                      {r.verified && <span className="verified">✓ Verified purchase</span>}
                    </div>
                    <p className="review-body">{r.body}</p>
                    <div className="review-meta">{dateShort(r.date)} · {r.helpful} found this helpful</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="pdp-buy">
          <div className="buybox">
            <Price value={p.price} size="lg" />
            {p.listPrice && <div className="tiny muted">List price <s>P{money(p.listPrice)}</s></div>}
            <div className="mt12">
              <span className={`stock-line ${p.stock === 0 ? 'out' : p.stock <= 12 ? 'low' : ''}`}>{data.stockLine}</span>
            </div>

            <div className="mt16 stack">
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="tiny muted">Quantity</span>
                <QtyBox value={qty} onChange={setQty} max={Math.max(1, p.stock)} />
              </div>
              <button className="btn btn-primary btn-block" disabled={p.stock === 0} onClick={() => addToCart(p, qty)}>
                <Icon name="cart" size={15} /> Add to cart
              </button>
              <button className="btn btn-dark btn-block" disabled={p.stock === 0} onClick={buyNow}>
                Buy now
              </button>
              <button className="btn btn-ghost btn-block" onClick={() => toggleSaved(p)}>
                <Icon name="heart" size={14} fill={isSaved ? 'currentColor' : 'none'} /> {isSaved ? 'Saved' : 'Save for later'}
              </button>
            </div>

            <div className="mt16" style={{ fontSize: 12.5 }}>
              <div className="buybox-row"><span>Delivery</span><b>{p.express ? 'Tomorrow' : '2–5 days'}</b></div>
              <div className="buybox-row"><span>Free over</span><b>P400</b></div>
              <div className="buybox-row"><span>Returns</span><b>7 days, collected</b></div>
            </div>

            <div className="seller-box">
              <div className="row-between">
                <div>
                  <div className="tiny muted">Sold by</div>
                  <b>{p.seller?.name}</b>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Stars value={p.seller?.rating} showValue={false} size={12} />
                  <div className="tiny muted">{p.seller?.city}</div>
                </div>
              </div>
              <div className="tiny muted mt8">
                {data.sellerCatalogue} listings · {p.seller?.fulfilment}
                {p.seller?.since ? ` · trading since ${p.seller.since}` : ''}
              </div>
            </div>

            {!user && (
              <div className="tiny muted mt12" style={{ borderTop: '1px solid var(--line-2)', paddingTop: 10 }}>
                <Link to="/signin" style={{ color: 'var(--navy-3)', fontWeight: 700 }}>Sign in</Link> to see your saved addresses.
              </div>
            )}
          </div>
        </div>
      </div>

      {data.alsoBought.length > 0 && (
        <section className="section">
          <div className="section-head"><div className="section-title">Customers who bought this also bought</div></div>
          <div className="grid-products">
            {data.alsoBought.map((x) => <ProductCard key={x.id} p={x} />)}
          </div>
        </section>
      )}

      <section className="section">
        <div className="panel">
          <div className="panel-head"><h3>Customer reviews</h3><span className="tiny muted">Only buyers can mark a review verified</span></div>
          <ReviewForm productId={p.id} onDone={load} />
        </div>
      </section>

      {data.related.length > 0 && (
        <section className="section">
          <div className="section-head"><div className="section-title">More in {p.categoryName}</div></div>
          <div className="grid-products">
            {data.related.map((x) => <ProductCard key={x.id} p={x} />)}
          </div>
        </section>
      )}
    </div>
  )
}
