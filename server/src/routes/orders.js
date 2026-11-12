import { Router } from 'express'
import { pool, fail } from '../db.js'
import { auth } from '../middleware/auth.js'
import { cartItems, cents, integer, payment, text, dateRange } from '../validation.js'
import { mutate, lockInventory } from '../mutations.js'
import { deleteOrder } from '../order-deletion.js'

const router = Router()

const withItems = async (orders) => {
  if (!orders.length) return orders
  const ids = orders.map(order => order.id)
  const [[items], [refunds]] = await Promise.all([
    pool.query('SELECT id, order_id, product_id, name, price, unit_cost, qty FROM order_items WHERE order_id IN (?) ORDER BY id', [ids]),
    pool.query('SELECT order_id, amount, restock, reason, created_at FROM refunds WHERE order_id IN (?)', [ids]),
  ])
  const itemsByOrder = new Map()
  for (const item of items) {
    if (!itemsByOrder.has(item.order_id)) itemsByOrder.set(item.order_id, [])
    itemsByOrder.get(item.order_id).push(item)
  }
  const refundsByOrder = new Map(refunds.map(refund => [refund.order_id, refund]))
  return orders.map((o) => ({
    ...o,
    items: itemsByOrder.get(o.id) || [],
    refund: refundsByOrder.get(o.id) || null,
  }))
}

const savedOrder = async (conn, id) => {
  const [[order]] = await conn.query('SELECT * FROM orders WHERE id = ?', [id])
  const [items] = await conn.query('SELECT id, order_id, product_id, name, price, unit_cost, qty FROM order_items WHERE order_id = ? ORDER BY id', [id])
  return { ...order, items }
}

router.get('/', auth(), async (req, res, next) => {
  try {
    const params = []
    let where = '1=1'
    if (req.query.from || req.query.to || req.query.q) {
      const [from, to] = dateRange(req.query)
      where = 'o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)'
      params.push(from, to)
      if (req.query.q) {
        where += ' AND o.order_no LIKE ?'
        params.push(`%${String(req.query.q).replace(/[%_]/g, '')}%`)
      }
    } else {
      where = 'o.created_at >= CURDATE() AND o.created_at < CURDATE() + INTERVAL 1 DAY'
    }
    const limit = req.query.limit ? Math.min(integer(Number(req.query.limit), 'Limit', 1), 200) : 200
    const [rows] = await pool.query(`SELECT o.* FROM orders o WHERE ${where} ORDER BY o.id DESC LIMIT ${limit}`, params)
    res.json(await withItems(rows))
  } catch (e) { next(e) }
})

router.get('/:id', auth(), async (req, res, next) => {
  try {
    const id = integer(Number(req.params.id), 'Order ID', 1)
    const [[order]] = await pool.query('SELECT * FROM orders WHERE id = ?', [id])
    if (!order) throw fail(404, 'Sale not found')
    res.json((await withItems([order]))[0])
  } catch (e) { next(e) }
})

