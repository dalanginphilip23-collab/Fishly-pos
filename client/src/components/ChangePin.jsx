import { useState } from 'react'
import { useAuth } from '../context/Auth'
import Modal from './Modal'

export default function ChangePin({ onClose }) {
  const { changePin } = useAuth()
  const [form, setForm] = useState({ current: '', next: '', confirm: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    if (form.next !== form.confirm) { setError('The new PINs do not match.'); return }
    if (form.next.length < 4) { setError('The new PIN must be at least 4 characters.'); return }
    setBusy(true); setError('')
    try {
      await changePin(form.current, form.next)
      setDone(true)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <Modal onClose={onClose} labelledBy="pin-title">
    <h2 id="pin-title" className="text-xl font-bold">Change PIN</h2>
    {done ? <>
      <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">PIN changed. Other signed-in devices for this account have been signed out.</p>
      <button className="btn-primary mt-5 w-full" onClick={onClose}>Done</button>
    </> : <form onSubmit={submit} className="mt-4 space-y-3">
      <label className="form-label">Current PIN<input autoFocus required type="password" autoComplete="current-password" className="field" value={form.current} onChange={e => setForm({ ...form, current: e.target.value })} /></label>
      <label className="form-label">New PIN<input required type="password" autoComplete="new-password" minLength="4" className="field" value={form.next} onChange={e => setForm({ ...form, next: e.target.value })} /></label>
      <label className="form-label">Confirm new PIN<input required type="password" autoComplete="new-password" minLength="4" className="field" value={form.confirm} onChange={e => setForm({ ...form, confirm: e.target.value })} /></label>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-coral">{error}</p>}
      <div className="flex gap-2"><button type="button" className="btn-ghost flex-1" onClick={onClose}>Cancel</button><button disabled={busy} className="btn-primary flex-1">{busy ? 'Saving…' : 'Change PIN'}</button></div>
    </form>}
  </Modal>
}
