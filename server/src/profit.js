const toCents = (amount) => Math.round(Number(amount) * 100)

// Product costs are an estimate from the inventory's current unit cost. They are
// reported separately because net profit still deducts the recorded daily expenses.
export function costOfGoods(productSales) {
  let cost = 0
  let uncostedUnits = 0
  for (const item of productSales) {
    const quantity = Number(item.qty) || 0
    if (item.unit_cost === null || item.unit_cost === undefined) uncostedUnits += quantity
    else cost += toCents(item.unit_cost) * quantity
  }
  return { cogs: cost / 100, uncostedUnits }
}

// Daily profit is collected sales less the expense amounts recorded by the admin.
export function profitSummary(sales, expenses) {
  const revenue = sales.reduce((sum, sale) => sum + toCents(sale.total), 0)
  const discounts = sales.reduce((sum, sale) => sum + toCents(sale.discount ?? 0), 0)
  const spent = expenses.reduce((sum, expense) => sum + toCents(expense.amount), 0)
  return {
    revenue: revenue / 100,
    discounts: discounts / 100,
    beforeDiscounts: (revenue + discounts) / 100,
    orders: sales.length,
    spent: spent / 100,
    net: (revenue - spent) / 100,
    sales,
  }
}
