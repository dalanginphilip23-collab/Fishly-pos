import { Router } from 'express'
import { pool, fail } from '../db.js'
import { auth } from '../middleware/auth.js'
import { cents, integer, text } from '../validation.js'
import { mutate } from '../mutations.js'

const router = Router()
const staff = auth()

const shiftSummary = async (shiftId) => {
  const [[shift]] = await pool.query('SELECT s.*, u.name user_name FROM shifts s JOIN users u ON u.id = s.user_id WHERE s.id = ?', [shiftId])
  if (!shift) throw fail(404, 'Shift not found')
  const [[totals]] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total END),0) cash_sales,
       COALESCE(SUM(CASE WHEN payment_method = 'gcash' THEN total END),0) gcash_sales
     FROM orders WHERE shift_id = ?`,
    [shiftId]
  )
  // Refunded sales stay in sales totals and are subtracted through the refunds
  // table. Excluding the original order would count the refund twice.
  const [[refunds]] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN amount END),0) cash_refunds,
            COALESCE(SUM(CASE WHEN payment_method = 'gcash' THEN amount END),0) gcash_refunds
     FROM refunds WHERE shift_id = ?`,
    [shiftId]
  )
  const [[movements]] = await pool.query(
    `SELECT COALESCE(SUM(CASE WHEN direction = 'in' THEN amount END),0) cash_in,
            COALESCE(SUM(CASE WHEN direction = 'out' THEN amount END),0) cash_out
     FROM cash_movements WHERE shift_id = ?`,
    [shiftId]
  )
  const expectedCash = Number(shift.opening_cash) + Number(totals.cash_sales) - Number(refunds.cash_refunds) + Number(movements.cash_in) - Number(movements.cash_out)
  const expectedGcash = Number(totals.gcash_sales) - Number(refunds.gcash_refunds)
  const [orders] = await pool.query('SELECT id, order_no, total, payment_method, created_at FROM orders WHERE shift_id = ? ORDER BY id', [shiftId])
  const [movementRows] = await pool.query('SELECT * FROM cash_movements WHERE shift_id = ? ORDER BY id', [shiftId])
  return {
    ...shift,
    orders,
    movements: movementRows,
    totals: {
      cash_sales: Number(totals.cash_sales),
      gcash_sales: Number(totals.gcash_sales),
      cash_refunds: Number(refunds.cash_refunds),
      gcash_refunds: Number(refunds.gcash_refunds),
      cash_in: Number(movements.cash_in),
      cash_out: Number(movements.cash_out),
      expected_cash: expectedCash,
      expected_gcash: expectedGcash,
      variance: shift.counted_cash === null ? null : Number(shift.counted_cash) - expectedCash,
      gcash_variance: shift.counted_gcash === null ? null : Number(shift.counted_gcash) - expectedGcash,
    },
  }
}

const ownShift = async (req, id) => {
  const [[shift]] = await pool.query('SELECT * FROM shifts WHERE id = ?', [id])
  if (!shift) throw fail(404, 'Shift not found')
  if (req.user.role !== 'admin' && shift.user_id !== req.user.id) throw fail(403, 'This shift belongs to another cashier')
  if (shift.closed_at) throw fail(409, 'This shift is already closed')
  return shift
}

router.get('/current', staff, async (req, res, next) => {
  try {
    const [[shift]] = await pool.query('SELECT id FROM shifts WHERE user_id = ? AND closed_at IS NULL ORDER BY id DESC LIMIT 1', [req.user.id])
    res.json(shift ? await shiftSummary(shift.id) : null)
  } catch (e) { next(e) }
})

