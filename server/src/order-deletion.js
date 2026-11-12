import { fail } from './db.js'
import { lockInventory } from './mutations.js'

// Called inside mutate's transaction so stock restoration and deletion commit together.
export async function deleteOrder(conn, { orderId, userId, restock }) {
  await lockInventory(conn)
  const [[order]] = await conn.query('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId])
  if (!order) throw fail(404, 'Sale not found')

  // Refunded orders already went through their chosen inventory correction.
  const restore = restock && order.status !== 'cancelled'
  if (restore) {
    // Use the sale-time inventory snapshot, including original combo ingredients.
    const [stock] = await conn.query('SELECT product_id, quantity FROM order_stock WHERE order_id = ? ORDER BY product_id', [orderId])
    for (const item of stock) {
      await conn.query('UPDATE products SET stock = stock + ? WHERE id = ?', [item.quantity, item.product_id])
      await conn.query('INSERT INTO stock_adjustments (product_id, adjustment_type, quantity, reason, user_id) VALUES (?,?,?,?,?)', [item.product_id, 'add', item.quantity, `Deleted sale ${order.order_no}`, userId])
    }
  }
  await conn.query('DELETE FROM refunds WHERE order_id = ?', [orderId])
  // order_items and order_stock are deleted by their ON DELETE CASCADE keys.
  await conn.query('DELETE FROM orders WHERE id = ?', [orderId])
  return { id: orderId, order_no: order.order_no, deleted: true, restocked: Boolean(restore) }
}
