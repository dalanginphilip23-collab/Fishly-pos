import { createContext, useContext, useReducer } from 'react'

const CartContext = createContext(null)
export const useCart = () => useContext(CartContext)

function reducer(lines, action) {
  switch (action.type) {
    case 'add': {
      const p = action.product
      if (p.stock < 1) return lines
      const hit = lines.find((l) => l.id === p.id)
      if (!hit) return [...lines, { id: p.id, name: p.name, price: p.price, photo_url: p.photo_url, stock: p.stock, qty: 1 }]
      return lines.map((l) => (l.id === p.id ? { ...l, qty: Math.min(l.qty + 1, l.stock) } : l))
    }
    case 'change':
      return lines
        .map((l) => (l.id === action.id ? { ...l, qty: Math.min(l.qty + action.by, l.stock) } : l))
        .filter((l) => l.qty > 0)
    case 'clear':
      return []
    case 'refresh':
      return lines.flatMap((line) => {
        const product = action.products.find((p) => p.id === line.id)
        return product && product.stock > 0 ? [{ ...line, price: product.price, name: product.name, photo_url: product.photo_url, stock: product.stock, qty: Math.min(line.qty, product.stock) }] : []
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
