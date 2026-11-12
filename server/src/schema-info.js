import { pool } from './db.js'

// Startup migrations inspect the schema once rather than making a round trip for
// every table, column, and index. This matters most on hosted databases where
// each query can add noticeable latency to server startup.
let snapshot = null
let loading = null

function load() {
  if (snapshot) return Promise.resolve(snapshot)
  loading ??= Promise.all([
    pool.query(`SELECT TABLE_NAME FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`),
    pool.query(`SELECT TABLE_NAME, COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()`),
    pool.query(`SELECT TABLE_NAME, INDEX_NAME FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()`),
  ]).then(([[tables], [columns], [indexes]]) => {
    snapshot = {
      tables: new Set(tables.map(row => row.TABLE_NAME)),
      columns: new Set(columns.map(row => `${row.TABLE_NAME}.${row.COLUMN_NAME}`)),
      indexes: new Set(indexes.map(row => `${row.TABLE_NAME}.${row.INDEX_NAME}`)),
    }
    return snapshot
  }).catch((error) => {
    loading = null
    throw error
  })
  return loading
}

export async function hasTable(table) {
  return (await load()).tables.has(table)
}

export async function hasColumn(table, column) {
  return (await load()).columns.has(`${table}.${column}`)
}

export async function hasIndex(table, index) {
  return (await load()).indexes.has(`${table}.${index}`)
}

export async function rememberTable(table) {
  ;(await load()).tables.add(table)
}

export async function rememberColumn(table, column) {
  ;(await load()).columns.add(`${table}.${column}`)
}

export async function rememberIndex(table, index) {
  ;(await load()).indexes.add(`${table}.${index}`)
}