router.get('/', auth(), async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT s.*, u.name user_name FROM shifts s JOIN users u ON u.id = s.user_id ORDER BY s.id DESC LIMIT 100`
    )
    res.json(rows)
  } catch (e) { next(e) }
})

router.get('/:id', staff, async (req, res, next) => {
  try {
    const id = integer(Number(req.params.id), 'Shift ID', 1)
    const [[shift]] = await pool.query('SELECT * FROM shifts WHERE id = ?', [id])
    if (!shift) throw fail(404, 'Shift not found')
    if (req.user.role !== 'admin' && shift.user_id !== req.user.id) throw fail(403, 'This shift belongs to another cashier')
    res.json(await shiftSummary(id))
  } catch (e) { next(e) }
})

router.post('/open', staff, async (req, res, next) => {
  try {
    const openingCash = cents(req.body.opening_cash, 'Opening cash') / 100
    const result = await mutate(req, 'shift.open', async (conn) => {
      await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [req.user.id])
      const [[open]] = await conn.query('SELECT id FROM shifts WHERE user_id = ? AND closed_at IS NULL LIMIT 1', [req.user.id])
      if (open) throw fail(409, 'You already have an open shift')
      const [r] = await conn.query('INSERT INTO shifts (user_id, opening_cash) VALUES (?,?)', [req.user.id, openingCash])
      return { id: r.insertId }
    })
    res.status(201).json(await shiftSummary(result.id))
  } catch (e) { next(e) }
})

router.post('/:id/movements', staff, async (req, res, next) => {
  try {
    const id = integer(Number(req.params.id), 'Shift ID', 1)
    const direction = req.body.direction
    if (!['in', 'out'].includes(direction)) throw fail(400, 'Choose cash in or cash out')
    const amount = cents(req.body.amount, 'Amount') / 100
    if (amount <= 0) throw fail(400, 'Amount must be greater than zero')
    const reason = text(req.body.reason, 'Reason', 200)
    const result = await mutate(req, `shift.movement.${id}`, async (conn) => {
      await conn.query('SELECT id FROM shifts WHERE id = ? FOR UPDATE', [id])
      const [[shift]] = await conn.query('SELECT * FROM shifts WHERE id = ?', [id])
      if (!shift) throw fail(404, 'Shift not found')
      if (shift.user_id !== req.user.id && req.user.role !== 'admin') throw fail(403, 'This shift belongs to another cashier')
      if (shift.closed_at) throw fail(409, 'This shift is already closed')
      const [r] = await conn.query(
        'INSERT INTO cash_movements (shift_id, user_id, direction, amount, reason) VALUES (?,?,?,?,?)',
        [id, req.user.id, direction, amount, reason]
      )
      return { id: r.insertId }
    })
    res.status(201).json(await shiftSummary(id))
  } catch (e) { next(e) }
})

router.post('/:id/close', staff, async (req, res, next) => {
  try {
    const id = integer(Number(req.params.id), 'Shift ID', 1)
    const countedCash = cents(req.body.counted_cash, 'Counted cash') / 100
    const countedGcash = cents(req.body.counted_gcash ?? 0, 'Counted GCash') / 100
    const notes = req.body.notes ? text(req.body.notes, 'Notes', 500) : null
    const result = await mutate(req, `shift.close.${id}`, async (conn) => {
      await conn.query('SELECT id FROM shifts WHERE id = ? FOR UPDATE', [id])
      const [[shift]] = await conn.query('SELECT * FROM shifts WHERE id = ?', [id])
      if (!shift) throw fail(404, 'Shift not found')
      if (shift.user_id !== req.user.id && req.user.role !== 'admin') throw fail(403, 'This shift belongs to another cashier')
      if (shift.closed_at) throw fail(409, 'This shift is already closed')
      const summary = await shiftSummary(id)
      const variance = countedCash - summary.totals.expected_cash
      await conn.query(
        'UPDATE shifts SET counted_cash = ?, expected_cash = ?, variance = ?, counted_gcash = ?, expected_gcash = ?, notes = ?, closed_at = CURRENT_TIMESTAMP WHERE id = ?',
        [countedCash, summary.totals.expected_cash, variance, countedGcash, summary.totals.expected_gcash, notes, id]
      )
      return { id }
    })
    res.json(await shiftSummary(result.id))
  } catch (e) { next(e) }
})

export default router
