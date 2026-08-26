require('dotenv').config();
const p=require('./db');
(async()=>{
  const manilaToday=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Manila'});
  const today=manilaToday();
  const lastRes=await p.query("SELECT closing_cash, closed_at FROM cash_shifts WHERE status='closed' ORDER BY closed_at DESC LIMIT 1");
  const lastAt=lastRes.rows[0].closed_at;
  console.log('today',today,'last',lastRes.rows[0]);
  const before = await p.query("SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE payment_method='gcash' AND (created_at AT TIME ZONE 'Asia/Manila')::date = $1 AND created_at > $2", [today, lastAt]);
  console.log('before',before.rows[0].total);
  await p.query("INSERT INTO expenses (category, amount, description, payment_method) VALUES ($1,$2,$3,$4)", ['Test','2','test gcash','gcash']);
  const after = await p.query("SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE payment_method='gcash' AND (created_at AT TIME ZONE 'Asia/Manila')::date = $1 AND created_at > $2", [today, lastAt]);
  console.log('after',after.rows[0].total);
  console.log('diff', Number(after.rows[0].total)-Number(before.rows[0].total));
  await p.query("DELETE FROM expenses WHERE category='Test'");
  console.log('cleaned');
  process.exit(0);
})();
