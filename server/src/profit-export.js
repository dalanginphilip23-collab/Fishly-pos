export function profitExportSheet({ from, to, revenue, expenses, purchaseItems = [] }) {
  const rows = [
    ['Fishly Poppers — Pinamili at Kita'],
    ['Panahon', from === to ? from : `${from} to ${to}`],
    [],
  ]
  for (const expense of expenses) {
    const lines = expense.purchase_id == null ? [] : purchaseItems.filter(item => Number(item.purchase_id) === Number(expense.purchase_id))
    if (lines.length) {
      for (const item of lines) rows.push([item.name, Number(item.qty), 'pcs', item.unit_cost == null ? '' : Number(item.unit_cost), Number(item.total), 'Pinamili'])
    } else {
      rows.push([
        expense.description || expense.title || 'Gastos',
        expense.qty == null ? '' : Number(expense.qty), expense.unit || '',
        expense.unit_cost == null ? '' : Number(expense.unit_cost), Number(expense.amount),
        expense.category === 'purchase' ? 'Pinamili' : expense.category === 'rent' ? 'Upa' : 'Iba pang gastos',
      ])
    }
  }
  if (!expenses.length) rows.push(['Walang naitalang gastos sa napiling panahon.', '', '', '', 0])
  const lastExpenseRow = rows.length + 1
  const spent = Math.round(expenses.reduce((sum, expense) => sum + Number(expense.amount), 0) * 100) / 100
  rows.push([])
  const salesRow = rows.length + 2
  rows.push(['KABUUANG BENTA (bawas na ang discounts)', '', '', '', revenue])
  const expenseRow = rows.length + 2
  rows.push(['KABUUANG GASTOS', '', '', '', { formula: `SUM(E5:E${lastExpenseRow})`, result: spent }])
  rows.push(['NETONG KITA (Benta − Gastos)', '', '', '', { formula: `E${salesRow}-E${expenseRow}`, result: Math.round((revenue - spent) * 100) / 100 }])
  rows.push([], ['Kasama ang naitalang pinamili, upa, at iba pang gastos.'], ['Blanko ang dami o presyo kung hindi ito naitala.'])
  return {
    name: 'Pinamili at Kita', autoFilter: false,
    columns: [
      { header: 'Pinamili / Gastos', width: 49 }, { header: 'Dami', width: 12 },
      { header: 'Unit', width: 12 }, { header: 'Presyo bawat item (PHP)', width: 24 },
      { header: 'Kabuuan (PHP)', width: 22 }, { header: 'Uri', width: 22 },
    ], rows,
  }
}
