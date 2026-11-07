import test from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../src/db.js'
import { transaction } from '../src/transaction.js'

test('transactions commit only on success and always release their connection', async (t) => {
  const calls = []
  const conn = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
  }
  t.mock.method(pool, 'getConnection', async () => conn)
  assert.equal(await transaction(async () => 42), 42)
  assert.deepEqual(calls, ['begin', 'commit', 'release'])
  calls.length = 0
  const failure = new Error('Insufficient stock')
  await assert.rejects(transaction(async () => { throw failure }), failure)
  assert.deepEqual(calls, ['begin', 'rollback', 'release'])
})

test('connection acquisition failures reject normally', async (t) => {
  const failure = new Error('Database unavailable')
  t.mock.method(pool, 'getConnection', async () => { throw failure })
  await assert.rejects(transaction(async () => assert.fail('Must not execute')), failure)
})

test('rollback failure preserves original error and releases connection', async (t) => {
  let released = false
  t.mock.method(pool, 'getConnection', async () => ({
    beginTransaction: async () => {},
    rollback: async () => { throw new Error('Connection lost') },
    release: () => { released = true },
  }))
  const failure = new Error('Write failed')
  await assert.rejects(transaction(async () => { throw failure }), failure)
  assert.equal(released, true)
})
