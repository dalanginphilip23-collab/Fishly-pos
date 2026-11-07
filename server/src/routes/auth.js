import { Router } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { pool, fail } from '../db.js'
import { auth } from '../middleware/auth.js'
import { text } from '../validation.js'

const router = Router()

router.post('/login', async (req, res, next) => {
  try {
    const username = text(req.body.username, 'Username', 40)
    const pin = text(req.body.pin, 'PIN', 100)
    const [[user]] = await pool.query('SELECT * FROM users WHERE username = ? AND active = 1', [username])
    if (!user || !(await bcrypt.compare(String(pin), user.pin_hash))) throw fail(401, 'Wrong username or PIN')
    const payload = { id: user.id, name: user.name, role: user.role }
    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '12h' })
    res.json({ token, user: payload })
  } catch (e) { next(e) }
})

router.get('/me', auth(), (req, res) => res.json(req.user))

export default router
