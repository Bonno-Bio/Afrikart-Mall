import express from 'express'
import path from 'node:path'
import crypto from 'node:crypto'
import fs from 'node:fs'
import { db, persist, verifyPassword, hashPassword, nextOrderId, nextReviewId } from './db.js'

const app = express()
const PORT = process.env.PORT || 3000
const DAY = 86400000

app.use(express.json({ limit: '1mb' }))

// ---------------------------------------------------------------- sessions
function parseCookies(req) {
  const out = {}
  const raw = req.headers.cookie
  if (!raw) return out
  for (const part of raw.split(';')) {
    const i = part.indexOf('=')
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

app.use((req, res, next) => {
  const token = parseCookies(req).ak_session
  req.user = token && db.sessions[token] ? db.users.find((u) => u.id === db.sessions[token]) : null
  req.token = token
  next()
})

function requireUser(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in to continue.' })
  next()
}
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Please sign in.' })
    if (role === 'seller' && !['seller', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Seller account required.' })
    if (role === 'admin' && req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required.' })
    if (role === 'rider' && !['rider', 'admin'].includes(req.user.role)) return res.status(403).json({ error: 'Rider access required.' })
    next()
  }
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, sellerId: u.sellerId || null, addresses: u.addresses || [], joined: u.joined })

// ---------------------------------------------------------------- view helpers
const catOf = (p) => db.categories.find((c) => c.slug === p.category)
const sellerOf = (p) => db.sellers.find((s) => s.id === p.sellerId)

function card(p) {
  const c = catOf(p)
  const s = sellerOf(p)
  return {
    id: p.id, title: p.title, brand: p.brand, price: p.price, listPrice: p.listPrice,
    rating: p.rating, ratingCount: p.ratingCount, stock: p.stock, express: p.express,
    deal: p.deal, category: p.category, categoryName: c?.name || '', glyph: c?.glyph || 'box',
    seller: s ? { id: s.id, name: s.name, rating: s.rating, city: s.city, fulfilment: s.fulfilment } : null,
    bullets: p.bullets, sold: p.sold,
  }
}

function full(p) {
  const c = catOf(p)
  const s = sellerOf(p)
  return {
    ...card(p),
    description: p.description, tags: p.tags, status: p.status, views: p.views,
    createdAt: p.createdAt,
    seller: s ? { ...s } : null,
    categoryBlurb: c?.blurb || '',
  }
}

const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)

function deliveryOptions(subtotal, city) {
  const gabs = /gaborone|tlokweng|mogoditshane/i.test(city || '')
  return [
    { id: 'express', label: 'Afrikart Express', eta: gabs ? 'Tomorrow, 08:00-13:00' : '2-3 working days', fee: subtotal >= 400 ? 0 : 30, note: 'Our own rider. Tracked door to door, free over P400.' },
    { id: 'standard', label: 'Standard courier', eta: gabs ? '2 working days' : '3-5 working days', fee: 20, note: 'Sprint Couriers, tracked.' },
    { id: 'pickup', label: 'Collect at a pickup point', eta: gabs ? 'Tomorrow after 14:00' : '3-5 working days', fee: 10, note: '9 points in Gaborone, 7 upcountry. Cheapest option.' },
    { id: 'intercity', label: 'Intercity combi', eta: '2-4 working days', fee: 45, note: 'For bulky items to villages. Driver calls on arrival at the rank.' },
  ]
}

const PAYMENTS = [
  { id: 'card', label: 'Card (Visa / Mastercard)', note: 'Processed by a Bank of Botswana licensed PSP. 3-D Secure.' },
  { id: 'orange', label: 'Orange Money', note: 'You will get a prompt on your phone to approve.' },
  { id: 'myzaka', label: 'MyZaka (Mascom)', note: 'You will get a prompt on your phone to approve.' },
  { id: 'smega', label: 'Smega (BotswanaPost)', note: 'Approve at any BotswanaPost branch or on the app.' },
  { id: 'cod', label: 'Cash on Delivery', note: 'Gaborone only. P15 handling fee. Pay the rider on arrival.' },
]

function restockEta(stock) {
  if (stock > 12) return 'In stock'
  if (stock > 0) return `Only ${stock} left`
  return 'Out of stock'
}

// ---------------------------------------------------------------- auth
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {}
  const user = db.users.find((u) => u.email.toLowerCase() === String(email || '').toLowerCase())
  if (!user || !verifyPassword(String(password || ''), user.salt, user.hash)) {
    return res.status(401).json({ error: 'That email and password combination is not right.' })
  }
  const token = crypto.randomBytes(24).toString('hex')
  db.sessions[token] = user.id
  persist()
  res.setHeader('Set-Cookie', `ak_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`)
  res.json({ user: publicUser(user) })
})

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body || {}
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required.' })
  if (String(password).length < 8) return res.status(400).json({ error: 'Use at least 8 characters for the password.' })
  if (db.users.some((u) => u.email.toLowerCase() === String(email).toLowerCase())) {
    return res.status(409).json({ error: 'That email is already registered. Try signing in.' })
  }
  const { salt, hash } = hashPassword(String(password))
  const user = { id: 'u' + Date.now(), name, email, role: 'customer', salt, hash, joined: Date.now(), addresses: [] }
  db.users.push(user)
  const token = crypto.randomBytes(24).toString('hex')
  db.sessions[token] = user.id
  persist()
  res.setHeader('Set-Cookie', `ak_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800`)
  res.json({ user: publicUser(user) })
})

