import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import rateLimit from 'express-rate-limit'
import { pool, fail } from '../db.js'
import { auth } from '../middleware/auth.js'
import { text, integer } from '../validation.js'

const router = Router()
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many sign-in attempts. Wait 15 minutes and try again.' },
})
const pin = (value, label = 'PIN') => {
  const result = text(value, label, 100)
  if (result.length < 4) throw fail(400, `${label} must be at least 4 characters`)
  return result
}
const tokenFor = user => jwt.sign(
  { id: user.id, name: user.name, role: user.role, token_version: user.token_version },
  process.env.JWT_SECRET,
  { expiresIn: '12h' }
)

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const username = text(req.body.username, 'Username', 40)
    const suppliedPin = text(req.body.pin, 'PIN', 100)
    const [[user]] = await pool.query('SELECT * FROM users WHERE username = ? AND active = 1', [username])
    if (!user || !(await bcrypt.compare(String(suppliedPin), user.pin_hash))) throw fail(401, 'Wrong username or PIN')
    const payload = { id: user.id, name: user.name, role: user.role }
    res.json({ token: tokenFor(user), user: payload })
  } catch (e) { next(e) }
})

router.get('/me', auth(), (req, res) => res.json(req.user))

router.get('/users', auth(), async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, username, name, role, active, created_at FROM users ORDER BY id')
    res.json(rows)
  } catch (e) { next(e) }
})

router.post('/users', auth(), async (req, res, next) => {
  try {
    const username = text(req.body.username, 'Username', 40)
    const name = text(req.body.name, 'Name', 80)
    const role = req.body.role === 'admin' ? 'admin' : 'cashier'
    const newPin = pin(req.body.pin, 'PIN')
    if (!/^[a-zA-Z0-9._-]+$/.test(username)) throw fail(400, 'Username may only use letters, numbers, dots, underscores, and hyphens')
    const [r] = await pool.query(
      'INSERT INTO users (username, name, pin_hash, role) VALUES (?,?,?,?)',
      [username, name, await bcrypt.hash(newPin, 12), role]
    )
    res.status(201).json({ id: r.insertId })
  } catch (e) { next(e) }
})

router.put('/users/:id', auth(), async (req, res, next) => {
  try {
    const id = integer(Number(req.params.id), 'User ID', 1)
    const [[target]] = await pool.query('SELECT * FROM users WHERE id = ?', [id])
    if (!target) throw fail(404, 'User not found')
    const values = {}
    if (req.body.name !== undefined) values.name = text(req.body.name, 'Name', 80)
    if (req.body.role !== undefined) {
      if (!['admin', 'cashier'].includes(req.body.role)) throw fail(400, 'Role must be admin or cashier')
      values.role = req.body.role
    }
    if (req.body.active !== undefined) {
      if (![0, 1, true, false].includes(req.body.active)) throw fail(400, 'Active must be true or false')
      values.active = req.body.active === 1 || req.body.active === true ? 1 : 0
    }
    if (values.active === 0 && id === req.user.id) throw fail(400, 'You cannot deactivate your own account')
    if ((values.active === 0 || (values.role && values.role !== 'admin')) && target.role === 'admin') {
      const [[{ admins }]] = await pool.query("SELECT COUNT(*) admins FROM users WHERE role = 'admin' AND active = 1")
      if (admins <= 1) throw fail(400, 'At least one active administrator is required')
    }
    if (req.body.pin !== undefined) {
      values.pin_hash = await bcrypt.hash(pin(req.body.pin), 12)
      values.token_version = target.token_version + 1
    }
    if (!Object.keys(values).length) throw fail(400, 'Nothing to update')
    const fields = Object.keys(values)
    await pool.query(`UPDATE users SET ${fields.map(f => `${f} = ?`).join(', ')} WHERE id = ?`, [...fields.map(f => values[f]), id])
    res.json({ ok: true })
  } catch (e) { next(e) }
})

export default router
