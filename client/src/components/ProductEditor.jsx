import { useRef, useState } from 'react'
import { api } from '../api'
import Modal from './Modal'
import ProductPhoto from './ProductPhoto'

export default function ProductEditor({ product, categories, onClose, onSaved }) {
  const editing = Boolean(product.id)
  const [form, setForm] = useState({ category_id: '', code: '', name: '', price: '', unit_cost: '', stock: 0, photo_url: null, active: 1, ...product })
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef(null)
  const locked = useRef(false)
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }))
  const close = () => { if (!locked.current) onClose() }

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
    locked.current = true
    setBusy(true)
    setError('')
    try {
      const values = {
        name: form.name.trim(), code: form.code.trim(), category_id: Number(form.category_id),
        price: Number(form.price),
        unit_cost: form.unit_cost === '' || form.unit_cost === null || form.unit_cost === undefined ? null : Number(form.unit_cost),
        stock: Number(form.stock), photo_url: form.photo_url, active: form.active ? 1 : 0,
      }
      // Editing a photo or price must not overwrite stock sold since opening the dialog.
      const body = editing ? Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== product[key])) : values
      if (!editing || Object.keys(body).length) await api(editing ? `/products/${product.id}` : '/products', { method: editing ? 'PUT' : 'POST', body })
      onSaved(`${editing ? 'Updated' : 'Added'} ${values.name}`)
    } catch (e) { setError(e.message) }
    finally { locked.current = false; setBusy(false) }
  }

  return <Modal wide labelledBy="product-editor-title" onClose={close}>
    <header className="mb-5 flex items-start justify-between gap-4">
      <div><p className="mb-1 text-xs font-semibold uppercase tracking-widest text-wave">Product details</p><h2 id="product-editor-title" className="page-title">{editing ? 'Edit product' : 'Add a product'}</h2><p className="page-subtitle">Set up how this item appears at the register.</p></div>
      <button type="button" aria-label="Close product editor" disabled={busy || uploading} onClick={close} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-foam text-xl text-slate-500 hover:bg-sky">×</button>
    </header>
    <form onSubmit={submit}>
      <fieldset disabled={busy || uploading} className="space-y-5">
        <div className="flex items-center gap-4 rounded-2xl border border-dashed border-slate-300 bg-foam p-4">
          <ProductPhoto src={form.photo_url} name={form.name || 'Product preview'} className="h-24 w-24 sm:h-28 sm:w-28" />
          <div className="min-w-0"><p className="text-sm font-bold">Product photo</p><p className="mt-1 text-xs leading-relaxed text-slate-500">Shown on the cashier’s menu.<br />JPG, PNG or WebP · max 5 MB</p><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={upload} className="hidden" tabIndex={-1} /><div className="mt-3 flex flex-wrap gap-2"><button type="button" className="btn-ghost !px-3 !py-2 text-xs" onClick={() => fileInput.current.click()}>{uploading ? 'Uploading…' : form.photo_url ? 'Change photo' : 'Upload photo'}</button>{form.photo_url && <button type="button" className="px-2 text-xs font-semibold text-coral" onClick={() => set('photo_url', null)}>Remove</button>}</div></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="form-label sm:col-span-2">Product name<input autoFocus className="field" required maxLength="100" placeholder="e.g. Regular poppers" value={form.name} onChange={(e) => set('name', e.target.value)} /></label>
          <label className="form-label">Product code<input className="field" required maxLength="20" placeholder="e.g. FP-R" value={form.code} onChange={(e) => set('code', e.target.value)} /></label>
          <label className="form-label">Category<select className="field" required value={form.category_id} onChange={(e) => set('category_id', e.target.value)}><option value="">Select category</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="form-label">Selling price (₱)<input className="field" required type="number" min="0" max="99999999.99" step="0.01" placeholder="0.00" value={form.price} onChange={(e) => set('price', e.target.value)} /></label>
          <label className="form-label">Unit cost (₱, optional)<input className="field" type="number" min="0" max="99999999.99" step="0.01" placeholder="0.00" value={form.unit_cost ?? ''} onChange={(e) => set('unit_cost', e.target.value)} /><span className="text-xs font-normal text-slate-500">Used for estimated cost of goods and gross profit.</span></label>
          <label className="form-label">Stock on hand<input className="field" required type="number" min="0" max="2147483647" step="1" value={form.stock} onChange={(e) => set('stock', e.target.value)} /><span className="text-xs font-normal text-slate-500">Current available quantity, not the amount to add.</span></label>
        </div>
        {editing && <label className="flex items-center gap-3 rounded-xl border border-slate-200 p-3"><input type="checkbox" checked={!!form.active} onChange={(e) => set('active', e.target.checked ? 1 : 0)} className="h-5 w-5 rounded accent-blue-600" /><span><span className="block text-sm font-bold">Show on cashier menu</span><span className="text-xs text-slate-500">Turn off to hide this item from new sales.</span></span></label>}
      </fieldset>
      {uploading && <p role="status" className="mt-3 text-sm text-wave">Uploading your photo…</p>}
      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-coral">{error}</p>}
      <footer className="mt-6 flex justify-end gap-3 border-t border-slate-100 pt-4"><button type="button" disabled={busy || uploading} className="btn-ghost" onClick={close}>Cancel</button><button disabled={busy || uploading} className="btn-primary min-w-32">{busy ? 'Saving…' : editing ? 'Save changes' : 'Add product'}</button></footer>
    </form>
  </Modal>
}
