import { Router, raw } from 'express'
import { randomUUID, createHash } from 'node:crypto'
import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { pool, fail } from '../db.js'
import { auth } from '../middleware/auth.js'
import { dateRange, cents, text, integer } from '../validation.js'
import { costOfGoods, profitSummary } from '../profit.js'
import { buildWorkbook } from '../xlsx.js'
import { profitExportSheet } from '../profit-export.js'
import { receiptDirectory } from '../photos.js'
import { mutate } from '../mutations.js'

const router = Router()
const manager = auth()
const receiptTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
const importTypes = [...receiptTypes, 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']

const receiptExtension = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) throw fail(400, 'Choose a valid receipt file')
  if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png'
  if (buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return 'jpg'
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  if (buffer.toString('ascii', 0, 4) === '%PDF') return 'pdf'
  if (buffer[0] === 0x50 && buffer[1] === 0x4b) return 'xlsx'
  if (!buffer.includes(0) && buffer.toString('utf8').includes(',')) return 'csv'
  throw fail(400, 'Choose a JPG, PNG, WebP, PDF, CSV, or XLSX file')
}

const saveReceipt = async (buffer, extension) => {
  const filename = `${randomUUID()}.${extension}`
  await mkdir(receiptDirectory, { recursive: true })
  await writeFile(receiptDirectory + filename, buffer, { flag: 'wx' })
  return { filename, url: `/api/reports/receipts/${filename}`, hash: createHash('sha256').update(buffer).digest('hex') }
}

export const serveReceipt = async (req, res, next) => {
  try {
    if (!/^[a-f0-9-]{36}\.(jpg|png|webp|pdf|xlsx|csv)$/.test(req.params.filename)) throw fail(404, 'Receipt not found')
    const buffer = await readFile(receiptDirectory + req.params.filename).catch(() => null)
    if (!buffer) throw fail(404, 'Receipt not found')
    const extension = req.params.filename.split('.').pop()
    const types = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv; charset=utf-8' }
    res.setHeader('Content-Type', types[extension])
    res.setHeader('Content-Disposition', `inline; filename="${req.params.filename}"`)
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Cache-Control', 'private, no-store')
    res.send(buffer)
  } catch (e) { next(e) }
}

router.get('/receipts/:filename', manager, serveReceipt)

router.post('/expenses/receipts', manager, raw({ type: receiptTypes, limit: '10mb' }), async (req, res, next) => {
  try {
    const extension = receiptExtension(req.body)
    if (!['png', 'jpg', 'webp', 'pdf'].includes(extension)) throw fail(400, 'Upload a JPG, PNG, WebP, or PDF receipt')
    const saved = await saveReceipt(req.body, extension)
    res.status(201).json({ receipt_url: saved.url })
  } catch (error) { next(error) }
})

const skipRow = /^(subtotal|total|grand total|tax|vat|change|cash|balance|amount due|discount|thank|received|paid)\b/i
const normalized = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()
const numberValue = (value) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const cleaned = String(value ?? '').replace(/[^\d.-]/g, '')
  if (!cleaned || !Number.isFinite(Number(cleaned))) return null
  return Number(cleaned)
}

