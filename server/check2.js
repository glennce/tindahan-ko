require('dotenv').config();
const p=require('./db');
(async()=>{
  const manilaToday = () => new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Manila'});
  const manilaDayBounds = (dateStr)=>{ const start=new Date(dateStr+'T00:00:00+08:00'); const end=new Date(start); end.setUTCDate(end.getUTCDate()+1); return {start,end};}
  const today=manilaToday();
  const {start,end}=manilaDayBounds(today);
  const steps = [
    {name:'profitToday', sql:`SELECT COALESCE(SUM((si.unit_price - p.cost_price) * si.quantity),0) AS gross_profit,
              COALESCE(SUM(si.quantity),0) AS items_sold
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       JOIN products p ON p.id = si.product_id
       WHERE s.created_at >= $1 AND s.created_at < $2 AND s.status = 'completed'`, params:[start,end]},
    {name:'lowStock', sql:`SELECT id, name, stock_quantity, units_per_pack, unit_label FROM products
      WHERE stock_quantity <= low_stock_threshold
      ORDER BY stock_quantity ASC
      LIMIT 5`, params:[]},
    {name:'lowCount', sql:`SELECT COUNT(*) AS count FROM products WHERE stock_quantity <= low_stock_threshold`, params:[]},
    {name:'topSelling', sql:`SELECT p.id, p.name, SUM(si.quantity) AS qty_sold, SUM(si.subtotal) AS revenue
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE s.created_at >= $1 AND s.created_at < $2 AND s.status = 'completed'
      GROUP BY p.id, p.name
      ORDER BY qty_sold DESC
      LIMIT 4`, params:[start,end]},
    {name:'latestUtang', sql:`SELECT DISTINCT ON (ut.customer_id) ut.customer_id, ut.balance_after, ut.created_at, c.name
      FROM utang_transactions ut
      JOIN customers c ON c.id = ut.customer_id
      ORDER BY ut.customer_id, ut.created_at DESC, ut.id DESC`, params:[]},
  ];
  for(const s of steps){
    try{ const r=await p.query(s.sql, s.params); console.log(s.name,'ok',r.rows.length, r.rows.slice(0,2)) }
    catch(e){ console.log(s.name,'ERR',e.message) }
  }
  process.exit(0)
})();
