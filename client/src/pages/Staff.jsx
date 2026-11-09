import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import Modal from '../components/Modal'
import Icon from '../components/Icon'
import { useAuth } from '../context/Auth'

export default function Staff() {
  const { user } = useAuth()
  const [rows, setRows] = useState([])
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setRows(await api('/auth/users')) } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  return <div className="workspace-surface h-full overflow-y-auto p-4 md:p-7">
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="page-title">Staff accounts</h1><p className="page-subtitle">Managers manage the store. Cashiers can only sell and review receipts.</p></div>
        <button className="btn-primary inline-flex items-center gap-2" onClick={() => setEditing({})}><Icon name="plus" />Add staff</button>
      </header>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-coral">{error}</p>}
      <section className="panel overflow-hidden">
        {loading ? <p className="p-12 text-center text-sm text-slate-500">Loading staff…</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead className="bg-foam text-[11px] uppercase tracking-wider text-slate-500"><tr>{['Name', 'Username', 'Role', 'Status', ''].map((h, i) => <th key={i} className="px-5 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.id}>
            <td className="px-5 py-4 font-semibold">{row.name}{row.id === user.id && <span className="ml-2 text-xs text-slate-400">You</span>}</td>
            <td className="px-5 py-4">{row.username}</td>
            <td className="px-5 py-4"><span className="rounded-full bg-foam px-2 py-1 text-xs font-semibold capitalize">{row.role}</span></td>
            <td className="px-5 py-4">{row.active ? <span className="font-semibold text-emerald-700">Active</span> : <span className="text-slate-400">Disabled</span>}</td>
            <td className="px-5 py-4 text-right"><button className="btn-ghost text-xs" onClick={() => setEditing(row)}>Edit</button></td>
          </tr>)}</tbody>
        </table></div>}
      </section>
      <p className="text-xs leading-relaxed text-slate-500">Every person should have their own account so sales, refunds, and stock movements can be attributed correctly. PINs are never shown after creation.</p>
    </div>
    {editing && <StaffModal staff={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load() }} />}
  </div>
}

function StaffModal({ staff, onClose, onDone }) {
  const editing = Boolean(staff.id)
  const [form, setForm] = useState({ username: staff.username || '', name: staff.name || '', role: staff.role || 'cashier', pin: '', active: staff.active ?? 1 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      if (editing) {
        const body = { name: form.name.trim(), role: form.role, active: form.active ? 1 : 0 }
        if (form.pin) body.pin = form.pin
        await api(`/auth/users/${staff.id}`, { method: 'PUT', body })
      } else {
        await api('/auth/users', { method: 'POST', body: { username: form.username.trim(), name: form.name.trim(), role: form.role, pin: form.pin } })
      }
      onDone()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <Modal onClose={() => { if (!busy) onClose() }} labelledBy="staff-title">
    <h2 id="staff-title" className="text-xl font-bold">{editing ? 'Edit staff account' : 'Add staff account'}</h2>
    <form onSubmit={submit} className="mt-4 space-y-3">
      {!editing && <label className="form-label">Username<input autoFocus required maxLength="40" autoCapitalize="none" className="field" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} /></label>}
      <label className="form-label">Full name<input autoFocus={editing} required maxLength="80" className="field" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></label>
      <label className="form-label">Role<select className="field" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="cashier">Cashier — sell and review receipts</option><option value="admin">Administrator — full access</option></select></label>
      <label className="form-label">{editing ? 'New PIN' : 'PIN'} <span className="font-normal text-slate-400">{editing ? 'Leave blank to keep current' : 'At least 4 characters'}</span><input required={!editing} type="password" autoComplete="new-password" minLength="4" maxLength="100" className="field" value={form.pin} onChange={e => setForm({ ...form, pin: e.target.value })} /></label>
      {editing && <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" checked={!!form.active} onChange={e => setForm({ ...form, active: e.target.checked ? 1 : 0 })} className="h-4 w-4" /><span><span className="block font-bold">Account active</span><span className="text-xs text-slate-500">Disabled accounts cannot sign in or use existing sessions.</span></span></label>}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-coral">{error}</p>}
      <div className="flex gap-2"><button type="button" className="btn-ghost flex-1" disabled={busy} onClick={onClose}>Cancel</button><button disabled={busy} className="btn-primary flex-1">{busy ? 'Saving…' : editing ? 'Save changes' : 'Add staff'}</button></div>
    </form>
  </Modal>
}
