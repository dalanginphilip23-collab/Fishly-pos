import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, download, openFile } from '../api'
import { money } from '../utils'
import BestSellers from '../components/BestSellers'
import SalesCharts from '../components/SalesCharts'
import Icon from '../components/Icon'
import SalesCalendar, { businessToday, shiftDate, displayDate } from '../components/SalesCalendar'

const today = businessToday

export default function Dashboard() {
  const [range, setRange] = useState({ from: today(), to: today() })
  const [data, setData] = useState(null)
  const [expense, setExpense] = useState({ category: 'purchase', title: '', description: '', qty: '', unit: '', unit_cost: '', amount: '', receipt_url: null })
  const [uploading, setUploading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanMessage, setScanMessage] = useState('')
  const [scanPreview, setScanPreview] = useState(null)
  const [error, setError] = useState('')
  const [exportError, setExportError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState(false)
  const expenseRequest = useRef(crypto.randomUUID())
  const expensePanel = useRef(null)
  const openExpense = () => {
    if (!expensePanel.current) return
    expensePanel.current.open = true
    expensePanel.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
    expensePanel.current.querySelector('input')?.focus({ preventScroll: true })
  }
  const presets = [
    ['Today', today(), today()],
    ['Yesterday', shiftDate(today(), -1), shiftDate(today(), -1)],
    ['Last 7 days', shiftDate(today(), -6), today()],
    ['This month', `${today().slice(0, 7)}-01`, today()],
  ]

  const load = useCallback(
    (signal) => {
      setLoading(true)
      setError('')
      return api(`/reports/summary?from=${range.from}&to=${range.to}`, { signal }).then(setData).catch((e) => { if (e.name !== 'AbortError') { setError(e.message); setData(null) } }).finally(() => { if (!signal?.aborted) setLoading(false) })
    },
    [range]
  )
  useEffect(() => { const controller = new AbortController(); load(controller.signal); return () => controller.abort() }, [load])

  const expenseAmount = expense.amount !== '' ? expense.amount : (expense.qty && expense.unit_cost ? (Number(expense.qty) * Number(expense.unit_cost)).toFixed(2) : '')

  const uploadReceipt = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setUploading(true)
    setError('')
    try {
      const result = await api('/reports/expenses/receipts', { method: 'POST', body: file })
      setExpense((current) => ({ ...current, receipt_url: result.receipt_url }))
    } catch (err) { setError(err.message) }
    finally { setUploading(false) }
  }

  const scanReceipt = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setScanning(true)
    setScanMessage('')
    setScanPreview(null)
    setError('')
    try {
      const result = await api('/reports/expenses/scan', { method: 'POST', body: file, timeout: 120000 })
      let columns = ''
      if (Array.isArray(result.headers)) columns = ` Columns: ${result.headers.filter(Boolean).join(' | ')}.`
      if (!result.items.length) {
        setScanMessage(`No expense lines were found.${columns}`)
      } else {
        setScanPreview({
          file_hash: result.file_hash,
          receipt_url: result.receipt_url,
          items: result.items.map((item, index) => ({ ...item, key: `${index}-${item.description}`, description: item.description, amount: String(item.amount) })),
        })
        setScanMessage(`Review ${result.items.length} detected line(s) before importing.${columns}`)
      }
    } catch (err) { setError(err.message) }
    finally { setScanning(false) }
  }

  const importExpenses = async () => {
    if (!scanPreview || scanning) return
    setScanning(true)
    setError('')
    try {
      const items = scanPreview.items.map((item) => {
        if (!item.description.trim()) throw new Error('Every imported line needs a description.')
        const amount = Number(item.amount)
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Every imported line needs an amount greater than zero.')
        return { ...item, description: item.description.trim(), amount }
      })
      await api('/reports/expenses/import', {
        method: 'POST',
        body: { file_hash: scanPreview.file_hash, receipt_url: scanPreview.receipt_url, items, request_id: crypto.randomUUID() },
      })
      setScanMessage(`Added ${items.length} expense line(s).`)
      setScanPreview(null)
      setRange({ from: today(), to: today() })
    } catch (err) { setError(err.message) }
    finally { setScanning(false) }
  }
  const addExpense = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/reports/expenses', {
        method: 'POST',
        body: {
          request_id: expenseRequest.current,
          category: expense.category,
          title: expense.title.trim() || undefined,
          description: expense.description.trim() || undefined,
          qty: expense.qty === '' ? null : Number(expense.qty),
          unit: expense.unit.trim() || undefined,
          unit_cost: expense.unit_cost === '' ? null : Number(expense.unit_cost),
          amount: Number(expenseAmount),
          receipt_url: expense.receipt_url,
        },
      })
      setExpense({ category: 'purchase', title: '', description: '', qty: '', unit: '', unit_cost: '', amount: '', receipt_url: null })
      expenseRequest.current = crypto.randomUUID()
      setRange({ from: today(), to: today() })
    } catch (err) {
      setError(err.message)
    } finally { setBusy(false) }
  }

  const exportSales = async () => {
    if (exporting) return
    setExporting(true)
    setExportError('')
    try {
      const name = `Fishly-Poppers-${range.from}${range.to === range.from ? '' : `-to-${range.to}`}.xlsx`
      await download(`/reports/export.xlsx?from=${range.from}&to=${range.to}`, name)
    } catch (err) {
      setExportError(err.message)
    } finally { setExporting(false) }
  }

  const showCosts = Boolean(data?.productSales?.some((item) => item.unit_cost !== null && item.unit_cost !== undefined))
  const cogs = Number(data?.cogs || 0)

  return (
    <div className="admin-dashboard relative h-full overflow-y-auto p-4 md:p-7 lg:p-8">
      <div className="relative mx-auto max-w-[1440px] space-y-6">
      <div className="workspace-heading flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3"><span className="workspace-heading-icon hidden sm:flex"><Icon name="chart" /></span><div><p className="mb-1 text-xs font-semibold uppercase tracking-widest text-wave">Fishly Poppers</p><h1 className="page-title">Sales Reports</h1><p className="page-subtitle">Review sales, expenses, and profit by date.</p></div></div>
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={loading || exporting} className="btn-ghost flex items-center gap-2 text-sm" onClick={exportSales}><Icon name={exporting ? 'refresh' : 'download'} className={exporting ? 'animate-spin' : ''} />{exporting ? 'Preparing…' : 'Export to Excel'}</button>
          <button disabled={loading || busy} className="btn-ghost flex items-center gap-2 text-sm" onClick={() => load()}><Icon name="refresh" className={loading ? 'animate-spin' : ''} />Refresh report</button>
        </div>
      </div>
      <section aria-label="Quick actions" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link to="/" className="btn-primary flex items-center justify-center gap-2"><Icon name="plus" />New sale</Link>
        <button type="button" disabled={loading || !data} onClick={openExpense} className="btn-ghost flex items-center justify-center gap-2"><Icon name="wallet" />Add expense</button>
        <Link to="/inventory" className="btn-ghost flex items-center justify-center gap-2"><Icon name="bag" />Purchases</Link>
        <Link to="/stock" className="btn-ghost flex items-center justify-center gap-2"><Icon name="grid" />Check stock</Link>
      </section>
      {exportError && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-coral">{exportError}</p>}
      <section className="panel flex flex-wrap items-center justify-between gap-4 p-4" aria-label="Report date filters">
        <div className="flex flex-wrap gap-1 rounded-xl bg-foam p-1">{presets.map(([label, from, to]) => <button key={label} type="button" aria-pressed={range.from === from && range.to === to} onClick={() => setRange({ from, to })} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${range.from === from && range.to === to ? 'bg-white text-wave shadow-sm' : 'text-slate-500 hover:text-ocean'}`}>{label}</button>)}</div>
        <div className="report-dates flex flex-wrap items-center gap-3">
        {['from', 'to'].map((k) => (
          <label key={k} className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            {k === 'from' ? 'From' : 'To'}
            <input type="date" className="field !w-auto !py-2" value={range[k]} min={k === 'to' ? range.from : undefined} max={k === 'from' ? range.to : undefined} onChange={(e) => { const value = e.target.value; if (value && (k === 'from' ? value <= range.to : value >= range.from)) setRange({ ...range, [k]: value }) }} />
          </label>
        ))}
        </div>
      </section>
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_310px]">
      <div className="min-w-0 space-y-5" aria-busy={loading}>
      <div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-bold">{range.from === range.to ? displayDate(range.from) : `${displayDate(range.from)} — ${displayDate(range.to)}`}</h2><span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Sales report</span></div>
      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-coral">{error}</p>}
      {loading && <div role="status"><p className="mb-3 text-sm text-slate-500">Loading sales…</p><div className="grid gap-3 sm:grid-cols-3">{[1, 2, 3].map(i => <div key={i} className="panel h-32 animate-pulse bg-slate-100" />)}</div></div>}
      {data && !loading && <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[['Total sales', money(data.revenue), 'register'], ['Total expenses', money(data.spent), 'wallet'], [data.net < 0 ? 'Net loss' : 'Net profit', money(data.net), 'chart']].map(([label, value, icon]) => (
          <div key={label} className={`panel p-5 ${label === 'Net profit' ? 'metric-feature' : label === 'Net loss' ? 'text-coral' : ''}`}>
            <div className="flex items-center gap-2"><span className="rounded-lg bg-sky p-2 text-wave"><Icon name={icon} className="!h-4 !w-4" /></span><p className="text-sm font-semibold text-slate-500">{label}</p></div>
            <p className="mt-3 break-words text-3xl font-bold tracking-tight tabular-nums">{value}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">Net profit here is sales minus recorded expenses. Product costs are shown separately in detailed reports.</p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-slate-200/70 bg-white/60 px-4 py-3 text-xs text-slate-500"><span><strong className="text-ocean">{data.orders}</strong> completed sales</span><span>Average sale <strong className="text-ocean">{money(data.orders ? data.revenue / data.orders : 0)}</strong></span><span>Discounts included · Cancelled orders excluded</span></div>
      <SalesCharts data={data} />
      <section className="panel p-5" aria-labelledby="recent-sales-title">
        <div className="flex items-center justify-between gap-3"><h2 id="recent-sales-title" className="text-base font-bold">Recent sales</h2><Link to="/orders" className="text-sm font-semibold text-wave">View receipts →</Link></div>
        <p className="mt-1 text-xs text-slate-500">Latest completed sales in the selected period.</p>
        <ul className="mt-4 divide-y divide-slate-100">
          {[...data.sales].sort((a, b) => new Date(b.created_at) - new Date(a.created_at) || b.id - a.id).slice(0, 5).map(sale => <li key={sale.id} className="flex items-center gap-3 py-3">
            <span className="rounded-lg bg-sky p-2 text-wave"><Icon name="check" className="!h-4 !w-4" /></span>
            <div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{sale.order_no}</p><p className="mt-1 text-xs text-slate-500">{new Date(sale.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</p></div>
            <span className="text-sm font-semibold tabular-nums text-wave">{money(sale.total)}</span>
          </li>)}
        </ul>
        {!data.sales.length && <div className="py-6 text-center"><p className="text-sm text-slate-500">No sales recorded for these dates.</p><Link to="/" className="mt-3 inline-flex text-sm font-semibold text-wave">Record a sale →</Link></div>}
      </section>
      <details className="panel p-5">
        <summary className="cursor-pointer text-sm font-bold text-wave">Import expenses from a receipt or file</summary>
        <p className="mb-4 mt-1 text-sm text-slate-500">Upload a photo, PDF, CSV, or XLSX list. Review the detected lines before importing them as expenses.</p>
        <div className="flex flex-wrap items-center gap-3">
          <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" onChange={scanReceipt} disabled={scanning} className="field !py-2" />
          {scanning && <span className="text-sm text-wave">Scanning receipt…</span>}
        </div>
        {scanMessage && <p className="mt-3 text-sm font-semibold text-emerald-700">{scanMessage}</p>}
        {scanPreview && <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
          <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead className="bg-foam text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-2">Description</th><th className="px-3 py-2">Amount (₱)</th><th className="px-3 py-2"><span className="sr-only">Remove</span></th></tr></thead>
            <tbody className="divide-y divide-slate-100">{scanPreview.items.map((item, index) => <tr key={item.key}>
              <td className="px-3 py-2"><input aria-label={`Description for line ${index + 1}`} className="field !py-2" maxLength="150" value={item.description} onChange={(e) => setScanPreview(current => ({ ...current, items: current.items.map((entry, i) => i === index ? { ...entry, description: e.target.value } : entry) }))} /></td>
              <td className="px-3 py-2"><input aria-label={`Amount for line ${index + 1}`} className="field !w-32 !py-2" type="number" min="0.01" step="0.01" value={item.amount} onChange={(e) => setScanPreview(current => ({ ...current, items: current.items.map((entry, i) => i === index ? { ...entry, amount: e.target.value } : entry) }))} /></td>
              <td className="px-3 py-2"><button type="button" className="text-xs font-bold text-coral" onClick={() => setScanPreview(current => ({ ...current, items: current.items.filter((_, i) => i !== index) }))}>Remove</button></td>
            </tr>)}</tbody>
          </table></div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-foam p-3">
            <p className="text-sm font-bold">Total {money(scanPreview.items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0))}</p>
            <div className="flex gap-2"><button type="button" className="btn-ghost text-xs" disabled={scanning} onClick={() => setScanPreview(null)}>Discard</button><button type="button" className="btn-primary text-xs" disabled={scanning || !scanPreview.items.length} onClick={importExpenses}>{scanning ? 'Importing…' : 'Import reviewed lines'}</button></div>
          </div>
        </div>}
      </details>

      <details ref={expensePanel} className="panel scroll-mt-4 p-5">
        <summary className="cursor-pointer text-base font-bold">Add expense</summary>
        <form onSubmit={addExpense} className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="form-label">Category
            <select className="field" value={expense.category} onChange={(e) => setExpense({ ...expense, category: e.target.value })}>
              <option value="rent">Rent</option>
              <option value="purchase">Purchased item</option>
              <option value="supplies">Supplies</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="form-label">Expense name
            <input className="field" maxLength="150" placeholder="e.g. Stall rent, cooking oil" value={expense.description} onChange={(e) => setExpense({ ...expense, description: e.target.value })} />
          </label>
          <label className="form-label sm:col-span-2">Total amount (₱)
            <input className="field" required type="number" min="0.01" max="99999999.99" step="0.01" placeholder="0.00" value={expenseAmount} onChange={(e) => setExpense({ ...expense, amount: e.target.value })} />
          </label>
          <details className="sm:col-span-2">
            <summary className="cursor-pointer text-sm font-semibold text-slate-500">Optional details & receipt</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="form-label sm:col-span-2">Title
            <input className="field" maxLength="150" placeholder="e.g. May 2026 groceries" value={expense.title || ''} onChange={(e) => setExpense({ ...expense, title: e.target.value })} />
          </label>
          <label className="form-label">Quantity
            <input className="field" type="number" min="1" step="1" placeholder="1" value={expense.qty} onChange={(e) => setExpense({ ...expense, qty: e.target.value, amount: '' })} />
          </label>
          <label className="form-label">Unit
            <input className="field" maxLength="20" placeholder="pcs, kg, L" value={expense.unit || ''} onChange={(e) => setExpense({ ...expense, unit: e.target.value })} />
          </label>
          <label className="form-label">Unit cost (₱)
            <input className="field" type="number" min="0" step="0.01" placeholder="0.00" value={expense.unit_cost} onChange={(e) => setExpense({ ...expense, unit_cost: e.target.value, amount: '' })} />
          </label>
          <label className="form-label sm:col-span-2">Receipt / list file (optional)
            <div className="flex items-center gap-2">
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv" onChange={uploadReceipt} className="field !py-2" disabled={uploading} />
              {uploading && <span className="text-xs text-wave">Uploading…</span>}
            </div>
            {expense.receipt_url && <button type="button" onClick={() => openFile(expense.receipt_url).catch(err => setError(err.message))} className="mt-1 block text-left text-xs font-semibold text-wave underline">View uploaded receipt</button>}
          </label>
            </div>
          </details>
          <div className="flex items-end">
            <button disabled={busy || uploading} className="btn-primary w-full">{busy ? 'Saving…' : 'Add expense'}</button>
          </div>
        </form>
        <p className="mt-3 text-xs text-slate-500">Recorded for today.</p>
      </details>
      <details className="panel p-5">
      <summary className="cursor-pointer text-base font-bold">Detailed reports & expense history</summary>
      <div className="mt-5 space-y-5">
      <BestSellers products={data.top} from={data.from} to={data.to} />
      <section className="panel overflow-hidden">
        <header className="p-5"><h2 className="text-lg font-bold">Selling prices & quantities</h2><p className="mt-1 text-xs text-slate-500">The actual price charged at checkout. If a price changes, sales at each price appear separately.</p></header>
        <div className="overflow-x-auto"><table className="w-full text-left text-sm">
          <thead className="bg-foam text-xs text-slate-500"><tr>{['Product', 'Price charged', 'Quantity sold', ...(showCosts ? ['Unit cost', 'Cost of goods'] : []), 'Total before discounts'].map((label) => <th key={label} scope="col" className="whitespace-nowrap p-4">{label}</th>)}</tr></thead>
          <tbody>{data.productSales.map((item) => <tr key={`${item.product_id}-${item.name}-${item.price}`} className="border-t border-slate-100"><td className="p-4 font-semibold">{item.name}</td><td className="whitespace-nowrap p-4 tabular-nums">{money(item.price)}</td><td className="p-4 tabular-nums">{item.qty}</td>{showCosts && <td className="whitespace-nowrap p-4 tabular-nums">{item.unit_cost === null || item.unit_cost === undefined ? '—' : money(item.unit_cost)}</td>}{showCosts && <td className="whitespace-nowrap p-4 tabular-nums">{item.unit_cost === null || item.unit_cost === undefined ? '—' : money(Number(item.unit_cost) * Number(item.qty))}</td>}<td className="whitespace-nowrap p-4 font-bold tabular-nums">{money(item.subtotal)}</td></tr>)}</tbody>
        </table></div>
        {!data.productSales.length && <p className="p-6 text-center text-sm text-slate-500">Complete a sale to see its selling prices here.</p>}
        <dl className={`grid gap-3 border-t border-slate-100 bg-foam p-5 ${showCosts ? 'sm:grid-cols-2 xl:grid-cols-5' : 'sm:grid-cols-3'}`}><div><dt className="text-xs text-slate-500">Sales before discounts</dt><dd className="mt-1 font-bold">{money(data.beforeDiscounts)}</dd></div><div><dt className="text-xs text-slate-500">Discounts deducted</dt><dd className="mt-1 font-bold">{money(data.discounts)}</dd></div><div><dt className="text-xs text-slate-500">Total sales collected</dt><dd className="mt-1 font-bold text-wave">{money(data.revenue)}</dd></div>{showCosts && <><div><dt className="text-xs text-slate-500">Estimated cost of goods</dt><dd className="mt-1 font-bold">{money(cogs)}</dd></div><div><dt className="text-xs text-slate-500">Estimated gross profit</dt><dd className="mt-1 font-bold">{money(Number(data.revenue) - cogs)}</dd></div></>}</dl>
        {showCosts && <p className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500">Product costs use the unit cost captured at the time of each sale. Net profit is total sales minus recorded expenses.</p>}
      </section>
      <section className="panel overflow-hidden">
        <div className="p-4"><h2 className="text-lg font-bold">Sales history</h2><p className="mt-1 text-xs text-slate-500">Payments collected in the selected period.</p></div>
        <div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-sm"><thead className="bg-foam"><tr>{['Receipt', 'Date', 'Sales'].map((label) => <th className="p-3" key={label}>{label}</th>)}</tr></thead><tbody>{data.sales.map((sale) => <tr key={sale.id} className="border-t border-slate-100"><td className="p-3 font-bold">{sale.order_no}</td><td className="p-3">{new Date(sale.created_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</td><td className="p-3">{money(sale.total)}</td></tr>)}</tbody></table></div>
        {!data.sales.length && <p className="p-6 text-center text-sm text-slate-500">No sales in this period yet.</p>}
      </section>

        <section className="panel p-4">
          <h2 className="mb-3 font-display text-lg font-extrabold">By day and payment</h2>
          <table className="w-full text-sm">
            <tbody>
              {data.days.map((d) => (
                <tr key={d.day} className="border-b border-blue-50"><td className="py-1.5">{d.day}</td><td>{d.orders} orders</td><td className="text-right font-bold">{money(d.revenue)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-sm font-bold">{data.payments.map((p) => `${p.method === 'cash' ? 'Cash' : 'GCash'} ${money(p.revenue)}`).join('  ·  ') || 'No payments yet.'}</p>
        </section>
      <section className="panel p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-extrabold">Recorded expenses</h2>
          <span className="text-xs text-slate-500">Corrections are voided, not deleted.</span>
        </div>
        {!data.expenses.length && <p className="text-sm text-slate-500">No expenses recorded for this period yet.</p>}
        {data.expenses.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-foam text-[11px] uppercase tracking-wider text-slate-500">
                <tr>{['Category', 'Ingredient', 'Quantity', 'Unit', 'Unit Cost', 'Total Cost', ''].map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.expenses.map((x) => (
                  <tr key={x.id}>
                    <td className="px-3 py-2"><span className="rounded-full bg-foam px-2 py-0.5 text-[10px] font-bold uppercase text-slate-500">{x.title || x.category || 'purchase'}</span></td>
                    <td className="px-3 py-2 font-semibold">{x.description}</td>
                    <td className="px-3 py-2 tabular-nums">{x.qty ?? '—'}</td>
                    <td className="px-3 py-2">{x.unit || '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{x.unit_cost == null ? '—' : money(x.unit_cost)}</td>
                    <td className="px-3 py-2 font-bold tabular-nums">{money(x.amount)}</td>
                    <td className="px-3 py-2"><button type="button" className="text-xs font-bold text-coral hover:underline" onClick={async () => { const reason = window.prompt('Why is this expense being voided?'); if (!reason?.trim()) return; try { await api(`/reports/expenses/${x.id}/void`, { method: 'POST', body: { reason: reason.trim(), request_id: crypto.randomUUID() } }); setRange({ ...range }) } catch (err) { setError(err.message) } }}>Void</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500">
          <span>Rent: <strong className="text-ocean">{money(data.rent || 0)}</strong></span>
          <span>Purchased items: <strong className="text-ocean">{money(data.purchases || 0)}</strong></span>
          <span>Other: <strong className="text-ocean">{money(data.otherExpenses || 0)}</strong></span>
        </div>
      </section>
      </div>
      </details>
      </>}
      </div>
      <aside className="space-y-4 xl:sticky xl:top-0">
        <section className="panel p-5">
          <h2 className="text-base font-bold">Your daily workflow</h2>
          <ol className="mt-4 space-y-5 text-sm">
            <li><Link to="/" className="font-semibold text-wave">1. Record a sale</Link><p className="mt-1 text-xs leading-5 text-slate-500">Pick items and flavors, then collect cash or GCash.</p></li>
            <li><Link to="/inventory" className="font-semibold text-wave">2. Record what you buy</Link><p className="mt-1 text-xs leading-5 text-slate-500">Receive stock and track your supplier purchases.</p></li>
            <li><Link to="/orders" className="font-semibold text-wave">3. Review your sales</Link><p className="mt-1 text-xs leading-5 text-slate-500">Check completed sales and print receipts when needed.</p></li>
          </ol>
        </section>
        <details className="panel p-4"><summary className="cursor-pointer text-sm font-semibold">Browse calendar</summary><div className="mt-4"><SalesCalendar range={range} onChange={setRange} /></div></details>
        <p className="px-1 text-xs leading-6 text-slate-500">Reports use Philippine time. Net profit is sales minus recorded expenses.</p>
      </aside>
      </div>
      </div>
    </div>
  )
}
