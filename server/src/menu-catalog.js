// Prices and portions from the supplied Rice to Meet You menu.
export const menuCategories = [
  { name: 'Rice meals (5 pcs + Cheese Ranch)', sort: 2, items: [
    ['RC-R', 'Regular chicken poppers rice cup (5 pcs)', 50],
    ['RC-S', 'Spicy chicken poppers rice cup (5 pcs)', 50],
    ['RC-BBQ', 'BBQ chicken poppers rice cup (5 pcs)', 50],
  ] },
  { name: 'Combo meals (rice cup + drink + Cheese Ranch)', sort: 3, items: [
    ['CM-R', 'Regular chicken poppers rice cup + drink (5 pcs)', 70],
    ['CM-S', 'Spicy chicken poppers rice cup + drink (5 pcs)', 70],
    ['CM-BBQ', 'BBQ chicken poppers rice cup + drink (5 pcs)', 70],
  ] },
  { name: 'Drinks', sort: 4, items: [
    ['BL-S', 'Blue Lemonade (small)', 20],
    ['CJ-S', 'Cucumber Juice (small)', 20],
  ] },
  { name: 'Pastillas', sort: 5, items: [
    ['PS-M', 'Pastillas Milo (per pack)', 20],
    ['PS-C', 'Pastillas Coffee (per pack)', 20],
    ['PS-O', 'Pastillas Oreo (per pack)', 20],
  ] },
  { name: 'Choco Palitaw', sort: 6, items: [
    ['CP-C', 'Choco Palitaw (per cup)', 20],
  ] },
  { name: 'Plain rice', sort: 7, items: [
    ['PR-C', 'Plain Rice (per cup)', 15],
  ] },
]

export async function applyMenuCatalog(conn) {
  for (const category of menuCategories) {
    const [[existing]] = await conn.query('SELECT id FROM categories WHERE name = ? ORDER BY id LIMIT 1', [category.name])
    let categoryId = existing?.id
    if (!categoryId) {
      const [created] = await conn.query('INSERT INTO categories (name, sort_order) VALUES (?,?)', [category.name, category.sort])
      categoryId = created.insertId
    }
    for (const [code, name, price] of category.items) {
      const [[product]] = await conn.query('SELECT id FROM products WHERE code = ? FOR UPDATE', [code])
      if (product) {
        await conn.query('UPDATE products SET category_id = ?, name = ?, price = ? WHERE id = ?', [categoryId, name, price, product.id])
      } else {
        await conn.query('INSERT INTO products (category_id, code, name, price, stock) VALUES (?,?,?,?,0)', [categoryId, code, name, price])
      }
    }
  }
}

export async function migrateMenuCatalog(pool) {
  await pool.query(`CREATE TABLE IF NOT EXISTS menu_migrations (
    version VARCHAR(80) PRIMARY KEY,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) ENGINE=InnoDB`)
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    await conn.query('SELECT id FROM inventory_lock WHERE id = 1 FOR UPDATE')
    const version = 'rice-to-meet-you-menu-v1'
    const [[applied]] = await conn.query('SELECT version FROM menu_migrations WHERE version = ?', [version])
    if (!applied) {
      await applyMenuCatalog(conn)
      await conn.query('INSERT INTO menu_migrations (version) VALUES (?)', [version])
    }
    await conn.commit()
  } catch (error) {
    await conn.rollback()
    throw error
  } finally { conn.release() }
}
