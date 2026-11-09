import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { money } from '../utils'
import Icon from '../components/Icon'

export default function Shifts() {
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { setRows(await api('/shifts')) } catch (e) { setError(e.message) } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  return <div className="workspace-surface h-full overflow-y-auto p-4 md:p-7">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div><h1 className="page-title">Shift reconciliation</h1><p className="page-subtitle">Cash drawer and GCash totals for each closed shift.</p></div>
        <button className="btn-ghost inline-flex items-center gap-2" disabled={loading} onClick={load}><Icon name="refresh" />Refresh</button>
      </header>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-coral">{error}</p>}
      <section className="panel overflow-hidden">
        {loading ? <p className="p-12 text-center text-sm text-slate-500">Loading shifts…</p> : !rows.length ? <p className="p-12 text-center text-sm text-slate-500">No shifts recorded yet.</p> : <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-sm">
          <thead className="bg-foam text-[11px] uppercase tracking-wider text-slate-500"><tr>{['Cashier', 'Opened', 'Closed', 'Opening cash', 'Expected cash', 'Counted cash', 'Variance', 'Expected GCash', 'Counted GCash'].map(h => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.id}>
            <td className="px-4 py-3 font-semibold">{row.user_name}{!row.closed_at && <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Open</span>}</td>
            <td className="px-4 py-3">{new Date(row.opened_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</td>
            <td className="px-4 py-3">{row.closed_at ? new Date(row.closed_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' }) : '—'}</td>
            <td className="px-4 py-3 tabular-nums">{money(row.opening_cash)}</td>
            <td className="px-4 py-3 tabular-nums">{row.expected_cash == null ? '—' : money(row.expected_cash)}</td>
            <td className="px-4 py-3 tabular-nums">{row.counted_cash == null ? '—' : money(row.counted_cash)}</td>
            <td className={`px-4 py-3 font-bold tabular-nums ${row.variance == null ? '' : Number(row.variance) === 0 ? 'text-emerald-700' : 'text-coral'}`}>{row.variance == null ? '—' : money(row.variance)}</td>
            <td className="px-4 py-3 tabular-nums">{row.expected_gcash == null ? '—' : money(row.expected_gcash)}</td>
            <td className="px-4 py-3 tabular-nums">{row.counted_gcash == null ? '—' : money(row.counted_gcash)}</td>
          </tr>)}</tbody>
        </table></div>}
      </section>
      <p className="text-xs leading-relaxed text-slate-500">Variance is counted cash minus expected cash. Expected cash includes the opening float, cash sales, cash refunds, and recorded cash in/out movements. Review every variance before accepting the shift.</p>
    </div>
  </div>
}
