import { useRef, useState } from 'react'
import { api } from '../api'
import { money } from '../utils'
import Modal from './Modal'
import ProductPhoto from './ProductPhoto'
import Icon from './Icon'

export default function ComboEditor({ combo, products, categories, onClose, onSaved }) {
  const editing = Boolean(combo.id)
  const [form, setForm] = useState({
    category_id: '', code: '', name: '', price: '', photo_url: null, active: 1,
    ...combo,
  })
  const [items, setItems] = useState(() => (combo.combo_items || []).map((item) => ({ item_id: item.item_id, qty: item.qty })))
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef(null)
  const locked = useRef(false)
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const close = () => { if (!locked.current) onClose() }

  const addItem = () => {
    const used = new Set(items.map((item) => Number(item.item_id)))
    const next = products.find((product) => !used.has(product.id))
    setItems((current) => [...current, { item_id: next?.id || '', qty: 1 }])
  }
  const setItem = (index, key, value) => setItems((current) => current.map((item, i) => (i === index ? { ...item, [key]: value } : item)))
  const removeItem = (index) => setItems((current) => current.filter((_, i) => i !== index))

  const itemCost = items.reduce((sum, item) => {
    const product = products.find((p) => p.id === Number(item.item_id))
    return sum + Math.round(Number(product?.unit_cost || 0) * 100) * (Number(item.qty) || 0)
  }, 0) / 100

  const upload = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || locked.current) return
    setError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Choose a JPG, PNG or WebP photo up to 5 MB.')
      return
    }
    locked.current = true
    setUploading(true)
    try {
      const result = await api('/products/photos', { method: 'POST', body: file })
      set('photo_url', result.photo_url)
    } catch (e) { setError(e.message) }
    finally { locked.current = false; setUploading(false) }
  }

  const submit = async (event) => {
    event.preventDefault()
    if (locked.current) return
    setError('')
    if (!items.length) { setError('Add at least one product to the combo.'); return }
    if (items.some((item) => !item.item_id || Number(item.qty) < 1)) { setError('Choose a product and a quantity of at least 1 for every line.'); return }
    locked.current = true
    setBusy(true)
    try {
      const body = {
        name: form.name.trim(), code: form.code.trim(), category_id: Number(form.category_id),
        price: Number(form.price),
        stock: 0,
        reorder_level: 0,
        is_combo: 1,
        combo_items: items.map((item) => ({ item_id: Number(item.item_id), qty: Number(item.qty) })),
        photo_url: form.photo_url,
        active: form.active ? 1 : 0,
      }
      await api(editing ? `/products/${combo.id}` : '/products', { method: editing ? 'PUT' : 'POST', body })
      onSaved(`${editing ? 'Updated' : 'Added'} combo ${body.name}`)
    } catch (e) { setError(e.message) }
    finally { locked.current = false; setBusy(false) }
  }

  return <Modal wide labelledBy="combo-editor-title" onClose={close}>
    <header className="mb-5 flex items-start justify-between gap-4">
      <div><p className="mb-1 text-xs font-semibold uppercase tracking-widest text-wave">Combo meal</p><h2 id="combo-editor-title" className="page-title">{editing ? 'Edit combo' : 'Build a combo meal'}</h2><p className="page-subtitle">Bundle menu items and sell them together at one price.</p></div>
      <button type="button" aria-label="Close combo editor" disabled={busy || uploading} onClick={close} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-foam text-xl text-slate-500 hover:bg-sky">×</button>
    </header>
    <form onSubmit={submit}>
      <fieldset disabled={busy || uploading} className="space-y-5">
        <div className="flex items-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-foam p-4">
          <ProductPhoto src={form.photo_url} name={form.name || 'Combo preview'} className="h-24 w-24 sm:h-28 sm:w-28" />
          <div className="min-w-0"><p className="text-sm font-bold">Combo photo</p><p className="mt-1 text-xs leading-relaxed text-slate-500">Shown on the cashier’s menu.<br />JPG, PNG or WebP · max 5 MB</p><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} className="hidden" tabIndex={-1} /><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn-ghost !px-3 !py-2 text-xs" onClick={() => fileInput.current.click()}>{uploading ? 'Uploading…' : form.photo_url ? 'Change photo' : 'Upload photo'}</button>{form.photo_url && <button type="button" className="px-2 text-xs font-semibold text-coral" onClick={() => set('photo_url', null)}>Remove</button>}</div></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="form-label sm:col-span-2">Combo name<input autoFocus className="field" required maxLength="100" placeholder="e.g. Barkada combo" value={form.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label className="form-label">Combo code<input className="field" required maxLength="20" placeholder="e.g. CB-1" value={form.code} onChange={(e) => set('code', e.target.value)} /></label>
          <label className="form-label">Category<select className="field" required value={form.category_id} onChange={(e) => set('category_id', e.target.value)}><option value="">Select category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="form-label">Combo price (₱)<input className="field" required type="number" min="0" max="99999999.99" step="0.01" placeholder="0.00" value={form.price} onChange={(e) => set('price', e.target.value)} /><span className="text-xs font-normal text-slate-500">The single price charged for the whole bundle.</span></label>
          <div className="form-label">Included product cost<span className="field bg-foam text-slate-500">{money(itemCost)}</span><span className="text-xs font-normal text-slate-500">Estimated from current unit costs.</span></div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-sm font-bold">Included products</p><p className="text-xs text-slate-500">Stock is deducted from each of these items when the combo sells.</p></div>
            <button type="button" className="btn-ghost !px-3 !py-2 text-xs" onClick={addItem}><Icon name="plus" className="mr-1 !h-3.5 !w-3.5" />Add product</button>
          </div>
          {!items.length ? <p className="rounded-xl bg-foam p-4 text-center text-sm text-slate-500">No products added yet. Add at least one to build the combo.</p> : <ul className="space-y-2">
            {items.map((item, index) => (
              <li key={index} className="flex flex-wrap items-end gap-2 rounded-xl bg-foam p-2">
                <label className="form-label min-w-0 flex-1 basis-48 !text-xs">Product
                  <select className="field !py-2" value={item.item_id} onChange={(e) => setItem(index, 'item_id', e.target.value)}>
                    <option value="">Select product</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name} · {money(product.price)}</option>)}
                  </select>
                </label>
                <label className="form-label !text-xs">Qty
                  <input className="field !w-20 !py-2" type="number" min="1" max="9999" step="1" value={item.qty} onChange={(e) => setItem(index, 'qty', e.target.value)} />
                </label>
                <button type="button" aria-label="Remove included product" className="mb-0.5 grid h-9 w-9 place-items-center rounded-lg bg-white text-coral hover:bg-red-50" onClick={() => removeItem(index)}>×</button>
              </li>
            ))}
          </ul>}
        </div>

        {editing && <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" checked={!!form.active} onChange={(e) => set('active', e.target.checked ? 1 : 0)} className="h-5 w-5 rounded accent-blue-600" /><span><span className="block text-sm font-bold">Show on cashier menu</span><span className="text-xs text-slate-500">Turn off to hide this combo from new sales.</span></span></label>}
      </fieldset>
      {uploading && <p role="status" className="mt-3 text-sm text-wave">Uploading your photo…</p>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-coral">{error}</p>}
      <footer className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4"><button type="button" disabled={busy || uploading} className="btn-ghost" onClick={close}>Cancel</button><button disabled={busy || uploading || !items.length} className="btn-primary min-w-32">{busy ? 'Saving…' : editing ? 'Save combo' : 'Add combo'}</button></footer>
    </form>
  </Modal>
}
