export function profitExportSheet({ from, to, revenue, expenses, purchaseItems = [] }) {
  const rows = [
    ['FISHLY POPPERS — EXPENSES & PROFIT'],
    [`Reporting period: ${from === to ? from : `${from} to ${to}`}`],
    [],
    ['Purchased item / Expense', 'Quantity', 'Unit', 'Unit cost (PHP)', 'Total (PHP)', 'Category'],
  ]
  for (const expense of expenses) {
    const lines = expense.purchase_id == null ? [] : purchaseItems.filter(item => Number(item.purchase_id) === Number(expense.purchase_id))
    if (lines.length) {
      for (const item of lines) rows.push([item.name, Number(item.qty), 'pcs', item.unit_cost == null ? '' : Number(item.unit_cost), Number(item.total), 'Purchase'])
    } else {
      rows.push([
        expense.description || expense.title || 'Expense',
        expense.qty == null ? '' : Number(expense.qty), expense.unit || '',
        expense.unit_cost == null ? '' : Number(expense.unit_cost), Number(expense.amount),
        expense.category === 'purchase' ? 'Purchase' : expense.category === 'rent' ? 'Rent' : 'Other expense',
      ])
    }
  }
  if (!expenses.length) rows.push(['No expenses recorded for this period.', '', '', '', 0])
  const lastExpenseRow = rows.length
  const spent = Math.round(expenses.reduce((sum, expense) => sum + Number(expense.amount), 0) * 100) / 100
  rows.push([])
  const salesRow = rows.length + 1
  rows.push(['TOTAL SALES (after discounts)', '', '', '', revenue])
  const expenseRow = rows.length + 1
  rows.push(['TOTAL EXPENSES', '', '', '', { formula: `SUM(E5:E${lastExpenseRow})`, result: spent }])
  rows.push(['NET PROFIT (Sales − Expenses)', '', '', '', { formula: `E${salesRow}-E${expenseRow}`, result: Math.round((revenue - spent) * 100) / 100 }])
  rows.push([], ['Expenses include recorded purchases, rent, and other costs.'], ['Quantity and unit cost are blank when not recorded.'])
  return {
    name: 'Expenses & Profit', autoFilter: false, header: false, freezeRows: 4,
    styledRows: { 1: 3, 4: 1, [salesRow]: 1, [expenseRow]: 1, [expenseRow + 1]: 4 },
    moneyColumns: [3, 4],
    merges: ['A1:F1', 'A2:F2', `A${salesRow}:D${salesRow}`, `A${expenseRow}:D${expenseRow}`, `A${expenseRow + 1}:D${expenseRow + 1}`, `A${rows.length - 1}:F${rows.length - 1}`, `A${rows.length}:F${rows.length}`],
    columns: [
      { header: 'Purchased item / Expense', width: 44 }, { header: 'Quantity', width: 12 },
      { header: 'Unit', width: 12 }, { header: 'Unit cost (PHP)', width: 20 },
      { header: 'Total (PHP)', width: 22 }, { header: 'Category', width: 22 },
    ], rows,
  }
}
