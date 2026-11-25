import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, money, dateShort, statusLabel, statusTone } from '../lib/api'
import { useStore } from '../state'
import { Icon } from '../components/icons'
import { Kpi, BarChart, Empty } from '../components/ui'

export default function Admin() {
  const { user, toast } = useStore()
  const [data, setData] = useState(null)
  const [tab, setTab] = useState('overview')

  const load = () => api('/admin/summary').then(setData).catch(() => setData(false))
  useEffect(() => { if (user?.role === 'admin') load() }, [user])

  if (!user || user.role !== 'admin') {
    return (
      <div className="container">
        <div className="panel mt24" style={{ padding: 40, textAlign: 'center' }}>
          <h2 style={{ marginBottom: 8 }}>Platform administration</h2>
          <p className="muted" style={{ marginBottom: 18 }}>This area is restricted to Afrikart operations staff.</p>
          <Link to="/signin?next=/admin" className="btn btn-primary">Sign in as admin</Link>
        </div>
      </div>
    )
  }

  if (!data) return <div className="container" style={{ padding: 30 }}><div className="skeleton" style={{ height: 300, borderRadius: 10 }} /></div>
  if (data === false) return <div className="container"><Empty title="Could not load platform data" /></div>

  const approve = async (id) => {
    try { await api(`/admin/sellers/${id}/approve`, { method: 'POST' }); toast('Seller approved'); load() }
    catch (e) { toast(e.message) }
  }

  const maxCat = Math.max(...data.byCategory.map((c) => c.gmv), 1)

  return (
    <div className="container">
      <div className="dash-layout">
        <nav className="dash-nav">
          <div className="dash-nav-title">Platform admin</div>
          {[['overview', 'Overview', 'chart'], ['sellers', 'Sellers', 'building'], ['orders', 'Orders', 'package'], ['catalogue', 'Catalogue', 'box']].map(([k, l, ico]) => (
            <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}><Icon name={ico} size={15} /> {l}</button>
          ))}
          <div className="dash-nav-title">Jump to</div>
          <Link to="/seller"><Icon name="building" size={15} /> Seller Central</Link>
          <Link to="/search"><Icon name="grid" size={15} /> Marketplace</Link>
        </nav>

        <div>
          <div className="row-between" style={{ marginBottom: 14 }}>
            <div>
              <h2 style={{ fontSize: 21 }}>Platform overview</h2>
              <div className="tiny muted">All figures live · commission 12% · fulfilment fee 6%</div>
            </div>
            <span className="badge badge-green">Operating normally</span>
          </div>

          {tab === 'overview' && (
            <>
              <div className="kpi-grid">
                <Kpi label="GMV" value={`P${money(data.kpis.gmv)}`} sub={`${data.kpis.orders} orders all time`} accent />
                <Kpi label="Platform revenue" value={`P${money(data.kpis.commission + data.kpis.fulfilmentFees + data.kpis.deliveryRev)}`} sub={`take rate ${data.kpis.takeRate}%`} />
                <Kpi label="Average order" value={`P${money(data.kpis.aov)}`} sub="the number that decides everything" />
                <Kpi label="Failed delivery" value={`${data.kpis.failureRate}%`} sub="returns as share of orders" />
              </div>

              <div className="kpi-grid" style={{ marginTop: -4 }}>
                <Kpi label="Customers" value={data.kpis.customers} sub="registered buyers" />
                <Kpi label="Approved sellers" value={data.kpis.sellers} sub={`${data.kpis.pendingSellers} awaiting review`} />
                <Kpi label="Live listings" value={data.kpis.listings} sub="across 8 departments" />
                <Kpi label="Delivery revenue" value={`P${money(data.kpis.deliveryRev)}`} sub="fees collected from customers" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
                <div className="panel">
                  <div className="panel-head"><h3>GMV, last 14 days</h3></div>
                  <div className="panel-body"><BarChart series={data.series} /></div>
                </div>
                <div className="panel">
                  <div className="panel-head"><h3>GMV by department</h3></div>
                  <div className="panel-body">
                    {data.byCategory.map((c) => (
                      <div className="bar-split" key={c.slug}>
                        <span className="bar-split-name">{c.name}</span>
                        <span className="bar-split-track"><span className="bar-split-fill" style={{ width: `${(c.gmv / maxCat) * 100}%` }} /></span>
                        <span className="bar-split-value">P{Math.round(c.gmv).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="panel mt16">
                <div className="panel-head"><h3>Latest orders</h3><span className="tiny muted">newest first</span></div>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Order</th><th>Placed</th><th>Items</th><th>Payment</th><th>Status</th><th className="num">Total</th></tr></thead>
                    <tbody>
                      {data.latestOrders.map((o) => (
                        <tr key={o.id}>
                          <td><b style={{ fontSize: 12.5 }}>{o.id}</b></td>
                          <td className="tiny muted">{dateShort(o.placedAt)}</td>
                          <td className="tiny muted" style={{ maxWidth: 260 }}>{o.items.length} lines · {o.address?.city}</td>
                          <td className="tiny muted">{o.paymentMethod}</td>
                          <td><span className={`badge badge-${statusTone(o.status)}`}>{statusLabel(o.status)}</span></td>
                          <td className="num">P{money(o.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {tab === 'sellers' && (
            <>
              {data.pendingSellers.length > 0 && (
                <div className="panel" style={{ marginBottom: 16, borderColor: 'var(--saffron)' }}>
                  <div className="panel-head"><h3>Awaiting verification</h3><span className="badge badge-amber">{data.pendingSellers.length}</span></div>
                  <div className="panel-body" style={{ paddingTop: 6 }}>
                    {data.pendingSellers.map((s) => (
                      <div key={s.id} className="row-between" style={{ padding: '10px 0', borderBottom: '1px solid var(--line-2)' }}>
                        <div>
                          <b style={{ fontSize: 13 }}>{s.name}</b>
                          <div className="tiny muted">{s.city} · applied {s.since} · {s.fulfilment}</div>
                        </div>
                        <div className="row" style={{ gap: 8 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => toast('Verification checklist opened')}>Review documents</button>
                          <button className="btn btn-primary btn-sm" onClick={() => approve(s.id)}>Approve</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="panel">
                <div className="panel-head"><h3>Seller performance</h3><span className="tiny muted">ranked by GMV</span></div>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>Seller</th><th>Town</th><th>Fulfilment</th><th>Status</th><th className="num">GMV</th><th className="num">Commission</th></tr></thead>
                    <tbody>
                      {data.sellerBoard.map((s) => (
                        <tr key={s.id}>
                          <td><b style={{ fontSize: 12.5 }}>{s.name}</b></td>
                          <td className="tiny muted">{s.city}</td>
                          <td className="tiny muted">{s.fulfilment}</td>
                          <td><span className={`badge ${s.status === 'approved' ? 'badge-green' : 'badge-amber'}`}>{s.status}</span></td>
                          <td className="num">P{money(s.gmv)}</td>
                          <td className="num">P{money(s.gmv * 0.12)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {tab === 'orders' && (
            <div className="panel">
              <div className="panel-head"><h3>All orders</h3><span className="tiny muted">{data.latestOrders.length} shown</span></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Order</th><th>Placed</th><th>To</th><th>Delivery</th><th>Status</th><th className="num">Total</th></tr></thead>
                  <tbody>
                    {data.latestOrders.map((o) => (
                      <tr key={o.id}>
                        <td><b style={{ fontSize: 12.5 }}>{o.id}</b></td>
                        <td className="tiny muted">{dateShort(o.placedAt)}</td>
                        <td className="tiny muted">{o.address?.city}</td>
                        <td className="tiny muted">{o.deliveryMethod || 'Afrikart Express'}</td>
                        <td><span className={`badge badge-${statusTone(o.status)}`}>{statusLabel(o.status)}</span></td>
                        <td className="num">P{money(o.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {tab === 'catalogue' && (
            <div className="panel">
              <div className="panel-head"><h3>Departments</h3><span className="tiny muted">GMV contribution</span></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Department</th><th className="num">GMV</th><th className="num">Share</th><th>Status</th></tr></thead>
                  <tbody>
                    {data.byCategory.map((c) => {
                      const total = data.byCategory.reduce((a, x) => a + x.gmv, 0) || 1
                      return (
                        <tr key={c.slug}>
                          <td><Link to={`/search?category=${c.slug}`} style={{ fontWeight: 600, fontSize: 12.5 }}>{c.name}</Link></td>
                          <td className="num">P{money(c.gmv)}</td>
                          <td className="num">{((c.gmv / total) * 100).toFixed(1)}%</td>
                          <td><span className="badge badge-green">live</span></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
