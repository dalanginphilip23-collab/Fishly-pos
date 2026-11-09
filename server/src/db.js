import mysql from 'mysql2/promise'
import 'dotenv/config'

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  decimalNumbers: true,
  timezone: '+08:00',
  dateStrings: ['DATE'],
  connectionLimit: 10,
  ssl: process.env.DB_SSL === 'false' ? undefined : { rejectUnauthorized: false },
})

pool.pool.on('connection', connection => {
  connection.query("SET time_zone = '+08:00'")
})

export const fail = (status, message) => Object.assign(new Error(message), { status })
