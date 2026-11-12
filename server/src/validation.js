import { fail } from './db.js'

export function text(value, label, max) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
    throw fail(400, `${label} is required (maximum ${max} characters)`)
  }
  return value.trim()
}

export function integer(value, label, min = 0) {
  if (!Number.isSafeInteger(value) || value < min || value > 2147483647) throw fail(400, `${label} must be a whole number of at least ${min}`)
  return value
}

export function cents(value, label = 'Amount') {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 99999999.99 || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001) {
    throw fail(400, `${label} must be a valid amount with at most two decimal places`)
  }
  return Math.round(value * 100)
}

export function cartItems(items) {
  if (!Array.isArray(items) || !items.length || items.length > 200) throw fail(400, 'Choose between 1 and 200 items')
  const merged = new Map()
  for (const item of items) {
    if (!item || typeof item !== 'object') throw fail(400, 'Invalid cart item')
    const id = integer(item.productId, 'Product ID', 1)
    const qty = integer(item.qty, 'Quantity', 1)
    merged.set(id, integer((merged.get(id) || 0) + qty, 'Quantity', 1))
  }
  return [...merged].sort(([a], [b]) => a - b).map(([productId, qty]) => ({ productId, qty }))
}

export function payment(subtotal, discount, method, cash) {
  const off = cents(discount, 'Discount')
  if (off > subtotal) throw fail(400, 'Discount cannot exceed the subtotal')
  const total = subtotal - off
  if (!['cash', 'gcash'].includes(method)) throw fail(400, 'Choose a payment method')
  const received = method === 'cash' ? cents(cash, 'Cash received') : null
  if (received !== null && received < total) throw fail(400, 'Cash received is less than the total')
  return { off: off / 100, total: total / 100, change: received === null ? null : (received - total) / 100 }
}

export function productFields(body, partial = false) {
  const result = {}
  for (const key of ['category_id', 'code', 'name', 'description', 'price', 'is_combo', 'unit_cost', 'stock', 'reorder_level', 'expiry_date', 'active', 'photo_url']) {
    if (body[key] === undefined && (partial || key === 'active' || key === 'unit_cost' || key === 'photo_url' || key === 'expiry_date' || key === 'description')) continue
    const defaults = { stock: 0, reorder_level: 10, is_combo: 0 }
    const value = body[key] === undefined && key in defaults ? defaults[key] : body[key]
    if (key === 'code' || key === 'name') result[key] = text(value, key, key === 'code' ? 20 : 100)
    else if (key === 'description') result[key] = value === null || value === undefined || value === '' ? null : text(value, 'Description', 255)
    else if (key === 'price') result[key] = cents(value, 'Price') / 100
    else if (key === 'unit_cost') result[key] = value === null ? null : cents(value, 'Unit cost') / 100
    else if (key === 'photo_url') result[key] = value === null ? null : text(value, 'Photo URL', 255)
    else if (key === 'active') {
      if (![0, 1].includes(value)) throw fail(400, 'Active must be 0 or 1')
      result[key] = value
    } else if (key === 'is_combo') {
      if (![0, 1].includes(value)) throw fail(400, 'Combo flag must be 0 or 1')
      result[key] = value
    } else if (key === 'reorder_level') result[key] = integer(value, 'Reorder level', 0)
    else if (key === 'expiry_date') {
      if (value === null || value === '') result[key] = null
      else if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw fail(400, 'Expiry date must be a valid YYYY-MM-DD date')
      else result[key] = value
    } else result[key] = integer(value, key, key === 'category_id' ? 1 : 0)
  }
  if (!Object.keys(result).length) throw fail(400, 'Nothing to update')
  return result
}

export function comboItems(items, comboId = null) {
  if (!Array.isArray(items) || !items.length || items.length > 30) throw fail(400, 'A combo needs between 1 and 30 included products')
  const merged = new Map()
  for (const item of items) {
    if (!item || typeof item !== 'object') throw fail(400, 'Invalid combo item')
    const itemId = integer(Number(item.item_id ?? item.itemId), 'Included product ID', 1)
    if (comboId !== null && itemId === comboId) throw fail(400, 'A combo cannot include itself')
    merged.set(itemId, integer((merged.get(itemId) || 0) + integer(Number(item.qty), 'Included quantity', 1), 'Included quantity', 1))
  }
  return [...merged].map(([item_id, qty]) => ({ item_id, qty }))
}

export function dateRange(query) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
  const dates = [query.from || today, query.to || today]
  if (dates.some((d) => typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0, 10) !== d) || dates[0] > dates[1]) {
    throw fail(400, 'Choose a valid date range with From before To')
  }
  return dates
}
