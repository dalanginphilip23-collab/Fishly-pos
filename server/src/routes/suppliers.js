import { Router } from 'express'
import { pool, fail } from '../db.js'
import { auth } from '../middleware/auth.js'
import { transaction } from '../transaction.js'
import { text, integer } from '../validation.js'

const router = Router()
const manager = auth()

router.get('/', manager, async (req, res, next) => {
  try {
    const q = (req.query.q || '').toString().trim()
    const params = []
    let sql = 'SELECT id, name, phone, email, address, notes, created_at, updated_at FROM suppliers'
    if (q) {
      sql += ' WHERE name LIKE ? OR phone LIKE ? OR email LIKE ?'
      const like = `%${q}%`
      params.push(like, like, like)
    }
    sql += ' ORDER BY name LIMIT 100'
    const [rows] = await pool.query(sql, params)
    res.json(rows)
  } catch (e) { next(e) }
})

router.get('/:id', manager, async (req, res, next) => {
  try {
    const id = integer(Number(req.params.id), 'Supplier ID', 1)
    const [[supplier]] = await pool.query('SELECT * FROM suppliers WHERE id = ?', [id])
    if (!supplier) throw fail(404, 'Supplier not found')
    const [purchases] = await pool.query('SELECT id, reference, status, total, created_at FROM purchases WHERE supplier_id = ? ORDER BY id DESC LIMIT 50', [id])
    res.json({ ...supplier, purchases })
  } catch (e) { next(e) }
})

router.post('/', manager, async (req, res, next) => {
  try {
    const name = text(req.body.name, 'Name', 120)
    const phone = req.body.phone ? text(req.body.phone, 'Phone', 40) : null
    const email = req.body.email ? text(req.body.email, 'Email', 120) : null
    const address = req.body.address ? text(req.body.address, 'Address', 255) : null
    const notes = req.body.notes ? text(req.body.notes, 'Notes', 500) : null
    const [r] = await pool.query('INSERT INTO suppliers (name, phone, email, address, notes) VALUES (?,?,?,?,?)', [name, phone, email, address, notes])
    res.status(201).json({ id: r.insertId })
  } catch (e) { next(e) }
})

router.put('/:id', manager, async (req, res, next) => {
  try {
    const id = integer(Number(req.params.id), 'Supplier ID', 1)
    const values = {}
    if (req.body.name !== undefined) values.name = text(req.body.name, 'Name', 120)
    if (req.body.phone !== undefined) values.phone = req.body.phone ? text(req.body.phone, 'Phone', 40) : null
    if (req.body.email !== undefined) values.email = req.body.email ? text(req.body.email, 'Email', 120) : null
    if (req.body.address !== undefined) values.address = req.body.address ? text(req.body.address, 'Address', 255) : null
    if (req.body.notes !== undefined) values.notes = req.body.notes ? text(req.body.notes, 'Notes', 500) : null
    if (!Object.keys(values).length) throw fail(400, 'Nothing to update')
    const fields = Object.keys(values)
    const [result] = await pool.query(`UPDATE suppliers SET ${fields.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`, [...fields.map((f) => values[f]), id])
    if (!result.affectedRows) throw fail(404, 'Supplier not found')
    res.json({ ok: true })
  } catch (e) { next(e) }
})

router.delete('/:id', auth(), async (req, res, next) => {
  try {
    const id = integer(Number(req.params.id), 'Supplier ID', 1)
    await transaction(async (conn) => {
      await conn.query('UPDATE purchases SET supplier_id = NULL WHERE supplier_id = ?', [id])
      const [result] = await conn.query('DELETE FROM suppliers WHERE id = ?', [id])
      if (!result.affectedRows) throw fail(404, 'Supplier not found')
    })
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
