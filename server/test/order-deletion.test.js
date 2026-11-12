import test from 'node:test'
import assert from 'node:assert/strict'
import { deleteOrder } from '../src/order-deletion.js'

function fixture(order = { id: 7, order_no: 'FP-000007', status: 'completed' }) {
  const calls = []
  const stock = new Map([[11, 4], [12, 8]])
  const conn = { query: async (sql, params) => {
    calls.push({ sql, params })
    if (sql.startsWith('SELECT * FROM orders')) return [[...(order ? [order] : [])]]
    if (sql.startsWith('SELECT product_id')) return [[{ product_id: 11, quantity: 2 }, { product_id: 12, quantity: 3 }]]
    if (sql.startsWith('UPDATE products')) stock.set(params[1], stock.get(params[1]) + params[0])
    return [[]]
  } }
  return { conn, calls, stock }
}

test('deleting a mistaken sale restores original stock quantities, including combo ingredients', async () => {
  const { conn, calls, stock } = fixture()
  const result = await deleteOrder(conn, { orderId: 7, userId: 2, restock: true })
  assert.deepEqual([...stock], [[11, 6], [12, 11]])
  assert.equal(result.restocked, true)
  assert.match(calls[0].sql, /inventory_lock.*FOR UPDATE/)
  assert.match(calls[1].sql, /orders.*FOR UPDATE/)
  assert.equal(calls.filter(call => call.sql.startsWith('INSERT INTO stock_adjustments')).length, 2)
  assert.deepEqual(calls.slice(-2).map(call => call.sql), ['DELETE FROM refunds WHERE order_id = ?', 'DELETE FROM orders WHERE id = ?'])
})

test('deleting prepared food can leave stock unchanged', async () => {
  const { conn, calls, stock } = fixture()
  await deleteOrder(conn, { orderId: 7, userId: 2, restock: false })
  assert.deepEqual([...stock], [[11, 4], [12, 8]])
  assert.ok(!calls.some(call => call.sql.startsWith('UPDATE products')))
})

test('deleting a refunded order never restores its stock twice', async () => {
  const { conn, stock } = fixture({ id: 7, order_no: 'FP-000007', status: 'cancelled' })
  const result = await deleteOrder(conn, { orderId: 7, userId: 2, restock: true })
  assert.equal(result.restocked, false)
  assert.deepEqual([...stock], [[11, 4], [12, 8]])
})

test('missing orders fail before any stock or deletion writes', async () => {
  const { conn, calls } = fixture(null)
  await assert.rejects(deleteOrder(conn, { orderId: 7, userId: 2, restock: true }), { status: 404 })
  assert.ok(calls.every(call => call.sql.startsWith('SELECT')))
})
