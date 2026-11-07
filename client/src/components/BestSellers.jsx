import { money } from '../utils'
import ProductPhoto from './ProductPhoto'
import Icon from './Icon'

export default function BestSellers({ products, from, to }) {
  const best = Number(products[0]?.qty || 1)
  return <section className="panel overflow-hidden" aria-labelledby="best-sellers-title">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
      <div><h2 id="best-sellers-title" className="text-lg font-extrabold">Best sellers</h2><p className="mt-1 text-xs text-slate-500">Your top 5 products, ranked by quantity sold.</p></div><span className="rounded-full bg-sky px-3 py-1.5 text-xs font-semibold text-wave">{from === to ? from : `${from} — ${to}`}</span>
    </header>
    {products.length ? <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <div className="flex flex-col justify-center border-b border-slate-100 bg-foam p-5 lg:border-b-0 lg:border-r">
        <p className="mb-4 text-sm font-semibold text-slate-500">Top-selling product</p>
        <ProductPhoto src={products[0].photo_url} name={products[0].name} className="mb-4 h-36 w-full" />
        <h3 className="text-xl font-extrabold">{products[0].name}</h3>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3"><p className="text-3xl font-extrabold">{Number(products[0].qty).toLocaleString()} <span className="text-xs font-medium text-slate-500">units sold</span></p><p className="text-sm font-bold">{money(products[0].revenue)}</p></div>
      </div>
      <ol className="divide-y divide-slate-100 px-4 sm:px-5">{products.map((product, index) => <li key={product.product_id} className="flex items-center gap-3 py-4">
        <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs font-bold ${index === 0 ? 'bg-sky text-wave' : 'bg-foam text-slate-500'}`}>{index + 1}</span>
        <ProductPhoto src={product.photo_url} name={product.name} className="hidden h-12 w-12 sm:flex" />
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1"><p className="text-sm font-semibold">{product.name}</p><p className="text-xs font-bold text-wave">{Number(product.qty).toLocaleString()} sold</p></div><div aria-hidden="true" className="mt-2 h-1.5 overflow-hidden rounded-full bg-sky"><div className="h-full rounded-full bg-wave" style={{ width: `${Number(product.qty) / best * 100}%` }} /></div><p className="mt-1.5 text-xs text-slate-500">{money(product.revenue)} in sales</p></div>
      </li>)}</ol>
    </div> : <div className="flex flex-col items-center p-10 text-center"><Icon name="chart" className="mb-3 !h-8 !w-8 text-slate-300" /><p className="font-bold">Your next sale starts the rankings</p><p className="mt-2 text-sm text-slate-500">No products sold in this date range. Select other dates or refresh after a sale.</p></div>}
    <p className="border-t border-slate-100 px-5 py-3 text-[11px] text-slate-500">Sales amounts are before order discounts. Cancelled sales are excluded. Equal quantities are ordered by sales amount.</p>
  </section>
}
