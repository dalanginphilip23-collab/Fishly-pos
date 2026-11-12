// Fishly Poppers menu confirmed by the store owner.
export const menuCategories = [
  { name: 'Popper Fish With Rice Cup', sort: 1, items: [
    ['RC-R', 'Popper Fish With Rice Cup - Regular', 60],
    ['RC-S', 'Popper Fish With Rice Cup - Spicy', 60],
    ['RC-BBQ', 'Popper Fish With Rice Cup - Barbecue', 60],
  ] },
  { name: 'Drinks', sort: 2, items: [
    ['MJ', 'Melon Juice', 15],
  ] },
  { name: 'Pastillas', sort: 3, items: [
    ['PS-C', 'Pastillas - Coffee', 15],
    ['PS-O', 'Pastillas - Oreo', 15],
    ['PS-M', 'Pastillas - Milo', 15],
  ] },
]

// Retire only unchanged entries from the previous supplied catalog. Preserve
// their stock and sales history, and leave custom products alone.
const retiredItems = [
  ['CM-R', 'Regular chicken poppers rice cup + drink (5 pcs)'],
  ['CM-S', 'Spicy chicken poppers rice cup + drink (5 pcs)'],
  ['CM-BBQ', 'BBQ chicken poppers rice cup + drink (5 pcs)'],
  ['BL-S', 'Blue Lemonade (small)'],
  ['CJ-S', 'Cucumber Juice (small)'],
  ['CP-C', 'Choco Palitaw (per cup)'],
  ['PR-C', 'Plain Rice (per cup)'],
]

export async function applyMenuCatalog(conn) {
  for (const category of menuCategories) {
    const [[existing]] = await conn.query('SELECT id FROM categories WHERE name = ? ORDER BY id LIMIT 1', [category.name])
    let categoryId = existing?.id
    if (!categoryId) {
      const [created] = await conn.query('INSERT INTO categories (name, sort_order) VALUES (?,?)', [category.name, category.sort])
      categoryId = created.insertId
    } else {
      await conn.query('UPDATE categories SET sort_order = ? WHERE id = ?', [category.sort, categoryId])
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
  for (const [code, name] of retiredItems) {
    await conn.query('UPDATE products SET active = 0 WHERE code = ? AND name = ?', [code, name])
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
    const version = 'fishly-poppers-menu-v2'
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
