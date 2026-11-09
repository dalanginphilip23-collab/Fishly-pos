import { Router, raw } from 'express'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { pool, fail } from '../db.js'
import { auth } from '../middleware/auth.js'
import { productFields, integer, comboItems } from '../validation.js'
import { photoDirectory, photoExtension, verifyPhoto } from '../photos.js'

const router = Router()
const staff = auth(['admin', 'cashier'])

// A combo is a menu item made from other products. Its sellable stock is the
// number of complete bundles the component stock can currently make.
const comboStockSql = `CASE WHEN p.is_combo = 1 THEN COALESCE((
  SELECT MIN(FLOOR(item.stock / ci.qty))
  FROM combo_items ci JOIN products item ON item.id = ci.item_id
  WHERE ci.combo_id = p.id
), 0) ELSE p.stock END AS stock`

const attachComboItems = async (rows) => {
  const ids = rows.filter((row) => row.is_combo).map((row) => row.id)
  if (!ids.length) return rows
  const [items] = await pool.query(
    `SELECT ci.combo_id, ci.item_id, ci.qty, p.name, p.code, p.photo_url
     FROM combo_items ci JOIN products p ON p.id = ci.item_id
     WHERE ci.combo_id IN (?) ORDER BY ci.id`,
    [ids]
  )
  return rows.map((row) => row.is_combo
    ? { ...row, combo_items: items.filter((item) => item.combo_id === row.id).map(({ combo_id, ...item }) => item) }
    : row)
}

const verifyComboItems = async (comboId, items) => {
  const ids = items.map((item) => item.item_id)
  const [rows] = await pool.query('SELECT id, is_combo FROM products WHERE id IN (?)', [ids])
  if (rows.length !== ids.length) throw fail(400, 'One of the included products no longer exists')
  if (rows.some((row) => row.is_combo)) throw fail(400, 'A combo cannot include another combo')
  if (comboId !== null && ids.includes(comboId)) throw fail(400, 'A combo cannot include itself')
}

const saveComboItems = async (conn, comboId, items) => {
  await conn.query('DELETE FROM combo_items WHERE combo_id = ?', [comboId])
  await conn.query('INSERT INTO combo_items (combo_id, item_id, qty) VALUES ?', [items.map((item) => [comboId, item.item_id, item.qty])])
}

router.post('/photos', staff, raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }), async (req, res, next) => {
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
    // The admin workspace uses the complete product list, including hidden items.
    const adminView = req.query.all === '1'
    const [rows] = await pool.query(
      `SELECT p.id, p.category_id, p.code, p.name, p.price, p.is_combo, ${comboStockSql},
              p.reorder_level, p.expiry_date, p.active, p.photo_url${adminView || req.user.role === 'admin' ? ', p.unit_cost' : ''}
       FROM products p ${adminView ? '' : 'WHERE p.active = 1'} ORDER BY p.category_id, p.id`
    )
    res.json(await attachComboItems(rows))
  } catch (e) { next(e) }
})

router.post('/', staff, async (req, res, next) => {
  try {
    const values = productFields(req.body)
    const isCombo = values.is_combo === 1
    const items = isCombo ? comboItems(req.body.combo_items) : []
    if (isCombo) {
      values.stock = 0
      await verifyComboItems(null, items)
    }
    await verifyPhoto(values.photo_url)
    const fields = Object.keys(values)
    const [r] = await pool.query(
      `INSERT INTO products (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(',')})`,
      fields.map((field) => values[field])
    )
    if (isCombo) await saveComboItems(pool, r.insertId, items)
    res.status(201).json({ id: r.insertId })
  } catch (e) {
    next(e.code === 'ER_DUP_ENTRY' ? fail(400, 'That product code already exists') : e)
  }
})

router.put('/:id', staff, async (req, res, next) => {
  try {
    const productId = integer(Number(req.params.id), 'Product ID', 1)
    const values = productFields(req.body, true)
    const touchesCombo = req.body.combo_items !== undefined
    const items = touchesCombo ? comboItems(req.body.combo_items, productId) : null
    if (items) await verifyComboItems(productId, items)
    await verifyPhoto(values.photo_url)
    const fields = Object.keys(values)
    if (fields.length) {
      const [result] = await pool.query(
        `UPDATE products SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
        [...fields.map((f) => values[f]), productId]
      )
      if (!result.affectedRows) throw fail(404, 'Product not found')
    } else if (!touchesCombo) {
      throw fail(400, 'Nothing to update')
    }
    if (values.is_combo === 0) await pool.query('DELETE FROM combo_items WHERE combo_id = ?', [productId])
    if (items) await saveComboItems(pool, productId, items)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
