import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../lib/api'
import { ProductCard, Empty } from '../components/ui'
import { Icon } from '../components/icons'

const PRICE_BANDS = [
  { id: '0-250', label: 'Under P250', min: 0, max: 250 },
  { id: '250-500', label: 'P250 – P500', min: 250, max: 500 },
  { id: '500-1000', label: 'P500 – P1,000', min: 500, max: 1000 },
  { id: '1000-3000', label: 'P1,000 – P3,000', min: 1000, max: 3000 },
  { id: '3000-', label: 'P3,000 and above', min: 3000, max: null },
]

export default function Search() {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  const q = params.get('q') || ''
  const category = params.get('category') || ''
  const sort = params.get('sort') || 'relevance'
  const page = Number(params.get('page') || 1)
  const min = params.get('min') || ''
  const max = params.get('max') || ''
  const rating = params.get('rating') || ''
  const express = params.get('express') === '1'
  const deal = params.get('deal') === '1'

  const setParam = (patch) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '' || v === false) next.delete(k)
      else next.set(k, v)
    }
    if (!('page' in patch)) next.delete('page')
    setParams(next, { replace: true })
  }

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams()
    if (q) qs.set('q', q)
    if (category) qs.set('category', category)
    if (min) qs.set('min', min)
    if (max) qs.set('max', max)
    if (rating) qs.set('rating', rating)
    if (express) qs.set('express', '1')
    if (deal) qs.set('deal', '1')
    qs.set('sort', sort)
    qs.set('page', String(page))
    api(`/search?${qs}`).then(setData).catch(() => setData({ results: [], total: 0, facets: [] })).finally(() => setLoading(false))
    window.scrollTo({ top: 0 })
  }, [q, category, min, max, rating, express, deal, sort, page])

  const activeBand = PRICE_BANDS.find((b) => String(b.min) === min && String(b.max ?? '') === max)?.id
  const chips = [
    q && { key: 'q', label: `"${q}"` },
    category && { key: 'category', label: (data?.facets.find((f) => f.slug === category)?.name) || category },
    express && { key: 'express', label: 'Afrikart Express' },
    deal && { key: 'deal', label: 'On deal' },
    rating && { key: 'rating', label: `${rating}★ & up` },
    (min || max) && { key: 'price', label: 'Price filter' },
  ].filter(Boolean)

  return (
    <div className="container">
      <div className="search-layout">
        <aside className="filters">
          <div className="panel">
            <div className="panel-body" style={{ padding: '16px 16px 8px' }}>
              <div className="filter-group" style={{ borderTop: 0 }}>
                <div className="filter-title">Department</div>
                <label className="filter-opt">
                  <input type="radio" name="cat" checked={!category} onChange={() => setParam({ category: null })} />
                  All departments
                </label>
                {(data?.facets || []).map((f) => (
                  <label className="filter-opt" key={f.slug}>
                    <input type="radio" name="cat" checked={category === f.slug} onChange={() => setParam({ category: f.slug })} />
                    {f.name}
                    <span className="filter-count">{f.count}</span>
                  </label>
                ))}
              </div>

              <div className="filter-group">
                <div className="filter-title">Delivery</div>
                <label className="filter-opt">
                  <input type="checkbox" checked={express} onChange={(e) => setParam({ express: e.target.checked ? '1' : null })} />
                  Afrikart Express
                </label>
                <label className="filter-opt">
                  <input type="checkbox" checked={deal} onChange={(e) => setParam({ deal: e.target.checked ? '1' : null })} />
                  Reduced price
                </label>
              </div>

              <div className="filter-group">
                <div className="filter-title">Price</div>
                {PRICE_BANDS.map((b) => (
                  <label className="filter-opt" key={b.id}>
                    <input
                      type="radio" name="price"
                      checked={activeBand === b.id}
                      onChange={() => setParam({ min: b.min, max: b.max ?? null })}
                    />
                    {b.label}
                  </label>
                ))}
              </div>

              <div className="filter-group" style={{ borderBottom: 0 }}>
                <div className="filter-title">Customer rating</div>
                {[4.5, 4, 3].map((r) => (
                  <label className="filter-opt" key={r}>
                    <input type="radio" name="rating" checked={rating === String(r)} onChange={() => setParam({ rating: r })} />
                    {r}★ &amp; up
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="panel mt16">
            <div className="panel-body" style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              <div className="row" style={{ gap: 8, marginBottom: 8, color: 'var(--ink)', fontWeight: 700 }}>
                <Icon name="info" size={15} /> Cash on delivery
              </div>
              Available in Gaborone, Tlokweng and Mogoditshane. P15 handling fee, paid to the rider.
            </div>
          </div>
        </aside>

        <div>
          <div className="results-head">
            <div className="results-count">
              {loading ? 'Searching…' : <><b>{data?.total ?? 0}</b> results{q ? <> for <b>“{q}”</b></> : ''}</>}
            </div>
            <div className="row" style={{ gap: 10 }}>
              <span className="tiny muted">Sort by</span>
              <select className="select" value={sort} onChange={(e) => setParam({ sort: e.target.value })}>
                <option value="relevance">Relevance</option>
                <option value="popular">Best selling</option>
                <option value="price-asc">Price: low to high</option>
                <option value="price-desc">Price: high to low</option>
                <option value="rating">Customer rating</option>
                <option value="newest">Newest arrivals</option>
              </select>
            </div>
          </div>

          {chips.length > 0 && (
            <div className="row wrap" style={{ marginBottom: 14, gap: 7 }}>
              {chips.map((c) => (
                <button key={c.key} className="badge badge-navy" style={{ border: 0, cursor: 'pointer' }}
                        onClick={() => setParam({ [c.key === 'price' ? 'min' : c.key]: null, ...(c.key === 'price' ? { max: null } : {}) })}>
                  {c.label} <Icon name="x" size={11} />
                </button>
              ))}
              <button className="btn-quiet" style={{ fontSize: 12 }} onClick={() => setParams({})}>Clear all</button>
            </div>
          )}

          {loading ? (
            <div className="grid-products">
              {Array.from({ length: 8 }).map((_, i) => <div key={i} className="skeleton" style={{ height: 290, borderRadius: 10 }} />)}
            </div>
          ) : data?.results.length ? (
            <>
              <div className="grid-products">
                {data.results.map((p) => <ProductCard key={p.id} p={p} />)}
              </div>
              {data.pages > 1 && (
                <div className="pager">
                  <button disabled={page <= 1} onClick={() => setParam({ page: page - 1 })}><Icon name="chevronLeft" size={15} /></button>
                  {Array.from({ length: data.pages }).map((_, i) => (
                    <button key={i} className={page === i + 1 ? 'active' : ''} onClick={() => setParam({ page: i + 1 })}>{i + 1}</button>
                  ))}
                  <button disabled={page >= data.pages} onClick={() => setParam({ page: page + 1 })}><Icon name="chevronRight" size={15} /></button>
                </div>
              )}
            </>
          ) : (
            <div className="panel">
              <Empty title="Nothing matched that search"
                     action={<button className="btn btn-ghost" onClick={() => setParams({})}>Clear filters</button>}>
                We only list what is actually in stock with a verified seller. Try a wider term — “nappies”,
                “inverter”, “weave” or “blanket”.
              </Empty>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
