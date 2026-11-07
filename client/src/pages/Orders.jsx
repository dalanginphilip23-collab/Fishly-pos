import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { money, time } from '../utils'
import Modal from '../components/Modal'
import Receipt from '../components/Receipt'
import { useAuth } from '../context/Auth'
import Icon from '../components/Icon'

export default function Orders() {
  const { user } = useAuth()
  const [orders, setOrders] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [receipt, setReceipt] = useState(null)
  const closeReceipt = useCallback(() => setReceipt(null), [])

  const load = useCallback(async (signal) => {
    setLoading(true)
    setError('')
    try {
      setOrders(await api('/orders', { signal }))
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load])

  return (
    <div className="workspace-surface flex h-full flex-col gap-5 overflow-y-auto p-4 md:p-7">
      <header className="flex items-center justify-between gap-3">
        <div><h1 className="page-title">{user.role === 'admin' ? 'Today’s orders' : 'Today’s sales'}</h1><p className="page-subtitle">Review payments and print customer receipts.</p></div>
        <button className="btn-ghost flex items-center gap-2" disabled={loading} onClick={() => load()}><Icon name="refresh" /><span className="hidden sm:inline">Refresh</span><span className="sr-only sm:hidden">Refresh orders</span></button>
      </header>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-coral">{error}</p>}
      {loading ? <p role="status" className="py-12 text-center text-slate-500">Loading sales…</p> : (
        <div className="min-w-0">
          <div className="space-y-3 md:hidden">{orders.map(order => <article key={order.id} className="panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold">{order.order_no}</h2><span className="text-sm font-bold tabular-nums">{money(order.total)}</span></div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500"><span>{time(order.created_at)}</span><span>· {order.payment_method === 'cash' ? 'Cash' : 'GCash'}</span>{order.status === 'cancelled' && <span className="font-semibold text-coral">· Cancelled</span>}</div>
            <button className="btn-ghost mt-4 w-full text-sm" onClick={() => setReceipt(order)}>View receipt</button>
          </article>)}</div>
          <div className="panel hidden overflow-x-auto md:block"><table className="w-full whitespace-nowrap text-left text-sm">
            <thead className="bg-foam text-xs text-slate-500"><tr>{['Receipt no.', 'Time', 'Payment', 'Total', 'Receipt'].map((label) => <th key={label} className="p-4">{label}</th>)}</tr></thead>
            <tbody>{orders.map((order) => (
              <tr key={order.id} className="border-t border-slate-100 transition-colors hover:bg-sky/40">
                <td className="p-4 font-bold">{order.order_no}{order.status === 'cancelled' && <span className="ml-2 text-xs text-coral">Cancelled</span>}</td>
                <td className="p-4">{time(order.created_at)}</td>
                <td className="p-4"><span className="rounded-md bg-foam px-3 py-1 text-xs font-medium text-slate-500">{order.payment_method === 'cash' ? 'Cash' : 'GCash'}</span></td>
                <td className="p-4 font-bold">{money(order.total)}</td>
                <td className="p-4"><button className="btn-ghost text-xs" onClick={() => setReceipt(order)}>View receipt</button></td>
              </tr>
            ))}</tbody>
          </table></div>
          {!orders.length && !error && <p className="p-12 text-center text-sm text-slate-500">{user.role === 'admin' ? 'No orders yet today. Completed cashier sales will appear here.' : 'No sales yet today. Complete a payment at the register to get started.'}</p>}
        </div>
      )}
      {receipt && <Modal labelledBy="receipt-title" onClose={closeReceipt}>
        <h2 id="receipt-title" className="mb-4 text-lg font-bold">Sale receipt</h2>
        <Receipt order={receipt} />
        {receipt.note && <p className="mt-4 text-sm text-slate-500">Note: {receipt.note}</p>}
        <div className="mt-5 flex gap-2"><button className="btn-ghost flex-1" onClick={closeReceipt}>Close</button><button className="btn-primary flex-1" onClick={() => window.print()}>Print receipt</button></div>
      </Modal>}
    </div>
  )
}
