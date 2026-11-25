import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './lib/api'

const StoreCtx = createContext(null)
export const useStore = () => useContext(StoreCtx)

const read = (k, fallback) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback } catch { return fallback }
}

export function StoreProvider({ children }) {
  const [user, setUser] = useState(undefined)
  const [categories, setCategories] = useState([])
  const [payments, setPayments] = useState([])
  const [cart, setCart] = useState(() => read('ak_cart', []))
  const [saved, setSaved] = useState(() => read('ak_saved', []))
  const [toasts, setToasts] = useState([])
  const [city, setCity] = useState(() => localStorage.getItem('ak_city') || 'Gaborone')
  const timers = useRef({}).current

  useEffect(() => {
    api('/auth/me').then((d) => setUser(d.user)).catch(() => setUser(null))
    api('/meta').then((d) => { setCategories(d.categories); setPayments(d.payments) }).catch(() => {})
  }, [])

  useEffect(() => { localStorage.setItem('ak_cart', JSON.stringify(cart)) }, [cart])
  useEffect(() => { localStorage.setItem('ak_saved', JSON.stringify(saved)) }, [saved])
  useEffect(() => { localStorage.setItem('ak_city', city) }, [city])

  const toast = useCallback((message, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2)
    setToasts((t) => [...t, { id, message, tone }])
    timers[id] = setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600)
  }, [timers])

  const addToCart = useCallback((product, qty = 1, silent = false) => {
    setCart((c) => {
      const found = c.find((i) => i.id === product.id)
      const max = product.stock ?? 99
      if (found) {
        return c.map((i) => (i.id === product.id ? { ...i, qty: Math.min(max, i.qty + qty) } : i))
      }
      return [...c, {
        id: product.id, title: product.title, price: product.price, listPrice: product.listPrice,
        glyph: product.glyph, category: product.category, express: product.express,
        stock: product.stock, seller: product.seller?.name || product.seller || '',
        qty: Math.min(max, qty),
      }]
    })
    if (!silent) toast('Added to cart')
  }, [toast])

  const removeFromCart = useCallback((id) => setCart((c) => c.filter((i) => i.id !== id)), [])
  const setQty = useCallback((id, qty) => setCart((c) => c.map((i) => (i.id === id ? { ...i, qty: Math.max(1, Math.min(i.stock ?? 99, qty)) } : i))), [])
  const clearCart = useCallback(() => setCart([]), [])

  const toggleSaved = useCallback((product) => {
    setSaved((s) => {
      const has = s.some((i) => i.id === product.id)
      toast(has ? 'Removed from your list' : 'Saved to your list')
      return has ? s.filter((i) => i.id !== product.id) : [...s, {
        id: product.id, title: product.title, price: product.price, glyph: product.glyph,
        category: product.category, rating: product.rating, ratingCount: product.ratingCount,
        listPrice: product.listPrice, express: product.express,
      }]
    })
  }, [toast])

  const login = useCallback(async (email, password) => {
    const d = await api('/auth/login', { method: 'POST', body: { email, password } })
    setUser(d.user)
    toast('Welcome back, ' + d.user.name.split(' ')[0])
    return d.user
  }, [toast])

  const register = useCallback(async (payload) => {
    const d = await api('/auth/register', { method: 'POST', body: payload })
    setUser(d.user)
    toast('Account created')
    return d.user
  }, [toast])

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' })
    setUser(null)
    toast('Signed out')
  }, [toast])

  const cartCount = useMemo(() => cart.reduce((a, i) => a + i.qty, 0), [cart])
  const subtotal = useMemo(() => cart.reduce((a, i) => a + i.price * i.qty, 0), [cart])

  const value = {
    user, setUser, categories, payments, city, setCity,
    cart, addToCart, removeFromCart, setQty, clearCart, cartCount, subtotal,
    saved, toggleSaved, login, register, logout, toast, toasts,
  }

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}
