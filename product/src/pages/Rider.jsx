import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, money } from '../lib/api'
import { useStore } from '../state'
import { Icon } from '../components/icons'
import { Kpi, Empty } from '../components/ui'

function Stop({ stop, reasons, onDone }) {
  const [mode, setMode] = useState(null) // 'deliver' | 'fail'
  const [cash, setCash] = useState(stop.cashDue || 0)
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const isDone = stop.status === 'delivered'
  const isFailed = stop.status === 'failed'

  const submit = async (outcome) => {
    setBusy(true); setErr('')
    try {
      await api(`/rider/deliveries/${stop.deliveryId}/attempt`, {
        method: 'POST',
        body: outcome === 'delivered'
          ? { outcome, cashCollected: Number(cash) }
          : { outcome, reasonCode: reason, note },
      })
      setMode(null)
      onDone()
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="panel" style={{
      marginBottom: 12,
      borderLeft: `3px solid ${isDone ? 'var(--green)' : isFailed ? 'var(--red)' : 'var(--saffron)'}`,
      opacity: isDone ? 0.75 : 1,
    }}>
      <div className="panel-body" style={{ padding: 16 }}>
        <div className="row-between" style={{ alignItems: 'flex-start', gap: 12 }}>
          <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
            <div style={{
              width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: 'grid', placeItems: 'center',
              background: isDone ? 'var(--green-soft)' : 'var(--saffron-soft)',
              color: isDone ? 'var(--green)' : '#a9691a', fontWeight: 800, fontSize: 13,
            }}>
              {isDone ? <Icon name="check" size={15} strokeWidth={3} /> : stop.sequence}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{stop.orderNumber}</div>
              <div className="tiny muted">{stop.customerName} · {stop.items} item{stop.items === 1 ? '' : 's'}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>{stop.line1}, {stop.city}</div>
              {stop.itemPreview && <div className="tiny muted" style={{ maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stop.itemPreview}</div>}
              {stop.reasonCode && <div className="tiny" style={{ color: 'var(--red)', fontWeight: 700, marginTop: 4 }}>Failed: {stop.reasonCode}</div>}
            </div>
          </div>

          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            {stop.cashDue > 0 ? (
              <>
                <div className="tiny muted">Collect</div>
                <div style={{ fontWeight: 800, fontSize: 17 }}>P{money(stop.cashDue)}</div>
                <span className="badge badge-amber" style={{ marginTop: 4 }}>CASH</span>
              </>
            ) : (
              <span className="badge badge-green">PREPAID</span>
            )}
          </div>
        </div>

        {err && <div className="error" style={{ marginTop: 12, marginBottom: 0 }}>{err}</div>}

        {!isDone && !isFailed && mode === null && (
          <div className="row" style={{ gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm" onClick={() => setMode('deliver')}>
              <Icon name="check" size={14} /> Delivered
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setMode('fail')}>
              <Icon name="x" size={14} /> Could not deliver
            </button>
            {stop.phone && <a className="btn btn-quiet btn-sm" href={`tel:${stop.phone}`}><Icon name="phone" size={13} /> Call</a>}
          </div>
        )}

        {mode === 'deliver' && (
          <div style={{ marginTop: 14, background: 'var(--bg-2)', border: '1px solid var(--line)', borderRadius: 9, padding: 14 }}>
            <div className="tiny muted" style={{ marginBottom: 8 }}>
              Proof of delivery is required. In production the rider photographs the parcel at the door.
            </div>
            <div className="field-row">
              <div className="field" style={{ marginBottom: 0 }}>
                <span className="label">Cash collected (P)</span>
                <input className="input" type="number" value={cash} onChange={(e) => setCash(e.target.value)} disabled={stop.cashDue === 0} />
              </div>
              <div className="field" style={{ marginBottom: 0 }}>
                <span className="label">Proof photo</span>
                <div className="input" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--muted)' }}>
                  <Icon name="package" size={15} /> proof.jpg captured
                </div>
              </div>
            </div>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => submit('delivered')}>
                {busy ? 'Saving…' : 'Confirm delivery'}
              </button>
              <button className="btn btn-quiet btn-sm" onClick={() => setMode(null)}>Cancel</button>
            </div>
          </div>
        )}

        {mode === 'fail' && (
          <div style={{ marginTop: 14, background: 'var(--red-soft)', border: '1px solid #f0cdc8', borderRadius: 9, padding: 14 }}>
            <div className="label" style={{ marginBottom: 6 }}>Why could it not be delivered? <span style={{ color: 'var(--red)' }}>*</span></div>
            <div className="tiny" style={{ color: '#8f2c20', marginBottom: 8 }}>
              A reason is mandatory — the platform cannot fix what it cannot categorise.
            </div>
            <select className="select" style={{ width: '100%' }} value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Select a reason…</option>
              {reasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
            <div className="field" style={{ marginTop: 10, marginBottom: 0 }}>
              <input className="input" placeholder="Optional note (e.g. no gate number on the street)" value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
            <div className="row" style={{ gap: 8, marginTop: 12 }}>
              <button className="btn btn-dark btn-sm" disabled={busy || !reason} onClick={() => submit('failed')}>
                {busy ? 'Saving…' : 'Log failed attempt'}
              </button>
              <button className="btn btn-quiet btn-sm" onClick={() => setMode(null)}>Cancel</button>
            </div>
          </div>
        )}

        {isDone && (
          <div className="tiny" style={{ color: 'var(--green)', marginTop: 10, fontWeight: 700 }}>
            ✓ Delivered{stop.cashCollected > 0 ? ` · P${money(stop.cashCollected)} collected` : ''}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Rider() {
  const { user } = useStore()
  const [data, setData] = useState(null)
  const [counted, setCounted] = useState('')
  const [recon, setRecon] = useState(null)

  const load = () => api('/rider/route').then(setData).catch(() => setData(false))
  useEffect(() => { if (user) load() }, [user])

  if (!user) {
    return (
      <div className="container">
        <div className="panel mt24" style={{ padding: 40, textAlign: 'center' }}>
          <h2 style={{ marginBottom: 8 }}>Rider route</h2>
          <p className="muted" style={{ marginBottom: 18 }}>Sign in with the rider account to open today's route.</p>
          <Link to="/signin?next=/rider" className="btn btn-primary">Sign in</Link>
        </div>
      </div>
    )
  }
  if (!data) return <div className="container" style={{ padding: 30 }}><div className="skeleton" style={{ height: 300, borderRadius: 10 }} /></div>
  if (data === false) return <div className="container"><Empty title="No route assigned to this account" /></div>

  const closeRoute = async () => {
    try {
      const r = await api('/rider/reconcile', { method: 'POST', body: { counted: Number(counted) || 0 } })
      setRecon(r)
      load()
    } catch (e) { setRecon({ message: e.message }) }
  }

  return (
    <div className="container" style={{ maxWidth: 880 }}>
      <div className="row-between wrap" style={{ margin: '20px 0 14px', gap: 12 }}>
        <div>
          <div className="eyebrow" style={{ color: 'var(--saffron-2)' }}>Rider · {data.date}</div>
          <h1 style={{ fontSize: 24 }}>{data.route?.name}</h1>
          <div className="tiny muted">
            {data.rider.name} · {data.rider.vehicle} {data.rider.plate} · float limit P{money(data.rider.floatLimit)}
          </div>
        </div>
        <span className="badge badge-navy">{data.summary.remaining} stops left</span>
      </div>

      <div className="kpi-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
        <Kpi label="Stops left" value={data.summary.remaining} sub={`${data.summary.total} on the route`} accent />
        <Kpi label="Cash to collect" value={`P${money(data.summary.cashDue)}`} sub="COD stops only" />
        <Kpi label="Delivered" value={data.summary.delivered} sub="today" />
        <Kpi label="First attempt" value={`${data.summary.successPct}%`} sub="target 93%" />
      </div>

      <div className="panel mt16">
        <div className="panel-body" style={{ padding: '14px 16px' }}>
          <div className="row-between" style={{ marginBottom: 8 }}>
            <span className="tiny" style={{ fontWeight: 700 }}>Route progress</span>
            <span className="tiny muted">{data.summary.delivered} of {data.summary.total}</span>
          </div>
          <div className="progress" style={{ height: 8, background: 'var(--line-2)' }}>
            <div style={{ width: `${data.summary.total ? (data.summary.delivered / data.summary.total) * 100 : 0}%` }} />
          </div>
          <div className="tiny muted mt8">
            The route works from cache if the signal drops. Every failure is logged with a reason, and the
            customer is messaged automatically — no one has to remember to call.
          </div>
        </div>
      </div>

      <div className="section-head" style={{ margin: '22px 0 12px' }}>
        <div className="section-title">Today's stops</div>
        <span className="tiny muted">in route order</span>
      </div>

      {data.stops.map((s) => <Stop key={s.deliveryId} stop={s} reasons={data.reasons} onDone={load} />)}

      <div className="panel mt16" style={{ borderColor: 'var(--navy-2)' }}>
        <div className="panel-head"><h3>Close the route · cash reconciliation</h3></div>
        <div className="panel-body">
          <div className="summary-row"><span>Collected today (COD)</span><b>P{money(data.summary.cashCollected)}</b></div>
          <div className="summary-row"><span>Float limit</span><b>P{money(data.rider.floatLimit)}</b></div>
          <div className="field mt12">
            <span className="label">Counted in hand (P)</span>
            <input className="input" type="number" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="0.00" />
            <span className="hint">Deposit within 24 hours. A variance above the float limit blocks tomorrow's route.</span>
          </div>
          <button className="btn btn-dark" onClick={closeRoute} disabled={counted === ''}>Reconcile and close route</button>

          {recon && (
            <div className="mt16" style={{
              background: recon.reconciliation && recon.reconciliation.variance === 0 ? 'var(--green-soft)' : 'var(--amber-soft)',
              border: `1px solid ${recon.reconciliation && recon.reconciliation.variance === 0 ? '#cfe9de' : '#f3e0b8'}`,
              borderRadius: 9, padding: 12, fontSize: 13,
            }}>
              {recon.message}
            </div>
          )}

          {data.reconciliation && !recon && (
            <div className="tiny muted mt12">
              Last reconciliation: expected P{money(data.reconciliation.expected)} · counted P{money(data.reconciliation.counted)} · variance P{money(data.reconciliation.variance)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
