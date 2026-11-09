import { Router } from 'express'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { pool, fail } from '../db.js'
import { auth } from '../middleware/auth.js'
import { dateRange, cents, text, integer } from '../validation.js'
import { costOfGoods, profitSummary } from '../profit.js'
import { buildWorkbook } from '../xlsx.js'
import { receiptDirectory } from '../photos.js'
import { raw } from 'express'

const router = Router()
const staff = auth(['admin', 'cashier'])

const receiptExtension = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) throw fail(400, 'Choose a valid receipt file')
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png'
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'jpg'
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  if (buffer.toString('ascii', 0, 4) === '%PDF') return 'pdf'
  throw fail(400, 'Choose a JPG, PNG, WebP or PDF receipt (max 10 MB)')
}

router.post('/expenses/receipts', staff, raw({ type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'], limit: '10mb' }), async (req, res, next) => {
  try {
    const extension = receiptExtension(req.body)
    const filename = `${randomUUID()}.${extension}`
    await mkdir(receiptDirectory, { recursive: true })
    await writeFile(receiptDirectory + filename, req.body, { flag: 'wx' })
    res.status(201).json({ receipt_url: `/api/uploads/receipts/${filename}` })
  } catch (error) { next(error) }
})

const parseReceiptText = (text) => {
  const lines = String(text || '').split(/\r?\n/)
  const items = []
  const skip = /total|subtotal|tax|vat|change|cash|receipt|date|time|thank|balance|amount due|qty|quantity|price|unit/i
  const seen = new Set()
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || skip.test(line)) continue
    const numbers = line.match(/-?\d[\d,]*\.?\d*/g)
    if (!numbers || !numbers.length) continue
    const amount = Number(numbers.at(-1).replace(/,/g, ''))
    if (!Number.isFinite(amount) || amount <= 0) continue
    let description = line.replace(/[-\d.,]/g, ' ').replace(/\s+/g, ' ').trim()
    if (description.length < 3) continue
    if (/^\d+$/.test(description)) continue
    const key = `${description.toLowerCase()}|${amount}`
    if (seen.has(key)) continue
    seen.add(key)
    let qty = null
    let unitCost = null
    if (numbers.length >= 3) {
      const q = Number(numbers[0].replace(/,/g, ''))
      const u = Number(numbers[1].replace(/,/g, ''))
      if (Number.isFinite(q) && q > 0 && Number.isFinite(u) && u > 0 && Math.abs(q * u - amount) <= Math.max(0.05 * amount, 0.05)) {
        qty = q
        unitCost = u
      }
    }
    items.push({ category: 'purchase', description, qty, unit_cost: unitCost, amount })
  }
  return items
}

