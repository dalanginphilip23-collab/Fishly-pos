import { pool } from './db.js'

export async function transaction(work) {
  for (let attempt = 0; ; attempt++) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const result = await work(conn)
    await conn.commit()
    return result
  } catch (error) {
    await conn.rollback().catch(() => {})
    if (error.code === 'ER_LOCK_DEADLOCK' && attempt < 2) continue
    throw error
  } finally {
    conn.release()
  }
  }
}
