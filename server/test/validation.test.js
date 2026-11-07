import test from 'node:test'
import assert from 'node:assert/strict'
import { cartItems, cents, payment, productFields, dateRange } from '../src/validation.js'

test('duplicate products are consolidated before stock validation and lock in ID order', () => {
  assert.deepEqual(cartItems([{ productId: 8, qty: 3 }, { productId: 2, qty: 1 }, { productId: 8, qty: 4 }]), [{ productId: 2, qty: 1 }, { productId: 8, qty: 7 }])
})

test('invalid quantities and aggregate overflow are rejected', () => {
  for (const items of [[], [null], [{ productId: 1, qty: -1 }], [{ productId: 1, qty: 1.5 }], [{ productId: '1', qty: 1 }], [{ productId: 1, qty: 2147483647 }, { productId: 1, qty: 1 }]]) {
    assert.throws(() => cartItems(items), { status: 400 })
  }
})

test('cash change uses integer centavos and permits exact tender', () => {
  assert.deepEqual(payment(cents(0.3), 0.1, 'cash', 0.5), { off: 0.1, total: 0.2, change: 0.3 })
  assert.deepEqual(payment(cents(70), 0, 'cash', 70), { off: 0, total: 70, change: 0 })
  assert.deepEqual(payment(cents(70), 5, 'gcash', null), { off: 5, total: 65, change: null })
})

test('invalid payment amounts never silently clamp or coerce', () => {
  for (const value of [null, '', '10', -1, NaN, Infinity, 1.001, 100000000]) assert.throws(() => cents(value), { status: 400 })
  assert.throws(() => payment(1000, 11, 'cash', 20), { status: 400 })
  assert.throws(() => payment(1000, 0, 'cash', 9.99), { status: 400 })
  assert.throws(() => payment(1000, 0, 'card', 10), { status: 400 })
})

test('product updates enforce inventory and money constraints', () => {
  for (const input of [{ stock: -1 }, { stock: 1.2 }, { price: null }, { price: -1 }, { active: 3 }, { name: ' ' }, { category_id: 0 }]) assert.throws(() => productFields(input, true), { status: 400 })
  assert.deepEqual(productFields({ price: 12.5, stock: 0, active: 0, injected: 'ignored' }, true), { price: 12.5, stock: 0, active: 0 })
})

test('reports reject impossible and reversed date ranges', () => {
  for (const query of [{ from: '2026-02-30', to: '2026-03-01' }, { from: '2026-11-03', to: '2026-11-01' }, { from: 'not-a-date' }]) assert.throws(() => dateRange(query), { status: 400 })
  assert.deepEqual(dateRange({ from: '2024-02-29', to: '2024-03-01' }), ['2024-02-29', '2024-03-01'])
})
