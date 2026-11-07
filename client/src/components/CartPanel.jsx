import { useState } from 'react'
import { useCart } from '../context/Cart'
import { money } from '../utils'
import CheckoutModal from './CheckoutModal'
import Icon from './Icon'
import ProductPhoto from './ProductPhoto'

export default function CartPanel({ onClose, onDone }) {
  const { lines, total, count, dispatch } = useCart()
  const [paying, setPaying] = useState(false)

  return (
    <>
      <div className="order-heading flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 p-5">
        <div><h2 className="text-lg font-semibold">Current order</h2><p className="mt-1 text-sm text-slate-500">Dine in · {count} {count === 1 ? 'item' : 'items'}</p></div>
        <div className="flex gap-3">
          {lines.length > 0 && <button onClick={() => window.confirm('Clear the current order?') && dispatch({ type: 'clear' })} className="text-sm font-bold text-coral">Clear</button>}
          <button onClick={onClose} className="text-sm font-bold lg:hidden">Close</button>
        </div>
      </div>

      <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {lines.map((l) => (
          <li key={l.id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-start gap-3"><ProductPhoto src={l.photo_url} name={l.name} className="h-12 w-12" /><div className="min-w-0 flex-1">
              <p className="break-words text-sm font-bold leading-snug">{l.name}</p>
              <p className="mt-1 text-xs text-slate-500">{money(l.price)} each</p>
            </div></div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 rounded-lg bg-foam p-1">
                <button aria-label={`Remove one ${l.name}`} onClick={() => dispatch({ type: 'change', id: l.id, by: -1 })} className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-lg font-bold">−</button>
                <span aria-label="Quantity" className="min-w-6 px-1 text-center text-sm font-bold tabular-nums">{l.qty}</span>
                <button aria-label={`Add one ${l.name}`} disabled={l.qty >= l.stock} onClick={() => dispatch({ type: 'change', id: l.id, by: 1 })} className="h-9 w-9 rounded-lg border border-slate-200 bg-white text-lg font-bold disabled:opacity-30">+</button>
              </div>
              <div className="ml-auto text-right"><p className="text-[10px] text-slate-400">Item total</p><p className="break-words text-base font-extrabold tabular-nums">{money(Math.round(l.price * 100) * l.qty / 100)}</p></div>
            </div>
          </li>
        ))}
        {!lines.length && <li className="flex flex-col items-center px-6 py-20 text-center"><Icon name="bag" className="mb-4 !h-8 !w-8 text-slate-400" /><p className="font-semibold">No items yet</p><p className="mt-2 text-sm leading-relaxed text-slate-500">Select products from the menu to add them here.</p></li>}
      </ul>

      <div className="shrink-0 space-y-4 border-t border-slate-200 bg-foam/60 p-5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><span className="font-bold">Order total</span><p className="mt-1 text-[11px] text-slate-500">Before any checkout discount</p></div>
          <span className="break-words text-3xl font-extrabold tracking-tight text-wave tabular-nums">{money(total)}</span>
        </div>
        <button className="btn-primary flex w-full items-center justify-center gap-2 !py-3.5" disabled={!lines.length} onClick={() => setPaying(true)}>
          Continue to payment <Icon name="arrow" className="!h-4 !w-4" />
        </button>
      </div>

      {paying && <CheckoutModal onClose={() => setPaying(false)} onDone={() => { setPaying(false); onClose(); onDone() }} />}
    </>
  )
}
