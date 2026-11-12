
import mysql from 'mysql2/promise'
import 'dotenv/config'
import { getSSLConfig } from './db-ssl.js'

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
