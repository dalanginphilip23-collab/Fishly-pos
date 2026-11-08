import { pool } from './db.js'

async function columnExists(table, column) {
  const [rows] = await pool.query(
    'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column]
  )
  return rows.length > 0
}

async function tableExists(table) {
  const [rows] = await pool.query(
    'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?',
    [table]
  )
  return rows.length > 0
}

export async function migrateSchema() {
  await pool.query(`CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    phone VARCHAR(40) NULL,
    email VARCHAR(120) NULL,
    address VARCHAR(255) NULL,
    notes VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`)

  await pool.query(`CREATE TABLE IF NOT EXISTS stock_adjustments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id INT NOT NULL,
    adjustment_type ENUM('add','remove','wastage','opening') NOT NULL,
    quantity INT NOT NULL,
    reason VARCHAR(200) NULL,
    user_id INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`)

  if (!(await columnExists('products', 'reorder_level'))) {
    await pool.query('ALTER TABLE products ADD COLUMN reorder_level INT NOT NULL DEFAULT 10 AFTER stock')
    console.log('Added products.reorder_level')
  }
  if (!(await columnExists('products', 'expiry_date'))) {
    await pool.query('ALTER TABLE products ADD COLUMN expiry_date DATE NULL AFTER reorder_level')
    console.log('Added products.expiry_date')
  }
  if (!(await columnExists('orders', 'customer_id'))) {
    await pool.query('ALTER TABLE orders ADD COLUMN customer_id INT NULL AFTER cashier_id')
    console.log('Added orders.customer_id')
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS suppliers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    phone VARCHAR(40) NULL,
    email VARCHAR(120) NULL,
    address VARCHAR(255) NULL,
    notes VARCHAR(500) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`)

  await pool.query(`CREATE TABLE IF NOT EXISTS purchases (
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
  )`)

  await pool.query(`CREATE TABLE IF NOT EXISTS purchase_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    purchase_id INT NOT NULL,
    product_id INT NOT NULL,
    qty INT NOT NULL,
    unit_cost DECIMAL(10,2) NULL,
    total DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (purchase_id) REFERENCES purchases(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`)

  console.log('Inventory, customer and reporting schema ready.')
}

if (process.argv[1]?.endsWith('migrate.js')) {
  await migrateSchema()
  process.exit(0)
}
