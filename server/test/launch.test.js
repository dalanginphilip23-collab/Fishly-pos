import test from 'node:test'
import assert from 'node:assert/strict'
import { payloadHash, requestId } from '../src/mutations.js'
import { parseTabular, readImport } from '../src/routes/reports.js'

test('idempotency payload hashes ignore object key order but detect changes', () => {
  assert.equal(payloadHash({ b: 2, a: { d: 4, c: 3 } }), payloadHash({ a: { c: 3, d: 4 }, b: 2 }))
  assert.notEqual(payloadHash({ amount: 10 }), payloadHash({ amount: 11 }))
})

test('request IDs must be stable opaque identifiers', () => {
  assert.equal(requestId('12345678-1234-1234-1234-123456789012'), '12345678-1234-1234-1234-123456789012')
  assert.throws(() => requestId('short'), (error) => error.status === 400)
  assert.throws(() => requestId('contains spaces and is long enough'), (error) => error.status === 400)
})

test('tabular expense parsing finds headers and excludes total rows', () => {
  const result = parseTabular([
    ['Purchased items for May'],
    ['Product', 'Qty', 'Unit cost', 'Amount'],
    ['Cooking oil', '2', '150.00', '300.00'],
    ['Rice', '5', '50.00', '250.00'],
    ['Total', '', '', '550.00'],
  ])
  assert.equal(result.items.length, 2)
  assert.deepEqual(result.items[0], {
    category: 'purchase', title: null, description: 'Cooking oil', qty: 2,
    unit: null, unit_cost: 150, amount: 300,
  })
})

test('CSV import parses lines without creating records', async () => {
  const csv = Buffer.from('Description,Qty,Unit Cost,Amount\nCooking oil,2,150,300\nTotal,,,300\n')
  const result = await readImport(csv, 'text/csv')
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].description, 'Cooking oil')
  assert.equal(result.items[0].amount, 300)
})

test('XLSX import uses the installed reader and parses worksheet values', async () => {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Purchases')
  sheet.addRow(['Description', 'Qty', 'Unit cost', 'Amount'])
  sheet.addRow(['Packaging', 10, 2.5, 25])
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer())
  const result = await readImport(buffer, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  assert.equal(result.items.length, 1)
  assert.equal(result.items[0].description, 'Packaging')
  assert.equal(result.items[0].amount, 25)
})