export function parseTabular(rows) {
  const clean = rows.map(row => (row || []).map(normalized))
  let headerRowIndex = 0
  let bestScore = 0
  for (let i = 0; i < Math.min(clean.length, 25); i++) {
    const row = clean[i].map(cell => cell.toLowerCase())
    if (row.filter(Boolean).length < 2) continue
    let score = 0
    for (const cell of row) {
      if (/item|desc|name|product|particular|pangalan|produkto|ingredient/.test(cell)) score += 3
      if (/qty|quantity|count|dami|bilang|pcs/.test(cell)) score += 2
      if (/unit cost|unit price|presyo|halaga/.test(cell)) score += 2
      if (/amount|total|value|kabuuan|suma|gastos/.test(cell)) score += 2
    }
    if (score > bestScore) { bestScore = score; headerRowIndex = i }
  }
  if (bestScore < 2) throw fail(400, 'Could not find product and amount columns in this file')
  const headers = clean[headerRowIndex].map(cell => cell.toLowerCase())
  const find = (...names) => headers.findIndex(header => names.some(name => header.includes(name)))
  const titleIndex = find('title', 'pamagat')
  const categoryIndex = find('category', 'kategori', 'type', 'group')
  let descIndex = find('description', 'item', 'product', 'particular', 'pangalan', 'produkto', 'ingredient', 'name')
  if (descIndex === -1) descIndex = [titleIndex, categoryIndex].includes(0) ? 1 : 0
  const qtyIndex = find('qty', 'quantity', 'count', 'dami', 'bilang', 'pcs')
  const unitCostIndex = find('unit cost', 'unit price', 'price', 'cost', 'presyo', 'halaga')
  const unitIndex = headers.findIndex(header => /^(unit|uom|measure|unit of measure|measurement)$/.test(header))
  const amountIndex = find('amount', 'total', 'value', 'kabuuan', 'suma', 'gastos')
  const finalAmountIndex = amountIndex === -1 ? headers.length - 1 : amountIndex
  const parsed = []
  for (const row of clean.slice(headerRowIndex + 1)) {
    if (!row.some(Boolean)) continue
    const description = normalized(row[descIndex])
    if (!description || description.length < 3 || skipRow.test(description)) continue
    const qty = qtyIndex === -1 ? null : numberValue(row[qtyIndex])
    const unitCost = unitCostIndex === -1 || unitCostIndex === finalAmountIndex ? null : numberValue(row[unitCostIndex])
    let amount = numberValue(row[finalAmountIndex])
    if (amount === null && qty !== null && unitCost !== null) amount = qty * unitCost
    if (amount === null || amount <= 0) continue
    parsed.push({
      category: 'purchase',
      title: titleIndex === -1 ? null : normalized(row[titleIndex]) || null,
      description: description.slice(0, 150),
      qty: qty === null || !Number.isInteger(qty) || qty <= 0 ? null : qty,
      unit: unitIndex === -1 ? null : normalized(row[unitIndex]).slice(0, 20) || null,
      unit_cost: unitCost !== null && unitCost > 0 ? Number(unitCost.toFixed(2)) : null,
      amount: Number(amount.toFixed(2)),
    })
  }
  return { headers: clean[headerRowIndex], items: parsed }
}

const parseReceiptText = (text) => {
  const items = []
  const skip = /total|subtotal|tax|vat|change|cash|receipt|date|time|thank|balance|amount due|qty|quantity|price|unit/i
  const seen = new Set()
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || skip.test(line)) continue
    const numbers = line.match(/-?\d[\d,]*\.?\d*/g)
    if (!numbers?.length) continue
    const amount = Number(numbers.at(-1).replace(/,/g, ''))
    if (!Number.isFinite(amount) || amount <= 0) continue
    const description = line.replace(/[-\d.,]/g, ' ').replace(/\s+/g, ' ').trim()
    if (description.length < 3 || /^\d+$/.test(description)) continue
    const key = `${description.toLowerCase()}|${amount}`
    if (seen.has(key)) continue
    seen.add(key)
    items.push({ category: 'purchase', title: null, description: description.slice(0, 150), qty: null, unit: null, unit_cost: null, amount })
  }
  return items
}

export async function readImport(buffer, mime) {
  if (mime.includes('csv') || receiptExtension(buffer) === 'csv') {
    const { parse } = await import('csv-parse/sync')
    return { ...parseTabular(parse(buffer, { skip_empty_lines: true, relax_column_count: true, bom: true })), text: '' }
  }
  if (mime.includes('spreadsheet') || receiptExtension(buffer) === 'xlsx') {
    const ExcelJS = (await import('exceljs')).default
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(buffer)
    const sheet = workbook.worksheets[0]
    if (!sheet) throw fail(400, 'The spreadsheet has no worksheets')
    const rows = []
    sheet.eachRow({ includeEmpty: true }, row => rows.push(row.values.slice(1)))
    return { ...parseTabular(rows), text: '' }
  }
  if (receiptExtension(buffer) === 'pdf') {
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: buffer })
    try {
      const result = await parser.getText()
      return { items: parseReceiptText(result.text), text: result.text || '' }
    } finally {
      await parser.destroy()
    }
  }
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng')
  try {
    const { data } = await worker.recognize(buffer)
    return { items: parseReceiptText(data.text), text: data.text || '' }
  } finally {
    await worker.terminate()
  }
}

