import { Link, useNavigate } from 'react-router-dom'
import { useStore } from '../state'
import { money } from '../lib/api'
import { Icon } from '../components/icons'
import { MediaTile, Price, QtyBox, Empty } from '../components/ui'

export default function Cart() {
  const { cart, removeFromCart, setQty, subtotal, cartCount, user, toggleSaved, clearCart } = useStore()
  const nav = useNavigate()
  const threshold = 400
  const remaining = Math.max(0, threshold - subtotal)
  const delivery = subtotal === 0 ? 0 : cart.some((i) => i.express) ? (remaining > 0 ? 30 : 0) : 20

  if (!cart.length) {
    return (
      <div className="container">
        <div className="panel mt24">
          <Empty title="Your cart is empty"
                 action={<Link to="/search" className="btn btn-primary">Continue shopping</Link>}>
            Add something in stock and we will get it to your door.
          </Empty>
        </div>
      </div>
    )
  }

  return (
    <div className="container">
      <div className="cart-layout">
        <div>
          <div className="panel">
            <div className="panel-head">
              <h3>Shopping cart</h3>
              <button className="btn-quiet" onClick={() => { clearCart(); }}>Clear cart</button>
            </div>
            <div className="panel-body" style={{ paddingTop: 4 }}>
              {cart.map((item) => (
                <div className="cart-item" key={item.id}>
                  <Link to={`/p/${item.id}`} className="cart-thumb">
                    <MediaTile glyph={item.glyph} category={item.category} title={item.title} compact />
                  </Link>
                  <div style={{ minWidth: 0 }}>
                    <Link to={`/p/${item.id}`} className="cart-title" style={{ display: 'block' }}>{item.title}</Link>
                    <div className="tiny" style={{ color: item.stock > 0 ? 'var(--green)' : 'var(--red)', fontWeight: 700 }}>
                      {item.stock > 0 ? 'In stock' : 'Out of stock'}
                    </div>
                    <div className="tiny muted">Sold by {item.seller || 'Afrikart'}</div>
                    <div className="cart-line-actions">
                      <QtyBox value={item.qty} onChange={(q) => setQty(item.id, q)} max={item.stock || 99} />
                      <button className="btn-quiet" style={{ fontSize: 12.5 }} onClick={() => removeFromCart(item.id)}>Delete</button>
                      <button className="btn-quiet" style={{ fontSize: 12.5 }} onClick={() => { toggleSaved(item); removeFromCart(item.id) }}>
                        Save for later
                      </button>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <Price value={item.price * item.qty} />
                    {item.qty > 1 && <div className="tiny muted">P{money(item.price)} each</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel mt16">
            <div className="panel-body" style={{ display: 'flex', gap: 16, alignItems: 'flex-start', fontSize: 12.5, color: 'var(--muted)' }}>
              <Icon name="shield" size={20} style={{ color: 'var(--green)', flexShrink: 0 }} />
              <div>
                <b style={{ color: 'var(--ink)' }}>Afrikart Buyer Protection.</b> We hold your money until the order is
                delivered. If it does not arrive, or it is not what was listed, you get a full refund — no arguing with the
                seller, no shipping it back yourself.
              </div>
            </div>
          </div>
        </div>

        <div>
          <div className="panel summary">
            <div className="panel-body">
              {remaining > 0 ? (
                <div className="free-ship">
                  <Icon name="truck" size={16} />
                  <div>
                    Add <b>P{money(remaining)}</b> for free delivery
                    <div className="progress"><div style={{ width: `${(subtotal / threshold) * 100}%` }} /></div>
                  </div>
                </div>
              ) : (
                <div className="free-ship">
                  <Icon name="check" size={16} />
                  <div><b>Free delivery unlocked.</b> Your order qualifies for Afrikart Express.</div>
                </div>
              )}

              <div className="mt16">
                <div className="summary-row"><span>Items ({cartCount})</span><b>P{money(subtotal)}</b></div>
                <div className="summary-row"><span>Delivery</span><b>{delivery === 0 ? 'Free' : `P${money(delivery)}`}</b></div>
                <div className="summary-row"><span>VAT included</span><b>P{money(subtotal * 0.14 / 1.14)}</b></div>
                <div className="summary-total"><span>Order total</span><span>P{money(subtotal + delivery)}</span></div>
              </div>

              <button className="btn btn-primary btn-block mt16" onClick={() => nav(user ? '/checkout' : '/signin?next=/checkout')}>
                {user ? 'Proceed to checkout' : 'Sign in to check out'}
              </button>
              <Link to="/search" className="btn btn-ghost btn-block mt8">Keep shopping</Link>

              <div className="tiny muted mt16" style={{ lineHeight: 1.5 }}>
                Pay by card, Orange Money, MyZaka, Smega, or cash on delivery in Gaborone.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
