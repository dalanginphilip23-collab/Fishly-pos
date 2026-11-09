import bcrypt from 'bcryptjs'
import { pool } from './db.js'

// Accounts are only created when the users table is empty. Existing PINs are
// never reset by starting the API or running the seed command.
async function createFirstAdmin() {
  const [[{ count }]] = await pool.query('SELECT COUNT(*) AS count FROM users')
  if (Number(count) > 0) return false
  const username = process.env.ADMIN_USERNAME || 'admin'
  const pin = process.env.ADMIN_PIN || '0000'
  if (pin.length < 4) {
    throw new Error('ADMIN_PIN must be at least 4 characters')
  }
  await pool.query(
    'INSERT INTO users (username, name, pin_hash, role) VALUES (?,?,?,?)',
    [username, process.env.ADMIN_NAME || 'Administrator', await bcrypt.hash(pin, 12), 'admin']
  )
  console.log(`Administrator account created for ${username}.`)
  return true
}

export async function ensureDefaultUsers() {
  return createFirstAdmin()
}

export async function seedUsers() {
  return createFirstAdmin()
}

if (process.argv[1]?.endsWith('seed.js')) {
  await seedUsers()
  process.exit(0)
}