app.post('/api/auth/logout', (req, res) => {
  if (req.token) delete db.sessions[req.token]
  persist()
  res.setHeader('Set-Cookie', 'ak_session=; Path=/; HttpOnly; Max-Age=0')
  res.json({ ok: true })
})

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null })
})

app.post('/api/account/addresses', requireUser, (req, res) => {
  const { label, name, line1, line2, city, phone } = req.body || {}
  if (!line1 || !city) return res.status(400).json({ error: 'Street address and town are required.' })
  req.user.addresses = req.user.addresses || []
  const addr = { id: 'a' + Date.now(), label: label || 'Address', name: name || req.user.name, line1, line2: line2 || '', city, phone: phone || '', default: req.user.addresses.length === 0 }
  req.user.addresses.push(addr)
  persist()
  res.json({ addresses: req.user.addresses })
})

// ---------------------------------------------------------------- browse
app.get('/api/meta', (req, res) => {
  res.json({ categories: db.categories, payments: PAYMENTS, deliveryFailureReasons: db.deliveryFailureReasons, deliveryOptions: deliveryOptions(0, 'Gaborone') })
})

app.get('/api/home', (req, res) => {
  const live = db.products.filter((p) => p.status === 'live')
  const deals = live.filter((p) => p.deal).slice(0, 8)
  const best = [...live].sort((a, b) => b.sold - a.sold).slice(0, 8)
  const rails = db.categories.map((c) => ({
    category: c,
    products: live.filter((p) => p.category === c.slug).sort((a, b) => b.sold - a.sold).slice(0, 4),
  }))
  const recent = req.user
    ? [...new Set(db.orders.filter((o) => o.userId === req.user.id).flatMap((o) => o.items.map((i) => i.productId)))]
        .slice(0, 6)
        .map((id) => db.products.find((p) => p.id === id))
        .filter(Boolean)
        .map(card)
    : []
  res.json({
    deals: deals.map(card),
    bestSellers: best.map(card),
    rails: rails.map((r) => ({ category: r.category, products: r.products.map(card) })),
    buyAgain: recent,
    stats: {
      products: live.length,
      sellers: db.sellers.filter((s) => s.status === 'approved').length,
      pickupPoints: 16,
    },
  })
})

function scoreProduct(p, terms) {
  const hay = `${p.title} ${p.brand} ${(p.tags || []).join(' ')} ${p.description}`.toLowerCase()
  let score = 0
  for (const t of terms) {
    if (p.title.toLowerCase().includes(t)) score += 6
    if (String(p.brand).toLowerCase().includes(t)) score += 3
    if ((p.tags || []).some((tag) => tag.includes(t))) score += 3
    if (hay.includes(t)) score += 1
  }
  return score
}

