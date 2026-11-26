import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, money, dateShort, statusLabel, statusTone } from '../lib/api'
import { useStore } from '../state'
import { Icon } from '../components/icons'
import { Kpi, BarChart, Empty, MediaTile, Price } from '../components/ui'

/* ------------------------------------------------------------------ landing */
function SellerLanding() {
  return (
    <div className="container">
      <div style={{ background: 'linear-gradient(120deg,#0b2138,#164066 65%,#1d5a86)', borderRadius: 14, padding: '44px 40px', color: '#fff', marginTop: 20 }}>
        <div className="eyebrow" style={{ color: '#ffcf8a' }}>Seller Central</div>
        <h1 style={{ fontSize: 'clamp(26px,3vw,38px)', maxWidth: '20ch', marginBottom: 12 }}>
          Your shop, without the shop.
        </h1>
        <p style={{ color: '#b9ccdd', maxWidth: '62ch', fontSize: 14.5, marginBottom: 22 }}>
          List your products on Afrikart and reach customers in every district without opening a branch.
          We take the payment, hand it to our own riders, handle the returns and pay you out weekly.
          Store your stock in our Gaborone fulfilment centre and you do not even need a warehouse.
        </p>
        <div className="row wrap">
          <Link to="/signin?next=/seller" className="btn btn-primary">Sign in as a seller</Link>
          <Link to="/help" className="btn btn-ghost" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.3)' }}>How selling works</Link>
        </div>
      </div>

      <div className="kpi-grid mt24" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <Kpi label="To list" value="P0" sub="no setup fee, no monthly fee" accent />
        <Kpi label="Commission" value="12%" sub="of item value, only when it sells" />
        <Kpi label="Fulfilment" value="+6%" sub="optional — we store, pack and deliver" />
        <Kpi label="Payout" value="Weekly" sub="after delivery, every Monday" />
      </div>

      <div className="grid-products mt16" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
        {[
          ['1', 'Apply and get verified', 'Company registration, tax number and a bank account. We check every seller before a single listing goes live — that is the whole reason customers trust the platform.'],
          ['2', 'List your catalogue', 'Photograph it once. Bulk upload from a spreadsheet. We show you search demand in your category so you list what people actually order.'],
          ['3', 'We deliver, you get paid', 'An order comes in, we pick and pack it, a rider delivers it, and the money lands in your account the following Monday minus commission.'],
        ].map(([n, t, d]) => (
          <div className="panel" key={t}>
            <div className="panel-body">
              <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--saffron-soft)', color: '#a9691a', display: 'grid', placeItems: 'center', fontWeight: 800, marginBottom: 12 }}>{n}</div>
              <b style={{ fontSize: 14.5 }}>{t}</b>
              <p className="muted" style={{ fontSize: 13, marginTop: 6, lineHeight: 1.6 }}>{d}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="panel mt16">
        <div className="panel-head"><h3>What other Botswana sellers ask us first</h3></div>
        <div className="panel-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}>
          {[
            ['Do I need a warehouse?', 'No. Afrikart Fulfilment stores your stock in Gaborone. You ship us one consignment and we handle every order after that.'],
            ['When do I get paid?', 'Every Monday for orders delivered the week before. The dashboard shows your exact payout, the commission deducted and the delivery cost.'],
            ['Can I set my own prices?', 'Yes, within the category price band. We flag listings that are priced above the market so customers do not lose trust in your page.'],
            ['What if a customer returns it?', 'We collect it, inspect it and return it to your stock. The commission is reversed; the delivery cost is shared.'],
          ].map(([q, a]) => (
            <div key={q}>
              <b style={{ fontSize: 13.5 }}>{q}</b>
              <p className="muted" style={{ fontSize: 13, marginTop: 4, lineHeight: 1.6 }}>{a}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ dashboard */
function Dashboard({ data, onFulfil }) {
  return (
    <>
      <div className="kpi-grid">
        <Kpi label="Gross sales" value={`P${money(data.kpis.gmv)}`} sub={`${data.kpis.orders} orders`} accent />
        <Kpi label="Your payout" value={`P${money(data.kpis.payout)}`} sub={`after P${money(data.kpis.platformFees)} fees`} />
        <Kpi label="Average order" value={`P${money(data.kpis.aov)}`} sub={`${data.kpis.units} units sold`} />
        <Kpi label="Conversion" value={`${data.kpis.conversion}%`} sub={`${data.kpis.liveListings} live listings`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
        <div className="panel">
          <div className="panel-head"><h3>Sales, last 14 days</h3><span className="tiny muted">item value, before fees</span></div>
          <div className="panel-body"><BarChart series={data.series} /></div>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Waiting to ship</h3><span className="badge badge-amber">{data.kpis.pendingCount}</span></div>
          <div className="panel-body" style={{ paddingTop: 6 }}>
            {data.pendingOrders.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Nothing waiting. Every order is packed.</p>}
            {data.pendingOrders.map((o) => (
              <div key={o.id} className="row-between" style={{ padding: '9px 0', borderBottom: '1px solid var(--line-2)' }}>
                <div>
                  <b style={{ fontSize: 12.5 }}>{o.id}</b>
                  <div className="tiny muted">{o.items.length} lines · P{money(o.subtotal)}</div>
                </div>
                <button className="btn btn-dark btn-sm" onClick={() => onFulfil(o.id)}>Mark shipped</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16, marginTop: 16 }}>
        <div className="panel">
          <div className="panel-head"><h3>Best sellers</h3></div>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Product</th><th className="num">Sold</th><th className="num">Stock</th><th className="num">Revenue</th></tr></thead>
              <tbody>
                {data.top.map((p) => (
                  <tr key={p.id}>
                    <td style={{ maxWidth: 260 }}><Link to={`/p/${p.id}`} style={{ fontWeight: 600 }}>{p.title.slice(0, 52)}{p.title.length > 52 ? '…' : ''}</Link></td>
                    <td className="num">{p.sold}</td>
                    <td className="num">{p.stock}</td>
                    <td className="num">P{money(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head"><h3>Stock alerts</h3></div>
          <div className="panel-body" style={{ paddingTop: 6 }}>
            {data.lowStock.length === 0 && <p className="muted" style={{ fontSize: 13 }}>All listings have healthy stock.</p>}
            {data.lowStock.map((p) => (
              <div key={p.id} className="row-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line-2)' }}>
                <span style={{ fontSize: 12.5, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
                <span className={`badge ${p.stock === 0 ? 'badge-red' : 'badge-amber'}`}>{p.stock === 0 ? 'Out' : `${p.stock} left`}</span>
              </div>
            ))}
            <div className="divider" />
            <div className="tiny muted" style={{ lineHeight: 1.6 }}>
              A stockout costs you the sale and costs Afrikart the search ranking. Restock before you drop below 12 units.
            </div>
          </div>
        </div>
      </div>

      <div className="panel mt16">
        <div className="panel-head"><h3>Recent orders</h3></div>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Order</th><th>Items</th><th>Placed</th><th>Status</th><th className="num">Your value</th></tr></thead>
            <tbody>
              {data.recentOrders.map((o) => (
                <tr key={o.id}>
                  <td><b style={{ fontSize: 12.5 }}>{o.id}</b></td>
                  <td style={{ maxWidth: 300 }}>{o.items.map((i) => `${i.qty}× ${i.title.slice(0, 30)}`).join(', ')}</td>
                  <td className="tiny muted">{dateShort(o.placedAt)}</td>
                  <td><span className={`badge badge-${statusTone(o.status)}`}>{statusLabel(o.status)}</span></td>
                  <td className="num">P{money(o.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ listings */
function Listings({ products, reload, toast }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', price: '', stock: '', category: 'baby-mother', description: '', bullets: '' })
  const [edit, setEdit] = useState({})

  const save = async (id) => {
    const patch = edit[id]
    if (!patch) return
    try {
      await api(`/seller/products/${id}`, { method: 'PATCH', body: patch })
      toast('Listing updated')
      setEdit({ ...edit, [id]: undefined })
      reload()
    } catch (e) { toast(e.message) }
  }

  const create = async (e) => {
    e.preventDefault()
    try {
      await api('/seller/products', {
        method: 'POST',
        body: {
          ...form,
          bullets: form.bullets.split('\n').filter(Boolean),
        },
      })
      toast('Listing published')
      setAdding(false)
      setForm({ title: '', price: '', stock: '', category: 'baby-mother', description: '', bullets: '' })
      reload()
    } catch (err) { toast(err.message) }
  }

  const del = async (id) => {
    try {
      await api(`/seller/products/${id}`, { method: 'DELETE' })
      toast('Listing removed')
      reload()
    } catch (e) { toast(e.message) }
  }

  return (
    <>
      <div className="row-between" style={{ marginBottom: 14 }}>
        <div className="section-title">Listings <small style={{ fontWeight: 500, fontSize: 12.5, color: 'var(--muted)' }}>{products.length} SKUs</small></div>
        <button className="btn btn-primary" onClick={() => setAdding(!adding)}><Icon name="plus" size={14} /> Add product</button>
      </div>

      {adding && (
        <form className="panel" onSubmit={create} style={{ marginBottom: 16 }}>
          <div className="panel-head"><h3>New listing</h3></div>
          <div className="panel-body">
            <div className="field"><span className="label">Product title</span>
              <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Brazilian Body Wave Bundle, 20 inch" required />
            </div>
            <div className="field-row">
              <div className="field"><span className="label">Price (P)</span>
                <input className="input" type="number" min="1" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />
              </div>
              <div className="field"><span className="label">Stock on hand</span>
                <input className="input" type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
              </div>
            </div>
            <div className="field"><span className="label">Department</span>
              <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="baby-mother">Baby &amp; Mother</option>
                <option value="hair-beauty">Hair &amp; Beauty</option>
                <option value="phones-tech">Phones &amp; Tech</option>
                <option value="home-kitchen">Home &amp; Kitchen</option>
                <option value="groceries">Groceries &amp; Household</option>
                <option value="solar-power">Solar &amp; Power</option>
                <option value="fashion">Fashion &amp; Shoes</option>
                <option value="diy-auto">DIY &amp; Auto</option>
              </select>
            </div>
            <div className="field"><span className="label">Description</span>
              <textarea className="textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What it is, who it suits, what is in the box." />
            </div>
            <div className="field"><span className="label">Bullet points (one per line)</span>
              <textarea className="textarea" value={form.bullets} onChange={(e) => setForm({ ...form, bullets: e.target.value })} placeholder={'100% virgin hair\nTangle free for 12 months\nColour safe'} />
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-primary">Publish listing</button>
              <button type="button" className="btn btn-ghost" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </div>
        </form>
      )}

      <div className="panel">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>Product</th><th className="num">Price</th><th className="num">Stock</th><th className="num">Views</th><th className="num">Sold</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <div style={{ width: 38, height: 38, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--line)', flexShrink: 0 }}>
                        <MediaTile glyph={p.glyph} category={p.category} title={p.title} compact />
                      </div>
                      <Link to={`/p/${p.id}`} style={{ fontSize: 12.5, fontWeight: 600, maxWidth: 280 }}>{p.title}</Link>
                    </div>
                  </td>
                  <td className="num">
                    <input className="input" style={{ width: 90, padding: '6px 8px', textAlign: 'right' }}
                           defaultValue={p.price}
                           onChange={(e) => setEdit({ ...edit, [p.id]: { ...(edit[p.id] || {}), price: Number(e.target.value) } })}
                           onBlur={() => save(p.id)} />
                  </td>
                  <td className="num">
                    <input className="input" style={{ width: 74, padding: '6px 8px', textAlign: 'right' }}
                           defaultValue={p.stock}
                           onChange={(e) => setEdit({ ...edit, [p.id]: { ...(edit[p.id] || {}), stock: Number(e.target.value) } })}
                           onBlur={() => save(p.id)} />
                  </td>
                  <td className="num muted">{p.views}</td>
                  <td className="num">{p.sold}</td>
                  <td><span className={`badge ${p.status === 'live' ? 'badge-green' : 'badge-grey'}`}>{p.status}</span></td>
                  <td><button className="btn-quiet" onClick={() => del(p.id)} title="Remove listing"><Icon name="x" size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="tiny muted mt12">Edit a price or stock figure and click away — it saves immediately.</p>
    </>
  )
}

/* ------------------------------------------------------------------ main */
export default function Seller() {
  const { user, toast } = useStore()
  const [tab, setTab] = useState('dashboard')
  const [data, setData] = useState(null)
  const [products, setProducts] = useState([])

  const loadSummary = () => api('/seller/summary').then(setData).catch(() => setData(false))
  const loadProducts = () => api('/seller/products').then((d) => setProducts(d.products)).catch(() => {})

  useEffect(() => {
    if (user && ['seller', 'admin'].includes(user.role)) { loadSummary(); loadProducts() }
  }, [user])

  if (!user || !['seller', 'admin'].includes(user.role)) return <SellerLanding />

  const fulfil = async (id) => {
    try { await api(`/seller/orders/${id}/fulfil`, { method: 'POST' }); toast('Marked as shipped'); loadSummary() }
    catch (e) { toast(e.message) }
  }

  const TABS = [['dashboard', 'Dashboard', 'chart'], ['listings', 'Listings', 'box'], ['payouts', 'Payouts', 'credit'], ['growth', 'Growth', 'trending']]

  return (
    <div className="container">
      <div className="dash-layout">
        <nav className="dash-nav">
          <div className="dash-nav-title">{data?.seller?.name || 'Seller Central'}</div>
          {TABS.map(([k, l, ico]) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}><Icon name={ico} size={15} /> {l}</button>
          ))}
          <div className="dash-nav-title">Platform</div>
          <Link to="/search"><Icon name="grid" size={15} /> Browse marketplace</Link>
          <Link to="/account"><Icon name="user" size={15} /> Your account</Link>
        </nav>

        <div>
          {!data && <div className="skeleton" style={{ height: 200, borderRadius: 10 }} />}
          {data === false && <div className="panel"><Empty title="Seller dashboard unavailable">This account is not linked to a seller profile.</Empty></div>}

          {data && tab === 'dashboard' && (
            <>
              <div className="row-between" style={{ marginBottom: 14 }}>
                <div>
                  <h2 style={{ fontSize: 21 }}>{data.seller.name}</h2>
                  <div className="tiny muted">{data.seller.city} · {data.seller.fulfilment} · trading since {data.seller.since}</div>
                </div>
                <span className="badge badge-green">Verified seller</span>
              </div>
              <Dashboard data={data} onFulfil={fulfil} />
            </>
          )}

          {data && tab === 'listings' && <Listings products={products} reload={loadProducts} toast={toast} />}

          {data && tab === 'payouts' && (
            <>
              <div className="kpi-grid">
                <Kpi label="Gross sales" value={`P${money(data.kpis.gmv)}`} accent />
                <Kpi label="Commission (12%)" value={`-P${money(data.kpis.gmv * 0.12)}`} sub="only on items that sold" />
                <Kpi label="Fulfilment fee" value={`-P${money(data.kpis.platformFees - data.kpis.gmv * 0.12)}`} sub={data.feeSchedule.fulfilmentRate ? '6% — we store, pack, deliver' : 'not on this account'} />
                <Kpi label="Net payout" value={`P${money(data.kpis.payout)}`} sub="paid every Monday" />
              </div>

              <div className="panel">
                <div className="panel-head"><h3>Payout statement</h3><span className="tiny muted">Next payout: Monday</span></div>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Order</th><th>Placed</th><th>Status</th><th className="num">Item value</th><th className="num">Fee</th><th className="num">Net</th></tr></thead>
                    <tbody>
                      {data.recentOrders.map((o) => {
                        const fee = o.value * (data.feeSchedule.commissionRate + data.feeSchedule.fulfilmentRate)
                        const settled = o.status === 'delivered'
                        return (
                          <tr key={o.id}>
                            <td><b style={{ fontSize: 12.5 }}>{o.id}</b></td>
                            <td className="tiny muted">{dateShort(o.placedAt)}</td>
                            <td><span className={`badge badge-${statusTone(o.status)}`}>{statusLabel(o.status)}</span></td>
                            <td className="num">P{money(o.value)}</td>
                            <td className="num" style={{ color: 'var(--red)' }}>-P{money(fee)}</td>
                            <td className="num"><b>{settled ? `P${money(o.value - fee)}` : 'Pending'}</b></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel mt16">
                <div className="panel-body" style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.7 }}>
                  <b style={{ color: 'var(--ink)' }}>How the fee works.</b> {data.feeSchedule.note} Fees are only charged on
                  items that were actually delivered — a cancelled or returned order reverses the commission automatically.
                  Delivery is charged to the customer separately, and Afrikart absorbs the shortfall when a basket is under P400.
                </div>
              </div>
            </>
          )}

          {data && tab === 'growth' && (
            <>
              <div className="section-head"><div className="section-title">Growth tools</div></div>
              <div className="grid-products" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
                {[
                  ['Sponsored products', 'Put your listing at the top of search for a category. Cost per click, capped daily budget. Available once you have 10+ delivered orders.', 'Live in pilot'],
                  ['Deal of the day', 'Afrikart features one seller per day on the homepage. You fund a discount; we fund the traffic.', 'Apply'],
                  ['Bundle builder', 'Bundle your slow movers with your best seller. Bundles lift average basket by 34% on this platform.', 'Configure'],
                  ['Bulk upload', 'Upload your whole catalogue from a spreadsheet instead of one listing at a time.', 'Upload CSV'],
                  ['Fulfilment upgrade', 'Move your stock into our Gaborone centre. Badge on every listing, and we handle packing and returns.', 'Request'],
                  ['Performance report', 'Conversion by listing, search terms that found you, and where customers dropped off.', 'Download'],
                ].map(([t, d, cta]) => (
                  <div className="panel" key={t}>
                    <div className="panel-body">
                      <b style={{ fontSize: 14 }}>{t}</b>
                      <p className="muted" style={{ fontSize: 12.5, margin: '6px 0 12px', lineHeight: 1.6 }}>{d}</p>
                      <button className="btn btn-ghost btn-sm" onClick={() => toast(t + ' — coming in the next release')}>{cta}</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
