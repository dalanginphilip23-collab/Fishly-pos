import { Router } from 'express'
import { pool, fail } from '../db.js'
import { auth } from '../middleware/auth.js'
import { dateRange, cents, text } from '../validation.js'
import { costOfGoods, profitSummary } from '../profit.js'
import { buildWorkbook } from '../xlsx.js'

const router = Router()
const staff = auth(['admin', 'cashier'])

const liveOrders = "o.status <> 'cancelled' AND o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)"

const localDateTime = (value) => new Date(value).toLocaleString('en-PH', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

const stockStatus = (product) => {
  if (!product.active) return 'Hidden'
  if (product.stock === 0) return 'Sold out'
  if (product.stock <= 10) return 'Low stock'
  return 'In stock'
}

router.get('/summary', staff, async (req, res, next) => {
  try {
    const [from, to] = dateRange(req.query)
    const span = [from, to]

    const [days] = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') day, COUNT(*) orders, SUM(total) revenue
       FROM orders o WHERE ${liveOrders} GROUP BY day ORDER BY day`, span)
    const [top] = await pool.query(
      `SELECT p.id product_id, p.name, p.photo_url, SUM(i.qty) qty, SUM(i.qty * i.price) revenue
       FROM order_items i JOIN orders o ON o.id = i.order_id JOIN products p ON p.id = i.product_id WHERE ${liveOrders}
       GROUP BY p.id, p.name, p.photo_url ORDER BY qty DESC, revenue DESC, p.id ASC LIMIT 5`, span)
    const [payments] = await pool.query(
      `SELECT payment_method method, SUM(total) revenue FROM orders o WHERE ${liveOrders} GROUP BY payment_method`, span)
    const [productSales] = await pool.query(
      `SELECT i.product_id, i.name, i.price, p.unit_cost, SUM(i.qty) qty, SUM(i.qty * i.price) subtotal
       FROM order_items i JOIN orders o ON o.id = i.order_id LEFT JOIN products p ON p.id = i.product_id WHERE ${liveOrders}
       GROUP BY i.product_id, i.name, i.price, p.unit_cost ORDER BY qty DESC, i.product_id, i.price`, span)
    const [expenses] = await pool.query(
      `SELECT * FROM expenses WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY) ORDER BY id DESC`, span)

    const [sales] = await pool.query(
      `SELECT o.id, o.order_no, o.created_at, o.total, o.discount
       FROM orders o WHERE ${liveOrders} ORDER BY o.id DESC`, span)

    res.json({
      from,
      to,
      ...profitSummary(sales, expenses),
      ...costOfGoods(productSales),
      productSales,
      days,
      top,
      payments,
      expenses,
    })
  } catch (e) { next(e) }
})

router.post('/expenses', staff, async (req, res, next) => {
  try {
    const description = req.body.description === undefined || req.body.description === '' ? 'Daily expenses' : text(req.body.description, 'Description', 150)
    const amount = cents(req.body.amount) / 100
    if (amount <= 0) throw fail(400, 'Amount must be greater than zero')
    await pool.query('INSERT INTO expenses (description, amount) VALUES (?,?)', [description, amount])
    res.status(201).json({ ok: true })
  } catch (e) { next(e) }
})

router.get('/export.xlsx', staff, async (req, res, next) => {
  try {
    const [from, to] = dateRange(req.query)
    const span = [from, to]

    const [sales] = await pool.query(
      `SELECT o.id, o.order_no, o.created_at, o.status, o.payment_method, o.subtotal, o.discount, o.total,
              o.cash_received, o.change_due, u.name cashier_name
       FROM orders o LEFT JOIN users u ON u.id = o.cashier_id
       WHERE ${liveOrders} ORDER BY o.id`, span)
    const [items] = await pool.query(
      `SELECT o.order_no, o.created_at, i.name, i.qty, i.price, p.unit_cost
       FROM order_items i JOIN orders o ON o.id = i.order_id
       LEFT JOIN products p ON p.id = i.product_id
       WHERE ${liveOrders} ORDER BY o.id, i.id`, span)
    const [expenses] = await pool.query(
      `SELECT * FROM expenses WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY) ORDER BY id`, span)
    const [inventory] = await pool.query(
      `SELECT p.code, p.name, c.name category, p.price, p.unit_cost, p.stock, p.active
       FROM products p LEFT JOIN categories c ON c.id = p.category_id
       ORDER BY c.sort_order, p.name`)
    const [days] = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') day, COUNT(*) orders, SUM(total) revenue
       FROM orders o WHERE ${liveOrders} GROUP BY day ORDER BY day`, span)

    const report = profitSummary(sales, expenses)
    const cost = costOfGoods(items)
    const paymentTotals = new Map()
    for (const sale of sales) paymentTotals.set(sale.payment_method, (paymentTotals.get(sale.payment_method) || 0) + Number(sale.total))

    const summary = [
      ['Report', 'Fishly Poppers'],
      ['Period', from === to ? from : `${from} to ${to}`],
      ['Generated', localDateTime(new Date())],
      ['Completed sales', report.orders],
      ['Total sales (after discounts)', report.revenue],
      ['Sales before discounts', report.beforeDiscounts],
      ['Discounts', report.discounts],
      ['Recorded expenses', report.spent],
      ['Net profit', report.net],
      ['Average sale', report.orders ? report.revenue / report.orders : 0],
      ['Estimated cost of goods', cost.cogs],
      ['Estimated gross profit', report.revenue - cost.cogs],
      ['Units sold without a recorded cost', cost.uncostedUnits],
      ...['cash', 'gcash'].filter((method) => paymentTotals.has(method)).map((method) => [
        `${method === 'cash' ? 'Cash' : 'GCash'} collected`, paymentTotals.get(method),
      ]),
    ]

    const sheets = [
      {
        name: 'Summary',
        columns: [{ header: 'Metric', width: 36 }, { header: 'Value', width: 24 }],
        rows: summary,
      },
      {
        name: 'Sales',
        columns: [
          { header: 'Receipt', width: 14 }, { header: 'Date & time', width: 22 }, { header: 'Status', width: 12 },
          { header: 'Payment', width: 11 }, { header: 'Subtotal', width: 12 }, { header: 'Discount', width: 11 },
          { header: 'Total', width: 12 }, { header: 'Cash received', width: 14 }, { header: 'Change', width: 11 },
          { header: 'Cashier', width: 18 },
        ],
        rows: sales.map((sale) => [
          sale.order_no,
          localDateTime(sale.created_at),
          sale.status,
          sale.payment_method === 'cash' ? 'Cash' : 'GCash',
          Number(sale.subtotal),
          Number(sale.discount),
          Number(sale.total),
          sale.cash_received === null ? '' : Number(sale.cash_received),
          sale.change_due === null ? '' : Number(sale.change_due),
          sale.cashier_name || '',
        ]),
      },
      {
        name: 'Sold items',
        columns: [
          { header: 'Receipt', width: 14 }, { header: 'Date & time', width: 22 }, { header: 'Product', width: 30 },
          { header: 'Quantity', width: 10 }, { header: 'Unit price', width: 12 }, { header: 'Line sales', width: 12 },
          { header: 'Unit cost (current)', width: 17 }, { header: 'Line cost (current)', width: 17 },
        ],
        rows: items.map((item) => [
          item.order_no,
          localDateTime(item.created_at),
          item.name,
          Number(item.qty),
          Number(item.price),
          Number(item.qty) * Number(item.price),
          item.unit_cost === null ? '' : Number(item.unit_cost),
          item.unit_cost === null ? '' : Number(item.qty) * Number(item.unit_cost),
        ]),
      },
      {
        name: 'Expenses',
        columns: [{ header: 'Date & time', width: 22 }, { header: 'Description', width: 34 }, { header: 'Amount', width: 12 }],
        rows: expenses.map((expense) => [localDateTime(expense.created_at), expense.description, Number(expense.amount)]),
      },
      {
        name: 'Daily sales',
        columns: [{ header: 'Date', width: 13 }, { header: 'Orders', width: 10 }, { header: 'Sales', width: 12 }],
        rows: days.map((day) => [day.day, Number(day.orders), Number(day.revenue)]),
      },
      {
        name: 'Inventory',
        columns: [
          { header: 'Code', width: 12 }, { header: 'Product', width: 30 }, { header: 'Category', width: 16 },
          { header: 'Selling price', width: 13 }, { header: 'Unit cost', width: 11 }, { header: 'Stock', width: 9 },
          { header: 'Stock value at cost', width: 18 }, { header: 'Status', width: 12 },
        ],
        rows: inventory.map((product) => [
          product.code,
          product.name,
          product.category || 'Uncategorized',
          Number(product.price),
          product.unit_cost === null ? '' : Number(product.unit_cost),
          Number(product.stock),
          product.unit_cost === null ? '' : Number(product.stock) * Number(product.unit_cost),
          stockStatus(product),
        ]),
      },
    ]

    const filename = `Fishly-Poppers-${from}${to === from ? '' : `-to-${to}`}.xlsx`
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Cache-Control', 'no-store')
    res.send(buildWorkbook(sheets))
  } catch (e) { next(e) }
})

export default router
