import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api'
import { useCart, availableInCart } from '../context/Cart'
import { money } from '../utils'
import CartPanel from '../components/CartPanel'
import Icon from '../components/Icon'
import Modal from '../components/Modal'
import ProductPhoto from '../components/ProductPhoto'

// The category card already explains what is included (rice, drink, pieces),
// so flavor choices only need the flavor word: Regular, Spicy, Barbecue.
const flavors = [
  [/\bbarbecue\b|\bbbq\b/i, 'Barbecue'],
  [/\bregular\b/i, 'Regular'],
  [/\bspicy\b/i, 'Spicy'],
  [/\bcoffee\b/i, 'Coffee'],
  [/\bmilo\b/i, 'Milo'],
  [/\boreo\b/i, 'Oreo'],
]

function flavorLabel(product) {
  if (!product || !product.name) return ''
  return flavors.find(([pattern]) => pattern.test(product.name))?.[1] || product.name
}

export default function Pos() {
  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [q, setQ] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [groupID, setGroupID] = useState(null)
  const [selectedFlavor, setSelectedFlavor] = useState(null)
  const [drawer, setDrawer] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const cartRef = useRef(null)
  const { dispatch, lines, count, total } = useCart()

  const load = useCallback(async () => {
    setError('')
    setLoading(true)
    try {
      const [p, c] = await Promise.all([api('/products'), api('/products/categories')])
      setProducts(p)
      setCategories(c)
      dispatch({ type: 'refresh', products: p })
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [dispatch])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!drawer) return
    const previous = document.activeElement
    const root = cartRef.current
    const controls = () => [...root.querySelectorAll('button:not(:disabled), input:not(:disabled)')].filter(element => element.getClientRects().length)
    controls()[0]?.focus()
    const keydown = (event) => {
      // Checkout owns focus while its dialog is open.
      if (document.querySelector('[aria-modal="true"]')) return
      if (event.key === 'Escape') setDrawer(false)
      if (event.key === 'Tab') {
        const elements = controls()
        const first = elements[0], last = elements.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    root.addEventListener('keydown', keydown)
    const desktop = window.matchMedia('(min-width: 1024px)')
    const resize = () => { if (desktop.matches) setDrawer(false) }
    desktop.addEventListener('change', resize)
    return () => { root.removeEventListener('keydown', keydown); desktop.removeEventListener('change', resize); if (previous?.isConnected) previous.focus() }
  }, [drawer])

  const qtyInOrder = (id) => lines.find((line) => line.id === id)?.qty || 0

  const addProduct = (product) => {
    if (availableInCart(product, lines) < 1) {
      setNotice(`Not enough shared stock left for ${product.name}. Reduce the order or refresh the menu.`)
      return false
    }
    setNotice('')
    dispatch({ type: 'add', product })
    return true
  }

  // Group the menu by category so flavors share one card: Poppers opens
  // Regular / Spicy / Barbecue instead of filling the register with every variant.
  const filteredProducts = useMemo(() => {
    if (categoryFilter === 'combos') return products.filter((product) => product.is_combo)
    if (categoryFilter === 'all') return products
    return products.filter((product) => product.category_id === Number(categoryFilter))
  }, [products, categoryFilter])

  const groups = useMemo(() => {
    const term = q.trim().toLowerCase()
    const byCategory = new Map()
    for (const product of filteredProducts) {
      const category = categories.find((item) => item.id === product.category_id)
      if (!byCategory.has(product.category_id)) {
        byCategory.set(product.category_id, {
          id: product.category_id,
          name: category?.name || 'Other items',
          sort: category?.sort_order ?? 9999,
          products: [],
        })
      }
      byCategory.get(product.category_id).products.push(product)
    }
    return [...byCategory.values()]
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
      .map((group) => {
        const categoryMatches = term && group.name.toLowerCase().includes(term)
        const visible = !term || categoryMatches
          ? group.products
          : group.products.filter((product) => `${product.name} ${product.code}`.toLowerCase().includes(term))
        // Search results that point at one flavor behave like a single product card,
        // while a category match keeps the full flavor list.
        const prices = visible.map((product) => Number(product.price))
        const totalStock = visible.reduce((sum, product) => sum + availableInCart(product, lines), 0)
        const remaining = visible.reduce((sum, product) => sum + availableInCart(product, lines), 0)
        const inCart = visible.reduce((sum, product) => sum + qtyInOrder(product.id), 0)
        return {
          ...group,
          visible,
          minPrice: Math.min(...prices),
          maxPrice: Math.max(...prices),
          totalStock,
          remaining,
          inCart,
          photo: visible.find((product) => product.photo_url)?.photo_url || null,
        }
      })
      .filter((group) => group.visible.length > 0)
  }, [filteredProducts, categories, q, lines])

  const activeGroup = useMemo(() => groups.find((group) => group.id === groupID) || null, [groups, groupID])
  useEffect(() => {
    if (!activeGroup) return
    setSelectedFlavor(activeGroup.visible.find((product) => availableInCart(product, lines) > 0)?.id ?? null)
  }, [activeGroup, lines])
  const choiceCount = groups.reduce((sum, group) => sum + group.visible.length, 0)
  const pickerCount = activeGroup ? activeGroup.visible.reduce((sum, product) => sum + qtyInOrder(product.id), 0) : 0
  const pickerTotal = activeGroup
    ? activeGroup.visible.reduce((sum, product) => sum + Math.round(Number(product.price) * 100) * qtyInOrder(product.id), 0) / 100
    : 0

  // Single-flavor groups (like drinks) skip the picker and add straight away.
  const openGroup = (group) => {
    if (group.visible.length === 1) {
      addProduct(group.visible[0])
      return
    }
    setGroupID(group.id)
  }

  const usedCategories = categories.filter((category) => products.some((product) => product.category_id === category.id))
  const comboCount = products.filter((product) => product.is_combo).length
  const chip = (active) => `rounded-full border px-3 py-1.5 text-xs font-semibold transition ${active ? 'border-wave bg-wave text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-wave hover:text-wave'}`

  return (
    <div className="workspace-surface relative flex h-full">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-10">
        <img src="/logo.jpg" alt="" className="h-[560px] w-[560px] rounded-full object-cover" />
      </div>
      <section inert={drawer ? '' : undefined} className="flex min-h-0 min-w-0 flex-1 flex-col p-3 sm:p-5 xl:p-6">
        <header className="workspace-heading mb-5 flex shrink-0 items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="workspace-heading-icon hidden sm:flex"><Icon name="register" /></span><div className="min-w-0"><h1 className="page-title">Register</h1><p className="page-subtitle">Choose items → Review order → Take payment.</p></div></div><span className="hidden whitespace-nowrap py-2 text-sm text-slate-500 xl:block">{new Date().toLocaleDateString('en-PH', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' })}</span></header>
        <div className="relative mb-3 shrink-0"><Icon name="search" className="absolute left-4 top-3 text-slate-400" /><input aria-label="Search menu by flavor, product, or code" className="field !pl-12 !py-3" placeholder="Search a flavor or product…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div role="group" aria-label="Filter menu by category" className="mb-3 flex shrink-0 flex-wrap gap-2">
          <button type="button" aria-pressed={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')} className={chip(categoryFilter === 'all')}>All</button>
          {comboCount > 0 && <button type="button" aria-pressed={categoryFilter === 'combos'} onClick={() => setCategoryFilter('combos')} className={chip(categoryFilter === 'combos')}>Combos <span className="opacity-70">({comboCount})</span></button>}
          {usedCategories.map((category) => <button key={category.id} type="button" aria-pressed={String(category.id) === categoryFilter} onClick={() => setCategoryFilter(String(category.id))} className={chip(String(category.id) === categoryFilter)}>{category.name}</button>)}
        </div>
        <div className="mb-3 flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span><span className="font-semibold text-ocean">{q.trim() ? 'Search results' : 'Menu groups'}</span> · {groups.length} {groups.length === 1 ? 'group' : 'groups'} · {choiceCount} {choiceCount === 1 ? 'choice' : 'choices'}</span><button disabled={loading} className="rounded-lg px-2 py-1 font-semibold text-wave hover:bg-sky" onClick={load}>Refresh menu</button></div>
        {notice && <div role="status" className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"><span>{notice}</span><button className="font-bold underline" onClick={() => setNotice('')}>Dismiss</button></div>}
        {error && <div role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-sm text-coral">{error}<button className="ml-3 font-bold underline" onClick={load}>Try again</button></div>}
        <div className="min-h-0 flex-1 overflow-y-auto pb-24 pr-1 lg:pb-3">
          <div className="register-grid gap-3">
          {loading ? <p role="status" className="col-span-full py-16 text-center text-sm text-slate-500">Loading the menu…</p> : groups.map((group) => {
            const soldOut = group.totalStock < 1
            const atLimit = !soldOut && group.remaining < 1
            const single = group.visible.length === 1
            const only = single ? group.visible[0] : null
            const cardName = single ? only.name : group.name
            const action = soldOut ? 'Sold out' : atLimit ? 'Stock limit' : single ? 'Add' : 'Choose'
            const price = group.minPrice === group.maxPrice ? money(group.minPrice) : `${money(group.minPrice)} – ${money(group.maxPrice)}`
            return <button
              key={group.id}
              type="button"
              aria-label={single ? `Add ${only.name}, ${money(only.price)} each${group.inCart ? `, ${group.inCart} in order` : ''}` : `Choose a flavor from ${group.name}, ${group.visible.length} choices${group.inCart ? `, ${group.inCart} in order` : ''}`}
              disabled={soldOut || atLimit}
              onClick={() => openGroup(group)}
              className={`menu-card group relative flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:border-wave hover:shadow-md disabled:shadow-none ${group.inCart ? 'border-wave ring-1 ring-wave/10' : 'border-slate-200'} ${soldOut ? 'bg-slate-50' : ''}`}
            >
              <span className="relative block w-full shrink-0 p-2 pb-0">
                <ProductPhoto src={group.photo} name={cardName} className={`aspect-[4/3] w-full ${soldOut ? 'grayscale opacity-60' : ''}`} />
                {group.inCart > 0 && <span className="absolute right-3 top-3 rounded-full bg-wave px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">{group.inCart} in order</span>}
                {!single && <span className="absolute left-3 top-3 rounded-full bg-ocean/85 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">{group.visible.length} choices</span>}
                {single && Boolean(only.is_combo) && <span className="absolute left-3 top-3 rounded-full bg-ocean/85 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm">Combo</span>}
                {soldOut && <span className="absolute inset-0 grid place-items-center"><span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-coral shadow-sm">Sold out</span></span>}
              </span>
              <span className="flex shrink-0 grow flex-col p-3 sm:p-4">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{single ? only.code : 'Pick a flavor'}</span>
                <span className="mt-1 min-h-10 break-words text-sm font-bold leading-5">{cardName}</span>
                {single && Boolean(only.is_combo) && <span className="mt-1 block text-[11px] leading-snug text-slate-500">{only.combo_items?.map((item) => `${item.qty}× ${item.name}`).join(' + ')}</span>}
                <span className="mt-3 block"><span className="block text-xs text-slate-500">{single ? 'Price' : 'Price range'}</span><span className="mt-1 block break-words text-xl font-semibold leading-tight tracking-tight text-ocean tabular-nums">{price}</span></span>
                <span className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3"><span className={`text-xs ${group.remaining > 0 && group.remaining <= 10 ? 'text-amber-700' : 'text-slate-500'}`}>{soldOut ? 'Unavailable' : atLimit ? 'Stock limit reached' : `${group.remaining} available`}</span><span className={`flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold ${!soldOut && !atLimit ? 'bg-sky text-wave' : 'bg-slate-100 text-slate-400'}`}><Icon name={!soldOut && !atLimit ? (single ? 'plus' : 'grid') : 'check'} className="!h-4 !w-4" />{action}</span></span>
              </span>
            </button>
          })}
          {!loading && !error && !groups.length && <div className="col-span-full py-16 text-center"><p className="font-bold">No menu items found</p><p className="mt-1 text-sm text-slate-500">Try another flavor, product, or code.</p><button className="btn-ghost mt-4" onClick={() => setQ('')}>Clear search</button></div>}
          </div>
        </div>
      </section>
      <aside ref={cartRef} aria-label="Current order" className={`mobile-cart ${drawer ? 'fixed inset-0 z-20 flex bg-ocean/60' : 'hidden'} lg:static lg:flex lg:w-[340px] lg:shrink-0 lg:bg-transparent xl:w-[390px]`}>
        <div className="ml-auto flex min-h-0 w-full max-w-md flex-col border-l border-slate-200 bg-white lg:max-w-none"><CartPanel onClose={() => setDrawer(false)} onDone={load} /></div>
      </aside>
      {count > 0 && !drawer && <button onClick={() => setDrawer(true)} className="cart-launcher btn-primary fixed z-10 flex flex-wrap justify-between gap-2 shadow-lg lg:hidden"><span>View order ({count})</span><span>{money(total)}</span></button>}
      {activeGroup && <Modal labelledBy="flavor-picker-title" onClose={() => setGroupID(null)}>
        <div className="space-y-4">
          <header className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-flex items-center rounded-full bg-sky px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-wave">Choose a flavor</span>
              <h2 id="flavor-picker-title" className="mt-1.5 text-xl font-extrabold tracking-tight">{activeGroup.name}</h2>
              <p className="text-xs text-slate-500">{activeGroup.visible.length} {activeGroup.visible.length === 1 ? 'choice' : 'choices'} available</p>
            </div>
            <button type="button" aria-label="Close flavor choices" onClick={() => setGroupID(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-foam text-lg text-slate-500 transition hover:bg-sky hover:text-wave">×</button>
          </header>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky via-foam to-white p-4">
            <div className="flex justify-center"><ProductPhoto src={activeGroup.photo} name={activeGroup.name} className="h-24 w-24 rounded-full shadow-lg ring-4 ring-white" /></div>
          </div>
          <div className="flex flex-wrap justify-center gap-x-14 gap-y-3 rounded-xl bg-foam px-5 py-3">
            {activeGroup.visible.map((product) => {
              const remaining = availableInCart(product, lines)
              const selected = selectedFlavor === product.id
              return (
                <label key={product.id} className={`flex cursor-pointer items-center gap-1.5 text-xs font-semibold ${remaining ? '' : 'cursor-not-allowed opacity-50'}`}>
                  <input type="radio" name="flavor" disabled={!remaining} checked={selected} onChange={() => setSelectedFlavor(product.id)} className="h-4 w-4 accent-wave" />
                  <span className={`whitespace-nowrap ${selected ? 'text-wave' : 'text-slate-700'}`}>{flavorLabel(product)}{remaining > 0 && remaining <= 5 ? ` (${remaining} left)` : ''}</span>
                </label>
              )
            })}
          </div>
          <footer className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Selected</p>
              <p className="truncate text-sm font-bold">{selectedFlavor ? flavorLabel(activeGroup.visible.find((p) => p.id === selectedFlavor) || {}) || 'None' : 'None'}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button type="button" className="btn-ghost text-xs" onClick={() => setGroupID(null)}>Cancel</button>
              <button type="button" className="btn-primary text-xs" disabled={selectedFlavor === null || !activeGroup.visible.some((product) => product.id === selectedFlavor && availableInCart(product, lines) > 0)} onClick={() => {
                const product = activeGroup.visible.find((item) => item.id === selectedFlavor)
                if (product && addProduct(product)) setGroupID(null)
              }}>Confirm</button>
            </div>
          </footer>
        </div>
      </Modal>}
    </div>
  )
}
