
import mysql from 'mysql2/promise'
import 'dotenv/config'

function getSSLConfig() {
  if (process.env.DB_SSL === 'false') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('SSL must be enabled in production')
    }
    return undefined
  }

  const base64 = process.env.DB_CA_CERT_BASE64
  const raw = process.env.DB_CA_CERT

  const ca = base64
    ? Buffer.from(base64, 'base64').toString('utf8')
    : raw?.replace(/\\n/g, '\n')

  if (!ca || !ca.includes('-----BEGIN CERTIFICATE-----')) {
    throw new Error('Missing or invalid Aiven CA certificate')
  }

  return {
    ca,
    rejectUnauthorized: true
  }
}

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,

  decimalNumbers: true,
  timezone: '+08:00',
  dateStrings: ['DATE'],

  waitForConnections: true,
  connectionLimit: 10,
  connectTimeout: 20000,

  ssl: getSSLConfig()
})

pool.pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+08:00'", (err) => {
    if (err) {
      console.error('Timezone configuration failed:', err.message)
    }
  })
})

export const fail = (status, message) =>
  Object.assign(new Error(message), { status })
