import { createContext, useContext, useMemo, useReducer } from 'react'
import { availableInCart } from '../cart-stock'
export { availableInCart } from '../cart-stock'

const CartContext = createContext(null)
export const useCart = () => useContext(CartContext)

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
    case 'refresh': {
      const products = new Map(action.products.map(product => [product.id, product]))
      return lines.flatMap((line) => {
        const product = products.get(line.id)
        if (!product || product.stock <= 0) return []
        return [{
          ...line, price: product.price, name: product.name, photo_url: product.photo_url,
          stock: product.stock, is_combo: product.is_combo, combo_items: product.combo_items,
          qty: Math.min(line.qty, product.stock),
        }]
      })
    }
    default:
      return lines
  }
}

export function CartProvider({ children }) {
  const [lines, dispatch] = useReducer(reducer, [])
  const value = useMemo(() => ({
    lines, dispatch,
    total: lines.reduce((s, l) => s + Math.round(l.price * 100) * l.qty, 0) / 100,
    count: lines.reduce((s, l) => s + l.qty, 0),
  }), [lines])
  return (
    <CartContext.Provider value={value}>{children}</CartContext.Provider>
  )
}
