import test from 'node:test'
import assert from 'node:assert/strict'
import { applyFishlyCombo, applyMenuCatalog, fishlyComboCategory, menuCategories, migrateMenuCatalog } from '../src/menu-catalog.js'

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
    query: async (sql, params) => { calls.push(sql); return sql.startsWith('SELECT version') ? [[{ version: params[0] }]] : [[]] },
  }
  await migrateMenuCatalog({ query: async () => {}, getConnection: async () => conn })
  assert.ok(calls.every(sql => sql.startsWith('SELECT')))
})

test('combo menu adds only missing ₱90 items and removes unused categories', async () => {
  const calls = []
  const conn = { query: async (sql, params) => {
    calls.push({ sql, params })
    if (sql.startsWith('SELECT id FROM categories')) return [[{ id: 9 }]]
    if (sql.startsWith('SELECT id FROM products')) return [params[0] === 'FC-S' ? [{ id: 70 }] : []]
    return [[]]
  } }
  await applyFishlyCombo(conn)
  const inserts = calls.filter(call => call.sql.startsWith('INSERT INTO products'))
  assert.deepEqual(inserts.map(call => call.params.slice(1)), [
    ['FC-C', 'Fishly Combo - Classic', 90],
    ['FC-BBQ', 'Fishly Combo - Barbecue', 90],
  ])
  assert.ok(inserts.every(call => call.sql.endsWith('VALUES (?,?,?,?,0)')))
  assert.equal(calls.filter(call => call.sql.startsWith('UPDATE products')).length, 0)
  assert.ok(calls.some(call => call.sql === 'DELETE c FROM categories c LEFT JOIN products p ON p.category_id = c.id WHERE p.id IS NULL'))
  assert.deepEqual(fishlyComboCategory.items.map(item => item[2]), [90, 90, 90])
})

test('combo menu still applies when the earlier menu version already ran', async () => {
  const calls = []
  const conn = {
    beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release: () => {},
    query: async (sql, params) => {
      calls.push({ sql, params })
      if (sql.startsWith('SELECT version')) return params[0] === 'fishly-poppers-menu-v2' ? [[{ version: params[0] }]] : [[]]
      if (sql.startsWith('SELECT id FROM categories')) return [[{ id: 4 }]]
      if (sql.startsWith('SELECT id FROM products')) return [[]]
      return [[]]
    },
  }
  await migrateMenuCatalog({ query: async () => {}, getConnection: async () => conn })
  assert.ok(!calls.some(call => call.sql.startsWith('UPDATE products SET active')))
  assert.ok(calls.some(call => call.sql.startsWith('INSERT INTO menu_migrations') && call.params[0] === 'fishly-poppers-menu-v3'))
  assert.equal(calls.filter(call => call.sql.startsWith('INSERT INTO products')).length, 3)
})
