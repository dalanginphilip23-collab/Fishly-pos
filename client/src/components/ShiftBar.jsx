import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { money } from '../utils'
import Modal from './Modal'
import Icon from './Icon'

export default function ShiftBar({ onShiftChange }) {
  const [shift, setShift] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [movement, setMovement] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try { setShift(await api('/shifts/current')) }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { onShiftChange?.(shift) }, [shift, onShiftChange])

  if (loading) return <div className="mb-3 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 text-xs text-slate-500">Checking the cash drawer…</div>
  if (error) return <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-coral"><span>Shift status: {error}</span><button className="font-bold underline" onClick={load}>Retry</button></div>
  if (!shift) return <>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm">
      <span className="font-semibold text-amber-900">Open a shift before taking payment.</span>
      <button className="btn-primary !py-2 text-xs" onClick={() => setOpen(true)}>Open shift</button>
    </div>
    {open && <OpenShift onClose={() => setOpen(false)} onDone={() => { setOpen(false); load() }} />}
  </>

  return <>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm">
      <span className="text-emerald-900"><strong>Shift open</strong> · Float {money(shift.opening_cash)} · Expected cash <strong>{money(shift.totals.expected_cash)}</strong> · GCash {money(shift.totals.expected_gcash)}</span>
      <span className="flex gap-2">
        <button className="btn-ghost !py-2 text-xs" onClick={() => setMovement(true)}>Cash in/out</button>
        <button className="btn-ghost !py-2 text-xs" onClick={() => setClosing(true)}>Close shift</button>
      </span>
    </div>
    {movement && <CashMovement shift={shift} onClose={() => setMovement(false)} onDone={() => { setMovement(false); load() }} />}
    {closing && <CloseShift shift={shift} onClose={() => setClosing(false)} onDone={() => { setClosing(false); load() }} />}
  </>
}

function OpenShift({ onClose, onDone }) {
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef(crypto.randomUUID())
  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      await api('/shifts/open', { method: 'POST', body: { opening_cash: Number(amount), request_id: requestRef.current } })
      onDone()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <Modal onClose={onClose} labelledBy="open-shift-title">
    <h2 id="open-shift-title" className="text-xl font-bold">Open shift</h2>
    <p className="mt-1 text-sm text-slate-500">Count the cash already in the drawer before the first sale.</p>
    <form onSubmit={submit} className="mt-5 space-y-4">
      <label className="form-label">Opening cash (₱)<input autoFocus required className="field" type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-coral">{error}</p>}
      <div className="flex gap-2"><button type="button" className="btn-ghost flex-1" onClick={onClose}>Cancel</button><button disabled={busy || amount === ''} className="btn-primary flex-1">{busy ? 'Opening…' : 'Open shift'}</button></div>
    </form>
  </Modal>
}

function CashMovement({ shift, onClose, onDone }) {
  const [form, setForm] = useState({ direction: 'out', amount: '', reason: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef(crypto.randomUUID())
  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      await api(`/shifts/${shift.id}/movements`, { method: 'POST', body: { ...form, amount: Number(form.amount), request_id: requestRef.current } })
      onDone()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <Modal onClose={onClose} labelledBy="movement-title">
    <h2 id="movement-title" className="text-xl font-bold">Cash in / out</h2>
    <form onSubmit={submit} className="mt-4 space-y-4">
      <label className="form-label">Type<select className="field" value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}><option value="out">Cash out</option><option value="in">Cash in</option></select></label>
      <label className="form-label">Amount (₱)<input required className="field" type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></label>
      <label className="form-label">Reason<input required maxLength="200" className="field" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></label>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-coral">{error}</p>}
      <div className="flex gap-2"><button type="button" className="btn-ghost flex-1" onClick={onClose}>Cancel</button><button disabled={busy} className="btn-primary flex-1">{busy ? 'Saving…' : 'Record movement'}</button></div>
    </form>
  </Modal>
}

function CloseShift({ shift, onClose, onDone }) {
  const [form, setForm] = useState({ counted_cash: '', counted_gcash: '', notes: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const requestRef = useRef(crypto.randomUUID())
  const submit = async (e) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError('')
    try {
      const closed = await api(`/shifts/${shift.id}/close`, { method: 'POST', body: { counted_cash: Number(form.counted_cash), counted_gcash: Number(form.counted_gcash || 0), notes: form.notes || null, request_id: requestRef.current } })
      setResult(closed)
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  if (result) return <Modal onClose={onDone} labelledBy="closed-title">
    <h2 id="closed-title" className="text-xl font-bold">Shift closed</h2>
    <dl className="mt-4 space-y-2 text-sm">
      <div className="flex justify-between"><dt>Expected cash</dt><dd className="font-bold">{money(result.totals.expected_cash)}</dd></div>
      <div className="flex justify-between"><dt>Counted cash</dt><dd className="font-bold">{money(result.counted_cash)}</dd></div>
      <div className={`flex justify-between ${Number(result.totals.variance) === 0 ? 'text-emerald-700' : 'text-coral'}`}><dt>Cash variance</dt><dd className="font-bold">{money(result.totals.variance)}</dd></div>
      <div className="flex justify-between"><dt>Expected GCash</dt><dd className="font-bold">{money(result.totals.expected_gcash)}</dd></div>
      <div className="flex justify-between"><dt>Counted GCash</dt><dd className="font-bold">{money(result.counted_gcash)}</dd></div>
      <div className={`flex justify-between ${Number(result.totals.gcash_variance) === 0 ? 'text-emerald-700' : 'text-coral'}`}><dt>GCash variance</dt><dd className="font-bold">{money(result.totals.gcash_variance)}</dd></div>
    </dl>
    <button className="btn-primary mt-5 w-full" onClick={onDone}>Start next shift</button>
  </Modal>
  return <Modal onClose={onClose} labelledBy="close-shift-title">
    <h2 id="close-shift-title" className="text-xl font-bold">Close shift</h2>
    <p className="mt-1 text-sm text-slate-500">Count the drawer and the GCash account. A nonzero variance is preserved for review.</p>
    <form onSubmit={submit} className="mt-4 space-y-4">
      <div className="rounded-xl bg-foam p-3 text-sm"><p className="flex justify-between"><span>Expected cash</span><strong>{money(shift.totals.expected_cash)}</strong></p><p className="mt-1 flex justify-between"><span>Expected GCash</span><strong>{money(shift.totals.expected_gcash)}</strong></p></div>
      <label className="form-label">Counted cash (₱)<input autoFocus required className="field" type="number" min="0" step="0.01" value={form.counted_cash} onChange={e => setForm({ ...form, counted_cash: e.target.value })} /></label>
      <label className="form-label">Counted GCash (₱)<input required className="field" type="number" min="0" step="0.01" value={form.counted_gcash} onChange={e => setForm({ ...form, counted_gcash: e.target.value })} /></label>
      <label className="form-label">Notes <span className="font-normal text-slate-400">Optional</span><textarea className="field resize-none" rows="2" maxLength="500" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></label>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-coral">{error}</p>}
      <div className="flex gap-2"><button type="button" className="btn-ghost flex-1" onClick={onClose}>Back</button><button disabled={busy} className="btn-primary flex-1">{busy ? 'Closing…' : 'Close shift'}</button></div>
    </form>
  </Modal>
}
