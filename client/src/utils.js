export function formatStock(product) {
  const { stock_quantity, units_per_pack, unit_label } = product;
  if (units_per_pack && unit_label) {
    const total = stock_quantity * units_per_pack;
    return `${stock_quantity} pack${stock_quantity === 1 ? '' : 's'} (${total} ${unit_label}${total === 1 ? '' : 's'})`;
  }
  return `${stock_quantity} pcs`;
}