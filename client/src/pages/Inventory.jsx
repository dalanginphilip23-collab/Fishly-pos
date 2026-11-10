import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/Auth'
import { api } from '../api'
import { money } from '../utils'
import Modal from '../components/Modal'
import Icon from '../components/Icon'

const tabs = ['Stock', 'Movements', 'Purchases', 'Suppliers']

export default function Inventory() {
  const { user } = useAuth()
  const isAdmin = user.role === 'admin' || localStorage.getItem('fp_admin_unlocked') === 'true'
  const [deletingMovement, setDeletingMovement] = useState(null)
  const [message, setMessage] = useState('')
  const [tab, setTab] = useState('Stock')
  const [products, setProducts] = useState([])
  const [movements, setMovements] = useState([])
  const [purchases, setPurchases] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [purchaseOpen, setPurchaseOpen] = useState(false)
  const [supplierOpen, setSupplierOpen] = useState(false)

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const results = await Promise.allSettled([
        api('/products?all=1'),
        api('/stock/adjustments'),
        api('/purchases'),
        api('/suppliers'),
      ])
      const setters = [setProducts, setMovements, setPurchases, setSuppliers]
      const labels = ['Stock', 'Movements', 'Purchases', 'Suppliers']
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') setters[index](index === 0
          ? result.value.map((product) => ({ ...product, is_combo: Boolean(Number(product.is_combo)) }))
          : result.value)
      })
      setError(results.flatMap((result, index) => result.status === 'rejected' ? [`${labels[index]}: ${result.reason.message}`] : []).join(' · '))
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])
  const stockProducts = products.filter((product) => !product.is_combo)
  const deleteMovement = async (movement) => {
    if (deletingMovement !== null) return
    setDeletingMovement(movement.id)
    setError('')
    setMessage('')
    try {
      await api(`/stock/adjustments/${movement.id}`, { method: 'DELETE', body: { request_id: crypto.randomUUID() } })
      setMovements(current => current.filter(item => item.id !== movement.id))
      setMessage(`Movement for ${movement.product_name} deleted. Stock and sales are unchanged.`)
    } catch (e) { setError(e.message) }
    finally { setDeletingMovement(null) }
  }

  return (
    <div className="workspace-surface h-full overflow-y-auto p-4 md:p-7">
      <div className="mx-auto max-w-[1440px] space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div><h1 className="page-title">Inventory</h1><p className="page-subtitle">Stock, movements, purchases, and suppliers.</p></div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-ghost inline-flex items-center gap-2" disabled={loading} onClick={load}><Icon name="refresh" />Refresh</button>
            {tab === 'Stock' && <Link className="btn-ghost" to="/stock">Adjust stock</Link>}
            {(tab === 'Stock' || tab === 'Purchases') && <button disabled={loading || !stockProducts.length} className="btn-primary inline-flex items-center gap-2" onClick={() => setPurchaseOpen(true)}><Icon name="plus" />Receive stock</button>}
            {tab === 'Suppliers' && <button className="btn-primary inline-flex items-center gap-2" onClick={() => setSupplierOpen(true)}><Icon name="plus" />Add supplier</button>}
          </div>
        </header>
        {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-coral">{error}</div>}
        {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
        <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-2">
          {tabs.map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === t ? 'bg-sky text-wave' : 'text-slate-500 hover:bg-foam'}`}>{t}</button>)}
        </div>
        {loading ? <div className="p-16 text-center text-sm text-slate-500">Loading inventory…</div> : <>
          {tab === 'Stock' && (
            <section className="panel overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
                <div><h2 className="font-bold">Stock on hand</h2><p className="mt-1 text-xs text-slate-500">Receive stock for deliveries. Adjust stock for counts, waste, or corrections. Sales deduct stock automatically.</p></div>
                <Link to="/products" className="text-sm font-semibold text-wave">Manage products</Link>
              </div>
              <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                <thead className="bg-foam text-[11px] uppercase tracking-wider text-slate-500"><tr>{['Product', 'Code', 'Stock', 'Reorder', 'Unit cost', 'Stock value', 'Expiry'].map((h, i) => <th key={i} className="px-5 py-3 font-semibold">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">{stockProducts.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-3 font-semibold">{p.name}</td>
                    <td className="px-5 py-3">{p.code}</td>
                    <td className="px-5 py-3">{p.stock}</td>
                    <td className="px-5 py-3">{p.reorder_level}</td>
                    <td className="px-5 py-3">{p.unit_cost == null ? '—' : money(p.unit_cost)}</td>
                    <td className="px-5 py-3">{p.unit_cost == null ? '—' : money(Number(p.unit_cost) * Number(p.stock))}</td>
                    <td className="px-5 py-3">{p.expiry_date || '—'}</td>
                  </tr>
                ))}</tbody>
              </table></div>
              {!stockProducts.length && <div className="p-10 text-center"><p className="font-semibold">No individual products to display</p><p className="mt-2 text-sm text-slate-500">Add a product in Products to start tracking stock. Combos use the stock of their included products.</p><Link to="/products" className="btn-primary mt-4 inline-flex">Go to products</Link></div>}
              {stockProducts.length > 0 && <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500">{stockProducts.length} products · Reorder is the low-stock threshold. Stock value is quantity × unit cost. Combos use their included products’ stock.</p>}
            </section>
          )}
          {tab === 'Movements' && (
            <section className="panel overflow-hidden">
              <p className="border-b border-slate-100 p-4 text-xs text-slate-500">Stock movement history. Deleting an entry removes only the history record; it does not change stock or cancel a sale.</p>
              <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                <thead className="bg-foam text-[11px] uppercase tracking-wider text-slate-500"><tr>{['Product', 'Type', 'Qty', 'Reason', 'By', 'Date', ...(isAdmin ? ['Actions'] : [])].map((h, i) => <th key={i} className="px-5 py-3 font-semibold">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">{movements.map((m) => (
                  <tr key={m.id}>
                    <td className="px-5 py-3 font-semibold">{m.product_name}</td>
                    <td className="px-5 py-3">{m.adjustment_type}</td>
                    <td className="px-5 py-3">{m.quantity}</td>
                    <td className="px-5 py-3">{m.reason || '—'}</td>
                    <td className="px-5 py-3">{m.user_name || '—'}</td>
                    <td className="px-5 py-3">{new Date(m.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</td>
                    {isAdmin && <td className="px-5 py-3"><button type="button" aria-label={`Delete movement for ${m.product_name}`} disabled={deletingMovement !== null} onClick={() => deleteMovement(m)} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50">{deletingMovement === m.id ? 'Deleting…' : 'Delete'}</button></td>}
                  </tr>
                ))}</tbody>
              </table></div>
              {!movements.length && <div className="p-8 text-center text-sm text-slate-500">No movements recorded.</div>}
            </section>
          )}
          {tab === 'Purchases' && (
            <section className="panel overflow-hidden">
              <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                <thead className="bg-foam text-[11px] uppercase tracking-wider text-slate-500"><tr>{['ID', 'Supplier', 'Reference', 'Total', 'Paid', 'By', 'Date'].map((h, i) => <th key={i} className="px-5 py-3 font-semibold">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">{purchases.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-3 font-semibold">#{p.id}</td>
                    <td className="px-5 py-3">{p.supplier_name || '—'}</td>
                    <td className="px-5 py-3">{p.reference || '—'}</td>
                    <td className="px-5 py-3">{money(p.total)}</td>
                    <td className="px-5 py-3">{p.paid ? <span className="font-semibold text-emerald-700">Paid</span> : 'Unpaid'}</td>
                    <td className="px-5 py-3">{p.user_name || '—'}</td>
                    <td className="px-5 py-3">{new Date(p.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</td>
                  </tr>
                ))}</tbody>
              </table></div>
              {!purchases.length && <div className="p-8 text-center text-sm text-slate-500">No purchases recorded.</div>}
            </section>
          )}
          {tab === 'Suppliers' && (
            <section className="panel overflow-hidden">
              <div className="overflow-x-auto"><table className="w-full text-left text-sm">
                <thead className="bg-foam text-[11px] uppercase tracking-wider text-slate-500"><tr>{['Name', 'Phone', 'Email', 'Address'].map((h, i) => <th key={i} className="px-5 py-3 font-semibold">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">{suppliers.map((s) => (
                  <tr key={s.id}>
                    <td className="px-5 py-3 font-semibold">{s.name}</td>
                    <td className="px-5 py-3">{s.phone || '—'}</td>
                    <td className="px-5 py-3">{s.email || '—'}</td>
                    <td className="px-5 py-3">{s.address || '—'}</td>
                  </tr>
                ))}</tbody>
              </table></div>
              {!suppliers.length && <div className="p-8 text-center text-sm text-slate-500">No suppliers yet.</div>}
            </section>
          )}
        </>}
      </div>
       {purchaseOpen && <PurchaseModal products={stockProducts} suppliers={suppliers} onClose={() => setPurchaseOpen(false)} onSave={async (form) => { await api('/purchases', { method: 'POST', body: form }); setPurchaseOpen(false); await load() }} />}
      {supplierOpen && <SupplierModal onClose={() => setSupplierOpen(false)} onSave={async (form) => { await api('/suppliers', { method: 'POST', body: form }); setSupplierOpen(false); await load() }} />}
    </div>
  )
}

function PurchaseModal({ products, suppliers, onClose, onSave }) {
  const [supplierId, setSupplierId] = useState('')
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  const [paid, setPaid] = useState(true)
  const [items, setItems] = useState([{ productId: products[0]?.id || '', qty: 1, unitCost: '' }])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef(crypto.randomUUID())

  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await onSave({
        request_id: requestRef.current,
        supplier_id: supplierId ? Number(supplierId) : null,
        reference: reference || null,
        notes: notes || null,
        paid,
        items: items.map((i) => ({ productId: Number(i.productId), qty: Number(i.qty), unit_cost: i.unitCost === '' ? null : Number(i.unitCost) })),
      })
    } catch (err) { setError(err.message) }
    finally { setBusy(false) }
  }

  return (
    <Modal onClose={() => { if (!busy) onClose() }} labelledBy="purchase-title" wide>
      <h2 id="purchase-title" className="text-lg font-bold">New purchase</h2>
      <form className="mt-4 space-y-3" onSubmit={submit}>
        <label className="form-label">Supplier
          <select className="field" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">No supplier</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="form-label">Reference <span className="font-normal text-slate-400">Optional</span>
          <input className="field" maxLength="40" value={reference} onChange={(e) => setReference(e.target.value)} />
        </label>
        {items.map((item, idx) => (
          <div key={idx} className="grid gap-2 sm:grid-cols-3">
            <label className="form-label">Product
              <select className="field" value={item.productId} onChange={(e) => setItems(items.map((it, i) => i === idx ? { ...it, productId: e.target.value } : it))}>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="form-label">Quantity
              <input className="field" type="number" min="1" value={item.qty} onChange={(e) => setItems(items.map((it, i) => i === idx ? { ...it, qty: e.target.value } : it))} />
            </label>
            <label className="form-label">Unit cost (₱)
              <input className="field" type="number" min="0" step="0.01" value={item.unitCost} onChange={(e) => setItems(items.map((it, i) => i === idx ? { ...it, unitCost: e.target.value } : it))} />
            </label>
          </div>
        ))}
        <button type="button" className="btn-ghost text-xs" onClick={() => setItems([...items, { productId: products[0]?.id || '', qty: 1, unitCost: '' }])}>Add line</button>
        <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-4 w-4" /><span><span className="block font-bold">Paid now</span><span className="text-xs text-slate-500">Record this purchase as an expense in today’s profit report.</span></span></label>
        <label className="form-label">Notes <span className="font-normal text-slate-400">Optional</span>
          <textarea className="field" maxLength="500" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-coral">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" disabled={busy} onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Receive stock'}</button></div>
      </form>
    </Modal>
  )
}

function SupplierModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <Modal onClose={onClose} labelledBy="supplier-title">
      <h2 id="supplier-title" className="text-lg font-bold">Add supplier</h2>
      <form className="mt-4 space-y-3" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setError(''); try { await onSave(form); } catch (err) { setError(err.message) } finally { setBusy(false) } }}>
        <label className="form-label">Name<input className="field" required maxLength="120" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
        <label className="form-label">Phone<input className="field" maxLength="40" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
        <label className="form-label">Email<input className="field" type="email" maxLength="120" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
        <label className="form-label">Address<input className="field" maxLength="255" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></label>
        <label className="form-label">Notes<textarea className="field" maxLength="500" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        {error && <p role="alert" className="text-sm text-coral">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
    </Modal>
  )
}