app.get('/api/search', (req, res) => {
  const { q = '', category = '', min, max, rating, sort = 'relevance', express, deal, page = 1 } = req.query
  const terms = String(q).toLowerCase().split(/\s+/).filter(Boolean)
  let list = db.products.filter((p) => p.status === 'live')

  if (category) list = list.filter((p) => p.category === category)
  if (express === '1') list = list.filter((p) => p.express)
  if (deal === '1') list = list.filter((p) => p.deal)
  if (min) list = list.filter((p) => p.price >= Number(min))
  if (max) list = list.filter((p) => p.price <= Number(max))
  if (rating) list = list.filter((p) => p.rating >= Number(rating))

  if (terms.length) {
    const scored = list.map((p) => ({ p, s: scoreProduct(p, terms) })).filter((x) => x.s > 0)
    scored.sort((a, b) => b.s - a.s || b.p.sold - a.p.sold)
    list = scored.map((x) => x.p)
  }

  if (sort === 'price-asc') list.sort((a, b) => a.price - b.price)
  if (sort === 'price-desc') list.sort((a, b) => b.price - a.price)
  if (sort === 'rating') list.sort((a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount)
  if (sort === 'newest') list.sort((a, b) => b.createdAt - a.createdAt)
  if (sort === 'popular') list.sort((a, b) => b.sold - a.sold)
  if (sort === 'relevance' && !terms.length) list.sort((a, b) => b.sold - a.sold)

  const perPage = 12
  const pg = Math.max(1, Number(page) || 1)
  const total = list.length
  const slice = list.slice((pg - 1) * perPage, pg * perPage)

  const facet = db.categories.map((c) => ({
    slug: c.slug, name: c.name,
    count: db.products.filter((p) => p.status === 'live' && p.category === c.slug && (!terms.length || scoreProduct(p, terms) > 0)).length,
  })).filter((f) => f.count > 0)

  res.json({
    total, page: pg, pages: Math.max(1, Math.ceil(total / perPage)),
    results: slice.map(card),
    facets: facet,
    query: q,
  })
})

app.get('/api/suggest', (req, res) => {
  const q = String(req.query.q || '').toLowerCase().trim()
  if (!q) return res.json({ suggestions: [] })
  const terms = q.split(/\s+/)
  const titles = db.products
    .filter((p) => p.status === 'live')
    .map((p) => ({ title: p.title, score: scoreProduct(p, terms) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 7)
    .map((x) => x.title)
  const cats = db.categories.filter((c) => c.name.toLowerCase().includes(q)).map((c) => c.name)
  res.json({ suggestions: [...cats, ...titles].slice(0, 8) })
})

// ---------------------------------------------------------------- product page
app.get('/api/products/:slug', (req, res) => {
  const p = db.products.find((x) => x.id === req.params.slug)
  if (!p) return res.status(404).json({ error: 'Product not found' })

  // customers-also-bought: co-occurrence in real orders, not a fake carousel
  const mine = new Set([p.id])
  const co = {}
  for (const o of db.orders) {
    if (!o.items.some((i) => i.productId === p.id)) continue
    for (const i of o.items) {
      if (i.productId !== p.id) co[i.productId] = (co[i.productId] || 0) + 1
    }
  }
  let alsoBought = Object.entries(co).sort((a, b) => b[1] - a[1]).slice(0, 4)
  if (alsoBought.length < 4) {
    const filler = db.products
      .filter((x) => x.category === p.category && !mine.has(x.id) && !co[x.id])
      .sort((a, b) => b.sold - a.sold)
      .slice(0, 4 - alsoBought.length)
      .map((x) => [x.id, 0])
    alsoBought = [...alsoBought, ...filler]
  }
  const alsoBoughtProducts = alsoBought.map(([id]) => db.products.find((x) => x.id === id)).filter(Boolean).map(card)

  const reviews = db.reviews.filter((r) => r.productId === p.id).sort((a, b) => b.helpful - a.helpful)
  const dist = [5, 4, 3, 2, 1].map((star) => ({ star, count: reviews.filter((r) => r.rating === star).length }))

  const related = db.products.filter((x) => x.category === p.category && x.id !== p.id && x.status === 'live').slice(0, 4).map(card)

  const sellerRisk = db.products.filter((x) => x.sellerId === p.sellerId).length

  res.json({
    product: full(p),
    reviews: reviews.slice(0, 8),
    reviewTotal: reviews.length,
    distribution: dist,
    alsoBought: alsoBoughtProducts,
    related,
    sellerCatalogue: sellerRisk,
    stockLine: restockEta(p.stock),
    delivery: deliveryOptions(p.price, 'Gaborone'),
  })
})

app.post('/api/products/:id/reviews', requireUser, (req, res) => {
  const p = db.products.find((x) => x.id === req.params.id)
  if (!p) return res.status(404).json({ error: 'Product not found' })
  const { rating, title, body } = req.body || {}
  const r = Number(rating)
  if (!(r >= 1 && r <= 5)) return res.status(400).json({ error: 'Choose a rating between 1 and 5.' })
  if (!body || String(body).trim().length < 10) return res.status(400).json({ error: 'Please write at least a sentence.' })

  const bought = db.orders.some((o) => o.userId === req.user.id && o.items.some((i) => i.productId === p.id) && o.status === 'delivered')
  const review = {
    id: nextReviewId(), productId: p.id, userId: req.user.id, author: req.user.name,
    rating: r, title: title || '', body: String(body).trim(), verified: bought,
    helpful: 0, date: Date.now(),
  }
  db.reviews.push(review)
  const all = db.reviews.filter((x) => x.productId === p.id)
  p.rating = +avg(all.map((x) => x.rating)).toFixed(1)
  p.ratingCount = all.length
  persist()
  res.json({ review })
})

// ---------------------------------------------------------------- checkout + orders
app.post('/api/checkout/quote', (req, res) => {
  const { items = [], city = 'Gaborone', paymentMethod = 'card' } = req.body || {}
  const lines = items.map((i) => {
    const p = db.products.find((x) => x.id === i.productId)
    return p ? { productId: p.id, title: p.title, price: p.price, qty: i.qty, sellerId: p.sellerId, express: p.express } : null
  }).filter(Boolean)
  const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0)
  const options = deliveryOptions(subtotal, city)
  const chosen = options.find((o) => o.id === 'express') || options[0]
  const codFee = paymentMethod === 'cod' ? 15 : 0
  res.json({
    lines, subtotal,
    deliveryOptions: options,
    recommended: chosen.id,
    vat: +(subtotal * 0.14 / 1.14).toFixed(2),
    codFee,
    freeShippingThreshold: 400,
  })
})

app.post('/api/orders', requireUser, (req, res) => {
  const { items = [], address = {}, deliveryMethod = 'express', paymentMethod = 'card' } = req.body || {}
  if (!items.length) return res.status(400).json({ error: 'Your cart is empty.' })
  if (address?.city && /gaborone|tlokweng|mogoditshane/i.test(address.city) === false && paymentMethod === 'cod') {
    return res.status(400).json({ error: 'Cash on delivery is only available in Gaborone, Tlokweng and Mogoditshane for now.' })
  }
  if (paymentMethod === 'cod' && !/gaborone|tlokweng|mogoditshane/i.test(address.city || 'Gaborone')) {
    return res.status(400).json({ error: 'Cash on delivery is only available in Gaborone, Tlokweng and Mogoditshane for now.' })
  }

  const lines = []
  for (const i of items) {
    const p = db.products.find((x) => x.id === i.productId)
    if (!p) return res.status(400).json({ error: 'One of the items is no longer available.' })
    if (p.stock < i.qty) return res.status(409).json({ error: `Only ${p.stock} of "${p.title}" left.` })
    lines.push({ productId: p.id, sellerId: p.sellerId, title: p.title, price: p.price, qty: i.qty })
  }
  const subtotal = lines.reduce((a, l) => a + l.price * l.qty, 0)
  const opts = deliveryOptions(subtotal, address.city)
  const method = opts.find((o) => o.id === deliveryMethod) || opts[0]
  const codFee = paymentMethod === 'cod' ? 15 : 0
  const total = subtotal + method.fee + codFee

  for (const l of lines) {
    const p = db.products.find((x) => x.id === l.productId)
    p.stock -= l.qty
    p.sold += l.qty
  }

  const order = {
    id: nextOrderId(),
    userId: req.user.id,
    items: lines,
    subtotal,
    deliveryFee: method.fee,
    codFee,
    deliveryMethod: method.label,
    total,
    status: paymentMethod === 'cod' ? 'placed' : 'packed',
    placedAt: Date.now(),
    address: { name: address.name || req.user.name, line1: address.line1 || '', line2: address.line2 || '', city: address.city || 'Gaborone', phone: address.phone || '' },
    paymentMethod: PAYMENTS.find((p) => p.id === paymentMethod)?.label || 'Card',
    timeline: [
      { at: Date.now(), label: 'Order placed', detail: `Payment: ${PAYMENTS.find((p) => p.id === paymentMethod)?.label || 'Card'}` },
      ...(paymentMethod === 'cod' ? [] : [{ at: Date.now(), label: 'Payment captured', detail: 'Funds held by Afrikart until delivery' }]),
      ...(paymentMethod === 'cod' ? [] : [{ at: Date.now() + 60000, label: 'Packed', detail: 'Gaborone fulfilment centre' }]),
    ],
  }
  db.orders.unshift(order)
  persist()
  res.json({ order })
})

app.get('/api/orders', requireUser, (req, res) => {
  const mine = db.orders.filter((o) => o.userId === req.user.id)
  res.json({ orders: mine })
})

app.get('/api/orders/:id', requireUser, (req, res) => {
  const o = db.orders.find((x) => x.id === req.params.id)
  if (!o) return res.status(404).json({ error: 'Order not found' })
  if (o.userId !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'That order is not yours.' })
  res.json({ order: o })
})

app.post('/api/orders/:id/action', requireUser, (req, res) => {
  const o = db.orders.find((x) => x.id === req.params.id)
  if (!o) return res.status(404).json({ error: 'Order not found' })
  if (o.userId !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'That order is not yours.' })
  const { action } = req.body || {}
  if (action === 'cancel') {
    if (!['placed', 'packed'].includes(o.status)) return res.status(400).json({ error: 'This order has already been dispatched and can no longer be cancelled. Request a return instead.' })
    o.status = 'cancelled'
    for (const i of o.items) {
      const p = db.products.find((x) => x.id === i.productId)
      if (p) { p.stock += i.qty; p.sold = Math.max(0, p.sold - i.qty) }
    }
    o.timeline.push({ at: Date.now(), label: 'Cancelled', detail: 'Cancelled before dispatch. Refund issued to the original payment method.' })
  } else if (action === 'return') {
    if (o.status !== 'delivered') return res.status(400).json({ error: 'You can only return an order once it has been delivered.' })
    o.status = 'returned'
    o.timeline.push({ at: Date.now(), label: 'Return requested', detail: 'A rider will collect within 2 working days. Refund on inspection.' })
  } else {
    return res.status(400).json({ error: 'Unknown action.' })
  }
  persist()
  res.json({ order: o })
})

