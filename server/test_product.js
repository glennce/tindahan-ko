require('dotenv').config();
const pool = require('./db');
async function manilaRangeBounds(startDateStr, endDateStr) {
  const manilaDayBounds = (dateStr) => {
    const start = new Date(`${dateStr}T00:00:00+08:00`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    return { start, end };
  };
  const { start } = manilaDayBounds(startDateStr);
  const { end } = manilaDayBounds(endDateStr);
  return { start, end };
}
(async () => {
  const start = '2026-07-31';
  const end = '2026-08-26';
  const granularity = 'day';
  const { start: rangeStart, end: rangeEnd } = await manilaRangeBounds(start, end);
  console.log('range', rangeStart, rangeEnd);
  let groupExpr, orderExpr;
  if (granularity === 'day') {
    groupExpr = `(s.created_at AT TIME ZONE 'Asia/Manila')::date`;
    orderExpr = `period::date`;
  } else if (granularity === 'week') {
    groupExpr = `date_trunc('week', s.created_at AT TIME ZONE 'Asia/Manila')::date`;
    orderExpr = `period::date`;
  } else {
    groupExpr = `date_trunc('month', s.created_at AT TIME ZONE 'Asia/Manila')::date`;
    orderExpr = `period::date`;
  }
  const params = [rangeStart, rangeEnd];
  const productFilter = '';
  try {
    const trend = await pool.query(`
      SELECT ${groupExpr} AS period,
             SUM(si.quantity) AS qty_sold,
             SUM(si.subtotal) AS revenue,
             COUNT(DISTINCT s.id) AS transactions
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id AND s.status='completed'
      WHERE s.created_at >= $1 AND s.created_at < $2 ${productFilter}
      GROUP BY period
      ORDER BY ${orderExpr}
    `, params);
    console.log('trend ok', trend.rows.length, trend.rows.slice(0,2));
  } catch (e) {
    console.error('trend err', e.message, e.stack);
  }

  try {
    const total = await pool.query(`
      SELECT COALESCE(SUM(si.quantity),0) AS total_qty,
             COALESCE(SUM(si.subtotal),0) AS total_revenue,
             COUNT(DISTINCT s.id) AS total_transactions
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id AND s.status='completed'
      WHERE s.created_at >= $1 AND s.created_at < $2 ${productFilter}
    `, params);
    console.log('total ok', total.rows[0]);
  } catch (e) {
    console.error('total err', e.message);
  }

  try {
    const topProducts = await pool.query(`
      SELECT p.id, p.name, p.category, SUM(si.quantity) AS qty_sold, SUM(si.subtotal) AS revenue
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id AND s.status='completed'
      JOIN products p ON p.id = si.product_id
      WHERE s.created_at >= $1 AND s.created_at < $2
      GROUP BY p.id, p.name, p.category
      ORDER BY qty_sold DESC LIMIT 10
    `, [rangeStart, rangeEnd]);
    console.log('top ok', topProducts.rows.length);
  } catch (e) {
    console.error('top err', e.message);
  }
  process.exit(0);
})();
