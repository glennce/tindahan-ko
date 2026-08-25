require('dotenv').config();
const p=require('./db');
(async()=>{
  const manilaToday = () => new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Manila'});
  const manilaDayBounds = (dateStr)=>{ const start=new Date(dateStr+'T00:00:00+08:00'); const end=new Date(start); end.setUTCDate(end.getUTCDate()+1); return {start,end};}
  const today = manilaToday();
  const {start,end} = manilaDayBounds(today);
  const now = new Date();
  console.log('start',start,'end now',now);
  // insert gcash
  const ins = await p.query(`INSERT INTO expenses (category, amount, description, payment_method) VALUES ($1,$2,$3,$4) RETURNING id, created_at, payment_method`, ['TestGcash', 15, 'debug', 'gcash']);
  console.log('inserted', ins.rows[0]);
  const q = await p.query(`SELECT * FROM expenses WHERE payment_method='gcash' AND created_at BETWEEN $1 AND $2`,[start, now]);
  console.log('gcash between start and now', q.rows.map(r=>[r.id, r.created_at, r.amount]));
  const q2 = await p.query(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE created_at BETWEEN $1 AND $2 AND payment_method='gcash'`,[start, now]);
  console.log('sum gcash', q2.rows[0].total);
  const q3 = await p.query(`SELECT * FROM expenses WHERE category='TestGcash'`);
  console.log('all test', q3.rows);
  await p.query(`DELETE FROM expenses WHERE category='TestGcash'`);
  console.log('cleaned');
  process.exit(0);
})();
