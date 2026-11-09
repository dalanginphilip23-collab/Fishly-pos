import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { money } from '../utils'
import Modal from '../components/Modal'
import Icon from '../components/Icon'

export default function Stock() {
  const [summary, setSummary] = useState(null)
  const [lowStock, setLowStock] = useState([])
  const [expiring, setExpiring] = useState([])
  const [adjustments, setAdjustments] = useState([])
  const [products, setProducts] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [adjustOpen, setAdjustOpen] = useState(false)

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const [s, low, exp, adj, prods] = await Promise.all([
        api('/stock/summary'),
        api('/stock/low-stock'),
        api('/stock/expiring?days=30'),
        api('/stock/adjustments'),
        api('/products?all=1'),
      ])
      setSummary(s)
      setLowStock(low)
      setExpiring(exp)
      setAdjustments(adj)
      setProducts(prods)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const submitAdjustment = async (form) => {
    await api('/stock/adjustments', { method: 'POST', body: form })
    setAdjustOpen(false)
    await load()
  }

  return (
    <div className="workspace-surface h-full overflow-y-auto p-4 md:p-7">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div><h1 className="page-title">Stock control</h1><p className="page-subtitle">Monitor inventory, low stock, expiring items, and stock adjustments.</p></div>
          <button className="btn-primary inline-flex items-center gap-2" onClick={() => setAdjustOpen(true)}><Icon name="plus" />Adjust stock</button>
        </header>
        {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-coral">{error}</div>}
        {loading ? <div className="p-16 text-center text-sm text-slate-500">Loading stock…</div> : <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-slate-500">Active products</p><p className="mt-2 text-3xl font-extrabold">{summary?.total_products ?? 0}</p></div>
            <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-slate-500">Units on hand</p><p className="mt-2 text-3xl font-extrabold">{summary?.total_units ?? 0}</p></div>
            <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-slate-500">Stock value at cost</p><p className="mt-2 text-2xl font-extrabold">{money(summary?.stock_value ?? 0)}</p></div>
            <div className="rounded-2xl border bg-white p-4"><p className="text-xs text-slate-500">Low stock items</p><p className="mt-2 text-3xl font-extrabold text-amber-600">{lowStock.length}</p></div>
          </div>

          <section className="panel overflow-hidden">
            <div className="border-b border-slate-100 p-4"><h2 className="font-bold">Low stock alerts</h2></div>
            {!lowStock.length ? <div className="p-8 text-center text-sm text-slate-500">No low stock items.</div> : (
              <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                <thead className="bg-foam text-[11px] uppercase tracking-wider text-slate-500"><tr>{['Product', 'Stock', 'Reorder level'].map((h, i) => <th key={i} className="px-5 py-3 font-semibold">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">{lowStock.map((p) => <tr key={p.id}><td className="px-5 py-3 font-semibold">{p.name}</td><td className="px-5 py-3">{p.stock}</td><td className="px-5 py-3">{p.reorder_level}</td></tr>)}</tbody>
              </table></div>
            )}
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-slate-100 p-4"><h2 className="font-bold">Expiring within 30 days</h2></div>
            {!expiring.length ? <div className="p-8 text-center text-sm text-slate-500">No expiring items.</div> : (
              <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                <thead className="bg-foam text-[11px] uppercase tracking-wider text-slate-500"><tr>{['Product', 'Stock', 'Expiry date'].map((h, i) => <th key={i} className="px-5 py-3 font-semibold">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">{expiring.map((p) => <tr key={p.id}><td className="px-5 py-3 font-semibold">{p.name}</td><td className="px-5 py-3">{p.stock}</td><td className="px-5 py-3">{p.expiry_date}</td></tr>)}</tbody>
              </table></div>
            )}
          </section>

          <section className="panel overflow-hidden">
            <div className="border-b border-slate-100 p-4"><h2 className="font-bold">Recent stock adjustments</h2></div>
            {!adjustments.length ? <div className="p-8 text-center text-sm text-slate-500">No adjustments recorded.</div> : (
              <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                <thead className="bg-foam text-[11px] uppercase tracking-wider text-slate-500"><tr>{['Product', 'Type', 'Qty', 'Reason', 'By', 'Date'].map((h, i) => <th key={i} className="px-5 py-3 font-semibold">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">{adjustments.map((a) => <tr key={a.id}><td className="px-5 py-3 font-semibold">{a.product_name}</td><td className="px-5 py-3">{a.adjustment_type}</td><td className="px-5 py-3">{a.quantity}</td><td className="px-5 py-3">{a.reason || '—'}</td><td className="px-5 py-3">{a.user_name || '—'}</td><td className="px-5 py-3">{new Date(a.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</td></tr>)}</tbody>
              </table></div>
            )}
          </section>
        </>}
      </div>
      {adjustOpen && <AdjustmentModal products={products.filter((p) => !p.is_combo)} onClose={() => setAdjustOpen(false)} onSave={submitAdjustment} />}
    </div>
  )
}

function AdjustmentModal({ products, onClose, onSave }) {
  const [form, setForm] = useState({ product_id: products[0]?.id || '', adjustment_type: 'add', quantity: 1, reason: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef(crypto.randomUUID())
  const product = products.find(p => p.id === Number(form.product_id))
  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      await onSave({
        ...form,
        product_id: Number(form.product_id),
        quantity: Number(form.quantity),
        expected_stock: product ? Number(product.stock) : undefined,
        request_id: requestRef.current,
      })
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return (
    <Modal onClose={() => { if (!busy) onClose() }} labelledBy="adjust-title">
      <h2 id="adjust-title" className="text-lg font-bold">Adjust stock</h2>
      <form className="mt-4 space-y-3" onSubmit={submit}>
        <label className="form-label">Product
          <select className="field" value={form.product_id} onChange={(e) => setForm({ ...form, product_id: e.target.value })}>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} (stock {p.stock})</option>)}
          </select>
        </label>
        <label className="form-label">Adjustment type
          <select className="field" value={form.adjustment_type} onChange={(e) => setForm({ ...form, adjustment_type: e.target.value })}>
            <option value="add">Add stock</option>
            <option value="remove">Remove stock</option>
            <option value="wastage">Wastage</option>
            <option value="opening">Opening count (set exact stock)</option>
          </select>
        </label>
        <label className="form-label">{form.adjustment_type === 'opening' ? 'Counted stock' : 'Quantity'}
          <input className="field" type="number" min={form.adjustment_type === 'opening' ? 0 : 1} required value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} />
        </label>
        <label className="form-label">Reason <span className="font-normal text-slate-400">Optional</span>
          <input className="field" maxLength="200" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
        </label>
        {form.adjustment_type === 'opening' && <p className="text-xs text-slate-500">This sets stock to the counted quantity and records the difference in the movement history.</p>}
        {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-coral">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>Cancel</button><button disabled={busy} className="btn-primary">{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
    </Modal>
  )
}
