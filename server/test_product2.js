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
  const granularity = 'week';
  const { start: rangeStart, end: rangeEnd } = await manilaRangeBounds(start, end);
  console.log('range', rangeStart, rangeEnd);
  let groupExpr;
  if (granularity === 'day') groupExpr = `(s.created_at AT TIME ZONE 'Asia/Manila')::date`;
  else if (granularity === 'week') groupExpr = `date_trunc('week', s.created_at AT TIME ZONE 'Asia/Manila')::date`;
  else groupExpr = `date_trunc('month', s.created_at AT TIME ZONE 'Asia/Manila')::date`;
  const params = [rangeStart, rangeEnd];
  try {
    const trend = await pool.query(`
      SELECT ${groupExpr} AS period,
             SUM(si.quantity) AS qty_sold,
             SUM(si.subtotal) AS revenue,
             COUNT(DISTINCT s.id) AS transactions
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id AND s.status='completed'
      WHERE s.created_at >= $1 AND s.created_at < $2
      GROUP BY 1
      ORDER BY 1
    `, params);
    console.log('trend week ok', trend.rows);
  } catch (e) {
    console.error('trend week err', e.message);
  }
  // Test with category filter
  try {
    const trendCat = await pool.query(`
      SELECT ${groupExpr} AS period,
             SUM(si.quantity) AS qty_sold,
             SUM(si.subtotal) AS revenue,
             COUNT(DISTINCT s.id) AS transactions
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id AND s.status='completed'
      JOIN products p ON p.id = si.product_id
      WHERE s.created_at >= $1 AND s.created_at < $2 AND p.category = $3
      GROUP BY 1
      ORDER BY 1
    `, [rangeStart, rangeEnd, 'Beverages']);
    console.log('trend with category ok', trendCat.rows.length);
  } catch (e) {
    console.error('trend cat err', e.message);
  }
  // Test top products
  try {
    const top = await pool.query(`
      SELECT p.id, p.name, p.category, SUM(si.quantity) AS qty_sold, SUM(si.subtotal) AS revenue
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id AND s.status='completed'
      JOIN products p ON p.id = si.product_id
      WHERE s.created_at >= $1 AND s.created_at < $2
      GROUP BY p.id, p.name, p.category
      ORDER BY qty_sold DESC
    `, [rangeStart, rangeEnd]);
    console.log('top ok', top.rows.slice(0,3));
  } catch (e) {
    console.error('top err', e.message);
  }
  process.exit(0);
})();
