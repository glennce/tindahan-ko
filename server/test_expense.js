require('dotenv').config();
const pool = require('./db');
(async()=>{
  // find owner user
  const u = await pool.query("SELECT id, name, role FROM users LIMIT 1");
  console.log('users', u.rows);
  // check shift current logic
  const manilaToday = () => new Date().toLocaleDateString('en-CA', {timeZone:'Asia/Manila'});
  const manilaDayBounds = (dateStr)=>{ const start=new Date(dateStr+'T00:00:00+08:00'); const end=new Date(start); end.setUTCDate(end.getUTCDate()+1); return {start,end};}
  const today = manilaToday();
  const {start,end} = manilaDayBounds(today);
  console.log('today bounds', today, start, end);
  // get opening cash
  const shiftRes = await pool.query("SELECT * FROM cash_shifts WHERE shift_date=$1",[today]);
  console.log('shift', shiftRes.rows[0]);
  const opening = shiftRes.rows[0]?.opening_cash || 0;
  // compute before
  const poolClient = pool;
  async function compute(openingCash, s,e){
    const cashSales = await poolClient.query(`SELECT COALESCE(SUM(CASE WHEN payment_method='cash' THEN total_amount WHEN payment_method='split' THEN amount_tendered ELSE 0 END),0) AS total FROM sales WHERE status='completed' AND created_at BETWEEN $1 AND $2`,[s,e]);
    const gcashSales = await poolClient.query(`SELECT COALESCE(SUM(total_amount),0) AS total FROM sales WHERE status='completed' AND payment_method='gcash' AND created_at BETWEEN $1 AND $2`,[s,e]);
    const cashUtang= await poolClient.query(`SELECT COALESCE(SUM(amount),0) AS total FROM utang_transactions WHERE type='payment' AND payment_method='cash' AND created_at BETWEEN $1 AND $2`,[s,e]);
    const gcashUtang= await poolClient.query(`SELECT COALESCE(SUM(amount),0) AS total FROM utang_transactions WHERE type='payment' AND payment_method='gcash' AND created_at BETWEEN $1 AND $2`,[s,e]);
    const cashExp= await poolClient.query(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE created_at BETWEEN $1 AND $2 AND (payment_method='cash' OR payment_method IS NULL)`,[s,e]);
    const gcashExp= await poolClient.query(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE created_at BETWEEN $1 AND $2 AND payment_method='gcash'`,[s,e]);
    console.log('cashSales',cashSales.rows[0].total,'gcashSales',gcashSales.rows[0].total,'cashUtang',cashUtang.rows[0].total,'gcashUtang',gcashUtang.rows[0].total,'cashExp',cashExp.rows[0].total,'gcashExp',gcashExp.rows[0].total);
    const cashInHand = Number(opening) + Number(cashSales.rows[0].total) + Number(cashUtang.rows[0].total) - Number(cashExp.rows[0].total);
    const gcashInHand = Number(gcashSales.rows[0].total) + Number(gcashUtang.rows[0].total) - Number(gcashExp.rows[0].total);
    console.log('totalCash',cashInHand,'totalGcash',gcashInHand);
    return {cashInHand, gcashInHand};
  }
  console.log('before');
  await compute(opening, start, new Date());
  console.log('inserting expense 10 cash');
  await pool.query(`INSERT INTO expenses (category, amount, description, payment_method) VALUES ($1,$2,$3,$4) RETURNING *`, ['Test', 10, 'debug', 'cash']);
  console.log('after insert cash');
  await compute(opening, start, new Date());
  console.log('inserting expense 5 gcash');
  await pool.query(`INSERT INTO expenses (category, amount, description, payment_method) VALUES ($1,$2,$3,$4) RETURNING *`, ['Test', 5, 'debug', 'gcash']);
  await compute(opening, start, new Date());
  // cleanup test expenses
  await pool.query(`DELETE FROM expenses WHERE category='Test'`);
  console.log('cleaned');
  process.exit(0);
})();
