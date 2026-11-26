import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../state'
import { api, money } from '../lib/api'
import { Icon } from '../components/icons'
import { MediaTile, Price } from '../components/ui'

export default function Checkout() {
  const { user, cart, subtotal, clearCart, payments, toast, city } = useStore()
  const nav = useNavigate()
  const [quote, setQuote] = useState(null)
  const [deliveryMethod, setDeliveryMethod] = useState('express')
  const [paymentMethod, setPaymentMethod] = useState('card')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newAddr, setNewAddr] = useState({ label: 'Home', line1: '', line2: '', city: user?.addresses?.[0]?.city || city, phone: '' })
  const [selectedAddr, setSelectedAddr] = useState(user?.addresses?.[0]?.id || 'new')

  const address = useMemo(() => {
    if (selectedAddr === 'new') return { id: 'new', name: user?.name, ...newAddr }
    return user?.addresses?.find((a) => a.id === selectedAddr) || user?.addresses?.[0] || { name: user?.name, city }
  }, [selectedAddr, newAddr, user, city])

  useEffect(() => {
    if (!cart.length) return
    api('/checkout/quote', {
      method: 'POST',
      body: { items: cart.map((i) => ({ productId: i.id, qty: i.qty })), city: address.city, paymentMethod },
    }).then((q) => {
      setQuote(q)
      if (!q.deliveryOptions.some((o) => o.id === deliveryMethod)) setDeliveryMethod(q.deliveryOptions[0].id)
    }).catch(() => {})
  }, [cart, address.city, paymentMethod])

  if (!user) {
    return (
      <div className="container">
        <div className="panel mt24" style={{ padding: 40, textAlign: 'center' }}>
          <h2 style={{ marginBottom: 10 }}>Sign in to check out</h2>
          <p className="muted" style={{ marginBottom: 18 }}>We need an account to hold your order and your refunds safely.</p>
          <Link to="/signin?next=/checkout" className="btn btn-primary">Sign in</Link>
        </div>
      </div>
    )
  }

  if (!cart.length) {
    return (
      <div className="container">
        <div className="panel mt24" style={{ padding: 40, textAlign: 'center' }}>
          <h2 style={{ marginBottom: 10 }}>Nothing to check out</h2>
          <Link to="/search" className="btn btn-primary">Start shopping</Link>
        </div>
      </div>
    )
  }

  const chosen = quote?.deliveryOptions.find((o) => o.id === deliveryMethod) || quote?.deliveryOptions[0]
  const codFee = paymentMethod === 'cod' ? 15 : 0
  const total = (quote?.subtotal ?? subtotal) + (chosen?.fee ?? 0) + codFee
  const codAllowed = /gaborone|tlokweng|mogoditshane/i.test(address.city || '')

  const placeOrder = async () => {
    setBusy(true)
    setError('')
    try {
      if (selectedAddr === 'new' && (!newAddr.line1 || !newAddr.city)) {
        throw new Error('Please enter a street address and town before placing the order.')
      }
      const d = await api('/orders', {
        method: 'POST',
        body: {
          items: cart.map((i) => ({ productId: i.id, qty: i.qty })),
          address: { ...address, name: address.name || user.name },
          deliveryMethod,
          paymentMethod,
        },
      })
      clearCart()
      toast('Order placed — ' + d.order.id)
      nav(`/order/${d.order.id}?new=1`)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="container">
      <div className="cart-layout">
        <div>
          <div className="steps">
            <span className="step done"><span className="step-num">1</span> Address</span>
            <span className="step done"><span className="step-num">2</span> Delivery</span>
            <span className="step done"><span className="step-num">3</span> Payment</span>
            <span className="step"><span className="step-num">4</span> Review</span>
          </div>

          {error && <div className="error">{error}</div>}

          {/* ------------------------------------------------ address */}
          <div className="panel">
            <div className="panel-head"><h3>1. Delivery address</h3></div>
            <div className="panel-body">
              <div className="stack" style={{ gap: 9 }}>
                {(user.addresses || []).map((a) => (
                  <label key={a.id} className={`option ${selectedAddr === a.id ? 'sel' : ''}`}>
                    <input type="radio" name="addr" checked={selectedAddr === a.id} onChange={() => setSelectedAddr(a.id)} />
                    <div className="option-main">
                      <b>{a.label} — {a.line1}</b>
                      <p>{[a.line2, a.city].filter(Boolean).join(', ')} · {a.phone}</p>
                    </div>
                  </label>
                ))}
                <label className={`option ${selectedAddr === 'new' ? 'sel' : ''}`}>
                  <input type="radio" name="addr" checked={selectedAddr === 'new'} onChange={() => setSelectedAddr('new')} />
                  <div className="option-main">
                    <b>Use a different address</b>
                    <p>Enter a new address for this order</p>
                  </div>
                </label>
              </div>

              {selectedAddr === 'new' && (
                <div className="mt16">
                  <div className="field-row">
                    <div className="field">
                      <span className="label">Street / plot</span>
                      <input className="input" placeholder="Plot 5421, Extension 12" value={newAddr.line1}
                             onChange={(e) => setNewAddr({ ...newAddr, line1: e.target.value })} />
                    </div>
                    <div className="field">
                      <span className="label">Area / suburb</span>
                      <input className="input" placeholder="Broadhurst" value={newAddr.line2}
                             onChange={(e) => setNewAddr({ ...newAddr, line2: e.target.value })} />
                    </div>
                  </div>
                  <div className="field-row">
                    <div className="field">
                      <span className="label">Town</span>
                      <select className="select" value={newAddr.city} onChange={(e) => setNewAddr({ ...newAddr, city: e.target.value })}>
                        {['Gaborone', 'Tlokweng', 'Mogoditshane', 'Francistown', 'Maun', 'Palapye', 'Serowe', 'Kanye', 'Molepolole', 'Lobatse'].map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="field">
                      <span className="label">Phone for the rider</span>
                      <input className="input" placeholder="+267 71 234 567" value={newAddr.phone}
                             onChange={(e) => setNewAddr({ ...newAddr, phone: e.target.value })} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ------------------------------------------------ delivery */}
          <div className="panel mt16">
            <div className="panel-head"><h3>2. Delivery speed</h3><span className="tiny muted">Free over P400</span></div>
            <div className="panel-body">
              <div className="stack" style={{ gap: 9 }}>
                {(quote?.deliveryOptions || []).map((o) => (
                  <label key={o.id} className={`option ${deliveryMethod === o.id ? 'sel' : ''}`}>
                    <input type="radio" name="del" checked={deliveryMethod === o.id} onChange={() => setDeliveryMethod(o.id)} />
                    <div className="option-main">
                      <b>{o.label}{o.id === 'express' && <span className="card-express" style={{ marginLeft: 8 }}><Icon name="bolt" size={10} fill="currentColor" /> EXPRESS</span>}</b>
                      <p>{o.eta} · {o.note}</p>
                    </div>
                    <span className="option-price">{o.fee === 0 ? 'Free' : `P${money(o.fee)}`}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* ------------------------------------------------ payment */}
          <div className="panel mt16">
            <div className="panel-head"><h3>3. Payment method</h3></div>
            <div className="panel-body">
              <div className="stack" style={{ gap: 9 }}>
                {(payments || []).map((pm) => {
                  const disabled = pm.id === 'cod' && !codAllowed
                  return (
                    <label key={pm.id} className={`option ${paymentMethod === pm.id ? 'sel' : ''}`} style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : {}}>
                      <input type="radio" name="pay" checked={paymentMethod === pm.id} disabled={disabled} onChange={() => setPaymentMethod(pm.id)} />
                      <div className="option-main">
                        <b>{pm.label}</b>
                        <p>{disabled ? 'Not available for this address — Gaborone only.' : pm.note}</p>
                      </div>
                      <Icon name={pm.id === 'cod' ? 'package' : 'credit'} size={18} style={{ color: 'var(--muted)' }} />
                    </label>
                  )
                })}
              </div>

              {paymentMethod === 'card' && (
                <div className="mt16" style={{ background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 10, padding: 14 }}>
                  <div className="field">
                    <span className="label">Card number</span>
                    <input className="input" placeholder="4242 4242 4242 4242 (test card)" />
                  </div>
                  <div className="field-row">
                    <div className="field"><span className="label">Expiry</span><input className="input" placeholder="MM / YY" /></div>
                    <div className="field"><span className="label">CVV</span><input className="input" placeholder="123" /></div>
                  </div>
                  <p className="hint">
                    This is a demonstration checkout. No card is charged. In production this form is hosted by a
                    Bank of Botswana licensed payment provider — card data never touches Afrikart servers.
                  </p>
                </div>
              )}

              {(paymentMethod === 'orange' || paymentMethod === 'myzaka' || paymentMethod === 'smega') && (
                <div className="mt16" style={{ background: 'var(--amber-soft)', border: '1px solid #f3e0b8', borderRadius: 10, padding: 14, fontSize: 12.5 }}>
                  You will get a prompt on <b>+267 7X XXX XXX</b> to approve P{money(total)}. The order is held until
                  the payment is confirmed — usually under 30 seconds.
                </div>
              )}
            </div>
          </div>

          {/* ------------------------------------------------ review */}
          <div className="panel mt16">
            <div className="panel-head"><h3>4. Review and place order</h3></div>
            <div className="panel-body">
              <div className="stack" style={{ gap: 14 }}>
                {cart.map((i) => (
                  <div className="row" key={i.id} style={{ gap: 12 }}>
                    <div style={{ width: 54, height: 54, borderRadius: 7, overflow: 'hidden', border: '1px solid var(--line)', flexShrink: 0 }}>
                      <MediaTile glyph={i.glyph} category={i.category} title={i.title} compact />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.title}</div>
                      <div className="tiny muted">Qty {i.qty} · {i.seller}</div>
                    </div>
                    <Price value={i.price * i.qty} size="sm" />
                  </div>
                ))}
              </div>

              <div className="divider" />

              <div className="row-between" style={{ alignItems: 'flex-start', gap: 20, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
                  <b style={{ color: 'var(--ink)' }}>Delivering to</b><br />
                  {address.name}<br />
                  {address.line1}{address.line2 ? `, ${address.line2}` : ''}<br />
                  {address.city}{address.phone ? ` · ${address.phone}` : ''}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
                  <b style={{ color: 'var(--ink)' }}>Delivery</b><br />
                  {chosen?.label}<br />
                  {chosen?.eta}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--muted)', lineHeight: 1.6 }}>
                  <b style={{ color: 'var(--ink)' }}>Payment</b><br />
                  {payments.find((p) => p.id === paymentMethod)?.label}
                </div>
              </div>

              <button className="btn btn-primary btn-block mt16" style={{ height: 44 }} disabled={busy} onClick={placeOrder}>
                {busy ? 'Placing order…' : `Place order · P${money(total)}`}
              </button>
              <p className="tiny muted mt8" style={{ textAlign: 'center' }}>
                By placing the order you agree to the Afrikart conditions of sale and the refund policy.
              </p>
            </div>
          </div>
        </div>

        {/* ------------------------------------------------ summary */}
        <div>
          <div className="panel summary">
            <div className="panel-head"><h3>Order summary</h3></div>
            <div className="panel-body">
              <div className="summary-row"><span>Items ({cart.reduce((a, i) => a + i.qty, 0)})</span><b>P{money(quote?.subtotal ?? subtotal)}</b></div>
              <div className="summary-row"><span>Delivery — {chosen?.label || '—'}</span><b>{chosen?.fee ? `P${money(chosen.fee)}` : 'Free'}</b></div>
              {codFee > 0 && <div className="summary-row"><span>Cash handling</span><b>P{money(codFee)}</b></div>}
              <div className="summary-row"><span>VAT (14%, included)</span><b>P{money((quote?.subtotal ?? subtotal) * 0.14 / 1.14)}</b></div>
              <div className="summary-total"><span>Total</span><span>P{money(total)}</span></div>

              <div className="mt16" style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
                <div className="row" style={{ gap: 7, marginBottom: 6 }}><Icon name="shield" size={14} style={{ color: 'var(--green)' }} /> Buyer protection on every order</div>
                <div className="row" style={{ gap: 7, marginBottom: 6 }}><Icon name="return" size={14} style={{ color: 'var(--green)' }} /> 7-day returns, collected at your door</div>
                <div className="row" style={{ gap: 7 }}><Icon name="truck" size={14} style={{ color: 'var(--green)' }} /> Tracked from packed to delivered</div>
              </div>
            </div>
          </div>

          <div className="panel mt16">
            <div className="panel-body" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              <b style={{ color: 'var(--ink)', display: 'block', marginBottom: 6 }}>Where your money goes</b>
              Afrikart holds the payment until you receive the order. The seller is paid out after delivery,
              minus commission. That is why a refund is a click, not a negotiation.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
