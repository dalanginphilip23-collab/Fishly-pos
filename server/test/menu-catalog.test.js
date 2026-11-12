import test from 'node:test'
import assert from 'node:assert/strict'
import { applyMenuCatalog, menuCategories, migrateMenuCatalog } from '../src/menu-catalog.js'

test('menu updates existing products without resetting stock and adds new items at zero stock', async () => {
  const calls = []
  const conn = { query: async (sql, params) => {
    calls.push({ sql, params })
    if (sql.startsWith('SELECT id FROM categories')) return [[{ id: 2 }]]
    if (sql.startsWith('SELECT id FROM products')) return [params[0] === 'RC-R' ? [{ id: 42 }] : []]
    return [{ insertId: 99 }]
  } }
  await applyMenuCatalog(conn)
  const update = calls.find(call => call.sql.startsWith('UPDATE products'))
  assert.equal(update.params[2], 60)
  assert.equal(update.params[3], 42)
  assert.doesNotMatch(update.sql, /stock|active|is_combo/)
  const inserts = calls.filter(call => call.sql.startsWith('INSERT INTO products'))
  assert.equal(inserts.length, 6)
  assert.ok(inserts.every(call => call.sql.endsWith('VALUES (?,?,?,?,0)')))
  assert.deepEqual(menuCategories.flatMap(category => category.items).map(item => item[2]), [60, 60, 60, 15, 15, 15, 15])
  const retired = calls.filter(call => call.sql.startsWith('UPDATE products SET active'))
  assert.equal(retired.length, 7)
  assert.ok(retired.every(call => call.sql.endsWith('WHERE code = ? AND name = ?')))
  assert.ok(retired.every(call => !/stock|DELETE/.test(call.sql)))
})

test('completed menu migration does not overwrite subsequent admin edits', async () => {
  const calls = []
  const conn = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    query: async (sql) => { calls.push(sql); return sql.startsWith('SELECT version') ? [[{ version: 'fishly-poppers-menu-v2' }]] : [[]] },
  }
  await migrateMenuCatalog({ query: async () => {}, getConnection: async () => conn })
  assert.ok(calls.every(sql => sql.startsWith('SELECT')))
})
