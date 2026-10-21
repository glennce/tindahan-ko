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

/* ---- shared report helpers (Reports, Shift, Utang) ---- */

// Dates formatted in Asia/Manila so they line up with the server's day
// boundaries (toISOString() would shift the PH date back a day after midnight).
export function manilaIsoDate(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

export function today() {
  return manilaIsoDate();
}

export function firstOfMonth() {
  const d = new Date();
  return manilaIsoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function pctChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

// UTF-8 BOM first so Excel opens UTF-8 correctly. Cells that Excel could read
// as a formula (=, +, -, @, tab, CR) get a leading apostrophe, except plain
// numbers so negative amounts stay numeric.
export function downloadCsv(filename, rows) {
  const csv = '﻿' + rows.map((row) => row.map((cell) => {
    let s = String(cell ?? '').replace(/"/g, '""');
    if (/^[=+@\t\r-]/.test(s) && !/^-?[\d.,() ]+$/.test(s)) s = `'${s}`;
    return `"${s}"`;
  }).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
