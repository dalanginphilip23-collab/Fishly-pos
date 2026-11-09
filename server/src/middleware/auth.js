import jwt from 'jsonwebtoken'
import { pool } from '../db.js'

export const auth = (roles = []) => async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1]
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET)
  } catch {
    return res.status(401).json({ message: 'Please sign in again' })
  }
  try {
    const [[user]] = await pool.query('SELECT id, name, role, token_version FROM users WHERE id = ? AND active = 1', [req.user.id])
    if (!user || Number(req.user.token_version || 0) !== Number(user.token_version)) {
      return res.status(401).json({ message: 'Please sign in again' })
    }
    req.user = { id: user.id, name: user.name, role: user.role }
  } catch (error) { return next(error) }
  if (roles.length && !roles.includes(req.user.role)) {
    return res.status(403).json({ message: roles.length === 1 && roles[0] === 'cashier' ? 'Only cashiers can record sales' : 'You do not have access to this action' })
  }
  next()
}
