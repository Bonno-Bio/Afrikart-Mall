import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useStore } from '../state'
import { api, money, dateShort, statusLabel, statusTone } from '../lib/api'
import { Icon } from '../components/icons'
import { MediaTile, Price, Empty } from '../components/ui'

function OrderRow({ o }) {
  return (
    <div className="order-card">
      <div className="order-head">
        <div><span>Order placed</span><b>{dateShort(o.placedAt)}</b></div>
        <div><span>Total</span><b>P{money(o.total)}</b></div>
        <div><span>Order</span><b>{o.id}</b></div>
        <div style={{ marginLeft: 'auto' }}><span className={`badge badge-${statusTone(o.status)}`}>{statusLabel(o.status)}</span></div>
      </div>
      <div className="order-body">
        <div className="order-thumbs">
          {o.items.slice(0, 4).map((i) => {
            const p = null
            return (
              <div className="order-thumb" key={i.productId}>
                <MediaTile glyph="box" category={o.category || ''} title={i.title} compact />
              </div>
            )
          })}
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>
            {o.items[0]?.title}
            {o.items.length > 1 ? ` + ${o.items.length - 1} more` : ''}
          </div>
          <div className="tiny muted">
            {o.items.reduce((a, i) => a + i.qty, 0)} items · {o.deliveryMethod || 'Afrikart Express'} · {o.paymentMethod}
          </div>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Link to={`/order/${o.id}`} className="btn btn-ghost btn-sm">Track / details</Link>
          <Link to={`/search?q=${encodeURIComponent(o.items[0]?.title?.split(' ').slice(0, 2).join(' ') || '')}`} className="btn btn-primary btn-sm">Buy again</Link>
        </div>
      </div>
    </div>
  )
}

