import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { money } from '../utils'
import Modal from '../components/Modal'
import Receipt from '../components/Receipt'
import { useAuth } from '../context/Auth'
import Icon from '../components/Icon'
import { businessToday } from '../components/SalesCalendar'

export default function Orders() {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [receipt, setReceipt] = useState(null)
  const [refund, setRefund] = useState(null)
  const [range, setRange] = useState({ from: businessToday(), to: businessToday(), q: '' })
  const closeReceipt = useCallback(() => setReceipt(null), [])

  const load = useCallback(async (signal) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ from: range.from, to: range.to, ...(range.q.trim() && { q: range.q.trim() }) })
      setOrders(await api(`/orders?${params}`, { signal }))
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [range])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  return (
    <div className="workspace-surface flex h-full flex-col gap-5 overflow-y-auto p-4 md:p-7">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="page-title">{user.role === 'admin' ? 'Orders' : 'Today’s sales'}</h1><p className="page-subtitle">Review payments, print receipts, and correct completed sales.</p></div>
        <button className="btn-ghost flex items-center gap-2" disabled={loading} onClick={() => load()}><Icon name="refresh" /><span className="hidden sm:inline">Refresh</span><span className="sr-only sm:hidden">Refresh orders</span></button>
      </header>
      <section className="panel flex flex-wrap items-end gap-3 p-4" aria-label="Receipt filters">
        {['from', 'to'].map(key => <label key={key} className="form-label">{key === 'from' ? 'From' : 'To'}<input type="date" className="field !w-auto !py-2" value={range[key]} max={key === 'from' ? range.to : undefined} min={key === 'to' ? range.from : undefined} onChange={e => { const value = e.target.value; if (value && (key === 'from' ? value <= range.to : value >= range.from)) setRange({ ...range, [key]: value }) }} /></label>)}
        <label className="form-label min-w-48 flex-1">Receipt number<input className="field !py-2" placeholder="Search receipt…" value={range.q} onChange={e => setRange({ ...range, q: e.target.value })} /></label>
      </section>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-coral">{error}</p>}
      {loading ? <p role="status" className="py-12 text-center text-slate-500">Loading sales…</p> : (
        <div className="min-w-0">
          <div className="space-y-3 md:hidden">{orders.map(order => <article key={order.id} className="panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">{order.order_no}</h2><span className="text-sm font-bold tabular-nums">{money(order.total)}</span></div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500"><span>{new Date(order.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</span><span>· {order.payment_method === 'cash' ? 'Cash' : 'GCash'}</span>{order.status === 'cancelled' && <span className="font-semibold text-coral">· Refunded</span>}</div>
            <div className="mt-4 flex gap-2"><button className="btn-ghost flex-1 text-sm" onClick={() => setReceipt(order)}>View receipt</button>{user.role === 'admin' && order.status !== 'cancelled' && <button className="btn-ghost flex-1 text-sm" onClick={() => setRefund(order)}>Refund</button>}</div>
          </article>)}</div>
          <div className="panel hidden overflow-x-auto md:block"><table className="w-full whitespace-nowrap text-left text-sm">
            <thead className="bg-foam text-xs text-slate-500"><tr>{['Receipt no.', 'Date & time', 'Payment', 'Total', 'Receipt', ...(user.role === 'admin' ? ['Correction'] : [])].map((label) => <th key={label} className="p-4">{label}</th>)}</tr></thead>
            <tbody>{orders.map((order) => (
              <tr key={order.id} className="border-t border-slate-100 transition-colors hover:bg-sky/40">
                <td className="p-4 font-bold">{order.order_no}{order.status === 'cancelled' && <span className="ml-2 text-xs text-coral">Refunded</span>}</td>
                <td className="p-4">{new Date(order.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</td>
                <td className="p-4"><span className="rounded-md bg-foam px-3 py-1 text-xs font-medium text-slate-500">{order.payment_method === 'cash' ? 'Cash' : 'GCash'}{order.payment_reference ? ` · ${order.payment_reference}` : ''}</span></td>
                <td className="p-4 font-bold">{money(order.total)}</td>
                <td className="p-4"><button className="btn-ghost text-xs" onClick={() => setReceipt(order)}>View receipt</button></td>
                {user.role === 'admin' && <td className="p-4">{order.status !== 'cancelled' ? <button className="btn-ghost text-xs" onClick={() => setRefund(order)}>Refund</button> : <span className="text-xs text-slate-400">Completed</span>}</td>}
              </tr>
            ))}</tbody>
          </table></div>
          {!orders.length && !error && <p className="p-12 text-center text-sm text-slate-500">No sales in this date range.</p>}
        </div>
      )}
      {receipt && <Modal labelledBy="receipt-title" onClose={closeReceipt}>
        <h2 id="receipt-title" className="mb-4 text-lg font-bold">Sale receipt</h2>
        <Receipt order={receipt} />
        {receipt.note && <p className="mt-4 text-sm text-slate-500">Note: {receipt.note}</p>}
        <div className="mt-5 flex gap-2"><button className="btn-ghost flex-1" onClick={closeReceipt}>Close</button><button className="btn-primary flex-1" onClick={() => window.print()}>Print receipt</button></div>
      </Modal>}
      {refund && <RefundModal order={refund} onClose={() => setRefund(null)} onDone={() => { setRefund(null); load() }} />}
    </div>
  )
}

function RefundModal({ order, onClose, onDone }) {
  const [reason, setReason] = useState('')
  const [restock, setRestock] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    if (busy || !reason.trim()) return
    setBusy(true); setError('')
    try {
      await api(`/orders/${order.id}/refund`, { method: 'POST', body: { reason: reason.trim(), restock, request_id: crypto.randomUUID() } })
      onDone()
    } catch (err) { setError(err.message) } finally { setBusy(false) }
  }
  return <Modal onClose={() => { if (!busy) onClose() }} labelledBy="refund-title">
    <h2 id="refund-title" className="text-xl font-bold">Refund {order.order_no}</h2>
    <p className="mt-1 text-sm text-slate-500">This reverses the full sale of {money(order.total)}. The original receipt stays in history with a refunded status.</p>
    <form onSubmit={submit} className="mt-4 space-y-4">
      <label className="form-label">Reason<input autoFocus required maxLength="200" className="field" value={reason} onChange={e => setReason(e.target.value)} /></label>
      <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} className="mt-1 h-4 w-4" /><span><span className="block font-bold">Return items to stock</span><span className="text-xs text-slate-500">Turn this off for food that was already prepared or cannot be resold.</span></span></label>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-coral">{error}</p>}
      <div className="flex gap-2"><button type="button" className="btn-ghost flex-1" disabled={busy} onClick={onClose}>Cancel</button><button disabled={busy || !reason.trim()} className="btn-primary flex-1">{busy ? 'Refunding…' : 'Record refund'}</button></div>
    </form>
  </Modal>
}