// ---------------------------------------------------------------- seller central
app.get('/api/seller/summary', requireRole('seller'), (req, res) => {
  const sellerId = req.user.sellerId || 's1'
  const seller = db.sellers.find((s) => s.id === sellerId)
  const mine = db.products.filter((p) => p.sellerId === sellerId)
  const ids = new Set(mine.map((p) => p.id))
  const orders = db.orders.filter((o) => o.items.some((i) => ids.has(i.productId) && ['delivered', 'dispatched', 'packed', 'placed'].includes(o.status)))

  const revenue = (o) => o.items.filter((i) => ids.has(i.productId)).reduce((a, i) => a + i.price * i.qty, 0)
  const gmv = orders.reduce((a, o) => a + revenue(o), 0)
  const commissionRate = 0.12
  const fulfilmentRate = seller?.fulfilment === 'Afrikart Fulfilment' ? 0.06 : 0
  const platformFees = +(gmv * (commissionRate + fulfilmentRate)).toFixed(2)
  const payout = +(gmv - platformFees).toFixed(2)

  const units = orders.reduce((a, o) => a + o.items.filter((i) => ids.has(i.productId)).reduce((x, i) => x + i.qty, 0), 0)
  const pending = db.orders.filter((o) => o.status === 'placed' && o.items.some((i) => ids.has(i.productId)))
  const views = mine.reduce((a, p) => a + p.views, 0)
  const conversion = views ? (units / views) * 100 : 0

  const top = [...mine].sort((a, b) => b.sold - a.sold).slice(0, 5).map((p) => ({
    id: p.id, title: p.title, sold: p.sold, stock: p.stock, price: p.price, rating: p.rating, revenue: p.sold * p.price,
  }))

  const lowStock = mine.filter((p) => p.stock <= 12).map((p) => ({ id: p.id, title: p.title, stock: p.stock }))

  // 14-day sales series
  const series = []
  for (let d = 13; d >= 0; d--) {
    const start = Date.now() - d * DAY
    const end = start + DAY
    const dayOrders = orders.filter((o) => o.placedAt >= start && o.placedAt < end)
    series.push({ day: new Date(start).toISOString().slice(5, 10), value: dayOrders.reduce((a, o) => a + revenue(o), 0) })
  }

  res.json({
    seller,
    kpis: {
      gmv: +gmv.toFixed(2),
      orders: orders.length,
      units,
      aov: orders.length ? +(gmv / orders.length).toFixed(2) : 0,
      payout,
      platformFees,
      pendingCount: pending.length,
      conversion: +conversion.toFixed(1),
      rating: seller?.rating || 0,
      liveListings: mine.filter((p) => p.status === 'live').length,
    },
    top, lowStock, series,
    pendingOrders: pending.slice(0, 6),
    recentOrders: orders.slice(0, 8).map((o) => ({
      id: o.id, placedAt: o.placedAt, status: o.status,
      value: revenue(o),
      items: o.items.filter((i) => ids.has(i.productId)).map((i) => ({ title: i.title, qty: i.qty })),
    })),
    feeSchedule: { commissionRate, fulfilmentRate, note: 'Commission 12% of item value. Afrikart Fulfilment adds 6% and covers storage, packing and last mile.' },
  })
})

