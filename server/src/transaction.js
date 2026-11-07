import { pool } from './db.js'

export async function transaction(work) {
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const result = await work(conn)
    await conn.commit()
    return result
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  } finally {
    conn.release()
  }
}
