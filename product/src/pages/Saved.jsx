import { Link } from 'react-router-dom'
import { useStore } from '../state'
import { ProductCard, Empty } from '../components/ui'

export default function Saved() {
  const { saved } = useStore()
  return (
    <div className="container">
      <div className="section-head" style={{ marginTop: 20 }}>
        <div className="section-title">Your list <small>{saved.length} items</small></div>
        <Link to="/account" className="section-link">Account →</Link>
      </div>
      {saved.length === 0 ? (
        <div className="panel">
          <Empty title="Nothing saved yet" action={<Link to="/search" className="btn btn-primary">Find something</Link>}>
            Tap the heart on any product and it waits here.
          </Empty>
        </div>
      ) : (
        <div className="grid-products" style={{ marginBottom: 40 }}>
          {saved.map((s) => <ProductCard key={s.id} p={{ ...s, stock: s.stock ?? 10, ratingCount: s.ratingCount ?? 0 }} />)}
        </div>
      )}
    </div>
  )
}
