require('dotenv').config();
const p=require('./db');
(async()=>{
  await p.query(`CREATE TABLE IF NOT EXISTS cash_shifts (
        id SERIAL PRIMARY KEY,
        shift_date DATE UNIQUE NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        opening_cash NUMERIC DEFAULT 0,
        opened_by INTEGER REFERENCES users(id),
        closing_cash NUMERIC,
        expected_cash NUMERIC,
        difference NUMERIC,
        gcash_sales NUMERIC DEFAULT 0,
        utang_charged NUMERIC DEFAULT 0,
        closed_by INTEGER REFERENCES users(id),
        closed_at TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
  await p.query(`ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'cash'`);
  await p.query(`UPDATE expenses SET payment_method='cash' WHERE payment_method IS NULL`);
  console.log('migration done');
  const r=await p.query(`SELECT column_name FROM information_schema.columns WHERE table_name='expenses'`);
  console.log(r.rows);
  const c=await p.query(`SELECT column_name FROM information_schema.columns WHERE table_name='cash_shifts'`);
  console.log(c.rows);
  process.exit(0);
})();
