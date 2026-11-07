import test from 'node:test'
import assert from 'node:assert/strict'
import { buildWorkbook } from '../src/xlsx.js'

test('workbook is a valid ZIP archive with the expected worksheet parts', () => {
  const file = buildWorkbook([
    { name: 'Summary', columns: [{ header: 'Metric' }, { header: 'Value' }], rows: [['Sales', 12.5], ['Note', 'A & B']] },
    { name: 'Sales', columns: [{ header: 'Receipt' }, { header: 'Total' }], rows: [['FP-000001', 99]] },
  ])
  assert.equal(file.subarray(0, 4).toString('hex'), '504b0304')
  assert.equal(file.subarray(-22, -18).toString('hex'), '504b0506')
  assert.match(file.toString('latin1'), /xl\/workbook\.xml/)
  assert.match(file.toString('latin1'), /xl\/worksheets\/sheet2\.xml/)
})

test('workbook rejects an empty workbook', () => {
  assert.throws(() => buildWorkbook([]))
})
