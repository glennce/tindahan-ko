require('dotenv').config();
const p=require('./db');
(async()=>{
  const r=await p.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='sales' ORDER BY ordinal_position");
  console.log(r.rows);
  try{ const r2=await p.query('SELECT * FROM sales LIMIT 1'); console.log('sales sample',r2.rows[0]); }catch(e){console.log('sales err',e.message)}
  
  const manilaToday = () => new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Manila'});
  const manilaDayBounds = (dateStr)=>{ const start=new Date(dateStr+'T00:00:00+08:00'); const end=new Date(start); end.setUTCDate(end.getUTCDate()+1); return {start,end};}
  const today=manilaToday();
  const {start,end}=manilaDayBounds(today);
  console.log('today',today,start,end);
  try{
    const rr = await p.query(`SELECT COALESCE(SUM(total_amount),0) AS total_sales, COUNT(*) AS transaction_count
      FROM sales WHERE created_at >= $1 AND created_at < $2 AND status = 'completed'`, [start,end]);
    console.log('salesToday ok',rr.rows);
  }catch(e){console.log('salesToday err',e.message)}
  process.exit(0)
})();
