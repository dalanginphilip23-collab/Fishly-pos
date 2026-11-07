import bcrypt from 'bcryptjs'
import { pool } from './db.js'

const users = [
  ['admin', 'Admin', '1234', 'admin'],
  ['cashier', 'Cashier', '0000', 'cashier'],
]

for (const [username, name, pin, role] of users) {
  const hash = await bcrypt.hash(pin, 10)
  await pool.query(
    'INSERT INTO users (username, name, pin_hash, role) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE pin_hash = VALUES(pin_hash)',
    [username, name, hash, role]
  )
}
console.log('Users ready: admin/1234, cashier/0000')
process.exit(0)
