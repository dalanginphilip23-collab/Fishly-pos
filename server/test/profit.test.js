import test from 'node:test'
import assert from 'node:assert/strict'
import { costOfGoods, profitSummary } from '../src/profit.js'

test('daily profit is total discounted sales minus entered expenses', () => {
  const report = profitSummary([{ total: 550, discount: 50 }, { total: 450 }], [{ amount: 300 }, { amount: 100 }])
  assert.equal(report.revenue, 1000)
  assert.equal(report.beforeDiscounts, 1050)
  assert.equal(report.discounts, 50)
  assert.equal(report.spent, 400)
  assert.equal(report.net, 600)
  assert.equal(report.orders, 2)
})

test('legacy item costs are not deducted again and missing costs do not block profit', () => {
  const report = profitSummary([{ total: 100, known_cost: 60, missing_cost_items: 1 }], [{ amount: 60 }])
  assert.equal(report.net, 40)
})

test('profit retains losses and supports empty days', () => {
  assert.equal(profitSummary([{ total: 10 }], [{ amount: 15 }]).net, -5)
  assert.equal(profitSummary([], [{ amount: 2 }]).net, -2)
  assert.equal(profitSummary([], []).net, 0)
  assert.equal(profitSummary([{ total: 30 }], []).net, 30)
})

test('fractional sales and expenses calculate in centavos', () => {
  const report = profitSummary([{ total: 0.1 }, { total: 0.2 }], [{ amount: 0.1 }])
  assert.equal(report.revenue, 0.3)
  assert.equal(report.net, 0.2)
})

test('cost of goods uses unit costs and flags units without a cost', () => {
  const cost = costOfGoods([
    { qty: 2, unit_cost: '12.50' },
    { qty: 1, unit_cost: 0.1 },
    { qty: 3, unit_cost: null },
  ])
  assert.equal(cost.cogs, 25.1)
  assert.equal(cost.uncostedUnits, 3)
})