app.get('/api/seller/products', requireRole('seller'), (req, res) => {
  const sellerId = req.user.sellerId || 's1'
  const mine = db.products.filter((p) => p.sellerId === sellerId)
  res.json({ products: mine.map((p) => ({ ...card(p), status: p.status, views: p.views })) })
})

app.post('/api/seller/products', requireRole('seller'), (req, res) => {
  const sellerId = req.user.sellerId || 's1'
  const { title, price, stock, category, description, bullets } = req.body || {}
  if (!title || !price || !category) return res.status(400).json({ error: 'Title, price and category are required.' })
  const p = {
    id: 'p' + Date.now(),
    title, brand: db.sellers.find((s) => s.id === sellerId)?.name || 'Afrikart Seller',
    category, sellerId,
    price: Number(price), listPrice: null,
    stock: Number(stock) || 0,
    express: false, deal: false,
    tags: [],
    bullets: Array.isArray(bullets) ? bullets.filter(Boolean) : [],
    description: description || '',
    rating: 0, ratingCount: 0, sold: 0, createdAt: Date.now(), status: 'live', views: 0,
  }
  db.products.push(p)
  persist()
  res.json({ product: full(p) })
})

app.patch('/api/seller/products/:id', requireRole('seller'), (req, res) => {
  const sellerId = req.user.sellerId || 's1'
  const p = db.products.find((x) => x.id === req.params.id && x.sellerId === sellerId)
  if (!p) return res.status(404).json({ error: 'Listing not found in your catalogue.' })
  const { price, stock, status, title } = req.body || {}
  if (price != null) p.price = Number(price)
  if (stock != null) p.stock = Number(stock)
  if (status) p.status = status
  if (title) p.title = title
  persist()
  res.json({ product: full(p) })
})