const validImportItem = (item) => {
  if (!item || typeof item !== 'object') throw fail(400, 'Invalid imported expense line')
  return {
    category: ['rent', 'purchase', 'supplies', 'other'].includes(item.category) ? item.category : 'purchase',
    title: item.title ? text(item.title, 'Title', 150) : null,
    description: text(item.description, 'Description', 150),
    qty: item.qty === null || item.qty === undefined || item.qty === '' ? null : integer(Number(item.qty), 'Quantity', 1),
    unit: item.unit ? text(item.unit, 'Unit', 20) : null,
    unit_cost: item.unit_cost === null || item.unit_cost === undefined || item.unit_cost === '' ? null : cents(Number(item.unit_cost), 'Unit cost') / 100,
    amount: cents(Number(item.amount), 'Amount') / 100,
  }
}

router.post('/expenses/scan', manager, raw({ type: importTypes, limit: '10mb' }), async (req, res, next) => {
  try {
    const extension = receiptExtension(req.body)
    const parsed = await readImport(req.body, String(req.headers['content-type'] || ''))
    if (parsed.items.length > 200) throw fail(400, 'This file contains more than 200 expense lines')
    const saved = await saveReceipt(req.body, extension)
    res.status(201).json({ ...parsed, file_hash: saved.hash, receipt_url: saved.url })
  } catch (e) { next(e) }
})

router.post('/expenses/import', manager, async (req, res, next) => {
  try {
    const fileHash = text(req.body.file_hash, 'File hash', 64)
    if (!/^[a-f0-9]{64}$/.test(fileHash)) throw fail(400, 'Invalid import file')
    const receiptUrl = req.body.receipt_url ? text(req.body.receipt_url, 'Receipt URL', 255) : null
    if (!Array.isArray(req.body.items) || !req.body.items.length) throw fail(400, 'There are no expense lines to import')
    if (req.body.items.length > 200) throw fail(400, 'This file contains more than 200 expense lines')
    const items = req.body.items.map(validImportItem)
    const result = await mutate(req, 'expenses.import', async (conn) => {
      try {
        await conn.query('INSERT INTO expense_imports (file_hash, user_id) VALUES (?,?)', [fileHash, req.user.id])
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw fail(409, 'This file has already been imported')
        throw error
      }
      const created = []
      for (const item of items) {
        const [r] = await conn.query(
          'INSERT INTO expenses (category, title, description, qty, unit, unit_cost, amount, receipt_url, user_id) VALUES (?,?,?,?,?,?,?,?,?)',
          [item.category, item.title, item.description, item.qty, item.unit, item.unit_cost, item.amount, receiptUrl, req.user.id]
        )
        created.push({ id: r.insertId, ...item, receipt_url: receiptUrl })
      }
      return { items: created }
    })
    res.status(201).json(result)
  } catch (e) { next(e) }
})

const liveOrders = "o.status <> 'cancelled' AND o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)"
const liveExpenses = 'created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY) AND voided_at IS NULL'

const localDateTime = (value) => new Date(value).toLocaleString('en-PH', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
})

const stockStatus = (product) => {
  if (!product.active) return 'Hidden'
  if (product.stock === 0) return 'Sold out'
  if (product.stock <= 10) return 'Low stock'
  return 'In stock'
}

router.get('/summary', manager, async (req, res, next) => {
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
      `SELECT i.product_id, i.name, i.price, i.unit_cost, SUM(i.qty) qty, SUM(i.qty * i.price) subtotal
       FROM order_items i JOIN orders o ON o.id = i.order_id WHERE ${liveOrders}
       GROUP BY i.product_id, i.name, i.price, i.unit_cost ORDER BY qty DESC, i.product_id, i.price`, span)
    const [expenses] = await pool.query(
      `SELECT * FROM expenses WHERE ${liveExpenses} ORDER BY id DESC`, span)
    const rent = expenses.filter((expense) => expense.category === 'rent').reduce((sum, expense) => sum + Number(expense.amount), 0)
    const purchases = expenses.filter((expense) => expense.category === 'purchase').reduce((sum, expense) => sum + Number(expense.amount), 0)
    const otherExpenses = expenses.filter((expense) => !['rent', 'purchase'].includes(expense.category)).reduce((sum, expense) => sum + Number(expense.amount), 0)
    const [sales] = await pool.query(
      `SELECT o.id, o.order_no, o.created_at, o.total, o.discount, o.payment_method
       FROM orders o WHERE ${liveOrders} ORDER BY o.id DESC`, span)

    res.json({
      from, to, ...profitSummary(sales, expenses), ...costOfGoods(productSales),
      productSales, days, top, payments, expenses, rent, purchases, otherExpenses,
    })
  } catch (e) { next(e) }
})

