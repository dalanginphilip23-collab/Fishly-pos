import { Router } from 'express'
import { pool, fail } from '../db.js'
import { auth } from '../middleware/auth.js'
import { integer, text, cents } from '../validation.js'
import { mutate, lockInventory } from '../mutations.js'

const router = Router()
const manager = auth()

router.get('/', manager, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.id, p.reference, p.status, p.total, p.paid, p.notes, p.created_at, s.name supplier_name, u.name user_name
       FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id LEFT JOIN users u ON u.id = p.user_id
       ORDER BY p.id DESC LIMIT 100`
    )
    res.json(rows)
  } catch (e) { next(e) }
})

router.get('/:id', manager, async (req, res, next) => {
  try {
    const id = integer(Number(req.params.id), 'Purchase ID', 1)
    const [[purchase]] = await pool.query(
      `SELECT p.*, s.name supplier_name FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id WHERE p.id = ?`,
      [id]
    )
    if (!purchase) throw fail(404, 'Purchase not found')
    const [items] = await pool.query(
      `SELECT i.id, i.product_id, pr.name product_name, i.qty, i.unit_cost, i.total
       FROM purchase_items i JOIN products pr ON pr.id = i.product_id WHERE i.purchase_id = ?`,
      [id]
    )
    res.json({ ...purchase, items })
  } catch (e) { next(e) }
})

router.post('/', manager, async (req, res, next) => {
  try {
    const supplierId = req.body.supplier_id === undefined || req.body.supplier_id === null || req.body.supplier_id === ''
      ? null
      : integer(Number(req.body.supplier_id), 'Supplier ID', 1)
    const reference = req.body.reference ? text(req.body.reference, 'Reference', 40) : null
    const notes = req.body.notes ? text(req.body.notes, 'Notes', 500) : null
    const paid = req.body.paid === true || req.body.paid === 1
    const items = Array.isArray(req.body.items) ? req.body.items : []
    if (!items.length) throw fail(400, 'Choose at least one product')
    if (items.length > 100) throw fail(400, 'A purchase can contain at most 100 lines')
    const normalized = items.map((item) => ({
      productId: integer(Number(item.productId), 'Product ID', 1),
      qty: integer(Number(item.qty), 'Quantity', 1),
      unitCost: item.unit_cost === undefined || item.unit_cost === null || item.unit_cost === ''
        ? null
        : cents(Number(item.unit_cost), 'Unit cost') / 100,
    }))

    const result = await mutate(req, 'purchase.create', async (conn) => {
      await lockInventory(conn)
      if (supplierId) {
        const [[supplier]] = await conn.query('SELECT id FROM suppliers WHERE id = ?', [supplierId])
        if (!supplier) throw fail(404, 'Supplier not found')
      }
      let total = 0
      const lines = []
      for (const item of normalized) {
        const [[product]] = await conn.query('SELECT id, name, stock FROM products WHERE id = ? AND is_combo = 0 FOR UPDATE', [item.productId])
        if (!product) throw fail(404, 'Product not found or is a combo')
        const lineTotal = item.unitCost === null ? 0 : item.unitCost * item.qty
        total += lineTotal
        lines.push({ ...item, name: product.name, lineTotal })
      }
      const [r] = await conn.query(
        'INSERT INTO purchases (supplier_id, reference, status, total, paid, notes, user_id) VALUES (?,?,?,?,?,?,?)',
        [supplierId, reference, 'received', total, paid ? 1 : 0, notes, req.user.id]
      )
      const purchaseId = r.insertId
      for (const line of lines) {
        await conn.query(
          'INSERT INTO purchase_items (purchase_id, product_id, qty, unit_cost, total) VALUES (?,?,?,?,?)',
          [purchaseId, line.productId, line.qty, line.unitCost, line.lineTotal]
        )
        await conn.query('UPDATE products SET stock = stock + ?, unit_cost = COALESCE(?, unit_cost) WHERE id = ?', [line.qty, line.unitCost, line.productId])
        await conn.query(
          'INSERT INTO stock_adjustments (product_id, adjustment_type, quantity, reason, user_id) VALUES (?,?,?,?,?)',
          [line.productId, 'add', line.qty, `Purchase #${purchaseId}`, req.user.id]
        )
      }
      if (paid && total > 0) {
        await conn.query(
          'INSERT INTO expenses (category, title, description, amount, user_id, purchase_id) VALUES (?,?,?,?,?,?)',
          ['purchase', `Purchase #${purchaseId}`, reference || `Inventory purchase #${purchaseId}`, total, req.user.id, purchaseId]
        )
      }
      const [[purchase]] = await conn.query('SELECT * FROM purchases WHERE id = ?', [purchaseId])
      return { ...purchase, items: lines }
    })

    res.status(201).json(result)
  } catch (e) { next(e) }
})

export default router