app.delete('/api/seller/products/:id', requireRole('seller'), (req, res) => {
  const sellerId = req.user.sellerId || 's1'
  const i = db.products.findIndex((x) => x.id === req.params.id && x.sellerId === sellerId)
  if (i === -1) return res.status(404).json({ error: 'Listing not found.' })
  db.products.splice(i, 1)
  persist()
  res.json({ ok: true })
})

app.post('/api/seller/orders/:id/fulfil', requireRole('seller'), (req, res) => {
  const o = db.orders.find((x) => x.id === req.params.id)
  if (!o) return res.status(404).json({ error: 'Order not found' })
  o.status = 'dispatched'
  o.timeline.push({ at: Date.now(), label: 'Dispatched by seller', detail: 'Handed to Afrikart rider' })
  persist()
  res.json({ order: o })
})


// ---------------------------------------------------------------- rider
function riderFor(user) {
  return db.riders.find((r) => r.userId === user.id) || db.riders[0]
}

function stopView(d) {
  const o = db.orders.find((x) => x.id === d.orderId)
  const route = db.routes.find((r) => r.id === d.routeId)
  const cash = d.cashDueMinor != null ? d.cashDueMinor : (/Cash/i.test(o?.paymentMethod || '') ? (o?.total || 0) * 100 : 0)
  return {
    deliveryId: d.id,
    sequence: d.sequence,
    status: d.status,
    orderNumber: o?.id,
    customerName: o?.address?.name || 'Customer',
    line1: o?.address?.line1 || '',
    city: o?.address?.city || '',
    phone: o?.address?.phone || '',
    items: o?.items?.length || 0,
    itemPreview: o?.items?.[0]?.title || '',
    cashDue: cash / 100,
    cashCollected: (d.cashCollectedMinor || 0) / 100,
    reasonCode: d.failureReasonCode,
    routeName: route?.name || '',
    deliveredAt: d.deliveredAt,
  }
}

