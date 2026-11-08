import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import Modal from '../components/Modal'
import Icon from '../components/Icon'

export default function Customers() {
  const [rows, setRows] = useState([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState(null)
  const [detail, setDetail] = useState(null)

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const data = await api(`/customers${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ''}`)
      setRows(data)
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [query])

  useEffect(() => { load() }, [load])

  const save = async (form) => {
    try {
      if (form.id) await api(`/customers/${form.id}`, { method: 'PUT', body: form })
      else await api('/customers', { method: 'POST', body: form })
      setEditor(null)
      await load()
    } catch (e) { alert(e.message) }
  }

  const remove = async (id) => {
    if (!window.confirm('Delete this customer?')) return
    try {
      await api(`/customers/${id}`, { method: 'DELETE' })
      await load()
    } catch (e) { alert(e.message) }
  }

  const openDetail = async (id) => {
    try { setDetail(await api(`/customers/${id}`)) } catch (e) { alert(e.message) }
  }

  return (
    <div className="workspace-surface h-full overflow-y-auto p-4 md:p-7">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div><h1 className="page-title">Customers & CRM</h1><p className="page-subtitle">Manage customer records, contact details, and purchase history.</p></div>
          <button className="btn-primary inline-flex items-center gap-2" onClick={() => setEditor({})}><Icon name="plus" />Add customer</button>
        </header>
        {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-coral">{error}</div>}
        <section className="panel overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4">
            <div className="relative min-w-0 flex-1 basis-56"><Icon name="search" className="absolute left-3 top-3 text-slate-400" /><input className="field !pl-10" placeholder="Search name, phone, or email…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
            <button className="btn-ghost text-xs" onClick={load}>Refresh</button>
          </div>
          {loading ? <div className="p-16 text-center text-sm text-slate-500">Loading customers…</div> : !rows.length ? <div className="p-14 text-center text-sm text-slate-500">No customers yet.</div> : (
            <div className="overflow-x-auto"><table className="w-full text-left text-sm">
              <thead className="bg-foam text-[11px] uppercase tracking-wider text-slate-500"><tr>{['Name', 'Phone', 'Email', 'Orders', ''].map((h, i) => <th key={i} className="px-5 py-3 font-semibold">{h}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{rows.map((c) => (
                <tr key={c.id} className="hover:bg-foam/60">
                  <td className="px-5 py-4 font-semibold">{c.name}</td>
                  <td className="px-5 py-4">{c.phone || '—'}</td>
                  <td className="px-5 py-4">{c.email || '—'}</td>
                  <td className="px-5 py-4"><button className="text-wave font-semibold" onClick={() => openDetail(c.id)}>View</button></td>
                  <td className="px-5 py-4 text-right"><button className="btn-ghost !px-3 !py-2 text-xs" onClick={() => setEditor(c)}>Edit</button> <button className="btn-ghost !px-3 !py-2 text-xs text-coral" onClick={() => remove(c.id)}>Delete</button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </section>
      </div>
      {editor && <CustomerEditor customer={editor} onClose={() => setEditor(null)} onSave={save} />}
      {detail && <CustomerDetail customer={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

function CustomerEditor({ customer, onClose, onSave }) {
  const [form, setForm] = useState({ name: customer.name || '', phone: customer.phone || '', email: customer.email || '', address: customer.address || '', notes: customer.notes || '', id: customer.id })
  return (
    <Modal onClose={onClose} labelledBy="customer-title">
      <h2 id="customer-title" className="text-lg font-bold">{customer.id ? 'Edit customer' : 'Add customer'}</h2>
      <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); onSave(form) }}>
        <input className="field" placeholder="Name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="field" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input className="field" placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="field" placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        <textarea className="field" placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary">Save</button></div>
      </form>
    </Modal>
  )
}

function CustomerDetail({ customer, onClose }) {
  return (
    <Modal onClose={onClose} labelledBy="customer-detail-title" wide>
      <h2 id="customer-detail-title" className="text-lg font-bold">{customer.name}</h2>
      <p className="text-sm text-slate-500">{customer.phone || 'No phone'} · {customer.email || 'No email'}</p>
      <p className="mt-2 text-sm">{customer.address || 'No address'}</p>
      {customer.notes && <p className="mt-2 text-sm text-slate-600">{customer.notes}</p>}
      <h3 className="mt-4 font-semibold">Recent orders</h3>
      {!customer.orders?.length ? <p className="text-sm text-slate-500">No orders yet.</p> : (
        <ul className="mt-2 space-y-1 text-sm">{customer.orders.map((o) => <li key={o.id}>{o.order_no} · {new Date(o.created_at).toLocaleString()} · ₱{Number(o.total).toFixed(2)} · {o.status}</li>)}</ul>
      )}
      <div className="mt-4 text-right"><button className="btn-ghost" onClick={onClose}>Close</button></div>
    </Modal>
  )
}
