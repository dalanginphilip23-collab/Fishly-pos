import { createHash } from 'node:crypto'
import { fail } from './db.js'
import { transaction } from './transaction.js'

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]))
  return value
}

export const payloadHash = (body) => createHash('sha256').update(JSON.stringify(canonical(body))).digest('hex')

export function requestId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9-]{16,64}$/.test(value)) throw fail(400, 'A valid request ID is required')
  return value
}

// The request record and business mutation commit together. Concurrent retries
// wait on the unique key and receive the original result, including after a lost response.
export async function mutate(req, scope, work) {
  const id = requestId(req.body.request_id)
  const hash = payloadHash(req.body)
  return transaction(async conn => {
    await conn.query('INSERT IGNORE INTO mutation_requests (user_id, scope, request_id, payload_hash) VALUES (?,?,?,?)', [req.user.id, scope, id, hash])
    const [[saved]] = await conn.query('SELECT * FROM mutation_requests WHERE user_id = ? AND scope = ? AND request_id = ? FOR UPDATE', [req.user.id, scope, id])
    if (saved.payload_hash !== hash) throw fail(409, 'This request was already used with different details')
    if (saved.response_json !== null) return JSON.parse(saved.response_json)
    const result = await work(conn)
    await conn.query('UPDATE mutation_requests SET response_json = ? WHERE user_id = ? AND scope = ? AND request_id = ?', [JSON.stringify(result), req.user.id, scope, id])
    return result
  })
}

// A small counter POS favors predictable serialized inventory writes. Every
// stock/catalog writer takes this lock before product locks, avoiding mixed combo lock cycles.
export const lockInventory = conn => conn.query('SELECT id FROM inventory_lock WHERE id = 1 FOR UPDATE')