export default function Account() {
  const { user, saved, toggleSaved, addToCart, toast } = useStore()
  const { hash } = useLocation()
  const [tab, setTab] = useState(hash === '#orders' ? 'orders' : 'overview')
  const [orders, setOrders] = useState(null)
  const [addrForm, setAddrForm] = useState({ line1: '', line2: '', city: 'Gaborone', phone: '', label: 'Home' })

  useEffect(() => {
    if (hash === '#orders') setTab('orders')
  }, [hash])

  useEffect(() => {
    if (!user) return
    api('/orders').then((d) => setOrders(d.orders)).catch(() => setOrders([]))
  }, [user])

  if (!user) {
    return (
      <div className="container">
        <div className="panel mt24" style={{ padding: 44, textAlign: 'center' }}>
          <h2 style={{ marginBottom: 8 }}>Sign in to see your account</h2>
          <p className="muted" style={{ marginBottom: 18 }}>Your orders, addresses and returns live here.</p>
          <Link to="/signin?next=/account" className="btn btn-primary">Sign in</Link>
        </div>
      </div>
    )
  }

  const addAddress = async (e) => {
    e.preventDefault()
    try {
      const d = await api('/account/addresses', { method: 'POST', body: addrForm })
      toast('Address saved')
      setAddrForm({ line1: '', line2: '', city: 'Gaborone', phone: '', label: 'Home' })
      window.location.reload()
    } catch (err) { toast(err.message) }
  }

  const TABS = [
    ['overview', 'Overview', 'user'],
    ['orders', 'Your orders', 'package'],
    ['saved', 'Your list', 'heart'],
    ['addresses', 'Addresses', 'pin'],
    ['seller', 'Seller tools', 'building'],
    ['admin', 'Platform admin', 'settings'],
  ].filter(([k]) => (k === 'seller' ? ['seller', 'admin'].includes(user.role) : k === 'admin' ? user.role === 'admin' : true))

  return (
    <div className="container">
      <div className="dash-layout">
        <nav className="dash-nav">
          <div className="dash-nav-title">Your account</div>
          {TABS.map(([k, l, ico]) => (
            k === 'seller'
              ? <Link key={k} to="/seller"><Icon name={ico} size={15} /> {l}</Link>
              : k === 'admin'
                ? <Link key={k} to="/admin"><Icon name={ico} size={15} /> {l}</Link>
                : <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}><Icon name={ico} size={15} /> {l}</button>
          ))}
        </nav>

        <div>
          {tab === 'overview' && (
            <>
              <div className="panel">
                <div className="panel-body">
                  <div className="row-between wrap" style={{ gap: 16 }}>
                    <div className="row" style={{ gap: 14 }}>
                      <div style={{ width: 54, height: 54, borderRadius: '50%', background: 'var(--navy-2)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 20, fontWeight: 800 }}>
                        {user.name.charAt(0)}
                      </div>
                      <div>
                        <h2 style={{ fontSize: 20 }}>Hello, {user.name.split(' ')[0]}</h2>
                        <div className="tiny muted">{user.email} · {user.role} · member since {dateShort(user.joined)}</div>
                      </div>
                    </div>
                    <Link to="/search" className="btn btn-primary">Shop deals</Link>
                  </div>
                </div>
              </div>

              <div className="kpi-grid mt16">
                <div className="kpi"><div className="kpi-label">Orders</div><div className="kpi-value">{orders?.length ?? '—'}</div><div className="kpi-sub">all time</div></div>
                <div className="kpi"><div className="kpi-label">In progress</div><div className="kpi-value">{orders?.filter((o) => ['placed', 'packed', 'dispatched'].includes(o.status)).length ?? '—'}</div><div className="kpi-sub">being packed or on the way</div></div>
                <div className="kpi"><div className="kpi-label">Saved items</div><div className="kpi-value">{saved.length}</div><div className="kpi-sub">your list</div></div>
                <div className="kpi"><div className="kpi-label">Lifetime spend</div><div className="kpi-value" style={{ fontSize: 20 }}>P{money(orders?.reduce((a, o) => a + (o.status === 'cancelled' ? 0 : o.total), 0) || 0)}</div><div className="kpi-sub">excludes cancellations</div></div>
              </div>

              <div className="panel mt16">
                <div className="panel-head"><h3>Recent orders</h3><button className="section-link" onClick={() => setTab('orders')}>See all →</button></div>
                <div className="panel-body" style={{ paddingTop: 0 }}>
                  {orders?.slice(0, 2).map((o) => <OrderRow key={o.id} o={o} />)}
                  {orders?.length === 0 && <Empty title="No orders yet"><Link to="/search" className="btn btn-primary">Start shopping</Link></Empty>}
                </div>
              </div>
            </>
          )}

          {tab === 'orders' && (
            <>
              <div className="section-head" style={{ marginBottom: 14 }}>
                <div className="section-title">Your orders</div>
                <span className="tiny muted">{orders?.length ?? 0} orders</span>
              </div>
              {orders === null && <div className="skeleton" style={{ height: 120, borderRadius: 10 }} />}
              {orders?.length === 0 && <div className="panel"><Empty title="No orders yet"><Link to="/search" className="btn btn-primary">Start shopping</Link></Empty></div>}
              {orders?.map((o) => <OrderRow key={o.id} o={o} />)}
            </>
          )}

          {tab === 'saved' && (
            <>
              <div className="section-head" style={{ marginBottom: 14 }}><div className="section-title">Your list</div></div>
              {saved.length === 0
                ? <div className="panel"><Empty title="Nothing saved yet">Tap the heart on any product to keep it here.</Empty></div>
                : (
                  <div className="panel">
                    <div className="panel-body" style={{ paddingTop: 4 }}>
                      {saved.map((s) => (
                        <div className="cart-item" key={s.id}>
                          <Link to={`/p/${s.id}`} className="cart-thumb"><MediaTile glyph={s.glyph} category={s.category} title={s.title} compact /></Link>
                          <div style={{ minWidth: 0 }}>
                            <Link to={`/p/${s.id}`} className="cart-title" style={{ display: 'block' }}>{s.title}</Link>
                            <Price value={s.price} list={s.listPrice} size="sm" />
                            <div className="cart-line-actions">
                              <button className="btn btn-dark btn-sm" onClick={() => addToCart({ ...s, stock: 99 })}>Add to cart</button>
                              <button className="btn-quiet" style={{ fontSize: 12.5 }} onClick={() => toggleSaved(s)}>Remove</button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
            </>
          )}

          {tab === 'addresses' && (
            <>
              <div className="section-head" style={{ marginBottom: 14 }}><div className="section-title">Delivery addresses</div></div>
              <div className="stack" style={{ gap: 10 }}>
                {(user.addresses || []).map((a) => (
                  <div className="panel" key={a.id}>
                    <div className="panel-body row-between">
                      <div>
                        <b>{a.label} {a.default && <span className="badge badge-green" style={{ marginLeft: 6 }}>Default</span>}</b>
                        <div className="muted" style={{ fontSize: 13 }}>{a.line1}{a.line2 ? `, ${a.line2}` : ''}, {a.city}</div>
                        <div className="tiny muted">{a.phone}</div>
                      </div>
                      <Icon name="pin" size={18} style={{ color: 'var(--muted-2)' }} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="panel mt16">
                <div className="panel-head"><h3>Add an address</h3></div>
                <form className="panel-body" onSubmit={addAddress}>
                  <div className="field-row">
                    <div className="field"><span className="label">Label</span>
                      <select className="select" value={addrForm.label} onChange={(e) => setAddrForm({ ...addrForm, label: e.target.value })}>
                        {['Home', 'Work', 'Other'].map((l) => <option key={l}>{l}</option>)}
                      </select>
                    </div>
                    <div className="field"><span className="label">Town</span>
                      <select className="select" value={addrForm.city} onChange={(e) => setAddrForm({ ...addrForm, city: e.target.value })}>
                        {['Gaborone', 'Tlokweng', 'Mogoditshane', 'Francistown', 'Maun', 'Palapye', 'Serowe', 'Kanye', 'Molepolole', 'Lobatse'].map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="field"><span className="label">Street / plot</span>
                    <input className="input" value={addrForm.line1} onChange={(e) => setAddrForm({ ...addrForm, line1: e.target.value })} placeholder="Plot 5421, Extension 12" required />
                  </div>
                  <div className="field-row">
                    <div className="field"><span className="label">Area</span>
                      <input className="input" value={addrForm.line2} onChange={(e) => setAddrForm({ ...addrForm, line2: e.target.value })} placeholder="Broadhurst" />
                    </div>
                    <div className="field"><span className="label">Phone</span>
                      <input className="input" value={addrForm.phone} onChange={(e) => setAddrForm({ ...addrForm, phone: e.target.value })} placeholder="+267 71 234 567" />
                    </div>
                  </div>
                  <button className="btn btn-dark">Save address</button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
