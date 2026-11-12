const partsOf = (product) => product.is_combo ? (product.combo_items || []) : [{ item_id: product.id, qty: 1, stock: product.stock }]

export function stockUsage(lines) {
  const usage = new Map()
  for (const line of lines) {
    for (const part of partsOf(line)) {
      const id = Number(part.item_id)
      usage.set(id, (usage.get(id) || 0) + Number(part.qty) * line.qty)
    }
  }
  return usage
}

export function availableFromUsage(product, usage) {
  const parts = partsOf(product)
  if (!parts.length) return 0
  let max = Infinity
  for (const part of parts) {
    const left = Number(part.stock) - (usage.get(Number(part.item_id)) || 0)
    max = Math.min(max, Math.floor(left / Number(part.qty)))
  }
  return Math.max(0, max)
}

export const availableInCart = (product, lines) => availableFromUsage(product, stockUsage(lines))