app.get('/api/rider/route', requireRole('rider'), (req, res) => {
  const rider = riderFor(req.user)
  const today = new Date().toISOString().slice(0, 10)
  const mine = db.deliveries.filter((d) => d.riderId === rider.id)
  const open = mine.filter((d) => !['delivered', 'failed', 'returned_to_hub'].includes(d.status))
  const done = mine.filter((d) => d.status === 'delivered')

  const cashDue = open.reduce((a, d) => a + (stopView(d).cashDue || 0), 0)
  const cashCollected = done.reduce((a, d) => a + ((d.cashCollectedMinor || 0) / 100), 0)
  const attempts = mine.length
  const first = done.length

  const recon = db.cashReconciliations.filter((r) => r.riderId === rider.id && r.businessDate === today).pop()

  res.json({
    rider: { id: rider.id, name: rider.name, vehicle: rider.vehicle, plate: rider.plate, floatLimit: rider.cashFloatLimitMinor / 100 },
    route: db.routes.find((r) => r.id === 'rt1'),
    date: today,
    stops: [...open, ...done].sort((a, b) => a.sequence - b.sequence).map(stopView),
    reasons: db.deliveryFailureReasons,
    summary: {
      total: attempts,
      delivered: first,
      remaining: open.length,
      cashDue,
      cashCollected,
      successPct: attempts ? Math.round((first / attempts) * 100) : 0,
    },
    reconciliation: recon || null,
  })
})

app.post('/api/rider/deliveries/:id/attempt', requireRole('rider'), (req, res) => {
  const d = db.deliveries.find((x) => x.id === req.params.id)
  if (!d) return res.status(404).json({ error: 'Delivery not found' })
  const { outcome, reasonCode, note, cashCollected } = req.body || {}

  if (outcome === 'failed' && !reasonCode) {
    return res.status(400).json({ error: 'A failure reason is required. Nothing is logged without one.' })
  }
  if (outcome === 'failed' && !db.deliveryFailureReasons.some((r) => r.code === reasonCode)) {
    return res.status(400).json({ error: 'Unknown reason code.' })
  }

  const o = db.orders.find((x) => x.id === d.orderId)
  const nowTs = Date.now()
  d.attemptCount = (d.attemptCount || 0) + 1
  if (!d.firstAttemptAt) d.firstAttemptAt = nowTs

  if (outcome === 'delivered') {
    d.status = 'delivered'
    d.deliveredAt = nowTs
    d.proofPhotoUrl = 'proof.jpg'
    d.cashCollectedMinor = Math.round((Number(cashCollected) || 0) * 100)
    if (o) {
      o.status = 'delivered'
      o.timeline.push({ at: nowTs, label: 'Delivered', detail: 'Handed to the customer at the door (proof photo captured)' })
    }
    // seller payable becomes releasable only now — not on payment
    persist()
    return res.json({ ok: true, stop: stopView(d), note: 'Seller payable for these lines is now releasable.' })
  }

  d.status = 'failed'
  d.failureReasonCode = reasonCode
  d.failureNote = note || null
  const label = db.deliveryFailureReasons.find((r) => r.code === reasonCode)?.label
  if (o) {
    o.status = 'packed'
    o.timeline.push({ at: nowTs, label: 'Delivery failed', detail: `${label}${note ? ' — ' + note : ''}` })
  }
  persist()
  return res.json({ ok: true, stop: stopView(d), note: `Logged as ${reasonCode}. The customer is told automatically.` })
})

app.post('/api/rider/reconcile', requireRole('rider'), (req, res) => {
  const rider = riderFor(req.user)
  const today = new Date().toISOString().slice(0, 10)
  const counted = Number(req.body?.countedMinor != null ? req.body.countedMinor / 100 : req.body?.counted || 0)
  const expected = db.deliveries
    .filter((d) => d.riderId === rider.id && d.status === 'delivered')
    .reduce((a, d) => a + ((d.cashCollectedMinor || 0) / 100), 0)
  const variance = +(counted - expected).toFixed(2)
  const record = {
    id: 'cr' + Date.now(), riderId: rider.id, businessDate: today,
    expected, counted, variance, at: Date.now(),
  }
  db.cashReconciliations.push(record)
  persist()
  res.json({
    reconciliation: record,
    blocked: Math.abs(variance) > rider.cashFloatLimitMinor / 100,
    message: variance === 0
      ? 'Balanced. Nothing outstanding.'
      : `Variance of P${Math.abs(variance).toFixed(2)}. ${Math.abs(variance) > rider.cashFloatLimitMinor / 100 ? 'Above the float limit — tomorrow’s route is blocked until this is resolved.' : 'Investigate today.'}`,
  })
})

