import test from 'node:test'
import assert from 'node:assert/strict'
import ExcelJS from 'exceljs'
import { profitExportSheet } from '../src/profit-export.js'
import { buildWorkbook } from '../src/xlsx.js'

test('export lists purchased items once and deducts all expenses from sales', async () => {
  const sheet = profitExportSheet({
    from: '2026-11-10', to: '2026-11-10', revenue: 1000,
    expenses: [
      { purchase_id: 7, amount: 300 },
      { description: 'Upa', category: 'rent', amount: 100 },
      { description: 'Mantika', qty: 2, unit: 'L', unit_cost: 50, amount: 100 },
    ],
    purchaseItems: [{ purchase_id: 7, name: 'Isda', qty: 3, unit_cost: 100, total: 300 }],
  })
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buildWorkbook([sheet]))
  const page = workbook.worksheets[0]
  assert.equal(page.getCell('A5').value, 'Isda')
  assert.equal(page.getCell('B5').value, 3)
  assert.equal(page.getCell('D5').value, 100)
  assert.equal(page.getCell('E5').value, 300)
  assert.deepEqual(page.getCell('E10').value, { formula: 'SUM(E5:E7)', result: 500 })
  assert.deepEqual(page.getCell('E11').value, { formula: 'E9-E10', result: 500 })
})

test('export supports no expenses and preserves losses and missing quantities', () => {
  const empty = profitExportSheet({ from: '2026-11-10', to: '2026-11-10', revenue: 0, expenses: [] })
  assert.equal(empty.rows.find(row => row[0]?.startsWith('NETONG'))[4].result, 0)
  const loss = profitExportSheet({ from: '2026-11-10', to: '2026-11-10', revenue: 10.25, expenses: [{ description: 'Supplies', amount: 20.5 }] })
  assert.equal(loss.rows[3][1], '')
  assert.equal(loss.rows.find(row => row[0]?.startsWith('NETONG'))[4].result, -10.25)
})
