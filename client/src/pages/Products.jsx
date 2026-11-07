import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { money } from '../utils'
import ProductPhoto from '../components/ProductPhoto'
import ProductEditor from '../components/ProductEditor'
import Icon from '../components/Icon'

function StockBadge({ product }) {
  const { active, stock } = product
  const label = !active ? 'Hidden' : stock === 0 ? 'Sold out' : stock <= 10 ? 'Low stock' : 'In stock'
  const color = !active ? 'bg-slate-100 text-slate-500' : stock === 0 ? 'bg-red-50 text-red-700' : stock <= 10 ? 'bg-amber-50 text-amber-700' : 'bg-foam text-slate-500'
  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${color}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{label}</span>
}

export default function Products() {
  const [rows, setRows] = useState([])
  const [categories, setCategories] = useState([])
  const [editor, setEditor] = useState(null)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('')
  const [filter, setFilter] = useState('all')

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const [products, groups] = await Promise.all([api('/products?all=1'), api('/products/categories')])
      setRows(products)
      setCategories(groups)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const lowStock = (p) => p.active && p.stock > 0 && p.stock <= 10
  const soldOut = (p) => p.active && p.stock === 0
  const shown = rows.filter((p) => `${p.name} ${p.code}`.toLowerCase().includes(query.trim().toLowerCase()) && (!category || p.category_id === Number(category)) && (filter === 'all' || (filter === 'low' && lowStock(p)) || (filter === 'out' && soldOut(p)) || (filter === 'hidden' && !p.active)))
  const categoryName = (id) => categories.find((c) => c.id === id)?.name || 'Uncategorized'
  const openEditor = (product) => { setMsg(''); setEditor(product) }

  return <div className="workspace-surface h-full overflow-y-auto p-4 md:p-7">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="page-title">Products & stock</h1><p className="page-subtitle">Manage menu items, prices, and available stock.</p></div>
        <button disabled={loading || !categories.length} className="btn-primary inline-flex items-center gap-2" onClick={() => openEditor({})}><Icon name="plus" />Add product</button>
      </header>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[['all', 'Total products', rows.length, 'text-ocean'], ['low', 'Running low', rows.filter(lowStock).length, 'text-amber-600'], ['out', 'Sold out', rows.filter(soldOut).length, 'text-coral'], ['hidden', 'Hidden from menu', rows.filter((p) => !p.active).length, 'text-slate-500']].map(([key, label, value, color]) => <button key={key} aria-pressed={filter === key} onClick={() => setFilter(key)} className={`rounded-2xl border bg-white p-4 text-left transition hover:border-wave sm:p-5 ${filter === key ? 'border-wave ring-1 ring-wave/10' : 'border-slate-200'}`}><p className="text-xs font-medium text-slate-500">{label}</p><p className={`mt-2 text-3xl font-extrabold tracking-tight ${color}`}>{loading ? '—' : value}</p></button>)}
      </div>
      {error && <div role="alert" className="flex items-center justify-between gap-3 rounded-xl bg-red-50 p-4 text-sm text-coral"><span>{error}</span><button className="font-bold underline" onClick={load}>Retry</button></div>}
      {msg && <p role="status" className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><Icon name="check" />{msg}</p>}
      <section className="panel overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
          <div className="relative min-w-0 flex-1 basis-56"><Icon name="search" className="absolute left-3 top-3 text-slate-400" /><input className="field !pl-10" aria-label="Search products" placeholder="Search name or product code…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <select aria-label="Filter by category" className="field !w-auto max-w-full" value={category} onChange={(e) => setCategory(e.target.value)}><option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <button className="btn-ghost text-xs" disabled={loading} onClick={load}>Refresh</button>
        </div>
        <div className="flex items-center justify-between gap-2 px-4 py-3 text-xs text-slate-500"><span>{shown.length} products{filter !== 'all' ? ' · Filtered view' : ''}</span>{(query || category || filter !== 'all') && <button className="font-semibold text-wave" onClick={() => { setQuery(''); setCategory(''); setFilter('all') }}>Clear filters</button>}</div>
        {loading ? <div role="status" className="p-16 text-center text-sm text-slate-500">Loading products…</div> : !shown.length ? <div className="flex flex-col items-center px-6 py-14 text-center"><div className="mb-4 rounded-2xl bg-foam p-4 text-slate-400"><Icon name="bag" className="!h-8 !w-8" /></div><h2 className="font-bold">{rows.length ? 'No matching products' : 'Your menu starts here'}</h2><p className="mt-2 text-sm text-slate-500">{rows.length ? 'Try a different search or clear the filters.' : 'Add your first product with a price, stock and photo.'}</p></div> : <>
          <div className="hidden overflow-x-auto lg:block"><table className="w-full text-left text-sm">
            <thead className="bg-foam text-[11px] uppercase tracking-wider text-slate-500"><tr>{['Product', 'Price', 'Cost', 'Stock', 'Status', ''].map((label, i) => <th key={i} scope="col" className="px-5 py-3 font-semibold">{label || <span className="sr-only">Actions</span>}</th>)}</tr></thead>
            <tbody className="divide-y divide-slate-100">{shown.map((p) => <tr key={p.id} className="transition hover:bg-foam/60">
              <td className="px-5 py-4"><div className="flex items-center gap-3"><ProductPhoto src={p.photo_url} name={p.name} className="h-14 w-14" /><div className="min-w-0"><p className="font-semibold">{p.name}</p><p className="mt-1 text-xs text-slate-400">{p.code} · {categoryName(p.category_id)}</p></div></div></td>
              <td className="whitespace-nowrap px-5 py-4 font-semibold tabular-nums">{money(p.price)}</td>
              <td className="whitespace-nowrap px-5 py-4 tabular-nums">{p.unit_cost === null || p.unit_cost === undefined ? <span className="text-slate-400">Not set</span> : money(p.unit_cost)}</td>
              <td className="px-5 py-4"><span className="font-semibold tabular-nums">{p.stock}</span><span className="ml-1 text-xs text-slate-400">units</span></td><td className="px-5 py-4"><StockBadge product={p} /></td>
              <td className="px-5 py-4 text-right"><button aria-label={`Edit ${p.name}`} className="btn-ghost !px-3 !py-2 text-xs" onClick={() => openEditor(p)}>Edit product</button></td>
            </tr>)}</tbody>
          </table></div>
          <div className="grid gap-3 p-3 sm:grid-cols-2 lg:hidden">{shown.map((p) => <article key={p.id} className="rounded-xl border border-slate-200 p-4"><div className="mb-4 flex items-center gap-3"><ProductPhoto src={p.photo_url} name={p.name} className="h-16 w-16" /><div className="min-w-0"><h2 className="font-bold leading-snug">{p.name}</h2><p className="mt-1 text-xs text-slate-400">{p.code} · {categoryName(p.category_id)}</p></div></div><dl className="mb-4 grid grid-cols-3 gap-2 text-sm"><div><dt className="text-xs text-slate-400">Price</dt><dd className="mt-1 font-bold">{money(p.price)}</dd></div><div><dt className="text-xs text-slate-400">Cost</dt><dd className="mt-1 font-bold">{p.unit_cost === null || p.unit_cost === undefined ? '—' : money(p.unit_cost)}</dd></div><div><dt className="text-xs text-slate-400">Stock</dt><dd className="mt-1 font-bold">{p.stock}</dd></div></dl><div className="flex items-center justify-between gap-2 border-t border-slate-100 pt-3"><StockBadge product={p} /><button aria-label={`Edit ${p.name}`} className="btn-ghost !px-3 !py-2 text-xs" onClick={() => openEditor(p)}>Edit product</button></div></article>)}</div>
        </>}
      </section>
      <p className="text-xs leading-relaxed text-slate-500">Select Edit product to update stock, photos, pricing and unit cost. Record daily expenses in Analytics to calculate profit.</p>
    </div>
    {editor && <ProductEditor product={editor} categories={categories} onClose={() => setEditor(null)} onSaved={(message) => { setEditor(null); setMsg(message); load() }} />}
  </div>
}
