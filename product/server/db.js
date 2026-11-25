import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { categories, sellers, products, reviewSeeds } from './seed.js'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_FILE = path.join(DATA_DIR, 'db.json')

// Deterministic pseudo-random so the demo catalogue and demo orders are stable
// across restarts. Same seed -> same shop.
function prng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 32).toString('hex')
  return { salt, hash }
}

export function verifyPassword(password, salt, hash) {
  const candidate = crypto.scryptSync(password, salt, 32).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(candidate, 'hex'), Buffer.from(hash, 'hex'))
}

const DAY = 86400000
const now = Date.now()

const addresses = [
  { id: 'a1', label: 'Home', name: 'Kago Mmolai', line1: 'Plot 5421, Extension 12', line2: 'Off Segoditshane Way', city: 'Gaborone', district: 'South-East', phone: '+267 71 234 567', default: true },
  { id: 'a2', label: 'Work', name: 'Kago Mmolai', line1: 'iTowers, 6th Floor, CBD', line2: 'Khama Crescent', city: 'Gaborone', district: 'South-East', phone: '+267 71 234 567', default: false },
]

function buildSeed() {
  const rnd = prng(20261125)
  const users = []

  const mk = (id, name, email, role, extra = {}) => {
    const { salt, hash } = hashPassword('demo1234')
    users.push({ id, name, email, role, salt, hash, joined: now - 400 * DAY, ...extra })
  }

  mk('u1', 'Kago Mmolai', 'customer@afrikart.co.bw', 'customer', { addresses })
  mk('u2', 'Naledi Sekgoma', 'seller@afrikart.co.bw', 'seller', { sellerId: 's1' })
  mk('u3', 'Afrikart Operations', 'admin@afrikart.co.bw', 'admin')
  mk('u4', 'Tumelo Kgosi', 'tumelo@example.com', 'customer', {})
  mk('u5', 'Refilwe Phiri', 'refilwe@example.com', 'customer', {})
  mk('u6', 'Lesego Banda', 'lesego@example.com', 'customer', {})
  mk('u7', 'Mpho Tshosa', 'mpho@example.com', 'customer', {})

  // ---- reviews: each product gets 3-8 reviews, weighted so the star
  // distribution is realistic rather than all five stars.
  const reviews = []
  let rid = 0
  for (const p of products) {
    const count = 3 + Math.floor(rnd() * 6)
    const picked = new Set()
    for (let i = 0; i < count; i++) {
      let idx = Math.floor(rnd() * reviewSeeds.length)
      while (picked.has(idx)) idx = (idx + 1) % reviewSeeds.length
      picked.add(idx)
      const r = reviewSeeds[idx]
      reviews.push({
        id: `r${++rid}`,
        productId: p.id,
        userId: 'u' + (4 + Math.floor(rnd() * 4)),
        author: r.name,
        rating: r.rating,
        title: r.title,
        body: r.body,
        verified: rnd() > 0.15,
        helpful: Math.floor(rnd() * 24),
        date: now - Math.floor(rnd() * 200 + 2) * DAY,
      })
    }
  }

  const stats = (pid) => {
    const rs = reviews.filter((r) => r.productId === pid)
    const sum = rs.reduce((a, r) => a + r.rating, 0)
    return { rating: rs.length ? +(sum / rs.length).toFixed(1) : 0, ratingCount: rs.length }
  }

  for (const p of products) {
    Object.assign(p, stats(p.id))
    p.sold = Math.floor(rnd() * 240) + 6
    p.createdAt = now - Math.floor(rnd() * 300 + 20) * DAY
    p.status = 'live'
    p.views = Math.floor(rnd() * 4000) + 120
  }

  // ---- demo orders, spread over the last 45 days so dashboards have shape.
  // Orders are built around a category theme rather than picked at random,
  // because random baskets produce nonsense "customers also bought" rails.
  const AFFINITY = {
    'baby-mother': ['baby-mother', 'groceries', 'hair-beauty'],
    'hair-beauty': ['hair-beauty', 'fashion', 'phones-tech'],
    'phones-tech': ['phones-tech', 'solar-power', 'hair-beauty'],
    'home-kitchen': ['home-kitchen', 'groceries', 'diy-auto'],
    groceries: ['groceries', 'home-kitchen', 'baby-mother'],
    'solar-power': ['solar-power', 'diy-auto', 'phones-tech'],
    fashion: ['fashion', 'hair-beauty', 'home-kitchen'],
    'diy-auto': ['diy-auto', 'home-kitchen', 'solar-power'],
  }
  // what actually drives volume in this market: essentials first
  const CAT_WEIGHTS = [
    ['baby-mother', 24], ['groceries', 22], ['hair-beauty', 18], ['phones-tech', 14],
    ['home-kitchen', 10], ['fashion', 7], ['diy-auto', 3], ['solar-power', 2],
  ]
  const weighted = (pairs) => {
    const total = pairs.reduce((a, [, w]) => a + w, 0)
    let r = rnd() * total
    for (const [v, w] of pairs) { if ((r -= w) <= 0) return v }
    return pairs[0][0]
  }

  const orders = []
  const statusPairs = [
    ['delivered', 68], ['dispatched', 8], ['packed', 7], ['placed', 6],
    ['cancelled', 5], ['returned', 4], ['returned', 2],
  ]
  const payMethods = ['Card', 'Orange Money', 'Orange Money', 'MyZaka', 'Cash on Delivery', 'Smega', 'Bank transfer']
  const cityPool = ['Gaborone', 'Gaborone', 'Gaborone', 'Gaborone', 'Francistown', 'Maun', 'Palapye', 'Serowe', 'Kanye', 'Molepolole', 'Lobatse']
  const buyerPool = ['u4', 'u5', 'u6', 'u7']

  let oid = 0
  const makeOrder = (userId, daysAgo, itemCount, forcedStatus, forcedCat) => {
    const cat = forcedCat || weighted(CAT_WEIGHTS)
    const pool = AFFINITY[cat] ? AFFINITY[cat].flatMap((c) => products.filter((p) => p.category === c)) : products
    const items = []
    const used = new Set()
    for (let i = 0; i < itemCount; i++) {
      let p
      let guard = 0
      do { p = pool[Math.floor(rnd() * pool.length)]; guard++ } while (used.has(p.id) && guard < 60)
      if (used.has(p.id)) break
      used.add(p.id)
      const qty = rnd() > 0.82 ? 2 : 1
      items.push({ productId: p.id, sellerId: p.sellerId, title: p.title, price: p.price, qty })
    }
    if (!items.length) {
      const p = products[0]
      items.push({ productId: p.id, sellerId: p.sellerId, title: p.title, price: p.price, qty: 1 })
    }
    const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0)
    const express = items.some((i) => products.find((x) => x.id === i.productId)?.express)
    const city = cityPool[Math.floor(rnd() * cityPool.length)]
    const deliveryFee = subtotal >= 400 ? 0 : express ? 30 : 20
    const status = forcedStatus || weighted(statusPairs)
    const placedAt = now - daysAgo * DAY
    const timeline = [{ at: placedAt, label: 'Order placed', detail: 'Payment authorised by Afrikart' }]
    if (status !== 'cancelled') timeline.push({ at: placedAt + 0.02 * DAY, label: 'Payment captured', detail: 'Funds held by Afrikart until delivery' })
    if (['packed', 'dispatched', 'delivered', 'returned'].includes(status)) timeline.push({ at: placedAt + 0.4 * DAY, label: 'Packed', detail: 'Gaborone fulfilment centre' })
    if (['dispatched', 'delivered', 'returned'].includes(status)) timeline.push({ at: placedAt + 0.9 * DAY, label: 'Out for delivery', detail: 'Assigned to the Gaborone West route' })
    if (['delivered', 'returned'].includes(status)) timeline.push({ at: placedAt + 1.05 * DAY, label: 'Delivered', detail: 'Handed to the customer at the door' })
    if (status === 'returned') timeline.push({ at: placedAt + 5 * DAY, label: 'Returned', detail: 'Collected, inspected, refund issued to the original payment method' })
    if (status === 'cancelled') timeline.push({ at: placedAt + 0.1 * DAY, label: 'Cancelled', detail: 'Cancelled before dispatch. Nothing was charged.' })

    return {
      id: `AK-${24000 + ++oid}`,
      userId,
      items,
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      status,
      placedAt,
      address: {
        name: 'Customer',
        line1: `Plot ${1000 + Math.floor(rnd() * 8000)}, ${['Extension 12', 'Broadhurst', 'Tlokweng', 'Area 51', 'Old Naledi', 'CBD'][Math.floor(rnd() * 6)]}`,
        city,
        phone: '+267 7X XXX XXX',
      },
      deliveryMethod: express ? 'Afrikart Express' : 'Standard courier',
      paymentMethod: payMethods[Math.floor(rnd() * payMethods.length)],
      timeline,
    }
  }

  // the demo customer gets a believable purchase history: consumables + one big buy
  ;[[6, 3, 'baby-mother'], [13, 2, 'groceries'], [21, 4, 'hair-beauty'], [34, 1, 'phones-tech'], [41, 2, 'home-kitchen']]
    .forEach(([d, n, c]) => orders.push(makeOrder('u1', d, n, undefined, c)))
  // and one in flight so "track your order" has something to show
  orders.push(makeOrder('u1', 1, 2, 'dispatched', 'baby-mother'))

  for (let i = 0; i < 46; i++) {
    orders.push(makeOrder(buyerPool[Math.floor(rnd() * buyerPool.length)], Math.floor(rnd() * 45) + 1, 1 + Math.floor(rnd() * 3)))
  }
  orders.sort((a, b) => b.placedAt - a.placedAt)

  return {
    categories,
    sellers,
    products,
    reviews,
    users,
    orders,
    sessions: {},
    counters: { order: 24000 + oid, review: rid },
  }
}

function load() {
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8')
    return JSON.parse(raw)
  } catch {
    const fresh = buildSeed()
    fs.mkdirSync(DATA_DIR, { recursive: true })
    fs.writeFileSync(DB_FILE, JSON.stringify(fresh))
    return fresh
  }
}

export const db = load()

let saveTimer = null
export function persist() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true })
      fs.writeFileSync(DB_FILE, JSON.stringify(db))
    } catch (e) {
      console.error('persist failed', e)
    }
  }, 40)
}

export function nextOrderId() {
  db.counters.order += 1
  return `AK-${db.counters.order}`
}

export function nextReviewId() {
  db.counters.review += 1
  return `r${db.counters.review}`
}
