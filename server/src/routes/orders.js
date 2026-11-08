import { Router } from 'express'
import { pool, fail } from '../db.js'
import { auth } from '../middleware/auth.js'
import { transaction } from '../transaction.js'
import { cartItems, cents, payment, text } from '../validation.js'

const router = Router()

const withItems = async (orders) => {
  if (!orders.length) return orders
  const [items] = await pool.query('SELECT id, order_id, product_id, name, price, qty FROM order_items WHERE order_id IN (?)', [orders.map((o) => o.id)])
  return orders.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) }))
}

router.get('/', auth(), async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM orders WHERE created_at >= CURDATE() AND created_at < CURDATE() + INTERVAL 1 DAY ORDER BY id DESC')
    res.json(await withItems(rows))
  } catch (e) { next(e) }
})

router.post('/', auth(['cashier']), async (req, res, next) => {
  try {
    const { payment_method, order_type = 'dine_in', discount = 0, cash_received = null } = req.body
    const items = cartItems(req.body.items)
    const note = req.body.note ? text(req.body.note, 'Note', 200) : null
    const customerId = req.body.customer_id === undefined || req.body.customer_id === null || req.body.customer_id === ''
      ? null
      : integer(Number(req.body.customer_id), 'Customer ID', 1)
    if (order_type !== 'dine_in') throw fail(400, 'Only dine-in sales are supported')
    const result = await transaction(async (conn) => {
      if (customerId) {
        const [[customer]] = await conn.query('SELECT id FROM customers WHERE id = ?', [customerId])
        if (!customer) throw fail(404, 'Customer not found')
      }
      const [products] = await conn.query(
        'SELECT id, name, price, stock FROM products WHERE id IN (?) AND active = 1 ORDER BY id FOR UPDATE',
        [items.map((i) => i.productId)]
      )
      const byId = new Map(products.map((p) => [p.id, p]))

      let subtotal = 0
      const lines = items.map(({ productId, qty }) => {
        const p = byId.get(productId)
        if (!p) throw fail(409, 'An item is no longer on the menu. Go back and refresh the menu.')
        if (p.stock < qty) throw fail(409, `Only ${p.stock} left of ${p.name}. Go back and refresh the menu.`)
        subtotal += cents(p.price, 'Price') * qty
        return [p.id, p.name, p.price, qty]
      })

      cents(subtotal / 100, 'Order subtotal')
      if (req.body.expected_subtotal !== undefined && cents(req.body.expected_subtotal, 'Expected subtotal') !== subtotal) {
        throw fail(409, 'Menu prices have changed. Go back and refresh the menu before collecting payment.')
      }
      const { off, total, change } = payment(subtotal, discount, payment_method, cash_received)
      const [r] = await conn.query(
        `INSERT INTO orders (order_no, order_type, payment_method, subtotal, discount, total, cash_received, change_due, note, cashier_id, customer_id, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,'completed')`,
        ['pending', order_type, payment_method, subtotal / 100, off, total, payment_method === 'cash' ? cash_received : null, change, note, req.user.id, customerId]
      )
      const order_no = `FP-${String(r.insertId).padStart(6, '0')}`
      await conn.query('UPDATE orders SET order_no = ? WHERE id = ?', [order_no, r.insertId])
      await conn.query('INSERT INTO order_items (order_id, product_id, name, price, qty) VALUES ?', [
        lines.map((l) => [r.insertId, ...l]),
      ])
      for (const [id, , , qty] of lines) await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [qty, id])
      for (const [id, , , qty] of lines) await conn.query('INSERT INTO stock_adjustments (product_id, adjustment_type, quantity, reason, user_id) VALUES (?,?,?,?,?)', [id, 'remove', qty, `Sale ${order_no}`, req.user.id])

      const [[order]] = await conn.query('SELECT * FROM orders WHERE id = ?', [r.insertId])
      const [savedItems] = await conn.query('SELECT id, order_id, product_id, name, price, qty FROM order_items WHERE order_id = ?', [r.insertId])
      return { ...order, items: savedItems }
    })
    res.status(201).json(result)
  } catch (e) { next(e) }
})

export default router
