
import mysql from 'mysql2/promise'
import 'dotenv/config'
import fs from 'node:fs'

const sslDisabled = process.env.DB_SSL === 'false'

function getSSLConfig() {
  if (sslDisabled) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Database SSL cannot be disabled in production')
    }
    return undefined
  }

  const ca = process.env.DB_CA_CERT?.replace(/\\n/g, '\n')

  if (!ca) {
    throw new Error(
      'Missing DB_CA_CERT. Add the Aiven CA certificate to your environment variables.'
    )
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
    if (err) console.error('Failed to set MySQL timezone:', err.message)
  })
})

export const fail = (status, message) =>
  Object.assign(new Error(message), { status })