router.post('/expenses', manager, async (req, res, next) => {
  try {
    const category = ['rent', 'purchase', 'supplies', 'other'].includes(req.body.category) ? req.body.category : 'other'
    const title = req.body.title === undefined || req.body.title === '' || req.body.title === null ? null : text(req.body.title, 'Title', 150)
    const description = req.body.description === undefined || req.body.description === '' || req.body.description === null
      ? (category === 'rent' ? 'Stall rent' : 'Expense')
      : text(req.body.description, 'Description', 150)
    const qty = req.body.qty === undefined || req.body.qty === '' || req.body.qty === null ? null : integer(Number(req.body.qty), 'Quantity', 1)
    const unit = req.body.unit === undefined || req.body.unit === '' || req.body.unit === null ? null : text(req.body.unit, 'Unit', 20)
    const unitCost = req.body.unit_cost === undefined || req.body.unit_cost === '' || req.body.unit_cost === null ? null : cents(req.body.unit_cost, 'Unit cost') / 100
    let amount = req.body.amount
    if ((amount === undefined || amount === '' || amount === null) && qty && unitCost) amount = qty * unitCost
    amount = cents(amount, 'Amount') / 100
    if (amount <= 0) throw fail(400, 'Amount must be greater than zero')
    const receiptUrl = req.body.receipt_url === undefined || req.body.receipt_url === '' || req.body.receipt_url === null ? null : text(req.body.receipt_url, 'Receipt URL', 255)
    const result = await mutate(req, 'expense.create', async (conn) => {
      const [r] = await conn.query(
        'INSERT INTO expenses (category, title, description, qty, unit, unit_cost, amount, receipt_url, user_id) VALUES (?,?,?,?,?,?,?,?,?)',
        [category, title, description, qty, unit, unitCost, amount, receiptUrl, req.user.id]
      )
      return { id: r.insertId }
    })
    res.status(201).json(result)
  } catch (e) { next(e) }
})

router.post('/expenses/:id/void', manager, async (req, res, next) => {
  try {
    const id = integer(Number(req.params.id), 'Expense ID', 1)
    const reason = text(req.body.reason, 'Void reason', 200)
    const result = await mutate(req, `expense.void.${id}`, async (conn) => {
      const [[expense]] = await conn.query('SELECT id, voided_at FROM expenses WHERE id = ? FOR UPDATE', [id])
      if (!expense) throw fail(404, 'Expense not found')
      if (expense.voided_at) throw fail(409, 'This expense has already been voided')
      await conn.query('UPDATE expenses SET voided_at = CURRENT_TIMESTAMP, voided_by = ?, void_reason = ? WHERE id = ?', [req.user.id, reason, id])
      return { ok: true }
    })
    res.json(result)
  } catch (e) { next(e) }
})