router.post('/expenses/scan', staff, raw({ type: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv'], limit: '10mb' }), async (req, res, next) => {
  try {
    const mime = req.headers['content-type'] || ''
    const isSpreadsheet = mime.includes('spreadsheet') || mime.includes('excel') || mime.includes('csv')
      || req.body.subarray?.(0, 2)?.equals?.(Buffer.from([0x50, 0x4b])) // xlsx (zip)
      || req.body.subarray?.(0, 8)?.equals?.(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) // xls (ole2)
      || (Buffer.isBuffer(req.body) && !req.body.includes(0) && req.body.toString('utf8').includes(','))
    let text = ''
    let extension = 'pdf'
    let parsed = []
    if (isSpreadsheet) {
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(req.body, { type: 'buffer' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
      let headerRowIndex = 0
      let bestScore = 0
      for (let i = 0; i < Math.min(aoa.length, 25); i++) {
        const row = (aoa[i] || []).map((cell) => String(cell).toLowerCase().trim())
        const nonEmpty = row.filter((cell) => cell !== '').length
        if (nonEmpty < 2) continue
        let score = 0
        for (const cell of row) {
          if (/item|desc|name|product|particular|pangalan|produkto|talaan/.test(cell)) score += 2
          if (/qty|quantity|count|dami|bilang|pcs/.test(cell)) score += 2
          if (/unit|cost|price|presyo|halaga/.test(cell)) score += 1
          if (/amount|total|value|kabuuan|suma|gastos/.test(cell)) score += 2
        }
        if (score > bestScore) {
          bestScore = score
          headerRowIndex = i
        }
      }
      if (bestScore < 2) {
        const fallbackIndex = aoa.findIndex((row) => (row || []).filter((cell) => String(cell).trim() !== '').length >= 2)
        if (fallbackIndex !== -1) headerRowIndex = fallbackIndex
      }
      const headers = (aoa[headerRowIndex] || []).map((cell) => String(cell).trim())
      const dataRows = aoa.slice(headerRowIndex + 1)
      const findIndex = (names) => headers.findIndex((header) => names.some((name) => header.toLowerCase().includes(name)))
      const titleIndex = findIndex(['title', 'pamagat'])
      const categoryIndex = findIndex(['category', 'kategori', 'type', 'group'])
      const descIndexRaw = findIndex(['item', 'description', 'name', 'product', 'particular', 'pangalan', 'produkto', 'bought', 'ingredient'])
      const descIndex = descIndexRaw !== -1 ? descIndexRaw : (titleIndex === 0 || categoryIndex === 0 ? 1 : 0)
      const qtyIndex = findIndex(['qty', 'quantity', 'count', 'dami', 'bilang', 'pcs'])
      const priceIndex = findIndex(['price', 'cost', 'presyo', 'halaga'])
      const unitTextIndexCandidate = findIndex(['unit', 'uom', 'measure'])
      const unitTextIndex = unitTextIndexCandidate !== -1 && unitTextIndexCandidate !== priceIndex ? unitTextIndexCandidate : -1
      const amountIndex = findIndex(['amount', 'total', 'value', 'kabuuan', 'suma', 'gastos'])
      console.log('SCAN HEADERS:', headers, 'unitTextIndex:', unitTextIndex, 'priceIndex:', priceIndex, 'titleIndex:', titleIndex, 'categoryIndex:', categoryIndex, 'descIndex:', descIndex)
        ? ([titleIndex, categoryIndex].includes(0) ? 1 : 0)
        : descIndex
      const fallbackAmountIndex = amountIndex === -1 ? headers.length - 1 : amountIndex
      for (const row of dataRows) {
        if (!row || row.every((cell) => String(cell).trim() === '')) continue
        const title = titleIndex !== -1
          ? String(row[titleIndex] ?? '').trim()
          : (categoryIndex !== -1 ? String(row[categoryIndex] ?? '').trim() : null)
        const description = String(row[fallbackDescIndex] ?? '').trim()
        if (!description) continue
        const qty = qtyIndex !== -1 && row[qtyIndex] !== '' ? Number(row[qtyIndex]) : null
        const unit = unitTextIndex !== -1 ? String(row[unitTextIndex] ?? '').trim() : null
        const unitCost = priceIndex !== -1 && row[priceIndex] !== '' ? Number(row[priceIndex]) : null
        let amount = amountIndex !== -1 && row[amountIndex] !== '' ? Number(row[amountIndex]) : null
        if (amount === null && Number.isFinite(qty) && Number.isFinite(unitCost)) amount = qty * unitCost
        if (!Number.isFinite(amount) || amount <= 0) continue
        if (!Number.isFinite(unitCost) && Number.isFinite(qty) && qty > 0) unitCost = amount / qty
        parsed.push({ category: 'purchase', title: title || null, description, qty: Number.isFinite(qty) ? qty : null, unit: unit || null, unit_cost: Number.isFinite(unitCost) ? Number(unitCost.toFixed(2)) : null, amount })
      }
      extension = mime.includes('csv') || (!mime.includes('excel') && !mime.includes('spreadsheet')) ? 'csv' : 'xlsx'
      text = JSON.stringify({ headers, rows: dataRows.slice(0, 5) })
    } else if (mime === 'application/pdf') {
      const pdfParse = (await import('pdf-parse')).default
      const result = await pdfParse(req.body)
      text = result.text || ''
      extension = 'pdf'
      parsed = parseReceiptText(text)
    } else {
      extension = receiptExtension(req.body)
      const { createWorker } = await import('tesseract.js')
      const worker = await createWorker('eng')
      const { data } = await worker.recognize(req.body)
      text = data.text || ''
      await worker.terminate()
      parsed = parseReceiptText(text)
    }
    const filename = `${randomUUID()}.${extension}`
    await mkdir(receiptDirectory, { recursive: true })
    await writeFile(receiptDirectory + filename, req.body, { flag: 'wx' })
    const receiptUrl = `/api/uploads/receipts/${filename}`
    const created = []
    for (const item of parsed) {
      const [r] = await pool.query('INSERT INTO expenses (category, description, qty, unit_cost, amount, receipt_url) VALUES (?,?,?,?,?,?)', [item.category, item.description, item.qty, item.unit_cost, item.amount, receiptUrl])
      created.push({ id: r.insertId, ...item, receipt_url: receiptUrl })
    }
    res.status(201).json({ text, items: created })
  } catch (e) { next(e) }
})

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
    const rent = expenses.filter((expense) => expense.category === 'rent').reduce((sum, expense) => sum + Number(expense.amount), 0)
    const purchases = expenses.filter((expense) => expense.category === 'purchase').reduce((sum, expense) => sum + Number(expense.amount), 0)
    const otherExpenses = expenses.filter((expense) => !['rent', 'purchase'].includes(expense.category)).reduce((sum, expense) => sum + Number(expense.amount), 0)

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
      rent,
      purchases,
      otherExpenses,
    })
  } catch (e) { next(e) }
})

