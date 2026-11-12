import test from 'node:test'
import assert from 'node:assert/strict'
import { availableFromUsage, availableInCart, stockUsage } from '../src/cart-stock.js'
import { money } from '../src/utils.js'

test('shared stock includes standalone items and all combo ingredients', () => {
  const rice = { id: 1, stock: 12 }
  const juice = { id: 2, stock: 10 }
  const combo = { id: 3, is_combo: 1, combo_items: [
    { item_id: 1, qty: 2, stock: 12 }, { item_id: 2, qty: 1, stock: 10 },
  ] }
  const lines = [{ ...rice, qty: 3 }, { ...combo, qty: 2 }]
  const usage = stockUsage(lines)
  assert.equal(usage.get(1), 7)
  assert.equal(usage.get(2), 2)
  assert.equal(availableFromUsage(rice, usage), 5)
  assert.equal(availableFromUsage(juice, usage), 8)
  assert.equal(availableFromUsage(combo, usage), 2)
  assert.equal(availableInCart(combo, lines), 2)
})

test('numeric string IDs share stock, exhausted and incomplete combos cannot be sold', () => {
  const product = { id: 1, stock: 2 }
  const usage = stockUsage([{ id: '1', stock: 2, qty: 3 }])
  assert.equal(availableFromUsage(product, usage), 0)
  assert.equal(availableFromUsage({ id: 3, is_combo: 1, combo_items: [] }, usage), 0)
  assert.equal(availableFromUsage(product, stockUsage([])), 2)
})

test('indexed stock calculations match the previous scan for mixed carts', () => {
  const products = Array.from({ length: 30 }, (_, id) => ({ id, stock: 30 + id }))
  for (let id = 30; id < 50; id++) products.push({ id, is_combo: 1, combo_items: [
    { item_id: id % 30, stock: 30 + id % 30, qty: 2 },
    { item_id: (id + 1) % 30, stock: 30 + (id + 1) % 30, qty: 1 },
  ] })
  const parts = p => p.is_combo ? p.combo_items : [{ item_id: p.id, qty: 1, stock: p.stock }]
  for (let size = 0; size <= products.length; size++) {
    const lines = products.slice(0, size).map(p => ({ ...p, qty: p.id % 4 + 1 }))
    const usage = stockUsage(lines)
    for (const product of products) {
      const expected = Math.max(0, Math.min(...parts(product).map(part => {
        const used = lines.reduce((sum, line) => sum + parts(line).reduce((n, ingredient) => n + (ingredient.item_id === part.item_id ? ingredient.qty * line.qty : 0), 0), 0)
        return Math.floor((part.stock - used) / part.qty)
      })))
      assert.equal(availableFromUsage(product, usage), expected)
    }
  }
})

test('reused currency formatter preserves receipt amounts and centavos', () => {
  for (const value of [0, 0.01, 15, 60.5, 123456.78, -20.25, '15.50', null]) {
    assert.equal(money(value), '₱' + Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  }
})
