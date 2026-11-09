import { Router } from 'express'
import { pool, fail } from '../db.js'
import { auth } from '../middleware/auth.js'
import { transaction } from '../transaction.js'
import { cartItems, cents, integer, payment, text } from '../validation.js'

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
        'SELECT id, name, price, stock, is_combo FROM products WHERE id IN (?) AND active = 1 ORDER BY id FOR UPDATE',
        [items.map((i) => i.productId)]
      )
      const byId = new Map(products.map((p) => [p.id, p]))
      const comboIds = products.filter((p) => p.is_combo).map((p) => p.id)
      const [bundle] = comboIds.length
        ? await conn.query('SELECT combo_id, item_id, qty FROM combo_items WHERE combo_id IN (?)', [comboIds])
        : [[]]
      const bundleByCombo = new Map()
      for (const row of bundle) {
        if (!bundleByCombo.has(row.combo_id)) bundleByCombo.set(row.combo_id, [])
        bundleByCombo.get(row.combo_id).push(row)
      }

      let subtotal = 0
      const needed = new Map()
      const lines = items.map(({ productId, qty }) => {
        const p = byId.get(productId)
        if (!p) throw fail(409, 'An item is no longer on the menu. Go back and refresh the menu.')
        if (p.is_combo) {
          const parts = bundleByCombo.get(p.id) || []
          if (!parts.length) throw fail(409, `${p.name} is not set up yet. Refresh the menu and try again.`)
          for (const part of parts) needed.set(part.item_id, (needed.get(part.item_id) || 0) + part.qty * qty)
        } else {
          needed.set(p.id, (needed.get(p.id) || 0) + qty)
        }
        subtotal += cents(p.price, 'Price') * qty
        return [p.id, p.name, p.price, qty]
      })

      // Combo components are deducted too, so lock and check them as well.
      const unlocked = [...needed.keys()].filter((id) => !byId.has(id))
      if (unlocked.length) {
        const [parts] = await conn.query(
          'SELECT id, name, price, stock, is_combo FROM products WHERE id IN (?) AND active = 1 ORDER BY id FOR UPDATE',
          [unlocked]
        )
        for (const part of parts) byId.set(part.id, part)
      }
      for (const [id, qty] of needed) {
        const part = byId.get(id)
        if (!part) throw fail(409, 'An item in this combo is no longer available. Go back and refresh the menu.')
        if (part.stock < qty) throw fail(409, `Only ${part.stock} left of ${part.name}. Go back and refresh the menu.`)
      }

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
      for (const [id, qty] of needed) await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [qty, id])
      for (const [id, qty] of needed) await conn.query('INSERT INTO stock_adjustments (product_id, adjustment_type, quantity, reason, user_id) VALUES (?,?,?,?,?)', [id, 'remove', qty, `Sale ${order_no}`, req.user.id])

      const [[order]] = await conn.query('SELECT * FROM orders WHERE id = ?', [r.insertId])
      const [savedItems] = await conn.query('SELECT id, order_id, product_id, name, price, qty FROM order_items WHERE order_id = ?', [r.insertId])
      return { ...order, items: savedItems }
    })
    res.status(201).json(result)
  } catch (e) { next(e) }
})

export default router
