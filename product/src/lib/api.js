export async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Something went wrong.')
  return data
}

export const money = (n) =>
  Number(n || 0).toLocaleString('en-BW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const money0 = (n) => 'P' + Math.round(Number(n || 0)).toLocaleString('en-BW')

export function priceParts(n) {
  const [int, dec] = money(n).split('.')
  return { int, dec }
}

export const dateShort = (ts) =>
  new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })

export const dateTime = (ts) =>
  new Date(ts).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export const discountPct = (price, list) => (list && list > price ? Math.round((1 - price / list) * 100) : 0)

export const statusTone = (s) =>
  ({ placed: 'amber', packed: 'navy', dispatched: 'navy', delivered: 'green', cancelled: 'grey', returned: 'red' }[s] || 'grey')

export const statusLabel = (s) =>
  ({ placed: 'Order placed', packed: 'Packed', dispatched: 'Out for delivery', delivered: 'Delivered', cancelled: 'Cancelled', returned: 'Returned' }[s] || s)