router.post('/', auth(), async (req, res, next) => {
  try {
    const { payment_method, order_type = 'dine_in', discount = 0, cash_received = null } = req.body
    const items = cartItems(req.body.items)
    const note = req.body.note ? text(req.body.note, 'Note', 200) : null
    const reference = req.body.payment_reference === undefined || req.body.payment_reference === null || req.body.payment_reference === ''
      ? null
      : text(req.body.payment_reference, 'GCash reference', 80)
    if (!['cash', 'gcash'].includes(payment_method)) throw fail(400, 'Choose a payment method')
    if (payment_method === 'gcash' && (!reference || reference.length < 4)) throw fail(400, 'Enter the GCash reference number shown on the customer receipt')
    if (payment_method === 'cash' && reference) throw fail(400, 'A GCash reference is only valid for GCash payments')
    const customerId = req.body.customer_id === undefined || req.body.customer_id === null || req.body.customer_id === ''
      ? null
      : integer(Number(req.body.customer_id), 'Customer ID', 1)
    if (order_type !== 'dine_in') throw fail(400, 'Only dine-in sales are supported')

    const result = await mutate(req, 'order.create', async (conn) => {
      await lockInventory(conn)
      const [[shift]] = await conn.query('SELECT id FROM shifts WHERE user_id = ? AND closed_at IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE', [req.user.id])
      if (customerId) {
        const [[customer]] = await conn.query('SELECT id FROM customers WHERE id = ?', [customerId])
        if (!customer) throw fail(404, 'Customer not found')
      }
      const [products] = await conn.query(
        'SELECT id, name, price, stock, is_combo, unit_cost FROM products WHERE id IN (?) AND active = 1 ORDER BY id FOR UPDATE',
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
      for (const { productId, qty } of items) {
        const p = byId.get(productId)
        if (!p) throw fail(409, 'An item is no longer on the menu. Go back and refresh the menu.')
        if (p.is_combo) {
          const parts = bundleByCombo.get(p.id) || []
          if (!parts.length) throw fail(409, `${p.name} is not set up yet. Refresh the menu and try again.`)
          for (const part of parts) {
            needed.set(part.item_id, (needed.get(part.item_id) || 0) + part.qty * qty)
          }
        } else {
          needed.set(p.id, (needed.get(p.id) || 0) + qty)
        }
        subtotal += cents(p.price, 'Price') * qty
      }

      const unlocked = [...needed.keys()].filter((id) => !byId.has(id))
      if (unlocked.length) {
        const [parts] = await conn.query(
          'SELECT id, name, price, stock, is_combo, unit_cost FROM products WHERE id IN (?) AND active = 1 ORDER BY id FOR UPDATE',
          [unlocked]
        )
        for (const part of parts) byId.set(part.id, part)
      }
      for (const [id, qty] of needed) {
        const part = byId.get(id)
        if (!part) throw fail(409, 'An item in this combo is no longer available. Go back and refresh the menu.')
        if (part.stock < qty) throw fail(409, `Only ${part.stock} left of ${part.name}. Go back and refresh the menu.`)
      }

      // Snapshot sale-time costs. A combo's cost is the sum of its included
      // products so cost-of-goods reporting values bundles correctly.
      const lines = items.map(({ productId, qty }) => {
        const p = byId.get(productId)
        let cost = p.unit_cost === null || p.unit_cost === undefined ? null : Number(p.unit_cost)
        if (p.is_combo) {
          const parts = bundleByCombo.get(p.id)
          const priced = parts.every((part) => byId.get(part.item_id)?.unit_cost !== null && byId.get(part.item_id)?.unit_cost !== undefined)
          cost = priced ? parts.reduce((sum, part) => sum + Number(byId.get(part.item_id).unit_cost) * part.qty, 0) : null
        }
        return [p.id, p.name, p.price, qty, cost]
      })

      if (req.body.expected_subtotal !== undefined && cents(req.body.expected_subtotal, 'Expected subtotal') !== subtotal) {
        throw fail(409, 'Menu prices have changed. Go back and refresh the menu before collecting payment.')
      }
      const { off, total, change } = payment(subtotal, discount, payment_method, cash_received)
      const [r] = await conn.query(
        `INSERT INTO orders (order_no, order_type, payment_method, subtotal, discount, total, cash_received, change_due, note, cashier_id, customer_id, shift_id, payment_reference, status)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'completed')`,
        ['pending', order_type, payment_method, subtotal / 100, off, total, payment_method === 'cash' ? cash_received : null, change, note, req.user.id, customerId, shift?.id ?? null, reference]
      )
      const order_no = `FP-${String(r.insertId).padStart(6, '0')}`
      await conn.query('UPDATE orders SET order_no = ? WHERE id = ?', [order_no, r.insertId])
      await conn.query('INSERT INTO order_items (order_id, product_id, name, price, qty, unit_cost) VALUES ?', [
        lines.map((l) => [r.insertId, ...l]),
      ])
      await conn.query('INSERT INTO order_stock (order_id, product_id, quantity) VALUES ?', [
        [...needed].map(([productId, quantity]) => [r.insertId, productId, quantity]),
      ])
      for (const [id, qty] of needed) {
        await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [qty, id])
        await conn.query('INSERT INTO stock_adjustments (product_id, adjustment_type, quantity, reason, user_id) VALUES (?,?,?,?,?)', [id, 'remove', qty, `Sale ${order_no}`, req.user.id])
      }
      return savedOrder(conn, r.insertId)
    })
    res.status(201).json(result)
  } catch (e) { next(e) }
})

// Full sale reversal. The original order and its items remain intact for audit.
router.post('/:id/refund', auth(), async (req, res, next) => {
  try {
    const orderId = integer(Number(req.params.id), 'Order ID', 1)
    const reason = text(req.body.reason, 'Refund reason', 200)
    const restock = req.body.restock === true ? 1 : 0
    const result = await mutate(req, `order.refund.${orderId}`, async (conn) => {
      await lockInventory(conn)
      const [[order]] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId])
      if (!order) throw fail(404, 'Sale not found')
      if (order.status === 'cancelled') throw fail(409, 'This sale has already been refunded')
      const [[shift]] = await conn.query('SELECT id FROM shifts WHERE user_id = ? AND closed_at IS NULL ORDER BY id DESC LIMIT 1 FOR UPDATE', [req.user.id])
      const [stock] = await conn.query('SELECT product_id, quantity FROM order_stock WHERE order_id = ? ORDER BY product_id', [orderId])
      await conn.query('UPDATE orders SET status = ? WHERE id = ?', ['cancelled', orderId])
      await conn.query(
        'INSERT INTO refunds (order_id, shift_id, user_id, amount, payment_method, reference, restock, reason) VALUES (?,?,?,?,?,?,?,?)',
        [orderId, shift?.id ?? null, req.user.id, order.total, order.payment_method, req.body.reference ? text(req.body.reference, 'Refund reference', 80) : null, restock, reason]
      )
      if (restock) {
        for (const item of stock) {
          await conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id])
          await conn.query('INSERT INTO stock_adjustments (product_id, adjustment_type, quantity, reason, user_id) VALUES (?,?,?,?,?)', [item.product_id, 'add', item.quantity, `Refund ${order.order_no}`, req.user.id])
        }
      }
      return { ...(await savedOrder(conn, orderId)), refund: { amount: order.total, restock, reason } }
    })
    res.status(201).json(result)
  } catch (e) { next(e) }
})

router.delete('/:id', auth(), async (req, res, next) => {
  try {
    const orderId = integer(Number(req.params.id), 'Order ID', 1)
    if (typeof req.body.restock !== 'boolean') throw fail(400, 'Choose whether to return items to stock')
    const result = await mutate(req, `order.delete.${orderId}`, conn => deleteOrder(conn, {
      orderId, userId: req.user.id, restock: req.body.restock,
    }))
    res.json(result)
  } catch (e) { next(e) }
})

export default router
