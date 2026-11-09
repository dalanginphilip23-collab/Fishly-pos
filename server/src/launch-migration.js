import { pool } from './db.js'

export async function migrateLaunchSchema() {
  const add = async (table, name, definition) => {
    const [rows] = await pool.query('SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?', [table, name])
    if (!rows.length) await pool.query(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`)
  }
  await add('products', 'photo_url', 'VARCHAR(255) NULL')
  await add('order_items', 'unit_cost', 'DECIMAL(10,2) NULL')
  await add('users', 'token_version', 'INT NOT NULL DEFAULT 0')
  const [[adjustmentType]] = await pool.query("SELECT COLUMN_TYPE type FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_adjustments' AND COLUMN_NAME = 'adjustment_type'")
  if (adjustmentType && !adjustmentType.type.includes("'count'")) {
    await pool.query("ALTER TABLE stock_adjustments MODIFY adjustment_type ENUM('add','remove','wastage','opening','count') NOT NULL")
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS mutation_requests (
    user_id INT NOT NULL, scope VARCHAR(40) NOT NULL, request_id VARCHAR(64) NOT NULL,
    payload_hash CHAR(64) NOT NULL, response_json LONGTEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, scope, request_id)
  )`)
  await pool.query('CREATE TABLE IF NOT EXISTS inventory_lock (id INT PRIMARY KEY)')
  await pool.query('INSERT IGNORE INTO inventory_lock (id) VALUES (1)')
  await pool.query(`CREATE TABLE IF NOT EXISTS shifts (
    id INT AUTO_INCREMENT PRIMARY KEY, user_id INT NOT NULL,
    opening_cash DECIMAL(10,2) NOT NULL, counted_cash DECIMAL(10,2) NULL,
    expected_cash DECIMAL(10,2) NULL, variance DECIMAL(10,2) NULL,
    counted_gcash DECIMAL(10,2) NULL, expected_gcash DECIMAL(10,2) NULL,
    notes VARCHAR(500) NULL, opened_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    closed_at TIMESTAMP NULL, INDEX (user_id, closed_at)
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS cash_movements (
    id INT AUTO_INCREMENT PRIMARY KEY, shift_id INT NOT NULL, user_id INT NOT NULL,
    direction ENUM('in','out') NOT NULL, amount DECIMAL(10,2) NOT NULL,
    reason VARCHAR(200) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (shift_id) REFERENCES shifts(id)
  )`)
  await add('orders', 'shift_id', 'INT NULL')
  await add('orders', 'payment_reference', 'VARCHAR(80) NULL')
  await pool.query(`CREATE TABLE IF NOT EXISTS order_stock (
    order_id INT NOT NULL, product_id INT NOT NULL, quantity INT NOT NULL,
    PRIMARY KEY (order_id, product_id)
  )`)
  await pool.query(`CREATE TABLE IF NOT EXISTS refunds (
    id INT AUTO_INCREMENT PRIMARY KEY, order_id INT NOT NULL UNIQUE,
    shift_id INT NULL, user_id INT NOT NULL, amount DECIMAL(10,2) NOT NULL,
    payment_method VARCHAR(20) NOT NULL, reference VARCHAR(80) NULL,
    restock TINYINT NOT NULL, reason VARCHAR(200) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
  await pool.query('ALTER TABLE refunds MODIFY shift_id INT NULL').catch(() => {})
  await add('expenses', 'user_id', 'INT NULL')
  await add('expenses', 'purchase_id', 'INT NULL UNIQUE')
  await add('expenses', 'voided_at', 'TIMESTAMP NULL')
  await add('expenses', 'voided_by', 'INT NULL')
  await add('expenses', 'void_reason', 'VARCHAR(200) NULL')
  await add('purchases', 'paid', 'TINYINT NOT NULL DEFAULT 0')
  await pool.query(`CREATE TABLE IF NOT EXISTS expense_imports (
    file_hash CHAR(64) PRIMARY KEY, user_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`)
}
