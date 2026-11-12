import test from 'node:test'
import assert from 'node:assert/strict'
import { getSSLConfig } from '../src/db-ssl.js'

test('local development does not require a hosted database certificate', () => {
  for (const DB_HOST of ['localhost', '127.0.0.1', '::1']) {
    assert.equal(getSSLConfig({ DB_HOST }), undefined)
  }
})

test('hosted, production, and explicitly enabled SSL require a CA', () => {
  for (const env of [
    { DB_HOST: 'mysql.example.com' },
    { DB_HOST: 'localhost', NODE_ENV: 'production' },
    { DB_HOST: 'localhost', DB_SSL: 'true' },
  ]) assert.throws(() => getSSLConfig(env), /requires a CA certificate/)
  assert.throws(() => getSSLConfig({ DB_SSL: 'false', NODE_ENV: 'production' }), /SSL must be enabled/)
})

test('configured certificates retain verification and support both formats', () => {
  const ca = '-----BEGIN CERTIFICATE-----\nexample\n-----END CERTIFICATE-----'
  assert.deepEqual(getSSLConfig({ DB_CA_CERT: ca.replace(/\n/g, '\\n') }), { ca, rejectUnauthorized: true })
  assert.deepEqual(getSSLConfig({ DB_CA_CERT_BASE64: Buffer.from(ca).toString('base64') }), { ca, rejectUnauthorized: true })
  assert.throws(() => getSSLConfig({ DB_CA_CERT_BASE64: 'invalid' }), /requires a CA certificate/)
})
