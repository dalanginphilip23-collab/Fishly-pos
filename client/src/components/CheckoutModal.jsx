import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { useCart } from '../context/Cart'
import { money } from '../utils'
import Receipt from './Receipt'
import Modal from './Modal'

export default function CheckoutModal({ onClose, onDone }) {
  const { lines, total, dispatch } = useCart()
  const [method, setMethod] = useState('cash')
  const [discount, setDiscount] = useState('')
  const [cash, setCash] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [order, setOrder] = useState(null)
  const [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [customerId, setCustomerId] = useState('')
  const [customers, setCustomers] = useState([])
  useEffect(() => { api('/customers').then(setCustomers).catch(() => {}) }, [])
  const submitting = useRef(false)

  const validAmount = (value) => Number.isFinite(Number(value)) && Number(value) >= 0 && Math.abs(Number(value) * 100 - Math.round(Number(value) * 100)) < 0.00001
  const validDiscount = validAmount(discount) && Number(discount) <= total
  const due = Math.max(Math.round(total * 100) - Math.round((Number(discount) || 0) * 100), 0) / 100
  const change = (Math.round(Number(cash) * 100) - Math.round(due * 100)) / 100
  const quick = [...new Set([due, 50, 100, 200, 500, 1000].filter((n) => n >= due))].slice(0, 4)
  const canPay = lines.length > 0 && validDiscount && (method === 'gcash' ? confirmed : cash !== '' && validAmount(cash) && change >= 0)
  const dismiss = useCallback(() => { if (!submitting.current && !order) onClose() }, [onClose, order])

  const submit = async () => {
    if (!canPay || submitting.current) return
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      const result = await api('/orders', {
        method: 'POST',
        body: {
          items: lines.map((l) => ({ productId: l.id, qty: l.qty })),
          payment_method: method,
          order_type: 'dine_in',
          discount: Number(discount) || 0,
          expected_subtotal: total,
          cash_received: method === 'cash' ? Number(cash) : null,
          note: note.trim() || null,
          customer_id: customerId ? Number(customerId) : null,
        },
      })
      dispatch({ type: 'clear' })
      setOrder(result)
    } catch (e) {
      setError(e.message)
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <Modal labelledBy="checkout-title" onClose={dismiss}>
        {order ? (
          <>
            <h2 id="checkout-title" className="mb-4 rounded-xl bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-700">Payment recorded · Sale complete</h2>
            <Receipt order={order} />
            <div className="mt-4 flex gap-2">
              <button className="btn-ghost flex-1" onClick={() => window.print()}>Print receipt</button>
              <button className="btn-primary flex-1" onClick={onDone}>New order</button>
            </div>
          </>
        ) : (
          <fieldset disabled={busy} className="space-y-4">
            <h2 id="checkout-title" className="font-display text-2xl font-extrabold">Take payment</h2>
            <p className="!mt-1 text-sm text-slate-500">Dine in · {lines.reduce((sum, line) => sum + line.qty, 0)} items</p>
            <div className="flex gap-2">
              {[['cash', 'Cash'], ['gcash', 'GCash']].map(([v, label]) => (
                <button key={v} aria-pressed={method === v} onClick={() => setMethod(v)} className={`flex-1 rounded-xl py-3 font-bold ${method === v ? 'bg-ocean text-white' : 'bg-sky'}`}>
                  {label}
                </button>
              ))}
            </div>
            <label className="grid gap-1 text-sm font-bold">
              Discount (₱)
              <input className="field" type="number" min="0" max={total} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </label>
            {!validDiscount && <p role="alert" className="text-sm text-coral">Enter a discount between zero and {money(total)}, with up to two decimals.</p>}
            <div className="flex flex-wrap items-end justify-between gap-2 rounded-2xl bg-ocean p-5 text-white">
              <span className="font-bold">Amount due</span>
              <span className="font-display text-3xl font-extrabold">{money(due)}</span>
            </div>
            {method === 'cash' && (
              <div className="space-y-2">
                <label className="grid gap-1 text-sm font-bold">
                  Cash received (₱)
                  <input className="field text-lg" type="number" min="0" step="0.01" autoFocus value={cash} onChange={(e) => setCash(e.target.value)} />
                </label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {quick.map((n) => (
                    <button key={n} onClick={() => setCash(String(n))} className="btn-ghost flex-1 !px-2 !py-2 text-sm">{money(n).replace('.00', '')}</button>
                  ))}
                </div>
                {cash !== '' && change >= 0 && <p className="text-right font-bold">Change: {money(change)}</p>}
              </div>
            )}
            {method === 'gcash' && <label className="flex items-start gap-3 rounded-xl bg-blue-50 p-3 text-sm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 h-4 w-4" /><span>I verified that {money(due)} was received in the merchant’s GCash account.</span></label>}
            <label className="grid gap-1 text-sm font-bold">Customer <span className="font-normal text-slate-400">Optional</span>
              <select className="field" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
                <option value="">Walk-in customer</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm font-bold">Sale note <span className="font-normal text-slate-400">Optional</span><textarea className="field resize-none" rows="2" maxLength="200" placeholder="Add a note for this sale" value={note} onChange={(e) => setNote(e.target.value)} /></label>
            {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-coral">{error}</p>}
            <div className="flex gap-2">
              <button className="btn-ghost flex-1" disabled={busy} onClick={onClose}>Back</button>
              <button className="btn-primary flex-1" disabled={!canPay || busy} onClick={submit}>{busy ? 'Saving…' : 'Confirm payment'}</button>
            </div>
          </fieldset>
        )}
    </Modal>
  )
}
