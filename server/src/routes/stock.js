import { Router } from 'express'
import { pool, fail } from '../db.js'
import { auth } from '../middleware/auth.js'
import { integer, text } from '../validation.js'
import { mutate, lockInventory } from '../mutations.js'

const router = Router()
const manager = auth()
const types = new Set(['add', 'remove', 'wastage', 'opening'])

router.get('/adjustments', manager, async (req, res, next) => {
  try {
    const productId = req.query.product_id ? integer(Number(req.query.product_id), 'Product ID', 1) : null
    const params = []
    let sql = `SELECT a.id, a.product_id, p.name product_name, a.adjustment_type, a.quantity, a.reason, a.user_id, u.name user_name, a.created_at
      FROM stock_adjustments a JOIN products p ON p.id = a.product_id LEFT JOIN users u ON u.id = a.user_id`
    if (productId) {
      sql += ' WHERE a.product_id = ?'
      params.push(productId)
    }
    sql += ' ORDER BY a.id DESC LIMIT 200'
    const [rows] = await pool.query(sql, params)
    res.json(rows)
  } catch (e) { next(e) }
})

router.delete('/adjustments/:id', auth(['admin']), async (req, res, next) => {
  try {
    const id = integer(Number(req.params.id), 'Movement ID', 1)
    const result = await mutate(req, `stock.movement.delete.${id}`, async (conn) => {
      await conn.query('DELETE FROM stock_adjustments WHERE id = ?', [id])
      return { ok: true }
    })
    res.json(result)
  } catch (e) { next(e) }
})

router.post('/adjustments', manager, async (req, res, next) => {
  try {
    const productId = integer(Number(req.body.product_id), 'Product ID', 1)
    const adjustmentType = text(req.body.adjustment_type, 'Adjustment type', 20)
    if (!types.has(adjustmentType)) throw fail(400, 'Adjustment type must be add, remove, wastage, or opening')
    const quantity = integer(Number(req.body.quantity), adjustmentType === 'opening' ? 'Counted stock' : 'Quantity', adjustmentType === 'opening' ? 0 : 1)
    const reason = req.body.reason ? text(req.body.reason, 'Reason', 200) : null
    const expectedStock = req.body.expected_stock === undefined ? null : integer(Number(req.body.expected_stock), 'Expected stock', 0)

    const result = await mutate(req, `stock.adjust.${productId}`, async (conn) => {
      await lockInventory(conn)
      const [[product]] = await conn.query('SELECT id, name, stock, is_combo FROM products WHERE id = ? FOR UPDATE', [productId])
      if (!product) throw fail(404, 'Product not found')
      if (product.is_combo) throw fail(400, 'A combo has no stock of its own. Adjust its included products.')
      if (expectedStock !== null && expectedStock !== Number(product.stock)) {
        throw fail(409, 'Stock changed while this form was open. Refresh and try again.')
      }
      const newStock = adjustmentType === 'add'
        ? Number(product.stock) + quantity
        : adjustmentType === 'opening'
          ? quantity
          : Number(product.stock) - quantity
      if (newStock < 0) throw fail(409, `Not enough stock for ${product.name}`)
      await conn.query('UPDATE products SET stock = ? WHERE id = ?', [newStock, productId])
      const [r] = await conn.query(
        'INSERT INTO stock_adjustments (product_id, adjustment_type, quantity, reason, user_id) VALUES (?,?,?,?,?)',
        [productId, adjustmentType, quantity, reason || (adjustmentType === 'opening' ? `Opening count: ${product.stock} to ${quantity}` : null), req.user.id]
      )
      return { id: r.insertId, product_id: productId, name: product.name, stock: newStock }
    })
    res.status(201).json(result)
  } catch (e) { next(e) }
})

router.get('/low-stock', manager, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, category_id, code, name, price, stock, reorder_level, expiry_date, active
       FROM products WHERE active = 1 AND is_combo = 0 AND stock <= reorder_level ORDER BY stock ASC, name`
    )
    res.json(rows)
  } catch (e) { next(e) }
})

router.get('/expiring', manager, async (req, res, next) => {
  try {
    const days = req.query.days ? integer(Number(req.query.days), 'Days', 1) : 30
    const [rows] = await pool.query(
      `SELECT id, code, name, stock, expiry_date
       FROM products
       WHERE expiry_date IS NOT NULL AND expiry_date <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
       ORDER BY expiry_date ASC`,
      [days]
    )
    res.json(rows)
  } catch (e) { next(e) }
})

router.get('/summary', manager, async (_req, res, next) => {
  try {
    const [[totals]] = await pool.query(
      `SELECT COUNT(*) total_products, COALESCE(SUM(stock),0) total_units, COALESCE(SUM(stock * COALESCE(unit_cost,0)),0) stock_value
       FROM products WHERE active = 1 AND is_combo = 0`
    )
    const [byCategory] = await pool.query(
      `SELECT c.name category, COUNT(p.id) products, COALESCE(SUM(p.stock),0) units
       FROM categories c LEFT JOIN products p ON p.category_id = c.id AND p.active = 1
       GROUP BY c.id, c.name ORDER BY c.sort_order`
    )
    res.json({ ...totals, byCategory })
  } catch (e) { next(e) }
})

export default router
