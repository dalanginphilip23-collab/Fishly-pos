import { createContext, useContext, useReducer } from 'react'

const CartContext = createContext(null)
export const useCart = () => useContext(CartContext)

const comboParts = (line) => line.is_combo ? (line.combo_items || []) : [{ item_id: line.id, qty: 1, stock: line.stock }]

// Sales that share combo components must be limited together. Counting each
// product in isolation can oversell the last shared ingredient.
function used(lines, productId) {
  let total = 0
  for (const line of lines) {
    for (const part of comboParts(line)) {
      if (Number(part.item_id) === Number(productId)) total += Number(part.qty) * line.qty
    }
  }
  return total
}

export function availableInCart(product, lines) {
  const parts = product.is_combo ? (product.combo_items || []) : [{ item_id: product.id, qty: 1, stock: product.stock }]
  if (!parts.length) return 0
  let max = Infinity
  for (const part of parts) {
    const left = Number(part.stock) - used(lines, part.item_id)
    max = Math.min(max, Math.floor(left / Number(part.qty)))
  }
  return Math.max(0, max)
}

function addLine(lines, product, requested) {
  const max = availableInCart(product, lines)
  if (max < 1) return lines
  const qty = Math.max(1, Math.min(Number(requested) || 1, max))
  const hit = lines.find((l) => l.id === product.id)
  if (!hit) return [...lines, {
    id: product.id, name: product.name, price: product.price, photo_url: product.photo_url,
    stock: product.stock, is_combo: product.is_combo, combo_items: product.combo_items, qty,
  }]
  return lines.map((l) => (l.id === product.id ? { ...l, qty: l.qty + qty } : l))
}

function reducer(lines, action) {
  switch (action.type) {
    case 'add':
      return addLine(lines, action.product, 1)
    case 'addQty':
      return addLine(lines, action.product, action.qty)
    case 'change': {
      const line = lines.find(l => l.id === action.id)
      if (!line) return lines
      const product = { ...line, stock: line.stock }
      const without = lines.filter(l => l.id !== action.id)
      const max = availableInCart(product, without)
      const next = Math.max(0, Math.min(line.qty + action.by, max))
      return next > 0 ? lines.map(l => l.id === action.id ? { ...l, qty: next } : l) : without
    }
    case 'clear':
      return []
    case 'refresh':
      return lines.flatMap((line) => {
        const product = action.products.find((p) => p.id === line.id)
        if (!product || product.stock <= 0) return []
        return [{
          ...line, price: product.price, name: product.name, photo_url: product.photo_url,
          stock: product.stock, is_combo: product.is_combo, combo_items: product.combo_items,
          qty: Math.min(line.qty, product.stock),
        }]
      })
    default:
      return lines
  }
}

export function CartProvider({ children }) {
  const [lines, dispatch] = useReducer(reducer, [])
  const total = lines.reduce((s, l) => s + Math.round(l.price * 100) * l.qty, 0) / 100
  const count = lines.reduce((s, l) => s + l.qty, 0)
  return (
    <CartContext.Provider value={{ lines, total, count, dispatch }}>{children}</CartContext.Provider>
  )
}
