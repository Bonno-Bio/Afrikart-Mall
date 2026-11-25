import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api, money, dateTime, statusLabel, statusTone } from '../lib/api'
import { useStore } from '../state'
import { Icon } from '../components/icons'
import { MediaTile, Price, Empty } from '../components/ui'

const STAGES = ['placed', 'packed', 'dispatched', 'delivered']

export default function OrderDetail() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const { toast } = useStore()
  const [order, setOrder] = useState(null)
  const [busy, setBusy] = useState(false)
  const isNew = params.get('new') === '1'

  const load = () => api(`/orders/${id}`).then((d) => setOrder(d.order)).catch(() => setOrder(false))
  useEffect(() => { load() }, [id])

  if (order === null) return <div className="container" style={{ padding: 30 }}><div className="skeleton" style={{ height: 400, borderRadius: 10 }} /></div>
  if (!order) return <div className="container"><Empty title="We could not find that order" action={<Link to="/account#orders" className="btn btn-dark">Your orders</Link>} /></div>

  const stageIndex = STAGES.indexOf(order.status)

  const act = async (action) => {
    setBusy(true)
    try {
      const d = await api(`/orders/${id}/action`, { method: 'POST', body: { action } })
      setOrder(d.order)
      toast(action === 'cancel' ? 'Order cancelled and refunded' : 'Return requested — a rider will collect')
    } catch (e) { toast(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="container">
      <div className="breadcrumb">
        <Link to="/account#orders">Your orders</Link>
        <Icon name="chevronRight" size={12} />
        <span style={{ color: 'var(--ink)' }}>{order.id}</span>
      </div>

      {isNew && (
        <div className="panel" style={{ background: 'linear-gradient(120deg,#0c5d47,#11836a)', color: '#fff', border: 0, marginBottom: 16 }}>
          <div className="panel-body row-between wrap" style={{ gap: 14 }}>
            <div className="row" style={{ gap: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,255,255,.18)', display: 'grid', placeItems: 'center' }}>
                <Icon name="check" size={20} />
              </div>
              <div>
                <b style={{ fontSize: 16 }}>Order confirmed. Thank you.</b>
                <div style={{ fontSize: 13, opacity: .9 }}>We sent the confirmation to your email. Your rider will call before arriving.</div>
              </div>
            </div>
            <Link to="/search" className="btn btn-ghost" style={{ background: 'rgba(255,255,255,.14)', color: '#fff', borderColor: 'transparent' }}>Keep shopping</Link>
          </div>
        </div>
      )}

      <div className="order-detail-grid">
        <div>
          <div className="panel">
            <div className="panel-head">
              <h3>{order.id}</h3>
              <span className={`badge badge-${statusTone(order.status)}`}>{statusLabel(order.status)}</span>
            </div>
            <div className="panel-body">
              <div className="row" style={{ justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 8 }}>
                <div><div className="tiny muted">Placed</div><b>{dateTime(order.placedAt)}</b></div>
                <div><div className="tiny muted">Payment</div><b>{order.paymentMethod}</b></div>
                <div><div className="tiny muted">Delivery</div><b>{order.deliveryMethod || 'Afrikart Express'}</b></div>
                <div><div className="tiny muted">Total</div><b>P{money(order.total)}</b></div>
              </div>

              {!['cancelled', 'returned'].includes(order.status) && (
                <div style={{ display: 'flex', gap: 0, marginBottom: 22 }}>
                  {STAGES.map((s, i) => (
                    <div key={s} style={{ flex: 1, textAlign: 'center', position: 'relative' }}>
                      <div style={{
                        height: 4, background: i <= stageIndex ? 'var(--green)' : 'var(--line)',
                        margin: '0 -1px', position: 'relative', top: 11,
                      }} />
                      <div style={{
                        width: 24, height: 24, borderRadius: '50%', margin: '0 auto', position: 'relative', zIndex: 2,
                        background: i <= stageIndex ? 'var(--green)' : '#fff', border: `2px solid ${i <= stageIndex ? 'var(--green)' : 'var(--line)'}`,
                        color: i <= stageIndex ? '#fff' : 'var(--muted-2)', display: 'grid', placeItems: 'center',
                      }}>
                        {i <= stageIndex ? <Icon name="check" size={12} strokeWidth={3} /> : <span style={{ fontSize: 10, fontWeight: 800 }}>{i + 1}</span>}
                      </div>
                      <div className="tiny" style={{ marginTop: 7, fontWeight: i <= stageIndex ? 700 : 500, color: i <= stageIndex ? 'var(--ink)' : 'var(--muted-2)' }}>
                        {['Placed', 'Packed', 'On the way', 'Delivered'][i]}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {order.status === 'cancelled' && (
                <div className="error" style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', color: 'var(--muted)' }}>
                  This order was cancelled before dispatch. Nothing was charged.
                </div>
              )}
              {order.status === 'returned' && (
                <div className="error" style={{ background: 'var(--amber-soft)', border: '1px solid #f3e0b8', color: '#8a5a12' }}>
                  Return in progress. A rider will collect within 2 working days and the refund is issued on inspection.
                </div>
              )}

              <div className="divider" />

              <div className="tl-label" style={{ fontWeight: 750, marginBottom: 14 }}>Tracking history</div>
              <div className="timeline">
                {[...order.timeline].reverse().map((t, i) => (
                  <div className={i === 0 ? 'tl-step on' : 'tl-step'} key={i}>
                    <span className="tl-dot" />
                    <b>{t.label}</b>
                    <span>{t.detail}</span>
                    <br />
                    <time>{dateTime(t.at)}</time>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel mt16">
            <div className="panel-head"><h3>Items in this order</h3><span className="tiny muted">{order.items.length} line items</span></div>
            <div className="panel-body" style={{ paddingTop: 4 }}>
              {order.items.map((i) => (
                <div className="cart-item" key={i.productId}>
                  <Link to={`/p/${i.productId}`} className="cart-thumb">
                    <MediaTile glyph="box" category="" title={i.title} compact />
                  </Link>
                  <div style={{ minWidth: 0 }}>
                    <Link to={`/p/${i.productId}`} className="cart-title" style={{ display: 'block' }}>{i.title}</Link>
                    <div className="tiny muted">Quantity {i.qty}</div>
                    <div className="cart-line-actions">
                      <Link to={`/p/${i.productId}`} className="btn-quiet" style={{ fontSize: 12.5 }}>Buy it again</Link>
                    </div>
                  </div>
                  <Price value={i.price * i.qty} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div>
          <div className="panel">
            <div className="panel-head"><h3>Order summary</h3></div>
            <div className="panel-body">
              <div className="summary-row"><span>Items</span><b>P{money(order.subtotal)}</b></div>
              <div className="summary-row"><span>Delivery</span><b>{order.deliveryFee ? `P${money(order.deliveryFee)}` : 'Free'}</b></div>
              {order.codFee > 0 && <div className="summary-row"><span>Cash handling</span><b>P{money(order.codFee)}</b></div>}
              <div className="summary-total"><span>Total paid</span><span>P{money(order.total)}</span></div>

              <div className="divider" />
              <div className="tiny muted" style={{ lineHeight: 1.6 }}>
                <b style={{ color: 'var(--ink)', display: 'block', marginBottom: 6 }}>Delivering to</b>
                {order.address?.name}<br />
                {order.address?.line1}{order.address?.line2 ? `, ${order.address.line2}` : ''}<br />
                {order.address?.city}<br />
                {order.address?.phone}
              </div>

              <div className="divider" />
              <div className="stack" style={{ gap: 8 }}>
                {['placed', 'packed'].includes(order.status) && (
                  <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => act('cancel')}>Cancel order</button>
                )}
                {order.status === 'delivered' && (
                  <button className="btn btn-ghost btn-block" disabled={busy} onClick={() => act('return')}>Request a return</button>
                )}
                <Link to="/help" className="btn btn-quiet btn-block">Get help with this order</Link>
              </div>
            </div>
          </div>

          <div className="panel mt16">
            <div className="panel-body" style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
              <b style={{ color: 'var(--ink)', display: 'block', marginBottom: 6 }}>Need it faster?</b>
              Afrikart Express delivers next day in Gaborone, Tlokweng and Mogoditshane. Upcountry orders travel
              by courier or intercity combi and take 2 to 5 working days.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
