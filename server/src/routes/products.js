import { Router, raw } from 'express'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { pool, fail } from '../db.js'
import { auth } from '../middleware/auth.js'
import { productFields, integer, comboItems } from '../validation.js'
import { photoDirectory, photoExtension, verifyPhoto } from '../photos.js'
import { lockInventory, mutate } from '../mutations.js'

const router = Router()

const comboStockSql = `CASE WHEN p.is_combo = 1 THEN COALESCE((
  SELECT MIN(CASE WHEN item.active = 1 AND item.is_combo = 0 THEN FLOOR(item.stock / ci.qty) ELSE 0 END)
  FROM combo_items ci JOIN products item ON item.id = ci.item_id
  WHERE ci.combo_id = p.id
), 0) ELSE p.stock END AS stock`

const attachComboItems = async (rows) => {
  const ids = rows.filter((row) => row.is_combo).map((row) => row.id)
  if (!ids.length) return rows
  const [items] = await pool.query(
    `SELECT ci.combo_id, ci.item_id, ci.qty, p.name, p.code, p.photo_url, p.active, p.stock
     FROM combo_items ci JOIN products p ON p.id = ci.item_id
     WHERE ci.combo_id IN (?) ORDER BY ci.id`,
    [ids]
  )
  return rows.map((row) => row.is_combo
    ? { ...row, combo_items: items.filter((item) => item.combo_id === row.id).map(({ combo_id, ...item }) => item) }
    : row)
}

const verifyComboItems = async (conn, comboId, items) => {
  const ids = items.map((item) => item.item_id)
  const [rows] = await conn.query('SELECT id, is_combo, active FROM products WHERE id IN (?) FOR UPDATE', [ids])
  if (rows.length !== ids.length) throw fail(400, 'One of the included products no longer exists')
  if (rows.some((row) => row.is_combo)) throw fail(400, 'A combo cannot include another combo')
  if (rows.some((row) => !row.active)) throw fail(400, 'A combo cannot include a hidden product')
  if (comboId !== null && ids.includes(comboId)) throw fail(400, 'A combo cannot include itself')
}

const saveComboItems = async (conn, comboId, items) => {
  await conn.query('DELETE FROM combo_items WHERE combo_id = ?', [comboId])
  await conn.query('INSERT INTO combo_items (combo_id, item_id, qty) VALUES ?', [items.map((item) => [comboId, item.item_id, item.qty])])
}

const recordStockChange = async (conn, productId, previous, next, userId, reason) => {
  const difference = next - previous
  if (!difference) return
  await conn.query('UPDATE products SET stock = ? WHERE id = ?', [next, productId])
  await conn.query(
    'INSERT INTO stock_adjustments (product_id, adjustment_type, quantity, reason, user_id) VALUES (?,?,?,?,?)',
    [productId, 'count', Math.abs(difference), reason, userId]
  )
}

router.post('/photos', auth(), raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }), async (req, res, next) => {
  try {
    const extension = photoExtension(req.body)
    const filename = `${randomUUID()}.${extension}`
    await mkdir(photoDirectory, { recursive: true })
    await writeFile(photoDirectory + filename, req.body, { flag: 'wx' })
    res.status(201).json({ photo_url: `/api/uploads/photos/${filename}` })
  } catch (error) { next(error) }
})

router.get('/categories', auth(), async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM categories ORDER BY sort_order')
    res.json(rows)
  } catch (e) { next(e) }
})

router.get('/', auth(), async (req, res, next) => {
  try {
    const adminView = req.user.role === 'admin' && req.query.all === '1'
    const [rows] = await pool.query(
      `SELECT p.id, p.category_id, p.code, p.name, p.price, p.is_combo, ${comboStockSql},
              p.reorder_level, p.expiry_date, p.active, p.photo_url${adminView || req.user.role === 'admin' ? ', p.unit_cost' : ''}
       FROM products p ${adminView ? '' : 'WHERE p.active = 1'} ORDER BY p.category_id, p.id`
    )
    res.json(await attachComboItems(rows))
  } catch (e) { next(e) }
})

router.post('/', auth(), async (req, res, next) => {
  try {
    await verifyPhoto(req.body.photo_url)
    const result = await mutate(req, 'product.create', async (conn) => {
      await lockInventory(conn)
      const values = productFields(req.body)
      const isCombo = values.is_combo === 1
      const items = isCombo ? comboItems(req.body.combo_items) : []
      if (isCombo) {
        values.stock = 0
        await verifyComboItems(conn, null, items)
      }
      const openingStock = Number(values.stock) || 0
      const fields = Object.keys(values)
      const [r] = await conn.query(
        `INSERT INTO products (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(',')})`,
        fields.map((field) => values[field])
      )
      if (isCombo) await saveComboItems(conn, r.insertId, items)
      if (openingStock > 0) {
        await conn.query(
          'INSERT INTO stock_adjustments (product_id, adjustment_type, quantity, reason, user_id) VALUES (?,?,?,?,?)',
          [r.insertId, 'opening', openingStock, 'Opening stock', req.user.id]
        )
      }
      return { id: r.insertId }
    })
    res.status(201).json(result)
  } catch (e) {
    next(e.code === 'ER_DUP_ENTRY' ? fail(400, 'That product code already exists') : e)
  }
})

router.put('/:id', auth(), async (req, res, next) => {
  try {
    const productId = integer(Number(req.params.id), 'Product ID', 1)
    await verifyPhoto(req.body.photo_url)
    const result = await mutate(req, `product.update.${productId}`, async (conn) => {
      await lockInventory(conn)
      const [[current]] = await conn.query('SELECT * FROM products WHERE id = ? FOR UPDATE', [productId])
      if (!current) throw fail(404, 'Product not found')
      const values = productFields(req.body, true)
      const touchesCombo = req.body.combo_items !== undefined
      const items = touchesCombo ? comboItems(req.body.combo_items, productId) : null
      if (items) await verifyComboItems(conn, productId, items)
      const nextIsCombo = values.is_combo === undefined ? current.is_combo : values.is_combo
      const requestedStock = values.stock
      delete values.stock
      if (values.is_combo === 1) {
        // A combo never stores its own stock; availability is computed from its parts.
        if (requestedStock !== undefined && Number(requestedStock) !== 0) throw fail(400, 'A combo has no stock of its own')
        values.stock = 0
      }
      if (requestedStock !== undefined && nextIsCombo === 0) {
        if (req.body.expected_stock !== undefined && Number(req.body.expected_stock) !== Number(current.stock)) {
          throw fail(409, 'Stock changed while this form was open. Refresh the product and try again.')
        }
        integer(requestedStock, 'Stock', 0)
      }
      const fields = Object.keys(values)
      if (fields.length) {
        await conn.query(
          `UPDATE products SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
          [...fields.map((f) => values[f]), productId]
        )
      } else if (!touchesCombo && requestedStock === undefined) {
        throw fail(400, 'Nothing to update')
      }
      if (requestedStock !== undefined && nextIsCombo === 0) {
        await recordStockChange(conn, productId, Number(current.stock), Number(requestedStock), req.user.id, 'Stock count from product editor')
      }
      if (values.is_combo === 0) await conn.query('DELETE FROM combo_items WHERE combo_id = ?', [productId])
      if (items) await saveComboItems(conn, productId, items)
      return { ok: true }
    })
    res.json(result)
  } catch (e) { next(e) }
})

export default router