router.get('/export.xlsx', manager, async (req, res, next) => {
  try {
    const [from, to] = dateRange(req.query)
    const span = [from, to]
    const [sales] = await pool.query(
      `SELECT o.id, o.order_no, o.created_at, o.status, o.payment_method, o.payment_reference, o.subtotal, o.discount, o.total,
              o.cash_received, o.change_due, u.name cashier_name
       FROM orders o LEFT JOIN users u ON u.id = o.cashier_id
       WHERE ${liveOrders} ORDER BY o.id`, span)
    const [items] = await pool.query(
      `SELECT o.order_no, o.created_at, i.name, i.qty, i.price, COALESCE(i.unit_cost, p.unit_cost) unit_cost
       FROM order_items i JOIN orders o ON o.id = i.order_id
       LEFT JOIN products p ON p.id = i.product_id
       WHERE ${liveOrders} ORDER BY o.id, i.id`, span)
    const [expenses] = await pool.query(`SELECT * FROM expenses WHERE ${liveExpenses} ORDER BY id`, span)
    const purchaseIds = [...new Set(expenses.filter(expense => expense.purchase_id != null).map(expense => expense.purchase_id))]
    const [purchaseItems] = purchaseIds.length ? await pool.query(
      `SELECT i.purchase_id, p.name, i.qty, i.unit_cost, i.total
       FROM purchase_items i JOIN products p ON p.id = i.product_id
       WHERE i.purchase_id IN (?) ORDER BY i.purchase_id, i.id`, [purchaseIds]
    ) : [[]]
    const [inventory] = await pool.query(
      `SELECT p.code, p.name, c.name category, p.price, p.unit_cost, p.stock, p.active
       FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY c.sort_order, p.name`)
    const [days] = await pool.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') day, COUNT(*) orders, SUM(total) revenue
       FROM orders o WHERE ${liveOrders} GROUP BY day ORDER BY day`, span)
    const report = profitSummary(sales, expenses)
    const cost = costOfGoods(items)
    const paymentTotals = new Map()
    for (const sale of sales) paymentTotals.set(sale.payment_method, (paymentTotals.get(sale.payment_method) || 0) + Number(sale.total))
    const rent = expenses.filter(e => e.category === 'rent').reduce((s, e) => s + Number(e.amount), 0)
    const purchases = expenses.filter(e => e.category === 'purchase').reduce((s, e) => s + Number(e.amount), 0)
    const otherExpenses = expenses.filter(e => !['rent', 'purchase'].includes(e.category)).reduce((s, e) => s + Number(e.amount), 0)

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
      ...['cash', 'gcash'].filter(method => paymentTotals.has(method)).map(method => [
        `${method === 'cash' ? 'Cash' : 'GCash'} collected`, paymentTotals.get(method),
      ]),
    ]

    const sheets = [
      profitExportSheet({ from, to, revenue: report.revenue, expenses, purchaseItems }),
      { name: 'Summary', columns: [{ header: 'Metric', width: 36 }, { header: 'Value', width: 24 }], rows: summary },
      {
        name: 'Sales',
        columns: [
          { header: 'Receipt', width: 14 }, { header: 'Date & time', width: 22 }, { header: 'Status', width: 12 },
          { header: 'Payment', width: 11 }, { header: 'Reference', width: 20 }, { header: 'Subtotal', width: 12 },
          { header: 'Discount', width: 11 }, { header: 'Total', width: 12 }, { header: 'Cash received', width: 14 },
          { header: 'Change', width: 11 }, { header: 'Cashier', width: 18 },
        ],
        rows: sales.map(sale => [
          sale.order_no, localDateTime(sale.created_at), sale.status, sale.payment_method === 'cash' ? 'Cash' : 'GCash',
          sale.payment_reference || '', Number(sale.subtotal), Number(sale.discount), Number(sale.total),
          sale.cash_received === null ? '' : Number(sale.cash_received),
          sale.change_due === null ? '' : Number(sale.change_due), sale.cashier_name || '',
        ]),
      },
      {
        name: 'Sold items',
        columns: [
          { header: 'Receipt', width: 14 }, { header: 'Date & time', width: 22 }, { header: 'Product', width: 30 },
          { header: 'Quantity', width: 10 }, { header: 'Unit price', width: 12 }, { header: 'Line sales', width: 12 },
          { header: 'Unit cost (sale time)', width: 17 }, { header: 'Line cost (sale time)', width: 17 },
        ],
        rows: items.map(item => [
          item.order_no, localDateTime(item.created_at), item.name, Number(item.qty), Number(item.price),
          Number(item.qty) * Number(item.price), item.unit_cost === null ? '' : Number(item.unit_cost),
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
        rows: expenses.map(expense => [
          localDateTime(expense.created_at), expense.category || 'other', expense.title || '', expense.description,
          expense.qty === null || expense.qty === undefined ? '' : Number(expense.qty), expense.unit || '',
          expense.unit_cost === null || expense.unit_cost === undefined ? '' : Number(expense.unit_cost),
          Number(expense.amount), expense.receipt_url || '',
        ]),
      },
      {
        name: 'Daily sales',
        columns: [{ header: 'Date', width: 13 }, { header: 'Orders', width: 10 }, { header: 'Sales', width: 12 }],
        rows: days.map(day => [day.day, Number(day.orders), Number(day.revenue)]),
      },
      {
        name: 'Inventory',
        columns: [
          { header: 'Code', width: 12 }, { header: 'Product', width: 30 }, { header: 'Category', width: 16 },
          { header: 'Selling price', width: 13 }, { header: 'Unit cost', width: 11 }, { header: 'Stock', width: 9 },
          { header: 'Stock value at cost', width: 18 }, { header: 'Status', width: 12 },
        ],
        rows: inventory.map(product => [
          product.code, product.name, product.category || 'Uncategorized', Number(product.price),
          product.unit_cost === null ? '' : Number(product.unit_cost), Number(product.stock),
          product.unit_cost === null ? '' : Number(product.stock) * Number(product.unit_cost), stockStatus(product),
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
