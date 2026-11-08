import { Router, raw } from 'express'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { pool, fail } from '../db.js'
import { auth } from '../middleware/auth.js'
import { productFields, integer } from '../validation.js'
import { photoDirectory, photoExtension, verifyPhoto } from '../photos.js'

const router = Router()
const staff = auth(['admin', 'cashier'])

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
      `SELECT id, category_id, code, name, price, stock, reorder_level, expiry_date, active, photo_url${adminView || req.user.role === 'admin' ? ', unit_cost' : ''} FROM products ${adminView ? '' : 'WHERE active = 1'} ORDER BY category_id, id`
    )
    res.json(rows)
  } catch (e) { next(e) }
})

router.post('/', staff, async (req, res, next) => {
  try {
    const { category_id, code, name, price, stock, reorder_level = 10, expiry_date = null, unit_cost = null, photo_url = null } = productFields(req.body)
    await verifyPhoto(photo_url)
    const [r] = await pool.query(
      'INSERT INTO products (category_id, code, name, price, stock, reorder_level, expiry_date, unit_cost, photo_url) VALUES (?,?,?,?,?,?,?,?,?)',
      [category_id, code, name, price, stock, reorder_level, expiry_date, unit_cost, photo_url]
    )
    res.status(201).json({ id: r.insertId })
  } catch (e) {
    next(e.code === 'ER_DUP_ENTRY' ? fail(400, 'That product code already exists') : e)
  }
})

router.put('/:id', staff, async (req, res, next) => {
  try {
    integer(Number(req.params.id), 'Product ID', 1)
    const values = productFields(req.body, true)
    await verifyPhoto(values.photo_url)
    const fields = Object.keys(values)
    const [result] = await pool.query(
      `UPDATE products SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
      [...fields.map((f) => values[f]), req.params.id]
    )
    if (!result.affectedRows) throw fail(404, 'Product not found')
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
