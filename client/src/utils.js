export function formatStock(product) {
  const { stock_quantity, units_per_pack, unit_label } = product;
  if (units_per_pack && unit_label) {
    const packs = Math.floor(stock_quantity / units_per_pack);
    const leftover = stock_quantity % units_per_pack;
    const leftoverText = leftover > 0 ? `, ${leftover} loose ${unit_label}${leftover === 1 ? '' : 's'}` : '';
    return `${packs} pack${packs === 1 ? '' : 's'}${leftoverText} (${stock_quantity} ${unit_label}${stock_quantity === 1 ? '' : 's'} total)`;
  }
  return `${stock_quantity} pcs`;
}