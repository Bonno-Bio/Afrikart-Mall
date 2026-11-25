import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../state'
import { Icon } from '../components/icons'

const DEMOS = [
  { role: 'Customer', email: 'customer@afrikart.co.bw', note: 'shops, tracks orders' },
  { role: 'Seller', email: 'seller@afrikart.co.bw', note: 'Naledi Beauty Supply' },
  { role: 'Admin', email: 'admin@afrikart.co.bw', note: 'platform operations' },
]

export default function SignIn() {
  const { login, register, user } = useStore()
  const nav = useNavigate()
  const [params] = useSearchParams()
  const next = params.get('next') || '/'
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (user) {
    return (
      <div className="container">
        <div className="panel mt24" style={{ padding: 40, textAlign: 'center' }}>
          <h2 style={{ marginBottom: 8 }}>You are signed in as {user.name}</h2>
          <p className="muted" style={{ marginBottom: 18 }}>{user.email} · {user.role}</p>
          <div className="row" style={{ justifyContent: 'center', gap: 10, flexWrap: 'wrap' }}>
            <Link to="/account" className="btn btn-dark">Your account</Link>
            <Link to="/shop" className="btn btn-primary">Continue shopping</Link>
          </div>
        </div>
      </div>
    )
  }

  const submit = async (e, creds) => {
    e?.preventDefault()
    setBusy(true); setError('')
    try {
      if (mode === 'register') await register({ name, email, password })
      else await login(creds?.email ?? email, creds?.password ?? password)
      nav(next)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const quick = (demo) => submit(null, { email: demo.email, password: 'demo1234' })

  return (
    <div className="container">
      <div className="auth-wrap">
        <div className="auth-side">
          <div>
            <Link to="/" className="logo" style={{ marginBottom: 26 }}>
              <span className="logo-mark">A</span>
              <span className="logo-text"><b style={{ color: '#fff' }}>afrikart</b><span>Mall · Botswana</span></span>
            </Link>
            <h2>One account.<br />Everything you order.</h2>
            <p>
              Your orders, your addresses, your returns and your saved list — across every seller on the
              platform. Payment is held by Afrikart until the order reaches your door.
            </p>
          </div>

          <div>
            <div className="tiny" style={{ color: '#9db4ca', textTransform: 'uppercase', letterSpacing: '.12em', fontWeight: 800, marginBottom: 8 }}>
              Demonstration accounts
            </div>
            <div className="demo-list">
              {DEMOS.map((d) => (
                <button key={d.email} className="demo-btn" onClick={() => quick(d)} disabled={busy}>
                  <span style={{ color: '#fff', fontWeight: 700 }}>
                    <Icon name={d.role === 'Customer' ? 'user' : d.role === 'Seller' ? 'building' : 'settings'} size={13} />
                    {' '}{d.role}
                  </span>
                  <span>{d.note}</span>
                </button>
              ))}
            </div>
            <p className="tiny" style={{ color: '#8aa3ba', marginTop: 8 }}>Password for all three: demo1234</p>
          </div>
        </div>

        <div className="auth-form">
          <div className="row" style={{ gap: 4, marginBottom: 20, background: 'var(--bg-2)', padding: 4, borderRadius: 999 }}>
            {[['signin', 'Sign in'], ['register', 'Create account']].map(([k, l]) => (
              <button key={k} onClick={() => { setMode(k); setError('') }} style={{
                flex: 1, border: 0, padding: '8px 12px', borderRadius: 999, fontWeight: 700, fontSize: 13,
                background: mode === k ? '#fff' : 'transparent', color: mode === k ? 'var(--ink)' : 'var(--muted)',
                boxShadow: mode === k ? 'var(--shadow)' : 'none',
              }}>{l}</button>
            ))}
          </div>

          <h2 style={{ fontSize: 22, marginBottom: 6 }}>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="muted" style={{ fontSize: 13, marginBottom: 18 }}>
            {mode === 'signin' ? 'Sign in to check out and track your orders.' : 'It takes about twenty seconds.'}
          </p>

          {error && <div className="error">{error}</div>}

          <form onSubmit={submit}>
            {mode === 'register' && (
              <div className="field">
                <span className="label">Full name</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Kago Mmolai" required />
              </div>
            )}
            <div className="field">
              <span className="label">Email</span>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.co.bw" required />
            </div>
            <div className="field">
              <span className="label">Password</span>
              <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required />
            </div>
            <button className="btn btn-primary btn-block" style={{ height: 42 }} disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          <p className="tiny muted mt16" style={{ lineHeight: 1.6 }}>
            By continuing you agree to the Afrikart terms of use. Your personal data is processed under the
            Botswana Data Protection Act, 2024 — we never sell it, and sellers only see what they need to ship
            your order.
          </p>
        </div>
      </div>
    </div>
  )
}