// ---------------------------------------------------------------- admin
app.get('/api/admin/summary', requireRole('admin'), (req, res) => {
  const all = db.orders
  const live = all.filter((o) => !['cancelled', 'returned'].includes(o.status))
  const gmv = live.reduce((a, o) => a + o.subtotal, 0)
  const deliveryRev = live.reduce((a, o) => a + (o.deliveryFee || 0), 0)
  const commission = +(gmv * 0.12).toFixed(2)
  const fulfilmentFees = +live.reduce((a, o) => {
    return a + o.items.reduce((x, i) => {
      const s = db.sellers.find((s) => s.id === i.sellerId)
      return x + (s?.fulfilment === 'Afrikart Fulfilment' ? i.price * i.qty * 0.06 : 0)
    }, 0)
  }, 0).toFixed(2)

  const byCategory = db.categories.map((c) => {
    const ids = new Set(db.products.filter((p) => p.category === c.slug).map((p) => p.id))
    const v = live.reduce((a, o) => a + o.items.filter((i) => ids.has(i.productId)).reduce((x, i) => x + i.price * i.qty, 0), 0)
    return { slug: c.slug, name: c.name, gmv: +v.toFixed(2) }
  }).sort((a, b) => b.gmv - a.gmv)

  const sellerBoard = db.sellers.map((s) => {
    const v = live.reduce((a, o) => a + o.items.filter((i) => i.sellerId === s.id).reduce((x, i) => x + i.price * i.qty, 0), 0)
    return { id: s.id, name: s.name, city: s.city, status: s.status, fulfilment: s.fulfilment, gmv: +v.toFixed(2) }
  }).sort((a, b) => b.gmv - a.gmv)

  const series = []
  for (let d = 13; d >= 0; d--) {
    const start = Date.now() - d * DAY
    const end = start + DAY
    series.push({ day: new Date(start).toISOString().slice(5, 10), value: live.filter((o) => o.placedAt >= start && o.placedAt < end).reduce((a, o) => a + o.subtotal, 0) })
  }

  const failed = all.filter((o) => o.status === 'returned').length
  const failureRate = all.length ? (failed / all.length) * 100 : 0

  res.json({
    kpis: {
      gmv: +gmv.toFixed(2),
      orders: all.length,
      aov: live.length ? +(gmv / live.length).toFixed(2) : 0,
      customers: db.users.filter((u) => u.role === 'customer').length,
      sellers: db.sellers.filter((s) => s.status === 'approved').length,
      pendingSellers: db.sellers.filter((s) => s.status === 'pending').length,
      commission, fulfilmentFees, deliveryRev: +deliveryRev.toFixed(2),
      takeRate: gmv ? +(((commission + fulfilmentFees + deliveryRev) / gmv) * 100).toFixed(1) : 0,
      failureRate: +failureRate.toFixed(1),
      listings: db.products.filter((p) => p.status === 'live').length,
    },
    byCategory, sellerBoard, series,
    pendingSellers: db.sellers.filter((s) => s.status === 'pending'),
    latestOrders: all.slice(0, 10),
  })
})

app.post('/api/admin/sellers/:id/approve', requireRole('admin'), (req, res) => {
  const s = db.sellers.find((x) => x.id === req.params.id)
  if (!s) return res.status(404).json({ error: 'Seller not found' })
  s.status = 'approved'
  persist()
  res.json({ seller: s })
})

app.patch('/api/admin/products/:id', requireRole('admin'), (req, res) => {
  const p = db.products.find((x) => x.id === req.params.id)
  if (!p) return res.status(404).json({ error: 'Product not found' })
  const { status } = req.body || {}
  if (status) p.status = status
  persist()
  res.json({ product: full(p) })
})

// ---------------------------------------------------------------- static app
const dist = path.join(process.cwd(), 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')))
}

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' })
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Afrikart Mall running on http://0.0.0.0:${PORT}`)
})
