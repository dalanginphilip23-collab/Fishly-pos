import { useEffect, useState } from 'react'
import Icon from './Icon'

export const businessToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
export const shiftDate = (value, days) => {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
export const displayDate = (value) => new Date(`${value}T12:00:00Z`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })

export default function SalesCalendar({ range, onChange }) {
  const today = businessToday()
  const [month, setMonth] = useState(range.from.slice(0, 7))
  useEffect(() => { setMonth(range.from.slice(0, 7)) }, [range.from])
  const first = new Date(`${month}-01T12:00:00Z`)
  const offset = first.getUTCDay()
  const count = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  const move = (step) => {
    const date = new Date(first)
    date.setUTCMonth(date.getUTCMonth() + step)
    setMonth(date.toISOString().slice(0, 7))
  }
  return <section className="panel p-5" aria-labelledby="calendar-title">
    <div className="flex items-center gap-2"><Icon name="calendar" className="text-wave" /><h2 id="calendar-title" className="font-bold">Sales calendar</h2></div>
    <p className="mt-1 text-xs text-slate-500">Choose a day to explore its sales.</p>
    <div className="my-4 flex items-center justify-between">
      <button type="button" aria-label="Previous month" className="calendar-arrow" onClick={() => move(-1)}>‹</button>
      <p aria-live="polite" className="text-sm font-bold">{first.toLocaleDateString('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</p>
      <button type="button" aria-label="Next month" className="calendar-arrow" onClick={() => move(1)}>›</button>
    </div>
    <div className="grid grid-cols-7 gap-1 text-center">
      {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <span key={day} className="pb-2 text-[11px] font-semibold text-slate-400">{day}</span>)}
      {Array.from({ length: offset }, (_, i) => <span key={`blank-${i}`} />)}
      {Array.from({ length: count }, (_, i) => {
        const value = `${month}-${String(i + 1).padStart(2, '0')}`
        const selected = value >= range.from && value <= range.to
        return <button key={value} type="button" aria-label={displayDate(value)} aria-pressed={selected} aria-current={value === today ? 'date' : undefined} onClick={() => onChange({ from: value, to: value })} className={`relative min-h-9 rounded-lg text-xs font-semibold transition ${selected ? 'bg-wave text-white shadow-sm' : 'text-slate-600 hover:bg-sky'} ${value === today ? 'ring-1 ring-inset ring-wave' : ''}`}>{i + 1}</button>
      })}
    </div>
    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-xs text-slate-500"><span>Philippine time · UTC+8</span><button type="button" onClick={() => onChange({ from: today, to: today })} className="font-bold text-wave hover:underline">Go to today</button></div>
  </section>
}
