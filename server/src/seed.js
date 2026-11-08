import bcrypt from 'bcryptjs'
import { pool } from './db.js'

const defaultUsers = [
  ['cashier', 'Cashier', '0000', 'cashier'],
]

export async function ensureDefaultUsers() {
  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM users')
  if (Number(count) > 0) return false
  for (const [username, name, pin, role] of defaultUsers) {
    const hash = await bcrypt.hash(pin, 10)
    await pool.query(
      'INSERT INTO users (username, name, pin_hash, role) VALUES (?,?,?,?)',
      [username, name, hash, role]
    )
  }
  console.log('Users ready: admin/1234, cashier/0000')
  return true
}

export async function seedUsers() {
  for (const [username, name, pin, role] of defaultUsers) {
    const hash = await bcrypt.hash(pin, 10)
    await pool.query(
      'INSERT INTO users (username, name, pin_hash, role) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE pin_hash = VALUES(pin_hash)',
      [username, name, hash, role]
    )
  }
  console.log('Users ready: admin/1234, cashier/0000')
}

if (process.argv[1]?.endsWith('seed.js')) {
  await seedUsers()
  process.exit(0)
}
