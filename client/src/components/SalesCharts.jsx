import { money } from '../utils'
import { memo } from 'react'
import { displayDate } from './SalesCalendar'

const shortMoney = (value) => `₱${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)}`
const colors = ['var(--action)', 'var(--chart-muted)', 'var(--chart-strong)']

function ChartCard({ title, subtitle, children, className = '' }) {
  return <section className={`panel min-w-0 p-5 ${className}`}>
    <h2 className="text-base font-bold">{title}</h2>
    <p className="mb-5 mt-1 text-xs text-slate-500">{subtitle}</p>
    {children}
  </section>
}

function SalesCharts({ data }) {
  const byDay = new Map(data.days.map(day => [day.day, Number(day.revenue)]))
  const start = Date.parse(`${data.from}T00:00:00Z`)
  const end = Date.parse(`${data.to}T00:00:00Z`)
  const dayCount = Math.round((end - start) / 86400000) + 1
  // Group long ranges into at most 31 buckets, including days without sales.
  const bucketSize = Math.max(1, Math.ceil(dayCount / 31))
  const buckets = []
  for (let index = 0; index < dayCount; index += bucketSize) {
    const from = new Date(start + index * 86400000).toISOString().slice(0, 10)
    const to = new Date(Math.min(end, start + (index + bucketSize - 1) * 86400000)).toISOString().slice(0, 10)
    buckets.push({ from, to, value: 0 })
  }
  for (const [day, value] of byDay) {
    const index = Math.floor((Date.parse(`${day}T00:00:00Z`) - start) / 86400000 / bucketSize)
    if (buckets[index]) buckets[index].value += value
  }
  const peak = Math.max(1, ...buckets.map(bucket => bucket.value))
  const width = Math.max(500, buckets.length * 48 + 70)
  const plotWidth = width - 70
  const step = plotWidth / Math.max(1, buckets.length)
  const points = buckets.map((bucket, index) => ({ x: 60 + step * (index + 0.5), y: 175 - bucket.value / peak * 145 }))
  const trend = points.map(point => `${point.x},${point.y}`).join(' ')
  const financials = [
    { label: 'Sales', value: Number(data.revenue), color: 'var(--action)' },
    { label: 'Expenses', value: Number(data.spent), color: 'var(--chart-muted)' },
    { label: Number(data.net) < 0 ? 'Net loss' : 'Net profit', value: Number(data.net), color: Number(data.net) < 0 ? '#d62839' : 'var(--chart-strong)' },
  ]
  const financialPeak = Math.max(1, ...financials.map(item => Math.abs(item.value)))
  const payments = data.payments.map((payment, index) => ({
    label: payment.method === 'cash' ? 'Cash' : payment.method === 'gcash' ? 'GCash' : payment.method,
    value: Number(payment.revenue), color: colors[index % colors.length],
  }))
  const paymentTotal = payments.reduce((total, payment) => total + payment.value, 0)
  let position = 0
  const segments = payments.map(payment => {
    const start = position
    position += paymentTotal ? payment.value / paymentTotal * 100 : 0
    return `${payment.color} ${start}% ${position}%`
  })

  return <div className="grid gap-5 md:grid-cols-2">
    <ChartCard title="Sales trend" subtitle={`${bucketSize === 1 ? 'Daily sales' : `Sales grouped into ${bucketSize}-day periods`} · after discounts, excluding cancelled orders.`} className="md:col-span-2">
      <div className="overflow-x-auto rounded-xl" tabIndex={0} role="region" aria-label="Sales chart; scroll horizontally for more dates">
        <svg viewBox={`0 0 ${width} 225`} style={{ minWidth: width }} className="h-56 w-full" role="img" aria-label={`Sales from ${displayDate(data.from)} to ${displayDate(data.to)}. Total ${money(data.revenue)}. Exact amounts are listed below.`}>
          {[0, 0.5, 1].map(tick => <g key={tick}>
            <line x1="60" x2={width - 10} y1={175 - tick * 145} y2={175 - tick * 145} stroke="var(--line)" strokeDasharray={tick ? '4 4' : undefined} />
            <text x="52" y={179 - tick * 145} textAnchor="end" fill="#64748b" fontSize="10">{shortMoney(peak * tick)}</text>
          </g>)}
          {points.length > 1 && <>
            <polygon points={`${points[0].x},175 ${trend} ${points.at(-1).x},175`} fill="var(--action)" opacity="0.08" />
            <polyline points={trend} fill="none" stroke="var(--action)" strokeWidth="2.5" strokeLinejoin="round" />
          </>}
          {buckets.map((bucket, index) => {
            const { x, y } = points[index]
            return <g key={bucket.from}>
              <title>{displayDate(bucket.from)}{bucket.from !== bucket.to ? ` – ${displayDate(bucket.to)}` : ''}: {money(bucket.value)}</title>
              <circle cx={x} cy={y} r="4" fill="var(--surface)" stroke="var(--action)" strokeWidth="2" />
              <text x={x} y="199" textAnchor="middle" fill="#64748b" fontSize="10">{bucket.from.slice(5).replace('-', '/')}</text>
            </g>
          })}
        </svg>
      </div>
      {!data.days.length && <p className="mt-2 text-sm text-slate-500">No sales in this period. Choose another date to explore your history.</p>}
      <details className="mt-3 text-xs text-slate-500"><summary className="w-fit cursor-pointer rounded font-semibold text-wave">View chart values</summary><dl className="mt-3 max-h-48 space-y-2 overflow-y-auto">{buckets.map(bucket => <div key={bucket.from} className="flex flex-wrap justify-between gap-2"><dt>{displayDate(bucket.from)}{bucket.from !== bucket.to ? ` – ${displayDate(bucket.to)}` : ''}</dt><dd className="font-semibold text-ocean">{money(bucket.value)}</dd></div>)}</dl></details>
    </ChartCard>
    <details className="md:col-span-2">
    <summary className="cursor-pointer text-sm font-semibold text-wave">Payment breakdown & financial comparison</summary>
    <div className="mt-4 grid gap-5 md:grid-cols-2">
    <ChartCard title="Sales, expenses & profit" subtitle="Compare the totals for your selected period.">
      <div className="space-y-5">{financials.map(item => <div key={item.label}>
        <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm"><span className="text-slate-500">{item.label}</span><span className="font-bold tabular-nums">{money(item.value)}</span></div>
        <div aria-hidden="true" className="relative h-5 overflow-hidden rounded bg-slate-50">
          <div className="absolute inset-y-0 left-1/2 border-l border-slate-300" />
          <div className="absolute inset-y-1 rounded" style={{ background: item.color, width: `${Math.abs(item.value) / financialPeak * 50}%`, left: `${item.value < 0 ? 50 - Math.abs(item.value) / financialPeak * 50 : 50}%` }} />
        </div>
      </div>)}</div>
      <p className="mt-4 text-[11px] text-slate-400">The center line is zero. Losses extend to the left.</p>
    </ChartCard>
    <ChartCard title="Payment methods" subtitle="How customers paid for their orders.">
      <div className="mx-auto grid h-36 w-36 place-items-center rounded-full" role="img" aria-label={paymentTotal ? payments.map(payment => `${payment.label}: ${money(payment.value)}, ${(payment.value / paymentTotal * 100).toFixed(1)}%`).join('. ') : 'No payments in this period'} style={{ background: paymentTotal > 0 ? `conic-gradient(${segments.join(', ')})` : '#edf3fc' }}>
        <div className="flex h-28 w-28 flex-col items-center justify-center rounded-full bg-white"><span className="text-[10px] uppercase tracking-wider text-slate-400">Collected</span><span className="mt-1 max-w-full px-2 text-center text-sm font-bold tabular-nums">{money(paymentTotal)}</span></div>
      </div>
      <ul className="mt-5 space-y-3">{payments.map((payment, index) => <li key={`${payment.label}-${index}`} className="flex flex-wrap items-center gap-2 text-xs"><span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ background: payment.color }} /><span className="mr-auto text-slate-500">{payment.label}</span><span className="font-bold">{money(payment.value)}</span><span className="text-slate-400">({paymentTotal ? (payment.value / paymentTotal * 100).toFixed(1) : '0'}%)</span></li>)}</ul>
      {!paymentTotal && <p className="mt-3 text-center text-sm text-slate-500">No payments in this period.</p>}
    </ChartCard>
    </div>
    </details>
  </div>
}

export default memo(SalesCharts)
