
import { pool } from './db.js'
import { migrateLaunchSchema } from './launch-migration.js'
import { migrateMenuCatalog } from './menu-catalog.js'

async function columnExists(table, column) {
  const [rows] = await pool.query(
    `SELECT COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [table, column]
  )

  return rows.length > 0
}

async function tableExists(table) {
  const [rows] = await pool.query(
    `SELECT TABLE_NAME
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND TABLE_TYPE = 'BASE TABLE'`,
    [table]
  )

  return rows.length > 0
}

async function addColumnIfMissing(table, column, definition) {
  if (!(await tableExists(table))) {
    throw new Error(
      `Missing required table: ${table}. Import the original POS schema first.`
    )
  }

  if (!(await columnExists(table, column))) {
    await pool.query(
      `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`
    )
    console.log(`Added ${table}.${column}`)
  }
}

async function verifyDatabase() {
  const [[info]] = await pool.query(`
    SELECT DATABASE() AS database_name,
           @@hostname AS server_name,
           @@port AS server_port
  `)

  console.log('Database:', info.database_name)
  console.log('MySQL server:', info.server_name)
  console.log('MySQL port:', info.server_port)

  if (!info.database_name) {
    throw new Error('No database selected')
  }

  if (info.database_name !== process.env.DB_NAME) {
    throw new Error(
      `Database mismatch: expected ${process.env.DB_NAME}, got ${info.database_name}`
    )
  }

  const requiredTables = [
    'users',
    'products',
    'orders',
    'order_items',
    'expenses'
  ]

  for (const table of requiredTables) {
    if (!(await tableExists(table))) {
      throw new Error(
        `Required table "${table}" not found in "${info.database_name}". ` +
        'Check your DB_NAME and original database schema.'
      )
    }

    console.log(`Verified table: ${table}`)
  }

  const [tables] = await pool.query(`
    SELECT TABLE_NAME, ENGINE
    FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME IN ('products', 'users', 'stock_adjustments')
  `)

  console.log('Parent/dependent table details:', tables)
}

export async function migrateSchema() {
  console.log('Starting Fishly POS migration...')

  await verifyDatabase()

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      phone VARCHAR(40) NULL,
      email VARCHAR(120) NULL,
      address VARCHAR(255) NULL,
      notes VARCHAR(500) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS stock_adjustments (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_id INT NOT NULL,
      adjustment_type ENUM('add','remove','wastage','opening') NOT NULL,
      quantity INT NOT NULL,
      reason VARCHAR(200) NULL,
      user_id INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB
  `)

  await addColumnIfMissing(
    'products',
    'reorder_level',
    'INT NOT NULL DEFAULT 10 AFTER stock'
  )

  await addColumnIfMissing(
    'products',
    'expiry_date',
    'DATE NULL AFTER reorder_level'
  )

  await addColumnIfMissing(
    'orders',
    'customer_id',
    'INT NULL AFTER cashier_id'
  )

  await addColumnIfMissing(
    'products',
    'is_combo',
    'TINYINT(1) NOT NULL DEFAULT 0 AFTER price'
  )

  await pool.query(`
    CREATE TABLE IF NOT EXISTS combo_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      combo_id INT NOT NULL,
      item_id INT NOT NULL,
      qty INT NOT NULL DEFAULT 1,
      FOREIGN KEY (combo_id) REFERENCES products(id)
        ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES products(id)
    ) ENGINE=InnoDB
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      phone VARCHAR(40) NULL,
      email VARCHAR(120) NULL,
      address VARCHAR(255) NULL,
      notes VARCHAR(500) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchases (
      id INT AUTO_INCREMENT PRIMARY KEY,
      supplier_id INT NULL,
      reference VARCHAR(40) NULL,
      status ENUM('received','draft') NOT NULL DEFAULT 'received',
      total DECIMAL(10,2) NOT NULL DEFAULT 0,
      notes VARCHAR(500) NULL,
      user_id INT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (supplier_id) REFERENCES suppliers(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS purchase_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      purchase_id INT NOT NULL,
      product_id INT NOT NULL,
      qty INT NOT NULL,
      unit_cost DECIMAL(10,2) NULL,
      total DECIMAL(10,2) NOT NULL,
      FOREIGN KEY (purchase_id) REFERENCES purchases(id)
        ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    ) ENGINE=InnoDB
  `)

  await addColumnIfMissing(
    'expenses', 'category',
    "VARCHAR(20) NOT NULL DEFAULT 'other' AFTER id"
  )

  await addColumnIfMissing(
    'expenses', 'qty',
    'INT NULL AFTER amount'
  )

  await addColumnIfMissing(
    'expenses', 'unit_cost',
    'DECIMAL(10,2) NULL AFTER qty'
  )

  await addColumnIfMissing(
    'expenses', 'receipt_url',
    'VARCHAR(255) NULL AFTER unit_cost'
  )

  await addColumnIfMissing(
    'expenses', 'title',
    'VARCHAR(150) NULL AFTER category'
  )

  await addColumnIfMissing(
    'expenses', 'unit',
    'VARCHAR(20) NULL AFTER qty'
  )

  await migrateLaunchSchema()
  await migrateMenuCatalog(pool)

  console.log('Fishly POS database migration completed successfully.')
}

if (process.argv[1]?.endsWith('migrate.js')) {
  try {
    await migrateSchema()
  } catch (error) {
    console.error('Migration failed:', error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}
