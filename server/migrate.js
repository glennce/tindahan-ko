require('dotenv').config();
const p=require('./db');
(async()=>{
  await p.query(`CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(20) DEFAULT 'owner'
      )`);
  await p.query(`CREATE TABLE IF NOT EXISTS products (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        sku TEXT UNIQUE,
        category TEXT,
        cost_price NUMERIC DEFAULT 0,
        selling_price NUMERIC NOT NULL DEFAULT 0,
        stock_quantity NUMERIC DEFAULT 0,
        low_stock_threshold INTEGER DEFAULT 10,
        supplier TEXT,
        units_per_pack INTEGER,
        unit_label VARCHAR(50)
      )`);
  await p.query(`CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        contact_number TEXT,
        credit_limit NUMERIC DEFAULT 0
      )`);
  await p.query(`CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        subtotal NUMERIC DEFAULT 0,
        discount_amount NUMERIC DEFAULT 0,
        total_amount NUMERIC NOT NULL DEFAULT 0,
        payment_method VARCHAR(20) DEFAULT 'cash',
        amount_tendered NUMERIC,
        change_amount NUMERIC,
        status VARCHAR(20) DEFAULT 'completed',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
  await p.query(`CREATE TABLE IF NOT EXISTS sale_items (
        id SERIAL PRIMARY KEY,
        sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        quantity NUMERIC NOT NULL,
        unit_price NUMERIC NOT NULL,
        subtotal NUMERIC NOT NULL
      )`);
  await p.query(`CREATE TABLE IF NOT EXISTS utang_transactions (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
        type VARCHAR(20) NOT NULL,
        amount NUMERIC NOT NULL,
        balance_after NUMERIC NOT NULL,
        payment_method VARCHAR(20) DEFAULT 'cash',
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
  await p.query(`CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        category TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        description TEXT,
        payment_method VARCHAR(20) DEFAULT 'cash',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
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
        cash_sales NUMERIC DEFAULT 0,
        cash_utang_payments NUMERIC DEFAULT 0,
        gcash_utang_payments NUMERIC DEFAULT 0,
        cash_expenses NUMERIC DEFAULT 0,
        gcash_expenses NUMERIC DEFAULT 0,
        expected_gcash NUMERIC DEFAULT 0,
        closed_by INTEGER REFERENCES users(id),
        closed_at TIMESTAMPTZ,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
  await p.query(`CREATE TABLE IF NOT EXISTS stock_adjustments (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        product_name TEXT NOT NULL,
        system_qty NUMERIC NOT NULL,
        counted_qty NUMERIC NOT NULL,
        difference NUMERIC NOT NULL,
        reason VARCHAR(40) NOT NULL DEFAULT 'unrecorded_sale',
        notes TEXT,
        cost_impact NUMERIC DEFAULT 0,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);
  await p.query(`CREATE TABLE IF NOT EXISTS money_transfers (
        id SERIAL PRIMARY KEY,
        from_wallet VARCHAR(20) NOT NULL,
        to_wallet VARCHAR(20) NOT NULL,
        amount NUMERIC NOT NULL,
        note TEXT,
        bank_name VARCHAR(100),
        created_by INTEGER REFERENCES users(id),
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
