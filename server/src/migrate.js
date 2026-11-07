import { pool } from './db.js'

try {
  for (const table of ['products', 'order_items']) {
    const [columns] = await pool.query(
      'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      [table, 'unit_cost']
    )
    if (!columns.length) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN unit_cost DECIMAL(10,2) NULL AFTER price`)
      console.log(`Added ${table}.unit_cost`)
    }
  }
  const [photos] = await pool.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'photo_url'")
  if (!photos.length) {
    await pool.query('ALTER TABLE products ADD COLUMN photo_url VARCHAR(255) NULL')
    console.log('Added products.photo_url')
  }
  console.log('Product cost and photo schema ready.')
} finally {
  await pool.end()
}