router.delete('/expenses', staff, async (req, res, next) => {
  try {
    const [from, to] = dateRange(req.query)
    await pool.query('DELETE FROM expenses WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)', [from, to])
    res.json({ ok: true })
  } catch (e) { next(e) }
})

router.delete('/expenses/:id', staff, async (req, res, next) => {
  try {
    const id = integer(Number(req.params.id), 'Expense ID', 1)
    const [result] = await pool.query('DELETE FROM expenses WHERE id = ?', [id])
    if (!result.affectedRows) throw fail(404, 'Expense not found')
    res.json({ ok: true })
  } catch (e) { next(e) }
})
router.post('/expenses', staff, async (req, res, next) => {
  try {
    const category = ['rent', 'purchase', 'supplies', 'other'].includes(req.body.category) ? req.body.category : 'other'
    const title = req.body.title === undefined || req.body.title === '' || req.body.title === null
      ? null
      : text(req.body.title, 'Title', 150)
    const description = req.body.description === undefined || req.body.description === '' || req.body.description === null
      ? (category === 'rent' ? 'Stall rent' : 'Expense')
      : text(req.body.description, 'Description', 150)
    const qty = req.body.qty === undefined || req.body.qty === '' || req.body.qty === null
      ? null
      : integer(Number(req.body.qty), 'Quantity', 1)
    const unit = req.body.unit === undefined || req.body.unit === '' || req.body.unit === null
      ? null
      : text(req.body.unit, 'Unit', 20)
    const unitCost = req.body.unit_cost === undefined || req.body.unit_cost === '' || req.body.unit_cost === null
      ? null
      : cents(req.body.unit_cost, 'Unit cost') / 100
    let amount = req.body.amount
    if ((amount === undefined || amount === '' || amount === null) && qty && unitCost) amount = qty * unitCost
    amount = cents(amount, 'Amount') / 100
    if (amount <= 0) throw fail(400, 'Amount must be greater than zero')
    const receiptUrl = req.body.receipt_url === undefined || req.body.receipt_url === '' || req.body.receipt_url === null
      ? null
      : text(req.body.receipt_url, 'Receipt URL', 255)
    await pool.query(
      'INSERT INTO expenses (category, title, description, qty, unit, unit_cost, amount, receipt_url) VALUES (?,?,?,?,?,?,?,?)',
      [category, title, description, qty, unit, unitCost, amount, receiptUrl]
    )
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

    const rent = expenses.filter((expense) => expense.category === 'rent').reduce((sum, expense) => sum + Number(expense.amount), 0)
    const purchases = expenses.filter((expense) => expense.category === 'purchase').reduce((sum, expense) => sum + Number(expense.amount), 0)
    const otherExpenses = expenses.filter((expense) => !['rent', 'purchase'].includes(expense.category)).reduce((sum, expense) => sum + Number(expense.amount), 0)

    const summary = [
      ['Report', 'Fishly Poppers'],
      ['Period', from === to ? from : `${from} to ${to}`],
      ['Generated', localDateTime(new Date())],
      ['Completed sales', report.orders],
      ['Total sales (after discounts)', report.revenue],
      ['Sales before discounts', report.beforeDiscounts],
      ['Discounts', report.discounts],
      ['Rent', rent],
      ['Purchased items cost', purchases],
      ['Other expenses', otherExpenses],
      ['Total expenses', report.spent],
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
        columns: [
          { header: 'Date & time', width: 22 }, { header: 'Category', width: 14 }, { header: 'Title', width: 24 },
          { header: 'Item / description', width: 34 }, { header: 'Quantity', width: 10 }, { header: 'Unit', width: 10 },
          { header: 'Unit cost', width: 12 }, { header: 'Amount', width: 12 }, { header: 'Receipt', width: 34 },
        ],
        rows: expenses.map((expense) => [
          localDateTime(expense.created_at),
          expense.category || 'other',
          expense.title || '',
          expense.description,
          expense.qty === null || expense.qty === undefined ? '' : Number(expense.qty),
          expense.unit || '',
          expense.unit_cost === null || expense.unit_cost === undefined ? '' : Number(expense.unit_cost),
          Number(expense.amount),
          expense.receipt_url || '',
        ]),
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
