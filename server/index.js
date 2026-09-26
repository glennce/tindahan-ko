const requireAuth = require('./authMiddleware');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./db');
const requireRole = require('./requireRole');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl) and any localhost for dev
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin) || origin.startsWith('http://localhost:')) {
      return callback(null, true);
    }
    return callback(null, true); // fallback allow - change to callback(new Error('Not allowed')) to strict
  },
  credentials: true,
}));
app.use(express.json());

// --- DB bootstrap for local dev: ensure cash_shifts & expenses.payment_method exist ---
async function ensureDB() {
  try {
    // Core tables (no-op when they already exist — makes fresh deploys work)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role VARCHAR(20) DEFAULT 'owner'
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS products (
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
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        contact_number TEXT,
        credit_limit NUMERIC DEFAULT 0
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sales (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER REFERENCES customers(id),
        subtotal NUMERIC DEFAULT 0,
        discount_amount NUMERIC DEFAULT 0,
        total_amount NUMERIC NOT NULL DEFAULT 0,
        payment_method VARCHAR(20) DEFAULT 'cash',
        amount_tendered NUMERIC,
        gcash_amount NUMERIC DEFAULT 0,
        change_amount NUMERIC,
        status VARCHAR(20) DEFAULT 'completed',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sale_items (
        id SERIAL PRIMARY KEY,
        sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        quantity NUMERIC NOT NULL,
        unit_price NUMERIC NOT NULL,
        subtotal NUMERIC NOT NULL
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS utang_transactions (
        id SERIAL PRIMARY KEY,
        customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
        sale_id INTEGER REFERENCES sales(id) ON DELETE SET NULL,
        type VARCHAR(20) NOT NULL,
        amount NUMERIC NOT NULL,
        balance_after NUMERIC NOT NULL,
        payment_method VARCHAR(20) DEFAULT 'cash',
        note TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // Older databases may carry a CHECK constraint limiting utang type to
    // ('charge','payment'), which would reject the monitoring-only cash_loan
    // types. Drop any check constraint that references the type column —
    // all validation for these values lives in the API layer.
    // Widen the column too so longer types like 'cash_loan_payment' always fit.
    try {
      await pool.query(`ALTER TABLE utang_transactions ALTER COLUMN type TYPE VARCHAR(30);`);
    } catch (e) {
      console.error('ensureDB alter utang type width:', e.message);
    }
    try {
      await pool.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN
          SELECT conname FROM pg_constraint
          WHERE conrelid = 'utang_transactions'::regclass
            AND contype = 'c'
            AND pg_get_constraintdef(oid) ILIKE '%type%'
        LOOP
          EXECUTE format('ALTER TABLE utang_transactions DROP CONSTRAINT %I', r.conname);
        END LOOP;
      END $$;
    `);
    } catch (e) {
      console.error('ensureDB drop utang type check:', e.message);
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id SERIAL PRIMARY KEY,
        category TEXT NOT NULL,
        amount NUMERIC NOT NULL,
        description TEXT,
        payment_method VARCHAR(20) DEFAULT 'cash',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cash_shifts (
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
      );
    `);
    await pool.query(`
      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20) DEFAULT 'cash';
    `);
    // backfill old expenses without method to cash
    await pool.query(`UPDATE expenses SET payment_method='cash' WHERE payment_method IS NULL`);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS money_transfers (
        id SERIAL PRIMARY KEY,
        from_wallet VARCHAR(20) NOT NULL,
        to_wallet VARCHAR(20) NOT NULL,
        amount NUMERIC NOT NULL,
        note TEXT,
        bank_name VARCHAR(100),
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // Ensure products has per-pack columns (deployed has them, local may not)
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS units_per_pack INTEGER`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_label VARCHAR(50)`);
    // Ensure sales has discount/subtotal/status if local DB is old (safe no-op if exists)
    await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS subtotal NUMERIC DEFAULT 0`);
    await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0`);
    await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed'`);
    await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS gcash_amount NUMERIC DEFAULT 0`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'owner'`);
    // Cash drawer breakdown persistence (for history details: debt from credit, GCash paid)
    await pool.query(`ALTER TABLE cash_shifts ADD COLUMN IF NOT EXISTS cash_sales NUMERIC DEFAULT 0`);
    await pool.query(`ALTER TABLE cash_shifts ADD COLUMN IF NOT EXISTS cash_utang_payments NUMERIC DEFAULT 0`);
    await pool.query(`ALTER TABLE cash_shifts ADD COLUMN IF NOT EXISTS gcash_utang_payments NUMERIC DEFAULT 0`);
    await pool.query(`ALTER TABLE cash_shifts ADD COLUMN IF NOT EXISTS cash_expenses NUMERIC DEFAULT 0`);
    await pool.query(`ALTER TABLE cash_shifts ADD COLUMN IF NOT EXISTS gcash_expenses NUMERIC DEFAULT 0`);
    await pool.query(`ALTER TABLE cash_shifts ADD COLUMN IF NOT EXISTS expected_gcash NUMERIC DEFAULT 0`);
    // Snapshot the cost at sale time so later restocks (which update
    // products.cost_price) can't rewrite historical profit.
    await pool.query(`ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS cost_price NUMERIC DEFAULT 0`);
    await pool.query(`
      UPDATE sale_items si SET cost_price = p.cost_price
      FROM products p WHERE p.id = si.product_id AND (si.cost_price IS NULL OR si.cost_price = 0)
    `);
    // Drawer reset baseline: everything created before the latest reset is
    // ignored by Cash Drawer KPIs (sales/expenses/transfers still kept in history).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS drawer_resets (
        id SERIAL PRIMARY KEY,
        reset_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // Owner profit withdrawals: cash/GCash the owner takes home from profit.
    // Deducts from the Cash Drawer like an expense, but is NEVER counted as
    // an expense in profit reports — so Net Profit stays correct.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS profit_withdrawals (
        id SERIAL PRIMARY KEY,
        amount NUMERIC NOT NULL,
        source_wallet VARCHAR(20) DEFAULT 'cash',
        note TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // Repack / conversion history (bulk -> tingi pieces, twin pack -> singles)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS repack_logs (
        id SERIAL PRIMARY KEY,
        source_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        source_name TEXT NOT NULL,
        source_qty NUMERIC NOT NULL,
        dest_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        dest_name TEXT NOT NULL,
        dest_qty NUMERIC NOT NULL,
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    // Restock / stock-in history: every inventory restock is logged here.
    // One bulk Confirm = one batch_id, so multi-product deliveries read as a
    // single transaction-like entry with expandable line items.
    await pool.query(`
      CREATE TABLE IF NOT EXISTS restock_logs (
        id SERIAL PRIMARY KEY,
        product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
        product_name TEXT NOT NULL,
        qty_added NUMERIC NOT NULL,
        old_qty NUMERIC NOT NULL,
        new_qty NUMERIC NOT NULL,
        old_cost NUMERIC,
        new_cost NUMERIC,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        batch_id TEXT
      );
    `);
    await pool.query(`ALTER TABLE restock_logs ADD COLUMN IF NOT EXISTS batch_id TEXT`);
    // Stock audit / shrinkage tracking (sold-but-unrecorded, theft, damage, etc.)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS stock_adjustments (
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
      );
    `);
  } catch (e) {
    console.error('ensureDB error', e.message);
  }
}
ensureDB();

function previousPeriod(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const rangeDays = Math.round((endDate - startDate) / 86400000) + 1;
  const prevEnd = new Date(startDate);
  prevEnd.setDate(prevEnd.getDate() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - rangeDays + 1);
  return {
    prevStart: prevStart.toISOString().slice(0, 10),
    prevEnd: prevEnd.toISOString().slice(0, 10),
  };
}

// Sanity-check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Tindahan Ko server is running' });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const user = result.rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Real database-backed route
app.get('/api/products', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT p.*, COALESCE(sold.total_sold, 0) AS total_sold
      FROM products p
      LEFT JOIN (
        SELECT si.product_id, SUM(si.quantity) AS total_sold
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
        GROUP BY si.product_id
      ) sold ON sold.product_id = p.id
      ORDER BY p.id
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.post('/api/products', requireAuth, requireRole('owner'), async (req, res) => {
  const { name, sku, category, cost_price, selling_price, stock_quantity, low_stock_threshold, supplier, units_per_pack, unit_label } = req.body;
  const cleanSku = sku && sku.trim() !== '' ? sku.trim() : null;
  if (!name || selling_price === undefined) {
    return res.status(400).json({ error: 'Name and selling price are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO products (name, sku, category, cost_price, selling_price, stock_quantity, low_stock_threshold, supplier, units_per_pack, unit_label)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [name, cleanSku, category, cost_price || 0, selling_price, stock_quantity || 0, low_stock_threshold || 10, supplier, units_per_pack || null, unit_label || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// Get a single product by id
app.get('/api/products/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// Update a product
app.put('/api/products/:id', requireAuth, requireRole('owner'), async (req, res) => {
  const { name, sku, category, cost_price, selling_price, stock_quantity, low_stock_threshold, supplier, units_per_pack, unit_label } = req.body;
  const cleanSku = sku && sku.trim() !== '' ? sku.trim() : null;
  try {
    const result = await pool.query(
      `UPDATE products
       SET name = $1, sku = $2, category = $3, cost_price = $4, selling_price = $5,
           stock_quantity = $6, low_stock_threshold = $7, supplier = $8, units_per_pack = $9, unit_label = $10
       WHERE id = $11
       RETURNING *`,
      [name, cleanSku, category, cost_price, selling_price, stock_quantity, low_stock_threshold, supplier, units_per_pack, unit_label, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete a product
app.delete('/api/products/:id', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product deleted', product: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

app.get('/api/customers', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, COALESCE(latest.balance_after, 0) AS balance
      FROM customers c
      LEFT JOIN LATERAL (
        SELECT balance_after FROM utang_transactions
        WHERE customer_id = c.id
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      ) latest ON true
      ORDER BY c.name
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

app.post('/api/customers', requireAuth, async (req, res) => {
  const { name, contact_number, credit_limit } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = await pool.query(
      `INSERT INTO customers (name, contact_number, credit_limit) VALUES ($1, $2, $3) RETURNING *`,
      [name, contact_number, credit_limit || 0]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

app.put('/api/customers/:id', requireAuth, async (req, res) => {
  const { name, contact_number, credit_limit } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const result = await pool.query(
      `UPDATE customers SET name = $1, contact_number = $2, credit_limit = $3
       WHERE id = $4 RETURNING *`,
      [name, contact_number, credit_limit || 0, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

app.delete('/api/customers/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM customers WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    res.json({ message: 'Customer deleted' });
  } catch (err) {
    // Foreign key violation — this customer has sales/utang history linked to them
    if (err.code === '23503') {
      return res.status(409).json({
        error: 'Cannot delete this customer — they have existing sales or utang history.',
      });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to delete customer' });
  }
});

app.post('/api/sales', requireAuth, async (req, res) => {
  const { customer_id, items, payment_method, amount_tendered, cash_amount, gcash_amount, discount_amount } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Sale must include at least one item' });
  }
  if (payment_method === 'utang' && !customer_id) {
    return res.status(400).json({ error: 'Utang sales require a customer' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const subtotal = items.reduce(
      (sum, item) => sum + item.quantity * Number(item.unit_price),
      0
    );
    const discount = Number(discount_amount) || 0;
    const total_amount = Math.max(subtotal - discount, 0);
    const change_amount = payment_method === 'cash' ? (amount_tendered - total_amount) : null;

    // Split = cash + GCash (e.g. total 150 = 50 cash + 100 GCash).
    // If cash + GCash < total, the remainder goes to utang (requires customer).
    let splitCash = 0;
    let splitGcash = 0;
    let utangPortion = 0;
    if (payment_method === 'split') {
      splitCash = Number(cash_amount ?? amount_tendered ?? 0) || 0;
      splitGcash = Number(gcash_amount ?? 0) || 0;
      if (splitCash < 0 || splitGcash < 0) throw new Error('Split amounts cannot be negative.');
      const paid = splitCash + splitGcash;
      if (paid <= 0) throw new Error('Enter a cash and/or GCash amount greater than ₱0.');
      if (paid - total_amount > 0.01) throw new Error('Cash + GCash cannot exceed the total.');
      utangPortion = Math.max(total_amount - paid, 0);
      if (utangPortion > 0.01 && !customer_id) {
        throw new Error('Remaining balance requires a customer (utang).');
      }
    }

    const saleResult = await client.query(
      `INSERT INTO sales (customer_id, subtotal, discount_amount, total_amount, payment_method, amount_tendered, gcash_amount, change_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        customer_id || null,
        subtotal,
        discount,
        total_amount,
        payment_method,
        payment_method === 'split' ? splitCash : (amount_tendered || null),
        payment_method === 'split' ? splitGcash : null,
        change_amount,
      ]
    );
    const sale = saleResult.rows[0];

    for (const item of items) {
    const effectiveUnitPrice = Number(item.unit_price);
    const itemSubtotal = item.quantity * effectiveUnitPrice;

    // Snapshot current cost so future restocks don't rewrite this sale's profit.
    const costRow = await client.query(
      `SELECT cost_price FROM products WHERE id = $1`,
      [item.product_id]
    );
    if (costRow.rows.length === 0) throw new Error(`Product ${item.product_id} not found`);
    const costAtSale = Number(costRow.rows[0].cost_price || 0);

    await client.query(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal, cost_price)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [sale.id, item.product_id, item.quantity, effectiveUnitPrice, itemSubtotal, costAtSale]
    );

      const stockResult = await client.query(
        `UPDATE products SET stock_quantity = stock_quantity - $1
         WHERE id = $2 AND stock_quantity >= $1
         RETURNING stock_quantity`,
        [item.quantity, item.product_id]
      );
      if (stockResult.rows.length === 0) {
        throw new Error(`Not enough stock for product ${item.product_id}`);
      }
    }

    if (payment_method === 'utang' || (payment_method === 'split' && utangPortion > 0.01)) {
      const custResult = await client.query(
        `SELECT name, credit_limit FROM customers WHERE id = $1`,
        [customer_id]
      );
      if (custResult.rows.length === 0) {
        throw new Error('Customer not found');
      }
      const { name: customerName, credit_limit } = custResult.rows[0];
      const creditLimit = Number(credit_limit);
      const chargeAmount = payment_method === 'utang' ? total_amount : utangPortion;
    
      const lastUtang = await client.query(
        `SELECT balance_after FROM utang_transactions WHERE customer_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
        [customer_id]
      );
      const previousBalance = lastUtang.rows.length ? Number(lastUtang.rows[0].balance_after) : 0;
      const newBalance = previousBalance + chargeAmount;
    
      if (newBalance > creditLimit) {
        const available = Math.max(creditLimit - previousBalance, 0);
        throw new Error(
          `This sale exceeds ${customerName}'s credit limit. Available credit: ₱${available.toFixed(2)}`
        );
      }
    
      await client.query(
        `INSERT INTO utang_transactions (customer_id, sale_id, type, amount, balance_after, note)
         VALUES ($1, $2, 'charge', $3, $4, $5)`,
        [customer_id, sale.id, chargeAmount, newBalance, payment_method === 'split' ? 'Split sale (partial credit)' : 'Sale purchase']
      );
    }

    await client.query('COMMIT');
    res.status(201).json(sale);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to process sale' });
  } finally {
    client.release();
  }
});

app.get('/api/sales/:id', requireAuth, async (req, res) => {
  try {
    const sale = await pool.query(
      `SELECT s.*, c.name AS customer_name FROM sales s
       LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = $1`,
      [req.params.id]
    );
    if (sale.rows.length === 0) return res.status(404).json({ error: 'Sale not found' });
    const items = await pool.query(
      `SELECT si.*, p.name AS product_name FROM sale_items si
       JOIN products p ON p.id = si.product_id WHERE si.sale_id = $1`,
      [req.params.id]
    );
    return res.json({ source: 'sale', ...sale.rows[0], items: items.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sale' });
  }
});

app.post('/api/sales/:id/void', requireAuth, requireRole('owner'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const saleRes = await client.query('SELECT * FROM sales WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (saleRes.rows.length === 0) throw new Error('Sale not found');
    const sale = saleRes.rows[0];
    if (sale.status === 'voided') throw new Error('This sale is already voided');

    const items = await client.query('SELECT * FROM sale_items WHERE sale_id = $1', [sale.id]);
    for (const item of items.rows) {
      await client.query(
        'UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2',
        [item.quantity, item.product_id]
      );
    }

    if ((sale.payment_method === 'utang' || sale.payment_method === 'split') && sale.customer_id) {
      const utangPortion =
        sale.payment_method === 'split'
          ? Number(sale.total_amount) - Number(sale.amount_tendered || 0) - Number(sale.gcash_amount || 0)
          : Number(sale.total_amount);

      if (utangPortion > 0.01) {
        const lastUtang = await client.query(
          `SELECT balance_after FROM utang_transactions WHERE customer_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
          [sale.customer_id]
        );
        const previousBalance = lastUtang.rows.length ? Number(lastUtang.rows[0].balance_after) : 0;
        const newBalance = previousBalance - utangPortion;
      
        await client.query(
          `INSERT INTO utang_transactions (customer_id, sale_id, type, amount, balance_after, note)
           VALUES ($1, $2, 'payment', $3, $4, 'Sale voided')`,
          [sale.customer_id, sale.id, utangPortion, newBalance]
        );
      }
    }

    await client.query(`UPDATE sales SET status = 'voided' WHERE id = $1`, [sale.id]);
    await client.query('COMMIT');
    res.json({ message: 'Sale voided successfully' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get('/api/dashboard', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const today = manilaToday();
    const { start, end } = manilaDayBounds(today);

    const salesToday = await pool.query(`
      SELECT COALESCE(SUM(total_amount),0) AS total_sales, COUNT(*) AS transaction_count
      FROM sales WHERE created_at >= $1 AND created_at < $2 AND status = 'completed'
    `, [start, end]);

    const profitToday = await pool.query(`
      SELECT COALESCE(SUM((si.unit_price - COALESCE(si.cost_price, p.cost_price)) * si.quantity),0) AS gross_profit,
             COALESCE(SUM(si.quantity),0) AS items_sold
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE s.created_at >= $1 AND s.created_at < $2 AND s.status = 'completed'
    `, [start, end]);

    const lowStock = await pool.query(`
      SELECT id, name, stock_quantity, units_per_pack, unit_label FROM products
      WHERE stock_quantity <= low_stock_threshold
      ORDER BY stock_quantity ASC
      LIMIT 5
    `);

    const lowStockCount = await pool.query(`
      SELECT COUNT(*) AS count FROM products WHERE stock_quantity <= low_stock_threshold
    `);

    const topSelling = await pool.query(`
      SELECT p.id, p.name, SUM(si.quantity) AS qty_sold, SUM(si.subtotal) AS revenue
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE s.created_at >= $1 AND s.created_at < $2 AND s.status = 'completed'
      GROUP BY p.id, p.name
      ORDER BY qty_sold DESC
      LIMIT 4
    `, [start, end]);

    const latestUtang = await pool.query(`
      SELECT DISTINCT ON (ut.customer_id) ut.customer_id, ut.balance_after, ut.created_at, c.name
      FROM utang_transactions ut
      JOIN customers c ON c.id = ut.customer_id
      ORDER BY ut.customer_id, ut.created_at DESC, ut.id DESC
    `);

    const outstanding = latestUtang.rows.filter((r) => Number(r.balance_after) > 0);
    const totalOutstanding = outstanding.reduce((sum, r) => sum + Number(r.balance_after), 0);
    const recentOutstanding = outstanding
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, 5);

    res.json({
      today_sales: Number(salesToday.rows[0].total_sales),
      transaction_count: Number(salesToday.rows[0].transaction_count),
      gross_profit: Number(profitToday.rows[0].gross_profit),
      items_sold: Number(profitToday.rows[0].items_sold),
      low_stock_count: Number(lowStockCount.rows[0].count),
      low_stock_items: lowStock.rows,
      top_selling: topSelling.rows,
      total_outstanding_utang: totalOutstanding,
      recent_utang: recentOutstanding,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load dashboard data' });
  }
});

app.get('/api/dashboard/trend', requireAuth, requireRole('owner'), async (req, res) => {
  const { range = 'today' } = req.query;
  try {
    if (range === 'today') {
      const today = manilaToday();
      const { start, end } = manilaDayBounds(today);
      const result = await pool.query(`
        SELECT EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Manila')::int AS bucket, SUM(total_amount) AS total
        FROM sales
        WHERE created_at >= $1 AND created_at < $2 AND status = 'completed'
        GROUP BY bucket
        ORDER BY bucket
      `, [start, end]);
      const map = Object.fromEntries(result.rows.map((r) => [r.bucket, Number(r.total)]));
      const trend = Array.from({ length: 24 }, (_, hour) => ({ label: hour, total: map[hour] || 0 }));
      return res.json({ granularity: 'hour', trend });
    }

    if (range === 'week' || range === 'month') {
      const days = range === 'week' ? 6 : 29;
      const today = manilaToday();
      const rangeStartDate = addDaysToManilaDate(today, -days);
      const { start } = manilaDayBounds(rangeStartDate);
      const { end } = manilaDayBounds(today);

      const result = await pool.query(`
        SELECT (created_at AT TIME ZONE 'Asia/Manila')::date AS bucket, SUM(total_amount) AS total
        FROM sales
        WHERE created_at >= $1 AND created_at < $2 AND status = 'completed'
        GROUP BY bucket
        ORDER BY bucket
      `, [start, end]);
      const map = Object.fromEntries(result.rows.map((r) => [dbDateToManila(r.bucket), Number(r.total)]));

      const trend = [];
      for (let i = days; i >= 0; i--) {
        const key = addDaysToManilaDate(today, -i);
        trend.push({ label: key, total: map[key] || 0 });
      }
      return res.json({ granularity: 'day', trend });
    }

    res.status(400).json({ error: 'Invalid range' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load trend data' });
  }
});

// List all customers with their current balance (ledger pattern again)
app.get('/api/utang', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT ON (c.id) c.id AS customer_id, c.name, c.credit_limit,
             COALESCE(ut.balance_after, 0) AS balance, ut.created_at AS last_active
      FROM customers c
      LEFT JOIN utang_transactions ut ON ut.customer_id = c.id
      ORDER BY c.id, ut.created_at DESC, ut.id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch utang ledger' });
  }
});

app.get('/api/utang/summary', requireAuth, async (req, res) => {
  try {
    const outstanding = await pool.query(`
      SELECT COALESCE(SUM(balance_after), 0) AS total, COUNT(*) AS customer_count
      FROM (
        SELECT DISTINCT ON (customer_id) customer_id, balance_after
        FROM utang_transactions
        ORDER BY customer_id, created_at DESC, id DESC
      ) latest
      WHERE balance_after > 0
    `);
    const paymentsToday = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
      FROM utang_transactions
      WHERE type = 'payment' AND created_at::date = CURRENT_DATE
    `);
    // Cash loans are monitoring-only (drawer-excluded): report them separately
    const cashStats = await pool.query(`
      SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'cash_loan'), 0) AS loaned,
             COALESCE(SUM(amount) FILTER (WHERE type = 'cash_loan_payment'), 0) AS repaid,
             COALESCE(SUM(amount) FILTER (WHERE type = 'cash_loan' AND created_at::date = CURRENT_DATE), 0) AS loaned_today,
             COALESCE(SUM(amount) FILTER (WHERE type = 'cash_loan_payment' AND created_at::date = CURRENT_DATE), 0) AS repaid_today
      FROM utang_transactions
    `);
    res.json({
      total_outstanding: Number(outstanding.rows[0].total),
      customers_with_balance: Number(outstanding.rows[0].customer_count),
      payments_today: Number(paymentsToday.rows[0].total),
      payments_today_count: Number(paymentsToday.rows[0].count),
      cash_loans_outstanding: Number(cashStats.rows[0].loaned) - Number(cashStats.rows[0].repaid),
      cash_loaned_today: Number(cashStats.rows[0].loaned_today),
      cash_loan_repaid_today: Number(cashStats.rows[0].repaid_today),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load utang summary' });
  }
});

// One customer's itemized debt statement: every charge with its products
// (camel, coke, noodles...) plus payments, so the total can be accounted for.
app.get('/api/utang/:customerId/statement', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.customerId)) {
    return res.status(400).json({ error: 'Invalid customer id' });
  }
  try {
    const cust = await pool.query(
      `SELECT c.*, COALESCE(latest.balance_after, 0) AS balance
       FROM customers c
       LEFT JOIN LATERAL (
         SELECT balance_after FROM utang_transactions
         WHERE customer_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1
       ) latest ON true
       WHERE c.id = $1`,
      [req.params.customerId]
    );
    if (cust.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    const txns = await pool.query(
      `SELECT * FROM utang_transactions WHERE customer_id = $1 ORDER BY created_at ASC, id ASC`,
      [req.params.customerId]
    );
    const charges = txns.rows.filter((t) => t.type === 'charge');
    const payments = txns.rows.filter((t) => t.type === 'payment');
    const cashLoans = txns.rows.filter((t) => t.type === 'cash_loan');
    const cashLoanPayments = txns.rows.filter((t) => t.type === 'cash_loan_payment');
    const saleIds = [...new Set(charges.map((c) => c.sale_id).filter(Boolean))];
    const itemsBySale = {};
    if (saleIds.length > 0) {
      const items = await pool.query(
        `SELECT si.sale_id, si.quantity, si.unit_price, si.subtotal,
                COALESCE(p.name, 'Deleted product') AS product_name
         FROM sale_items si
         LEFT JOIN products p ON p.id = si.product_id
         WHERE si.sale_id = ANY($1)
         ORDER BY si.sale_id ASC, si.id ASC`,
        [saleIds]
      );
      for (const it of items.rows) {
        (itemsBySale[it.sale_id] = itemsBySale[it.sale_id] || []).push({
          product_name: it.product_name,
          quantity: Number(it.quantity),
          unit_price: Number(it.unit_price),
          subtotal: Number(it.subtotal),
        });
      }
    }
    res.json({
      customer: cust.rows[0],
      charges: charges.map((c) => ({
        id: c.id,
        sale_id: c.sale_id,
        created_at: c.created_at,
        amount: Number(c.amount),
        note: c.note,
        items: c.sale_id ? (itemsBySale[c.sale_id] || []) : [],
      })),
      payments: payments.map((p) => ({
        id: p.id,
        created_at: p.created_at,
        amount: Number(p.amount),
        payment_method: p.payment_method,
        note: p.note,
      })),
      cash_loans: cashLoans.map((c) => ({
        id: c.id,
        created_at: c.created_at,
        amount: Number(c.amount),
        note: c.note,
      })),
      cash_loan_payments: cashLoanPayments.map((p) => ({
        id: p.id,
        created_at: p.created_at,
        amount: Number(p.amount),
        payment_method: p.payment_method,
        note: p.note,
      })),
      total_charged: charges.reduce((s, c) => s + Number(c.amount), 0),
      total_paid: payments.reduce((s, p) => s + Number(p.amount), 0),
      total_cash_loaned: cashLoans.reduce((s, c) => s + Number(c.amount), 0),
      total_cash_repaid: cashLoanPayments.reduce((s, p) => s + Number(p.amount), 0),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to build debt statement' });
  }
});

// One customer's full transaction history
app.get('/api/utang/:customerId', requireAuth, async (req, res) => {
  if (!/^\d+$/.test(req.params.customerId)) {
    return res.status(400).json({ error: 'Invalid customer id' });
  }
  try {
    const history = await pool.query(
      `SELECT * FROM utang_transactions WHERE customer_id = $1 ORDER BY created_at DESC, id DESC`,
      [req.params.customerId]
    );
    res.json(history.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch customer history' });
  }
});

// Record a payment against a customer's STORE balance (product credit).
// Store payments ARE counted in the Cash Drawer. Cash-loan repayments must
// use /utang/cash-loan/payment instead (monitoring only, drawer-excluded).
app.post('/api/utang/payment', requireAuth, async (req, res) => {
  const { customer_id, amount, payment_method, note } = req.body;
  if (!customer_id || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Valid customer_id and amount are required' });
  }
  try {
    const lastEntry = await pool.query(
      `SELECT balance_after FROM utang_transactions WHERE customer_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [customer_id]
    );
    const currentBalance = lastEntry.rows.length ? Number(lastEntry.rows[0].balance_after) : 0;

    if (Number(amount) > currentBalance) {
      return res.status(400).json({
        error: `Payment exceeds current balance. Customer owes ₱${currentBalance.toFixed(2)}.`,
      });
    }

    // Keep buckets clean: a store payment may not exceed the store-credit
    // portion (total minus cash-loan outstanding). Anything for a cash loan
    // should go through the cash-loan repayment endpoint instead.
    const cashStat = await pool.query(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'cash_loan'), 0) AS loaned,
              COALESCE(SUM(amount) FILTER (WHERE type = 'cash_loan_payment'), 0) AS repaid
       FROM utang_transactions WHERE customer_id = $1`,
      [customer_id]
    );
    const cashOutstanding = Number(cashStat.rows[0].loaned) - Number(cashStat.rows[0].repaid);
    const storeBalance = currentBalance - cashOutstanding;
    if (Number(amount) > storeBalance + 0.005) {
      return res.status(400).json({
        error: `That exceeds the store-credit balance of ₱${Math.max(storeBalance, 0).toFixed(2)}. Use Cash Repayment for the cash-loan part.`,
      });
    }

    const newBalance = currentBalance - Number(amount);

    const method = payment_method === 'gcash' ? 'gcash' : 'cash';
    const result = await pool.query(
      `INSERT INTO utang_transactions (customer_id, type, amount, balance_after, payment_method, note)
       VALUES ($1, 'payment', $2, $3, $4, $5) RETURNING *`,
      [customer_id, amount, newBalance, method, note || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

// Lend cash to a customer (monitoring only — NOT counted in Cash Drawer).
// Increases the customer's utang balance using type='cash_loan', which all
// drawer queries ignore (they only sum type='charge' / type='payment').
app.post('/api/utang/cash-loan', requireAuth, async (req, res) => {
  const { customer_id, amount, note } = req.body;
  if (!customer_id || !amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Valid customer_id and amount are required' });
  }
  try {
    const cust = await pool.query(`SELECT id, name, credit_limit FROM customers WHERE id = $1`, [customer_id]);
    if (cust.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    const lastEntry = await pool.query(
      `SELECT balance_after FROM utang_transactions WHERE customer_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [customer_id]
    );
    const currentBalance = lastEntry.rows.length ? Number(lastEntry.rows[0].balance_after) : 0;
    const newBalance = currentBalance + Number(amount);
    const creditLimit = Number(cust.rows[0].credit_limit);
    if (newBalance > creditLimit) {
      const available = Math.max(creditLimit - currentBalance, 0);
      return res.status(400).json({
        error: `This loan exceeds ${cust.rows[0].name}'s credit limit. Available credit: ₱${available.toFixed(2)}`,
      });
    }
    const result = await pool.query(
      `INSERT INTO utang_transactions (customer_id, type, amount, balance_after, payment_method, note)
       VALUES ($1, 'cash_loan', $2, $3, 'cash', $4) RETURNING *`,
      [customer_id, Number(amount), newBalance, note || 'Cash loan']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Failed to record cash loan' });
  }
});

// Repay a cash loan (monitoring only — NOT counted in Cash Drawer).
// Uses type='cash_loan_payment', which drawer queries ignore. payment_method
// is stored for info only (cash/gcash).
app.post('/api/utang/cash-loan/payment', requireAuth, async (req, res) => {
  const { customer_id, amount, payment_method, note } = req.body;
  if (!customer_id || !amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Valid customer_id and amount are required' });
  }
  try {
    const lastEntry = await pool.query(
      `SELECT balance_after FROM utang_transactions WHERE customer_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [customer_id]
    );
    const currentBalance = lastEntry.rows.length ? Number(lastEntry.rows[0].balance_after) : 0;
    const cashStat = await pool.query(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE type = 'cash_loan'), 0) AS loaned,
              COALESCE(SUM(amount) FILTER (WHERE type = 'cash_loan_payment'), 0) AS repaid
       FROM utang_transactions WHERE customer_id = $1`,
      [customer_id]
    );
    const cashOutstanding = Number(cashStat.rows[0].loaned) - Number(cashStat.rows[0].repaid);
    if (cashOutstanding <= 0) {
      return res.status(400).json({ error: 'This customer has no outstanding cash loan.' });
    }
    if (Number(amount) > cashOutstanding + 0.005) {
      return res.status(400).json({
        error: `Repayment exceeds cash-loan balance of ₱${cashOutstanding.toFixed(2)}.`,
      });
    }
    if (Number(amount) > currentBalance + 0.005) {
      return res.status(400).json({
        error: `Repayment exceeds total balance of ₱${currentBalance.toFixed(2)}.`,
      });
    }
    const newBalance = currentBalance - Number(amount);
    const method = payment_method === 'gcash' ? 'gcash' : 'cash';
    const result = await pool.query(
      `INSERT INTO utang_transactions (customer_id, type, amount, balance_after, payment_method, note)
       VALUES ($1, 'cash_loan_payment', $2, $3, $4, $5) RETURNING *`,
      [customer_id, Number(amount), newBalance, method, note || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('cash-loan/payment failed:', err);
    res.status(500).json({ error: err.message || 'Failed to record cash-loan repayment' });
  }
});

app.get('/api/transactions', requireAuth, requireRole('owner'), async (req, res) => {
  const { start = '2000-01-01', end = '2100-12-31', type = 'All', status = 'All', page = 1, limit = 10 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);
  const { start: rangeStart, end: rangeEnd } = manilaRangeBounds(start, end);
  const params = [rangeStart, rangeEnd, type, status];

  const cte = `
    WITH combined AS (
      SELECT 'sale' AS source, s.id, s.created_at,
             COALESCE(c.name, '- Walk-in -') AS customer_name,
             s.total_amount AS amount,
             CASE WHEN s.payment_method = 'utang' THEN 'Sale (Utang)'
                  WHEN s.payment_method = 'gcash' THEN 'Sale (GCash)'
                  WHEN s.payment_method = 'split' THEN 'Sale (Split)'
                  ELSE 'Sale (Cash)' END AS type_label,
             s.status
      FROM sales s
      LEFT JOIN customers c ON c.id = s.customer_id

      UNION ALL

      SELECT 'utang_payment' AS source, ut.id, ut.created_at,
             c.name AS customer_name, ut.amount AS amount,
             'Utang Payment' AS type_label, 'completed' AS status
      FROM utang_transactions ut
      JOIN customers c ON c.id = ut.customer_id
      WHERE ut.type = 'payment'

      UNION ALL

      SELECT 'cash_loan' AS source, ut.id, ut.created_at,
             c.name AS customer_name, ut.amount AS amount,
             'Cash Loan' AS type_label, 'completed' AS status
      FROM utang_transactions ut
      JOIN customers c ON c.id = ut.customer_id
      WHERE ut.type = 'cash_loan'

      UNION ALL

      SELECT 'cash_loan_payment' AS source, ut.id, ut.created_at,
             c.name AS customer_name, ut.amount AS amount,
             'Cash Loan Repayment' AS type_label, 'completed' AS status
      FROM utang_transactions ut
      JOIN customers c ON c.id = ut.customer_id
      WHERE ut.type = 'cash_loan_payment'
    )
  `;

  try {
    const rows = await pool.query(
      `${cte}
       SELECT * FROM combined
       WHERE created_at >= $1 AND created_at < $2
         AND ($3 = 'All' OR type_label = $3)
         AND ($4 = 'All' OR status = $4)
       ORDER BY created_at DESC
       LIMIT $5 OFFSET $6`,
      [...params, Number(limit), offset]
    );
    const countResult = await pool.query(
      `${cte}
       SELECT COUNT(*) FROM combined
       WHERE created_at >= $1 AND created_at < $2
         AND ($3 = 'All' OR type_label = $3)
         AND ($4 = 'All' OR status = $4)`,
      params
    );

    res.json({
      transactions: rows.rows,
      total: Number(countResult.rows[0].count),
      page: Number(page),
      limit: Number(limit),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

app.get('/api/transactions/:source/:id', requireAuth, requireRole('owner'), async (req, res) => {
  const { source, id } = req.params;
  try {
    if (source === 'sale') {
      const sale = await pool.query(
        `SELECT s.*, c.name AS customer_name FROM sales s
         LEFT JOIN customers c ON c.id = s.customer_id WHERE s.id = $1`,
        [id]
      );
      if (sale.rows.length === 0) return res.status(404).json({ error: 'Not found' });
      const items = await pool.query(
        `SELECT si.*, p.name AS product_name FROM sale_items si
         JOIN products p ON p.id = si.product_id WHERE si.sale_id = $1`,
        [id]
      );
      return res.json({ source: 'sale', ...sale.rows[0], items: items.rows });
    }

    if (source === 'utang_payment' || source === 'cash_loan' || source === 'cash_loan_payment') {
      const payment = await pool.query(
        `SELECT ut.*, c.name AS customer_name FROM utang_transactions ut
         JOIN customers c ON c.id = ut.customer_id WHERE ut.id = $1`,
        [id]
      );
      if (payment.rows.length === 0) return res.status(404).json({ error: 'Not found' });
      return res.json({ source, ...payment.rows[0] });
    }

    res.status(400).json({ error: 'Invalid source' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch transaction detail' });
  }
});

// Expenses CRUD (simple, no update/delete needed for now)
app.get('/api/expenses', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM expenses ORDER BY created_at DESC LIMIT 20');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

// Delete a single expense (owner only) — e.g. a mistaken entry.
app.delete('/api/expenses/:id', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM expenses WHERE id = $1 RETURNING *', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Expense not found' });
    res.json({ message: 'Expense deleted', expense: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete expense' });
  }
});

// Convert an expense into a profit withdrawal (owner only) — for profit that
// was mistakenly recorded as an expense (which wrongly shrank Net Profit).
// The withdrawal keeps the original date/amount/wallet so the Cash Drawer
// history stays exactly the same; only the profit report is fixed.
app.post('/api/expenses/:id/convert-to-withdrawal', requireAuth, requireRole('owner'), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const exp = await client.query('SELECT * FROM expenses WHERE id = $1', [req.params.id]);
    if (exp.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Expense not found' });
    }
    const e = exp.rows[0];
    const wallet = e.payment_method === 'gcash' ? 'gcash' : 'cash';
    const note = [e.category, e.description].filter(Boolean).join(' — ');
    const wd = await client.query(
      `INSERT INTO profit_withdrawals (amount, source_wallet, note, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [e.amount, wallet, note || 'Converted from expense', req.user.id, e.created_at]
    );
    await client.query('DELETE FROM expenses WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.status(201).json(wd.rows[0]);
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error(err);
    res.status(500).json({ error: 'Failed to convert expense' });
  } finally {
    client.release();
  }
});

app.post('/api/expenses', requireAuth, async (req, res) => {
  const { category, amount, description, payment_method } = req.body;
  const method = payment_method === 'gcash' ? 'gcash' : 'cash';
  if (!category || !amount) {
    return res.status(400).json({ error: 'Category and amount are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO expenses (category, amount, description, payment_method) VALUES ($1, $2, $3, $4) RETURNING *`,
      [category, amount, description, method]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add expense' });
  }
});

// Reports: everything scoped to a date range via query params ?start=YYYY-MM-DD&end=YYYY-MM-DD
app.get('/api/reports', async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) {
    return res.status(400).json({ error: 'start and end query params are required' });
  }
  try {
    const totals = await pool.query(
      `SELECT COALESCE(SUM(total_amount),0) AS total_sales
       FROM sales WHERE created_at::date BETWEEN $1 AND $2 AND status = 'completed'`,
      [start, end]
    );

    const profit = await pool.query(
      `SELECT COALESCE(SUM((si.unit_price - COALESCE(si.cost_price, p.cost_price)) * si.quantity),0) AS gross_profit
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
       JOIN products p ON p.id = si.product_id
       WHERE s.created_at::date BETWEEN $1 AND $2`,
      [start, end]
    );

    const expenseTotal = await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS total_expenses
       FROM expenses WHERE created_at::date BETWEEN $1 AND $2`,
      [start, end]
    );

    const trend = await pool.query(
      `SELECT created_at::date AS day, SUM(total_amount) AS total
       FROM sales WHERE created_at::date BETWEEN $1 AND $2 AND status = 'completed'
       GROUP BY day ORDER BY day`,
      [start, end]
    );

    const categories = await pool.query(
      `SELECT COALESCE(p.category, 'Uncategorized') AS category, SUM(si.subtotal) AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
       JOIN products p ON p.id = si.product_id
       WHERE s.created_at::date BETWEEN $1 AND $2
       GROUP BY p.category
       ORDER BY revenue DESC`,
      [start, end]
    );

    res.json({
      total_sales: Number(totals.rows[0].total_sales),
      gross_profit: Number(profit.rows[0].gross_profit),
      total_expenses: Number(expenseTotal.rows[0].total_expenses),
      trend: trend.rows,
      categories: categories.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load report' });
  }
});

app.get('/api/reports/sales', requireAuth, requireRole('owner'), async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end are required' });
  const { prevStart, prevEnd } = previousPeriod(start, end);
  const { start: rangeStart, end: rangeEnd } = manilaRangeBounds(start, end);
  const { start: prevRangeStart, end: prevRangeEnd } = manilaRangeBounds(prevStart, prevEnd);

  try {
    const current = await pool.query(
      `SELECT COALESCE(SUM(total_amount),0) AS total, COUNT(*) AS count
       FROM sales WHERE created_at >= $1 AND created_at < $2 AND status = 'completed'`,
      [rangeStart, rangeEnd]
    );
    const previous = await pool.query(
      `SELECT COALESCE(SUM(total_amount),0) AS total
       FROM sales WHERE created_at >= $1 AND created_at < $2 AND status = 'completed'`,
      [prevRangeStart, prevRangeEnd]
    );
    const trend = await pool.query(
      `SELECT (created_at AT TIME ZONE 'Asia/Manila')::date AS day, SUM(total_amount) AS total
       FROM sales WHERE created_at >= $1 AND created_at < $2 AND status = 'completed'
       GROUP BY day ORDER BY day`,
      [rangeStart, rangeEnd]
    );
    const categories = await pool.query(
      `SELECT COALESCE(p.category, 'Uncategorized') AS category, SUM(si.subtotal) AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
       JOIN products p ON p.id = si.product_id
       WHERE s.created_at >= $1 AND s.created_at < $2
       GROUP BY p.category ORDER BY revenue DESC`,
      [rangeStart, rangeEnd]
    );

    res.json({
      total_sales: Number(current.rows[0].total),
      transaction_count: Number(current.rows[0].count),
      prev_total_sales: Number(previous.rows[0].total),
      trend: trend.rows.map((r) => ({
        ...r,
        day: r.day instanceof Date
          ? r.day.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
          : String(r.day).slice(0, 10),
      })),
      categories: categories.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load sales report' });
  }
});

app.get('/api/reports/profit', requireAuth, requireRole('owner'), async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end are required' });
  const { prevStart, prevEnd } = previousPeriod(start, end);
  const { start: rangeStart, end: rangeEnd } = manilaRangeBounds(start, end);
  const { start: prevRangeStart, end: prevRangeEnd } = manilaRangeBounds(prevStart, prevEnd);

  try {
    const grossProfit = async (s, e) => {
      const r = await pool.query(
        `SELECT COALESCE(SUM((si.unit_price - COALESCE(si.cost_price, p.cost_price)) * si.quantity),0) AS gross_profit
         FROM sale_items si
         JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
         JOIN products p ON p.id = si.product_id
         WHERE s.created_at >= $1 AND s.created_at < $2`,
        [s, e]
      );
      return Number(r.rows[0].gross_profit);
    };

    const currentGross = await grossProfit(rangeStart, rangeEnd);
    const prevGross = await grossProfit(prevRangeStart, prevRangeEnd);

    const expensesResult = await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE created_at >= $1 AND created_at < $2`,
      [rangeStart, rangeEnd]
    );
    const totalExpenses = Number(expensesResult.rows[0].total);
    const netProfit = currentGross - totalExpenses;
    // Owner's take-home for the period — shown separately, NEVER subtracted
    // from net profit (recording profit-taking as an expense was making net
    // profit go negative).
    let profitTaken = 0;
    try {
      const takenResult = await pool.query(
        `SELECT COALESCE(SUM(amount),0) AS total FROM profit_withdrawals WHERE created_at >= $1 AND created_at < $2`,
        [rangeStart, rangeEnd]
      );
      profitTaken = Number(takenResult.rows[0].total);
    } catch {
      profitTaken = 0;
    }

    const salesResult = await pool.query(
      `SELECT COALESCE(SUM(total_amount),0) AS total FROM sales
       WHERE created_at >= $1 AND created_at < $2 AND status = 'completed'`,
      [rangeStart, rangeEnd]
    );
    const totalSales = Number(salesResult.rows[0].total);

    const trend = await pool.query(
      `SELECT (s.created_at AT TIME ZONE 'Asia/Manila')::date AS day,
              SUM((si.unit_price - COALESCE(si.cost_price, p.cost_price)) * si.quantity) AS profit
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
       JOIN products p ON p.id = si.product_id
       WHERE s.created_at >= $1 AND s.created_at < $2
       GROUP BY day ORDER BY day`,
      [rangeStart, rangeEnd]
    );

    res.json({
      gross_profit: currentGross,
      prev_gross_profit: prevGross,
      total_expenses: totalExpenses,
      total_sales: totalSales,
      net_profit: netProfit,
      profit_taken: profitTaken,
      net_after_withdrawals: netProfit - profitTaken,
      margin_pct: totalSales > 0 ? (netProfit / totalSales) * 100 : 0,
      trend: trend.rows.map((r) => ({
        ...r,
        day: r.day instanceof Date
          ? r.day.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
          : String(r.day).slice(0, 10),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load profit report' });
  }
});

app.get('/api/reports/inventory', requireAuth, requireRole('owner'), async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end are required' });
  const { start: rangeStart, end: rangeEnd } = manilaRangeBounds(start, end);

  try {
    const stockValue = await pool.query(
      `SELECT COALESCE(SUM(cost_price * stock_quantity), 0) AS value FROM products`
    );
    const statusCounts = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE stock_quantity <= 0) AS out_of_stock,
        COUNT(*) FILTER (WHERE stock_quantity > 0 AND stock_quantity <= low_stock_threshold) AS low_stock,
        COUNT(*) FILTER (WHERE stock_quantity > low_stock_threshold) AS available
      FROM products
    `);
    const topMovers = await pool.query(
      `SELECT p.id, p.name, SUM(si.quantity) AS qty_sold
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
       JOIN products p ON p.id = si.product_id
       WHERE s.created_at >= $1 AND s.created_at < $2
       GROUP BY p.id, p.name ORDER BY qty_sold DESC LIMIT 5`,
      [rangeStart, rangeEnd]
    );
    const slowMovers = await pool.query(
      `SELECT p.id, p.name, p.stock_quantity
       FROM products p
       WHERE p.id NOT IN (
         SELECT DISTINCT si.product_id FROM sale_items si
         JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
         WHERE s.created_at >= $1 AND s.created_at < $2
       )
       ORDER BY p.stock_quantity DESC LIMIT 5`,
      [rangeStart, rangeEnd]
    );
    const lowStockList = await pool.query(`
      SELECT p.id, p.name, p.category, p.stock_quantity, p.low_stock_threshold,
             p.units_per_pack, p.unit_label,
             COALESCE(sold.qty, 0) AS qty_sold
      FROM products p
      LEFT JOIN (
        SELECT si.product_id AS pid, SUM(si.quantity) AS qty
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
        WHERE s.created_at >= $1 AND s.created_at < $2
        GROUP BY si.product_id
      ) sold ON sold.pid = p.id
      WHERE p.stock_quantity > 0 AND p.stock_quantity <= p.low_stock_threshold
      ORDER BY p.stock_quantity ASC
    `, [rangeStart, rangeEnd]);
    const outOfStockList = await pool.query(`
      SELECT p.id, p.name, p.category, p.stock_quantity, p.low_stock_threshold,
             p.units_per_pack, p.unit_label,
             COALESCE(sold.qty, 0) AS qty_sold
      FROM products p
      LEFT JOIN (
        SELECT si.product_id AS pid, SUM(si.quantity) AS qty
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
        WHERE s.created_at >= $1 AND s.created_at < $2
        GROUP BY si.product_id
      ) sold ON sold.pid = p.id
      WHERE p.stock_quantity <= 0
      ORDER BY p.name ASC
    `, [rangeStart, rangeEnd]);

    res.json({
      total_stock_value: Number(stockValue.rows[0].value),
      out_of_stock: Number(statusCounts.rows[0].out_of_stock),
      low_stock: Number(statusCounts.rows[0].low_stock),
      available: Number(statusCounts.rows[0].available),
      top_movers: topMovers.rows,
      slow_movers: slowMovers.rows,
      low_stock_list: lowStockList.rows,
      out_of_stock_list: outOfStockList.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load inventory report' });
  }
});

app.get('/api/reports/utang', requireAuth, requireRole('owner'), async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end are required' });
  const { start: rangeStart, end: rangeEnd } = manilaRangeBounds(start, end);

  try {
    const outstanding = await pool.query(`
      SELECT COALESCE(SUM(balance_after), 0) AS total
      FROM (
        SELECT DISTINCT ON (customer_id) customer_id, balance_after
        FROM utang_transactions ORDER BY customer_id, created_at DESC, id DESC
      ) latest WHERE balance_after > 0
    `);
    const periodActivity = await pool.query(
      `SELECT
        COALESCE(SUM(amount) FILTER (WHERE type = 'charge'), 0) AS charged,
        COALESCE(SUM(amount) FILTER (WHERE type = 'payment'), 0) AS paid,
        COALESCE(SUM(amount) FILTER (WHERE type = 'cash_loan'), 0) AS cash_loaned,
        COALESCE(SUM(amount) FILTER (WHERE type = 'cash_loan_payment'), 0) AS cash_repaid
       FROM utang_transactions WHERE created_at >= $1 AND created_at < $2`,
      [rangeStart, rangeEnd]
    );
    const topDebtors = await pool.query(`
      SELECT c.id, c.name, latest.balance_after AS balance
      FROM customers c
      JOIN LATERAL (
        SELECT balance_after FROM utang_transactions
        WHERE customer_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1
      ) latest ON true
      WHERE latest.balance_after > 0
      ORDER BY latest.balance_after DESC LIMIT 5
    `);

    res.json({
      total_outstanding: Number(outstanding.rows[0].total),
      charged_this_period: Number(periodActivity.rows[0].charged),
      paid_this_period: Number(periodActivity.rows[0].paid),
      cash_loaned_this_period: Number(periodActivity.rows[0].cash_loaned),
      cash_repaid_this_period: Number(periodActivity.rows[0].cash_repaid),
      top_debtors: topDebtors.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load utang report' });
  }
});

app.get('/api/reports/product-sales', requireAuth, requireRole('owner'), async (req, res) => {
  const { product_id, category, start, end, granularity = 'day' } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end are required' });
  const { start: rangeStart, end: rangeEnd } = manilaRangeBounds(start, end);
  const validGran = ['day','week','month'];
  const gran = validGran.includes(granularity) ? granularity : 'day';
  try {
    let groupExpr;
    if (gran === 'day') {
      groupExpr = `(s.created_at AT TIME ZONE 'Asia/Manila')::date`;
    } else if (gran === 'week') {
      groupExpr = `date_trunc('week', s.created_at AT TIME ZONE 'Asia/Manila')::date`;
    } else {
      groupExpr = `date_trunc('month', s.created_at AT TIME ZONE 'Asia/Manila')::date`;
    }
    const params = [rangeStart, rangeEnd];
    let productFilter = '';
    let categoryFilter = '';
    let categoryJoin = '';
    if (product_id) {
      productFilter = `AND si.product_id = $${params.length + 1}`;
      params.push(product_id);
    }
    if (category) {
      categoryFilter = `AND p.category = $${params.length + 1}`;
      categoryJoin = `JOIN products p ON p.id = si.product_id`;
      params.push(category);
      // need p join for category filter even if product_id not set, ensure join exists
      if (!product_id) {
        // already have join for category, no extra
      }
    } else if (product_id) {
      // need join for product filter? si already has product_id, no need
    }
    // For trend, need to handle category filter which requires join
    const trendJoin = category ? `JOIN products p ON p.id = si.product_id` : '';
    const trendCategoryFilter = category ? `AND p.category = $${params.length}` : '';
    // Actually params already includes category if present, so use same
    const trend = await pool.query(`
      SELECT ${groupExpr} AS period,
             SUM(si.quantity) AS qty_sold,
             SUM(si.subtotal) AS revenue,
             COUNT(DISTINCT s.id) AS transactions
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id AND s.status='completed'
      ${trendJoin}
      WHERE s.created_at >= $1 AND s.created_at < $2 ${productFilter} ${trendCategoryFilter}
      GROUP BY 1
      ORDER BY 1
    `, params);
    const total = await pool.query(`
      SELECT COALESCE(SUM(si.quantity),0) AS total_qty,
             COALESCE(SUM(si.subtotal),0) AS total_revenue,
             COUNT(DISTINCT s.id) AS total_transactions
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id AND s.status='completed'
      ${trendJoin}
      WHERE s.created_at >= $1 AND s.created_at < $2 ${productFilter} ${trendCategoryFilter}
    `, params);
    // For top products, filter by category if selected, and respect date range
    let topProducts = { rows: [] };
    if (!product_id) {
      const topParams = [rangeStart, rangeEnd];
      let topCategoryFilter = '';
      if (category) {
        topCategoryFilter = `AND p.category = $3`;
        topParams.push(category);
      }
      topProducts = await pool.query(`
        SELECT p.id, p.name, p.category, p.stock_quantity, p.units_per_pack, p.unit_label, SUM(si.quantity) AS qty_sold, SUM(si.subtotal) AS revenue
        FROM sale_items si
        JOIN sales s ON s.id = si.sale_id AND s.status='completed'
        JOIN products p ON p.id = si.product_id
        WHERE s.created_at >= $1 AND s.created_at < $2 ${topCategoryFilter}
        GROUP BY p.id, p.name, p.category, p.stock_quantity, p.units_per_pack, p.unit_label
        ORDER BY qty_sold DESC
      `, topParams);
    }
    res.json({
      granularity: gran,
      trend: trend.rows.map(r => ({ period: r.period instanceof Date ? r.period.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) : String(r.period).slice(0, 10), qty_sold: Number(r.qty_sold), revenue: Number(r.revenue), transactions: Number(r.transactions) })),
      total_qty: Number(total.rows[0].total_qty),
      total_revenue: Number(total.rows[0].total_revenue),
      total_transactions: Number(total.rows[0].total_transactions),
      top_products: topProducts.rows.map(r => ({ ...r, qty_sold: Number(r.qty_sold), revenue: Number(r.revenue), stock_quantity: Number(r.stock_quantity ?? 0) })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load product sales report' });
  }
});

app.get('/api/reports/expenses', requireAuth, requireRole('owner'), async (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end are required' });
  const { prevStart, prevEnd } = previousPeriod(start, end);
  const { start: rangeStart, end: rangeEnd } = manilaRangeBounds(start, end);
  const { start: prevRangeStart, end: prevRangeEnd } = manilaRangeBounds(prevStart, prevEnd);

  try {
    const current = await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE created_at >= $1 AND created_at < $2`,
      [rangeStart, rangeEnd]
    );
    const previous = await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE created_at >= $1 AND created_at < $2`,
      [prevRangeStart, prevRangeEnd]
    );
    const cashCurrent = await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE created_at >= $1 AND created_at < $2 AND (payment_method='cash' OR payment_method IS NULL)`,
      [rangeStart, rangeEnd]
    );
    const gcashCurrent = await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE created_at >= $1 AND created_at < $2 AND payment_method='gcash'`,
      [rangeStart, rangeEnd]
    );
    const cashPrev = await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE created_at >= $1 AND created_at < $2 AND (payment_method='cash' OR payment_method IS NULL)`,
      [prevRangeStart, prevRangeEnd]
    );
    const gcashPrev = await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE created_at >= $1 AND created_at < $2 AND payment_method='gcash'`,
      [prevRangeStart, prevRangeEnd]
    );
    const byCategory = await pool.query(
      `SELECT category, SUM(amount) AS total FROM expenses
       WHERE created_at >= $1 AND created_at < $2
       GROUP BY category ORDER BY total DESC`,
      [rangeStart, rangeEnd]
    );
    const byPayment = await pool.query(
      `SELECT COALESCE(payment_method,'cash') AS payment_method, SUM(amount) AS total FROM expenses
       WHERE created_at >= $1 AND created_at < $2
       GROUP BY payment_method`,
      [rangeStart, rangeEnd]
    );
    const recent = await pool.query(
      `SELECT * FROM expenses WHERE created_at >= $1 AND created_at < $2
       ORDER BY created_at DESC LIMIT 20`,
      [rangeStart, rangeEnd]
    );

    res.json({
      total_expenses: Number(current.rows[0].total),
      prev_total_expenses: Number(previous.rows[0].total),
      cash_total: Number(cashCurrent.rows[0].total),
      gcash_total: Number(gcashCurrent.rows[0].total),
      prev_cash_total: Number(cashPrev.rows[0].total),
      prev_gcash_total: Number(gcashPrev.rows[0].total),
      by_category: byCategory.rows,
      by_payment: byPayment.rows,
      recent: recent.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load expenses report' });
  }
});

// Bulk restock: add stock to many products in one tap (audit-style).
// Body: { items: [{ product_id, quantity (pieces), cost_price (per piece, optional) }], payment_method: 'cash'|'gcash' }
// The total purchase cost (qty × effective cost/piece — new cost if given,
// otherwise the product's current cost) is auto-recorded as a Restock
// expense so the Cash Drawer deducts it immediately.
app.post('/api/products/restock/bulk', requireAuth, requireRole('owner'), async (req, res) => {
  const { items, payment_method } = req.body;
  const method = payment_method === 'gcash' ? 'gcash' : 'cash';
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No stock-in entries to save' });
  }
  if (items.length > 500) return res.status(400).json({ error: 'Too many items at once (max 500)' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const batchId = crypto.randomUUID();
    const saved = [];
    let totalCost = 0;
    const descParts = [];
    for (const it of items) {
      const qty = Number(it.quantity);
      if (!it.product_id || !Number.isFinite(qty) || qty <= 0) {
        throw new Error('Each entry needs a product and a quantity greater than 0');
      }
      const cost = it.cost_price === '' || it.cost_price == null ? null : Number(it.cost_price);
      if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
        throw new Error('Cost price cannot be negative');
      }
      const before = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [it.product_id]);
      if (before.rows.length === 0) throw new Error(`Product #${it.product_id} not found`);
      const prev = before.rows[0];
      const oldQty = Number(prev.stock_quantity);
      const oldCost = prev.cost_price == null ? null : Number(prev.cost_price);
      const result = await client.query(
        `UPDATE products
         SET stock_quantity = stock_quantity + $1,
             cost_price = COALESCE($2, cost_price)
         WHERE id = $3
         RETURNING *`,
        [qty, cost, it.product_id]
      );
      if (result.rows.length === 0) throw new Error(`Product #${it.product_id} not found`);
      const updated = result.rows[0];
      await client.query(
        `INSERT INTO restock_logs (product_id, product_name, qty_added, old_qty, new_qty, old_cost, new_cost, created_by, batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [updated.id, updated.name, qty, oldQty, Number(updated.stock_quantity), oldCost, updated.cost_price == null ? null : Number(updated.cost_price), req.user.id, batchId]
      );
      saved.push(result.rows[0]);
      // Drawer deduction: new cost if supplied, else the kept current cost.
      const effectiveCost = cost !== null ? cost : (oldCost || 0);
      totalCost += qty * effectiveCost;
      descParts.push(`${updated.name} +${qty}`);
    }
    totalCost = Math.round(totalCost * 100) / 100;
    let expense = null;
    if (totalCost > 0) {
      const preview = descParts.slice(0, 3).join(', ') + (descParts.length > 3 ? ` +${descParts.length - 3} more` : '');
      const expRes = await client.query(
        `INSERT INTO expenses (category, amount, description, payment_method) VALUES ('Restock', $1, $2, $3) RETURNING *`,
        [totalCost, `Stock in: ${preview}`, method]
      );
      expense = expRes.rows[0];
    }
    await client.query('COMMIT');
    res.status(201).json({ saved, count: saved.length, batch_id: batchId, total_cost: totalCost, expense });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to save stock-in' });
  } finally {
    client.release();
  }
});

app.post('/api/products/:id/restock', requireAuth, requireRole('owner'), async (req, res) => {
  const { quantity, cost_price, payment_method } = req.body;
  const method = payment_method === 'gcash' ? 'gcash' : 'cash';
  const qty = Number(quantity);

  if (!qty || qty <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive number' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const before = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [req.params.id]);
    if (before.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Product not found' });
    }
    const prev = before.rows[0];
    const oldQty = Number(prev.stock_quantity);
    const oldCost = prev.cost_price == null ? null : Number(prev.cost_price);
    const cost = cost_price === '' || cost_price == null ? null : Number(cost_price);
    if (cost !== null && (!Number.isFinite(cost) || cost < 0)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cost price cannot be negative' });
    }
    const result = await client.query(
      `UPDATE products
       SET stock_quantity = stock_quantity + $1,
           cost_price = COALESCE($2, cost_price)
       WHERE id = $3
       RETURNING *`,
      [qty, cost, req.params.id]
    );
    const updated = result.rows[0];
    await client.query(
      `INSERT INTO restock_logs (product_id, product_name, qty_added, old_qty, new_qty, old_cost, new_cost, created_by, batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [updated.id, updated.name, qty, oldQty, Number(updated.stock_quantity), oldCost, updated.cost_price == null ? null : Number(updated.cost_price), req.user.id, crypto.randomUUID()]
    );
    // Drawer deduction: new cost if supplied, else the kept current cost.
    const effectiveCost = cost !== null ? cost : (oldCost || 0);
    const totalCost = Math.round(qty * effectiveCost * 100) / 100;
    let expense = null;
    if (totalCost > 0) {
      const expRes = await client.query(
        `INSERT INTO expenses (category, amount, description, payment_method) VALUES ('Restock', $1, $2, $3) RETURNING *`,
        [totalCost, `Stock in: ${updated.name} +${qty}`, method]
      );
      expense = expRes.rows[0];
    }
    await client.query('COMMIT');
    res.json({ ...updated, total_cost: totalCost, expense });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (_) {}
    console.error(err);
    res.status(500).json({ error: 'Failed to restock product' });
  } finally {
    client.release();
  }
});

// Transaction-style restock history: one entry per Confirm (batch), with
// nested line items — mirrors how sales transactions read in history.
app.get('/api/restock-logs', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT rl.*, u.name AS created_by_name FROM restock_logs rl
       LEFT JOIN users u ON u.id = rl.created_by
       ORDER BY rl.created_at DESC LIMIT 500`
    );
    const groups = new Map();
    for (const r of result.rows) {
      // Pre-batch rows (batch_id NULL) each stand as their own single-item entry
      const key = r.batch_id || `single-${r.id}`;
      if (!groups.has(key)) {
        groups.set(key, {
          batch_id: r.batch_id || `single-${r.id}`,
          created_at: r.created_at,
          created_by: r.created_by,
          created_by_name: r.created_by_name,
          item_count: 0,
          total_qty: 0,
          items: [],
        });
      }
      const g = groups.get(key);
      g.items.push(r);
      g.item_count = g.items.length;
      g.total_qty = g.items.reduce((n, it) => n + Number(it.qty_added || 0), 0);
      if (new Date(r.created_at) > new Date(g.created_at)) g.created_at = r.created_at;
    }
    res.json([...groups.values()].slice(0, 100));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load restock history' });
  }
});

// --- Repack / convert: turn units of one product into units of another ---
// e.g. 2 packs of 1/4 Sugar -> 15 pcs of P2 Sugar, or 1 twin-pack coffee -> 2 singles.
// Atomic: deducts source, adds destination, logs to repack_logs (costs untouched).
app.post('/api/products/repack', requireAuth, requireRole('owner'), async (req, res) => {
  const { source_product_id, source_qty, dest_product_id, dest_qty, notes } = req.body;
  const useQty = Number(source_qty);
  const makeQty = Number(dest_qty);
  const srcId = Number(source_product_id);
  const dstId = Number(dest_product_id);

  if (!srcId || !dstId) return res.status(400).json({ error: 'Source and destination products are required' });
  if (srcId === dstId) return res.status(400).json({ error: 'Source and destination must be different products' });
  if (!Number.isFinite(useQty) || useQty <= 0) return res.status(400).json({ error: 'Quantity used must be greater than 0' });
  if (!Number.isFinite(makeQty) || makeQty <= 0) return res.status(400).json({ error: 'Quantity produced must be greater than 0' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rows = await client.query(
      `SELECT * FROM products WHERE id = ANY($1) ORDER BY id FOR UPDATE`,
      [[srcId, dstId]]
    );
    const src = rows.rows.find((p) => Number(p.id) === srcId);
    const dst = rows.rows.find((p) => Number(p.id) === dstId);
    if (!src) throw new Error('Source product not found');
    if (!dst) throw new Error('Destination product not found');
    if (Number(src.stock_quantity) < useQty) {
      throw new Error(`Not enough ${src.name} — only ${src.stock_quantity} in stock.`);
    }
    const updSrc = await client.query(
      `UPDATE products SET stock_quantity = stock_quantity - $1 WHERE id = $2 RETURNING *`,
      [useQty, srcId]
    );
    const updDst = await client.query(
      `UPDATE products SET stock_quantity = stock_quantity + $1 WHERE id = $2 RETURNING *`,
      [makeQty, dstId]
    );
    const log = await client.query(
      `INSERT INTO repack_logs (source_product_id, source_name, source_qty, dest_product_id, dest_name, dest_qty, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [srcId, src.name, useQty, dstId, dst.name, makeQty, notes || null, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json({ source: updSrc.rows[0], dest: updDst.rows[0], log: log.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(400).json({ error: err.message || 'Failed to repack' });
  } finally {
    client.release();
  }
});

app.get('/api/repack-logs', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT rl.*, u.name AS created_by_name FROM repack_logs rl
       LEFT JOIN users u ON u.id = rl.created_by
       ORDER BY rl.created_at DESC LIMIT 30`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load repack history' });
  }
});

// --- Stock audit / shrinkage ---
// Record a physical count. System stock is corrected to counted_qty and the
// variance is logged with a reason (unrecorded sale, theft, damaged, ...).
app.get('/api/stock-adjustments', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sa.*, u.name AS created_by_name FROM stock_adjustments sa
       LEFT JOIN users u ON u.id = sa.created_by
       ORDER BY sa.created_at DESC LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load stock adjustments' });
  }
});

app.get('/api/stock-adjustments/summary', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const r = await pool.query(`
      SELECT
        COUNT(*) AS total_counts,
        COUNT(*) FILTER (WHERE difference < 0) AS shortage_counts,
        COUNT(*) FILTER (WHERE difference > 0) AS overage_counts,
        COALESCE(SUM(cost_impact) FILTER (WHERE difference < 0), 0) AS shortage_value,
        COALESCE(SUM(ABS(difference)) FILTER (WHERE reason = 'unrecorded_sale'), 0) AS unrecorded_units,
        COALESCE(SUM(cost_impact) FILTER (WHERE reason = 'unrecorded_sale'), 0) AS unrecorded_value,
        COALESCE(SUM(cost_impact) FILTER (WHERE reason = 'theft'), 0) AS theft_value
      FROM stock_adjustments
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);
    const row = r.rows[0];
    res.json({
      total_counts: Number(row.total_counts),
      shortage_counts: Number(row.shortage_counts),
      overage_counts: Number(row.overage_counts),
      shortage_value: Number(row.shortage_value),
      unrecorded_units: Number(row.unrecorded_units),
      unrecorded_value: Number(row.unrecorded_value),
      theft_value: Number(row.theft_value),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load audit summary' });
  }
});

app.post('/api/stock-adjustments', requireAuth, requireRole('owner'), async (req, res) => {
  const { product_id, counted_qty, reason, notes } = req.body;
  const validReasons = ['unrecorded_sale', 'theft', 'damaged', 'expired', 'miscount_correction', 'supplier_shortage', 'return_correction', 'other'];
  const useReason = validReasons.includes(reason) ? reason : 'unrecorded_sale';
  const counted = Number(counted_qty);
  if (!product_id) return res.status(400).json({ error: 'Product is required' });
  if (!Number.isFinite(counted) || counted < 0) {
    return res.status(400).json({ error: 'Counted quantity must be 0 or more' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const prod = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [product_id]);
    if (prod.rows.length === 0) throw new Error('Product not found');
    const p = prod.rows[0];
    const systemQty = Number(p.stock_quantity);
    const diff = counted - systemQty;
    if (diff === 0) throw new Error('No variance — counted matches system stock.');
    const costImpact = diff * Number(p.cost_price || 0);
    await client.query('UPDATE products SET stock_quantity = $1 WHERE id = $2', [counted, product_id]);
    const log = await client.query(
      `INSERT INTO stock_adjustments (product_id, product_name, system_qty, counted_qty, difference, reason, notes, cost_impact, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [product_id, p.name, systemQty, counted, diff, useReason, notes || null, costImpact, req.user.id]
    );
    await client.query('COMMIT');
    res.status(201).json(log.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message || 'Failed to save audit' });
  } finally {
    client.release();
  }
});

// Bulk shelf count: update many products in one tap. Items with no variance
// are skipped (not errors); unknown products abort the whole batch.
app.post('/api/stock-adjustments/bulk', requireAuth, requireRole('owner'), async (req, res) => {
  const { items, reason, notes } = req.body;
  const validReasons = ['unrecorded_sale', 'theft', 'damaged', 'expired', 'miscount_correction', 'supplier_shortage', 'return_correction', 'other'];
  const useReason = validReasons.includes(reason) ? reason : 'unrecorded_sale';
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'No counts to save' });
  }
  if (items.length > 500) return res.status(400).json({ error: 'Too many items at once (max 500)' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const saved = [];
    const skipped = [];
    for (const it of items) {
      const counted = Number(it.counted_qty);
      if (!it.product_id || !Number.isFinite(counted) || counted < 0) {
        throw new Error('Each count needs a product and a quantity of 0 or more');
      }
      const prod = await client.query('SELECT * FROM products WHERE id = $1 FOR UPDATE', [it.product_id]);
      if (prod.rows.length === 0) throw new Error(`Product #${it.product_id} not found`);
      const p = prod.rows[0];
      const systemQty = Number(p.stock_quantity);
      const diff = counted - systemQty;
      if (diff === 0) {
        skipped.push({ product_id: p.id, product_name: p.name });
        continue;
      }
      const costImpact = diff * Number(p.cost_price || 0);
      await client.query('UPDATE products SET stock_quantity = $1 WHERE id = $2', [counted, p.id]);
      const log = await client.query(
        `INSERT INTO stock_adjustments (product_id, product_name, system_qty, counted_qty, difference, reason, notes, cost_impact, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [p.id, p.name, systemQty, counted, diff, useReason, notes || null, costImpact, req.user.id]
      );
      saved.push(log.rows[0]);
    }
    await client.query('COMMIT');
    res.status(201).json({ saved, skipped });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message || 'Failed to save counts' });
  } finally {
    client.release();
  }
});

async function computeExpectedCash(openingCash, startTime, endTime, client = pool, expenseStart = null) {
  // Sales/utang count from startTime, but expenses can start later (after a
  // drawer reset, pre-reset expenses such as a manual "zeroing" entry are ignored).
  const expStart = expenseStart || startTime;
  const cashSales = await client.query(
    `SELECT COALESCE(SUM(
       CASE
         WHEN payment_method = 'cash' THEN total_amount
         WHEN payment_method = 'split' THEN amount_tendered
         ELSE 0
       END
     ), 0) AS total
     FROM sales
     WHERE status = 'completed' AND created_at BETWEEN $1 AND $2`,
    [startTime, endTime]
  );
  const gcashSales = await client.query(
    `SELECT COALESCE(SUM(
       CASE
         WHEN payment_method = 'gcash' THEN total_amount
         WHEN payment_method = 'split' THEN COALESCE(gcash_amount, 0)
         ELSE 0
       END
     ), 0) AS total
     FROM sales
     WHERE status = 'completed' AND created_at BETWEEN $1 AND $2`,
    [startTime, endTime]
  );
  const cashUtangPayments = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM utang_transactions
     WHERE type = 'payment' AND payment_method = 'cash' AND created_at BETWEEN $1 AND $2`,
    [startTime, endTime]
  );
  const gcashUtangPayments = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM utang_transactions
     WHERE type = 'payment' AND payment_method = 'gcash' AND created_at BETWEEN $1 AND $2`,
    [startTime, endTime]
  );
  const utangCharged = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM utang_transactions
     WHERE type = 'charge' AND created_at BETWEEN $1 AND $2`,
    [startTime, endTime]
  );
  const cashExpenses = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM expenses WHERE created_at BETWEEN $1 AND $2 AND (payment_method = 'cash' OR payment_method IS NULL)`,
    [expStart, endTime]
  );
  const gcashExpenses = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM expenses WHERE created_at BETWEEN $1 AND $2 AND payment_method = 'gcash'`,
    [expStart, endTime]
  );
  const totalExpenses = Number(cashExpenses.rows[0].total) + Number(gcashExpenses.rows[0].total);

  // No starting cash: expected is just today's actual cash sales
  // (cash sales + cash utang payments). Opening is always 0 — the user
  // counts the drawer every morning and takes the cash to their wallet,
  // so nothing carries over. `openingCash` param is kept for compat but ignored.
  void openingCash;
  const expectedCash =
    Number(cashSales.rows[0].total) +
    Number(cashUtangPayments.rows[0].total);
  const expectedGcash =
    Number(gcashSales.rows[0].total) +
    Number(gcashUtangPayments.rows[0].total);

  const cashInHand =
    expectedCash - Number(cashExpenses.rows[0].total);
  const gcashInHand =
    expectedGcash - Number(gcashExpenses.rows[0].total);

  return {
    cash_sales: Number(cashSales.rows[0].total),
    gcash_sales: Number(gcashSales.rows[0].total),
    cash_utang_payments: Number(cashUtangPayments.rows[0].total),
    gcash_utang_payments: Number(gcashUtangPayments.rows[0].total),
    utang_charged: Number(utangCharged.rows[0].total),
    cash_expenses: Number(cashExpenses.rows[0].total),
    gcash_expenses: Number(gcashExpenses.rows[0].total),
    expenses: totalExpenses,
    // Expected is total sale for the day (no expense deduction) — used for Today's pending & close Expected
    expected_cash: expectedCash,
    expected_gcash: expectedGcash,
    // Actual drawer with expenses — used for counted KPI via closed logic, kept for legacy
    total_cash: cashInHand,
    total_gcash: gcashInHand,
  };
}

function manilaToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

function manilaDayBounds(dateStr) {
  const start = new Date(`${dateStr}T00:00:00+08:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

function manilaRangeBounds(startDateStr, endDateStr) {
  const { start } = manilaDayBounds(startDateStr);
  const { end } = manilaDayBounds(endDateStr);
  return { start, end };
}

function addDaysToManilaDate(dateStr, deltaDays) {
  const d = new Date(`${dateStr}T12:00:00+08:00`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

// DATE columns come back from pg as JS Dates at midnight in the DB/server
// timezone, so .toISOString().slice(0,10) shifts a Manila date back one day
// (e.g. Sep 11 00:00+08 -> Sep 10 in UTC). Always format in Asia/Manila.
function dbDateToManila(dateVal) {
  if (dateVal == null) return null;
  if (typeof dateVal === 'string') return dateVal.slice(0, 10);
  return dateVal.toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}

async function ensureTodayShift() {
  const today = manilaToday();
  let result = await pool.query(`SELECT * FROM cash_shifts WHERE shift_date = $1`, [today]);
  if (result.rows.length === 0) {
    // No starting cash / no carry-over: every morning starts at 0.
    // The user counts the actual cash drawer and takes it to their wallet,
    // then the KPI simply accumulates each day's counted actual.
    result = await pool.query(
      `INSERT INTO cash_shifts (shift_date, status, opening_cash) VALUES ($1, 'active', 0) RETURNING *`,
      [today]
    );
  } else if (result.rows[0].opening_cash === null) {
    await pool.query(`UPDATE cash_shifts SET opening_cash = 0 WHERE shift_date = $1 AND opening_cash IS NULL`, [today]);
    result = await pool.query(`SELECT * FROM cash_shifts WHERE shift_date = $1`, [today]);
  } else if (Number(result.rows[0].opening_cash) !== 0 && result.rows[0].status === 'active') {
    // Normalize any legacy carried-over opening back to 0 for active days.
    await pool.query(`UPDATE cash_shifts SET opening_cash = 0 WHERE shift_date = $1 AND status = 'active'`, [today]);
    result = await pool.query(`SELECT * FROM cash_shifts WHERE shift_date = $1`, [today]);
  }
  return result.rows[0];
}

async function freezeStaleShifts() {
  const today = manilaToday();
  const stale = await pool.query(
    `SELECT * FROM cash_shifts WHERE status = 'active' AND shift_date < $1`,
    [today]
  );
  for (const shift of stale.rows) {
    const dateStr = dbDateToManila(shift.shift_date);
    // No starting cash: normalize opening to 0.
    const opening = 0;
    if (shift.opening_cash === null || Number(shift.opening_cash) !== 0) {
      await pool.query(`UPDATE cash_shifts SET opening_cash = 0 WHERE id = $1`, [shift.id]);
    }
    const { start, end } = manilaDayBounds(dateStr);
    const running = await computeExpectedCash(0, start, end);
    await pool.query(
      `UPDATE cash_shifts SET status = 'pending_count', expected_cash = $1, gcash_sales = $2, utang_charged = $3,
        cash_sales = $4, cash_utang_payments = $5, gcash_utang_payments = $6,
        cash_expenses = $7, gcash_expenses = $8, expected_gcash = $9 WHERE id = $10`,
      [running.expected_cash, running.gcash_sales, running.utang_charged,
       running.cash_sales, running.cash_utang_payments, running.gcash_utang_payments,
       running.cash_expenses, running.gcash_expenses, running.expected_gcash, shift.id]
    );
  }
}

app.get('/api/shift/current', requireAuth, async (req, res) => {
  try {
    await ensureTodayShift();
    await freezeStaleShifts();

    const today = manilaToday();
    const todayResult = await pool.query(
      `SELECT cs.*, u.name AS opened_by_name FROM cash_shifts cs
       LEFT JOIN users u ON u.id = cs.opened_by WHERE shift_date = $1`,
      [today]
    );
    const shift = todayResult.rows[0];
    // Reset is date-level for sales (today's sales from 00:00 still count),
    // but expenses before the reset moment are ignored (e.g. a manual
    // "zeroing" entry stays in history without deducting from the drawer).
    const resetAt = await getDrawerResetAt();
    const { start } = manilaDayBounds(today);
    const expenseStart = resetAt && resetAt > start ? resetAt : start;
    const running = await computeExpectedCash(shift.opening_cash || 0, start, new Date(), pool, expenseStart);

    const pending = await pool.query(
      `SELECT cs.*, u.name AS opened_by_name FROM cash_shifts cs
       LEFT JOIN users u ON u.id = cs.opened_by
       WHERE status = 'pending_count' ORDER BY shift_date ASC`
    );

    // Closed totals: all sales from yesterday and so on (only days already counted as closed)
    // Don't include today's active sales until counted.
    // After a reset there are no closed rows, so old history is ignored while
    // today's sales/expenses from 00:00 still count via `running` above.
    const closedCashSales = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN s.payment_method='cash' THEN s.total_amount WHEN s.payment_method='split' THEN s.amount_tendered ELSE 0 END),0) AS total
      FROM sales s
      WHERE s.status='completed' AND (s.created_at AT TIME ZONE 'Asia/Manila')::date IN (SELECT shift_date FROM cash_shifts WHERE status='closed')
    `);
    const closedGcashSales = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN s.payment_method='gcash' THEN s.total_amount WHEN s.payment_method='split' THEN COALESCE(s.gcash_amount,0) ELSE 0 END),0) AS total FROM sales s
      WHERE s.status='completed' AND (s.created_at AT TIME ZONE 'Asia/Manila')::date IN (SELECT shift_date FROM cash_shifts WHERE status='closed')
    `);
    const closedCashPayments = await pool.query(`
      SELECT COALESCE(SUM(amount),0) AS total FROM utang_transactions
      WHERE type='payment' AND payment_method='cash' AND (created_at AT TIME ZONE 'Asia/Manila')::date IN (SELECT shift_date FROM cash_shifts WHERE status='closed')
    `);
    const closedGcashPayments = await pool.query(`
      SELECT COALESCE(SUM(amount),0) AS total FROM utang_transactions
      WHERE type='payment' AND payment_method='gcash' AND (created_at AT TIME ZONE 'Asia/Manila')::date IN (SELECT shift_date FROM cash_shifts WHERE status='closed')
    `);
    const closedCashExpenses = await pool.query(`
      SELECT COALESCE(SUM(amount),0) AS total FROM expenses
      WHERE (payment_method='cash' OR payment_method IS NULL) AND (created_at AT TIME ZONE 'Asia/Manila')::date IN (SELECT shift_date FROM cash_shifts WHERE status='closed')
        AND ($1::timestamptz IS NULL OR created_at >= $1)
    `, [resetAt]);
    const closedGcashExpenses = await pool.query(`
      SELECT COALESCE(SUM(amount),0) AS total FROM expenses
      WHERE payment_method='gcash' AND (created_at AT TIME ZONE 'Asia/Manila')::date IN (SELECT shift_date FROM cash_shifts WHERE status='closed')
        AND ($1::timestamptz IS NULL OR created_at >= $1)
    `, [resetAt]);
    // Profit withdrawals behave like expenses for the drawer (deduct cash),
    // but live in their own table so profit reports stay correct.
    const closedCashWithdrawals = await pool.query(`
      SELECT COALESCE(SUM(amount),0) AS total FROM profit_withdrawals
      WHERE (source_wallet='cash' OR source_wallet IS NULL) AND (created_at AT TIME ZONE 'Asia/Manila')::date IN (SELECT shift_date FROM cash_shifts WHERE status='closed')
        AND ($1::timestamptz IS NULL OR created_at >= $1)
    `, [resetAt]);
    const closedGcashWithdrawals = await pool.query(`
      SELECT COALESCE(SUM(amount),0) AS total FROM profit_withdrawals
      WHERE source_wallet='gcash' AND (created_at AT TIME ZONE 'Asia/Manila')::date IN (SELECT shift_date FROM cash_shifts WHERE status='closed')
        AND ($1::timestamptz IS NULL OR created_at >= $1)
    `, [resetAt]);
    // KPI accumulates every counted actual: each morning the user counts the
    // drawer and takes it to their wallet, so total = SUM of all closing_cash.
    // opening_cash is always 0 now, so SUM(closing - opening) == SUM(closing)
    // while staying compatible with legacy carried-over rows.
    const closedActualRes = await pool.query(`
      SELECT COUNT(*) AS closed_days,
             COALESCE(SUM(closing_cash - COALESCE(opening_cash, 0)), 0) AS cumulative_net,
             MAX(closed_at) AS last_closed_at
      FROM cash_shifts WHERE status='closed' AND closing_cash IS NOT NULL
    `);
    const closedDays = Number(closedActualRes.rows[0].closed_days || 0);
    const hasClosedActual = closedDays > 0;
    let closedTotalCash = hasClosedActual ? Number(closedActualRes.rows[0].cumulative_net) : (Number(closedCashSales.rows[0].total) + Number(closedCashPayments.rows[0].total) - Number(closedCashExpenses.rows[0].total) - Number(closedCashWithdrawals.rows[0].total));
    let closedTotalGcash = Number(closedGcashSales.rows[0].total) + Number(closedGcashPayments.rows[0].total) - Number(closedGcashExpenses.rows[0].total) - Number(closedGcashWithdrawals.rows[0].total);
    let closedCashExpDisplay = Number(closedCashExpenses.rows[0].total);
    let closedGcashExpDisplay = Number(closedGcashExpenses.rows[0].total);
    let closedCashWdDisplay = Number(closedCashWithdrawals.rows[0].total);
    let closedGcashWdDisplay = Number(closedGcashWithdrawals.rows[0].total);

    // Deduct expenses that happened AFTER the last counted time from previous sale (user wants expense to reduce previous sale, not today's pending sales)
    if (hasClosedActual) {
      const lastClosedAt = closedActualRes.rows[0].last_closed_at;
      const lastClosedDateStr = new Date(lastClosedAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
      const isTodayClosed = lastClosedDateStr === today;
      // Cash: deduct ALL post expenses (latest closing is actual, not sum, so remainder + today all deduct)
      const postCashExp = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE (payment_method='cash' OR payment_method IS NULL) AND created_at > $1`, [lastClosedAt]);
      const postCash = Number(postCashExp.rows[0].total);
      if (postCash) {
        closedTotalCash -= postCash;
        if (!isTodayClosed) {
          const postCashTodayExp = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE (payment_method='cash' OR payment_method IS NULL) AND (created_at AT TIME ZONE 'Asia/Manila')::date = $1 AND created_at > $2`, [today, lastClosedAt]);
          closedCashExpDisplay += Number(postCashTodayExp.rows[0].total);
        }
      }
      // GCash: same as cash — deduct ALL post GCash expenses after last count
      const postGcashExp = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE payment_method='gcash' AND created_at > $1`, [lastClosedAt]);
      const postGcash = Number(postGcashExp.rows[0].total);
      if (postGcash) {
        closedTotalGcash -= postGcash;
        if (!isTodayClosed) {
          const postGcashTodayExp = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE payment_method='gcash' AND (created_at AT TIME ZONE 'Asia/Manila')::date = $1 AND created_at > $2`, [today, lastClosedAt]);
          closedGcashExpDisplay += Number(postGcashTodayExp.rows[0].total);
        }
      }
      // Profit withdrawals after the last count: deduct like expenses.
      const postCashWd = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM profit_withdrawals WHERE (source_wallet='cash' OR source_wallet IS NULL) AND created_at > $1`, [lastClosedAt]);
      const postCashWdTotal = Number(postCashWd.rows[0].total);
      if (postCashWdTotal) {
        closedTotalCash -= postCashWdTotal;
        if (!isTodayClosed) {
          const postCashWdToday = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM profit_withdrawals WHERE (source_wallet='cash' OR source_wallet IS NULL) AND (created_at AT TIME ZONE 'Asia/Manila')::date = $1 AND created_at > $2`, [today, lastClosedAt]);
          closedCashWdDisplay += Number(postCashWdToday.rows[0].total);
        }
      }
      const postGcashWd = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM profit_withdrawals WHERE source_wallet='gcash' AND created_at > $1`, [lastClosedAt]);
      const postGcashWdTotal = Number(postGcashWd.rows[0].total);
      if (postGcashWdTotal) {
        closedTotalGcash -= postGcashWdTotal;
        if (!isTodayClosed) {
          const postGcashWdToday = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM profit_withdrawals WHERE source_wallet='gcash' AND (created_at AT TIME ZONE 'Asia/Manila')::date = $1 AND created_at > $2`, [today, lastClosedAt]);
          closedGcashWdDisplay += Number(postGcashWdToday.rows[0].total);
        }
      }
      // Money transfers: affect counted totals (previous sale)
      const postCashTransfersOut = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM money_transfers WHERE from_wallet='cash' AND created_at > $1`, [lastClosedAt]);
      const postCashTransfersIn = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM money_transfers WHERE to_wallet='cash' AND created_at > $1`, [lastClosedAt]);
      const postGcashTransfersOut = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM money_transfers WHERE from_wallet='gcash' AND created_at > $1`, [lastClosedAt]);
      const postGcashTransfersIn = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM money_transfers WHERE to_wallet='gcash' AND created_at > $1`, [lastClosedAt]);
      const netCashTransfer = Number(postCashTransfersIn.rows[0].total) - Number(postCashTransfersOut.rows[0].total);
      const netGcashTransfer = Number(postGcashTransfersIn.rows[0].total) - Number(postGcashTransfersOut.rows[0].total);
      closedTotalCash += netCashTransfer;
      closedTotalGcash += netGcashTransfer;
    } else {
      // No counted day yet: KPI is 0 - today's pending expenses (so expense still deducts)
      const todayCashExp = Number(running.cash_expenses ?? 0);
      const todayGcashExp = Number(running.gcash_expenses ?? 0);
      if (todayCashExp) { closedTotalCash -= todayCashExp; closedCashExpDisplay += todayCashExp; }
      if (todayGcashExp) { closedTotalGcash -= todayGcashExp; closedGcashExpDisplay += todayGcashExp; }
      // Also deduct today's profit withdrawals even with no counted day
      const todayCashWd = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM profit_withdrawals WHERE (source_wallet='cash' OR source_wallet IS NULL) AND (created_at AT TIME ZONE 'Asia/Manila')::date = $1`, [today]);
      const todayGcashWd = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM profit_withdrawals WHERE source_wallet='gcash' AND (created_at AT TIME ZONE 'Asia/Manila')::date = $1`, [today]);
      if (Number(todayCashWd.rows[0].total)) { closedTotalCash -= Number(todayCashWd.rows[0].total); closedCashWdDisplay += Number(todayCashWd.rows[0].total); }
      if (Number(todayGcashWd.rows[0].total)) { closedTotalGcash -= Number(todayGcashWd.rows[0].total); closedGcashWdDisplay += Number(todayGcashWd.rows[0].total); }
      // Also apply today's transfers even with no counted day
      const todayCashTransOut = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM money_transfers WHERE from_wallet='cash' AND (created_at AT TIME ZONE 'Asia/Manila')::date = $1`, [today]);
      const todayCashTransIn = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM money_transfers WHERE to_wallet='cash' AND (created_at AT TIME ZONE 'Asia/Manila')::date = $1`, [today]);
      const todayGcashTransOut = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM money_transfers WHERE from_wallet='gcash' AND (created_at AT TIME ZONE 'Asia/Manila')::date = $1`, [today]);
      const todayGcashTransIn = await pool.query(`SELECT COALESCE(SUM(amount),0) AS total FROM money_transfers WHERE to_wallet='gcash' AND (created_at AT TIME ZONE 'Asia/Manila')::date = $1`, [today]);
      closedTotalCash += Number(todayCashTransIn.rows[0].total) - Number(todayCashTransOut.rows[0].total);
      closedTotalGcash += Number(todayGcashTransIn.rows[0].total) - Number(todayGcashTransOut.rows[0].total);
    }

    // Today's gross profit (all completed sales today, Manila time) — the
    // basis for how much profit the owner can take home today.
    const { start: todayStart, end: todayEnd } = manilaDayBounds(today);
    const todayProfitRes = await pool.query(
      `SELECT COALESCE(SUM((si.unit_price - COALESCE(si.cost_price, p.cost_price)) * si.quantity),0) AS gross_profit
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
       JOIN products p ON p.id = si.product_id
       WHERE s.created_at >= $1 AND s.created_at < $2`,
      [todayStart, todayEnd]
    );
    const todayGrossProfit = Number(todayProfitRes.rows[0].gross_profit);
    const takenTodayCashRes = await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM profit_withdrawals
       WHERE (source_wallet='cash' OR source_wallet IS NULL) AND created_at >= $1 AND created_at < $2`,
      [todayStart, todayEnd]
    );
    const takenTodayGcashRes = await pool.query(
      `SELECT COALESCE(SUM(amount),0) AS total FROM profit_withdrawals
       WHERE source_wallet='gcash' AND created_at >= $1 AND created_at < $2`,
      [todayStart, todayEnd]
    );
    const takenTodayCash = Number(takenTodayCashRes.rows[0].total);
    const takenTodayGcash = Number(takenTodayGcashRes.rows[0].total);
    const recentWithdrawals = await pool.query(
      `SELECT w.*, u.name AS created_by_name FROM profit_withdrawals w
       LEFT JOIN users u ON u.id = w.created_by
       ORDER BY w.created_at DESC LIMIT 10`
    );

    const closed = {
      cash_sales: Number(closedCashSales.rows[0].total),
      gcash_sales: Number(closedGcashSales.rows[0].total),
      cash_utang_payments: Number(closedCashPayments.rows[0].total),
      gcash_utang_payments: Number(closedGcashPayments.rows[0].total),
      cash_expenses: closedCashExpDisplay,
      gcash_expenses: closedGcashExpDisplay,
      cash_withdrawals: closedCashWdDisplay,
      gcash_withdrawals: closedGcashWdDisplay,
      total_cash: closedTotalCash,
      total_gcash: closedTotalGcash,
      closed_days: closedDays,
    };

    const profit = {
      today_gross: todayGrossProfit,
      taken_today_cash: takenTodayCash,
      taken_today_gcash: takenTodayGcash,
      taken_today_total: takenTodayCash + takenTodayGcash,
      available_today: Math.max(todayGrossProfit - takenTodayCash - takenTodayGcash, 0),
    };

    res.json({ shift, running, pending: pending.rows, closed, profit, withdrawals: recentWithdrawals.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load current shift' });
  }
});

// Deprecated: starting cash was removed. Every day starts at 0 and the KPI
// just accumulates each counted actual. Kept for old clients — always
// normalizes today's opening to 0 instead of storing a value.
app.post('/api/shift/opening-cash', requireAuth, async (req, res) => {
  try {
    const today = manilaToday();
    const result = await pool.query(
      `UPDATE cash_shifts SET opening_cash = 0, opened_by = $1
       WHERE shift_date = $2 AND status = 'active' RETURNING *`,
      [req.user.id, today]
    );
    if (result.rows.length === 0) {
      return res.status(400).json({ error: "Today's shift is not active" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to set opening cash' });
  }
});

// Reset Cash Drawer to zero: clears all shift history and records a baseline
// timestamp. Drawer KPIs ignore everything created before the reset moment
// (including any manual "zeroing" expense made earlier today). Sales, expenses,
// transfers and profit-withdrawal records are kept in history; only the drawer
// baseline resets.
app.post('/api/shift/reset', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    await pool.query(`DELETE FROM cash_shifts`);
    await pool.query(`INSERT INTO drawer_resets DEFAULT VALUES`);
    const today = manilaToday();
    const result = await pool.query(
      `INSERT INTO cash_shifts (shift_date, status, opening_cash) VALUES ($1, 'active', 0) RETURNING *`,
      [today]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset cash drawer' });
  }
});

async function getDrawerResetAt(client = pool) {
  try {
    const r = await client.query(`SELECT MAX(reset_at) AS reset_at FROM drawer_resets`);
    return r.rows[0]?.reset_at ? new Date(r.rows[0].reset_at) : null;
  } catch {
    return null;
  }
}

app.post('/api/shift/:id/close', requireAuth, async (req, res) => {
  const { closing_cash, notes } = req.body;
  if (closing_cash === undefined || Number(closing_cash) < 0) {
    return res.status(400).json({ error: 'Enter a valid closing cash amount' });
  }
  try {
    const shiftResult = await pool.query(`SELECT * FROM cash_shifts WHERE id = $1`, [req.params.id]);
    if (shiftResult.rows.length === 0) return res.status(404).json({ error: 'Shift not found' });
    const shift = shiftResult.rows[0];
    if (shift.status === 'closed') return res.status(400).json({ error: 'Shift already closed' });

    const dateStr = dbDateToManila(shift.shift_date);
    const resetAt = await getDrawerResetAt();
    let breakdown;
    if (shift.status === 'active') {
      const { start } = manilaDayBounds(dateStr);
      const expenseStart = resetAt && resetAt > start ? resetAt : start;
      breakdown = await computeExpectedCash(shift.opening_cash || 0, start, new Date(), pool, expenseStart);
    } else {
      // pending_count: prefer frozen values, backfill missing pieces from full-day recompute
      const { start, end } = manilaDayBounds(dateStr);
      const expenseStart = resetAt && resetAt > start ? resetAt : start;
      const full = await computeExpectedCash(shift.opening_cash || 0, start, end, pool, expenseStart);
      breakdown = {
        expected_cash: shift.expected_cash ?? full.expected_cash,
        gcash_sales: shift.gcash_sales ?? full.gcash_sales,
        utang_charged: shift.utang_charged ?? full.utang_charged,
        cash_sales: shift.cash_sales ?? full.cash_sales,
        cash_utang_payments: shift.cash_utang_payments ?? full.cash_utang_payments,
        gcash_utang_payments: shift.gcash_utang_payments ?? full.gcash_utang_payments,
        cash_expenses: shift.cash_expenses ?? full.cash_expenses,
        gcash_expenses: shift.gcash_expenses ?? full.gcash_expenses,
        expected_gcash: shift.expected_gcash ?? full.expected_gcash,
      };
    }

    const difference = Number(closing_cash) - Number(breakdown.expected_cash);
    const result = await pool.query(
      `UPDATE cash_shifts
       SET closed_by = $1, closing_cash = $2, expected_cash = $3, difference = $4,
           gcash_sales = $5, utang_charged = $6, status = 'closed', closed_at = NOW(), notes = $7,
           cash_sales = $8, cash_utang_payments = $9, gcash_utang_payments = $10,
           cash_expenses = $11, gcash_expenses = $12, expected_gcash = $13
       WHERE id = $14 RETURNING *`,
      [req.user.id, closing_cash, breakdown.expected_cash, difference,
       breakdown.gcash_sales, breakdown.utang_charged, notes || null,
       breakdown.cash_sales, breakdown.cash_utang_payments, breakdown.gcash_utang_payments,
       breakdown.cash_expenses, breakdown.gcash_expenses, breakdown.expected_gcash, shift.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to close shift' });
  }
});

// Enrich a closed shift with full-day breakdown (debt from credit + GCash paid).
// Uses stored snapshot when present, otherwise recomputes from sales/utang/expenses.
// Always attaches that day's profit withdrawals (owner's take-home, not an expense).
async function enrichShiftRow(shift) {
  const attachWithdrawals = async (row) => {
    try {
      const dateStr = dbDateToManila(row.shift_date);
      const { start, end } = manilaDayBounds(dateStr);
      const wd = await pool.query(
        `SELECT COALESCE(SUM(amount) FILTER (WHERE source_wallet = 'cash' OR source_wallet IS NULL), 0) AS cash_wd,
                COALESCE(SUM(amount) FILTER (WHERE source_wallet = 'gcash'), 0) AS gcash_wd
         FROM profit_withdrawals WHERE created_at >= $1 AND created_at < $2`,
        [start, end]
      );
      const cashWd = Number(wd.rows[0].cash_wd);
      const gcashWd = Number(wd.rows[0].gcash_wd);
      return { ...row, cash_withdrawals: cashWd, gcash_withdrawals: gcashWd, profit_taken: cashWd + gcashWd };
    } catch {
      return { ...row, cash_withdrawals: 0, gcash_withdrawals: 0, profit_taken: 0 };
    }
  };
  const needsCompute =
    shift.cash_sales == null || shift.cash_utang_payments == null ||
    shift.gcash_utang_payments == null || shift.cash_expenses == null ||
    shift.gcash_expenses == null || shift.expected_gcash == null;
  if (!needsCompute) {
    const gcashReceived = Number(shift.gcash_sales || 0) + Number(shift.gcash_utang_payments || 0);
    return attachWithdrawals({
      ...shift,
      gcash_received: gcashReceived,
      gcash_in_hand: gcashReceived - Number(shift.gcash_expenses || 0),
    });
  }
  try {
    const dateStr = dbDateToManila(shift.shift_date);
    const { start, end } = manilaDayBounds(dateStr);
    const full = await computeExpectedCash(shift.opening_cash || 0, start, end);
    const gcashReceived = full.gcash_sales + full.gcash_utang_payments;
    return attachWithdrawals({
      ...shift,
      cash_sales: shift.cash_sales ?? full.cash_sales,
      cash_utang_payments: shift.cash_utang_payments ?? full.cash_utang_payments,
      gcash_sales: shift.gcash_sales ?? full.gcash_sales,
      gcash_utang_payments: shift.gcash_utang_payments ?? full.gcash_utang_payments,
      utang_charged: shift.utang_charged ?? full.utang_charged,
      cash_expenses: shift.cash_expenses ?? full.cash_expenses,
      gcash_expenses: shift.gcash_expenses ?? full.gcash_expenses,
      expected_gcash: shift.expected_gcash ?? full.expected_gcash,
      gcash_received: gcashReceived,
      gcash_in_hand: gcashReceived - (Number(shift.gcash_expenses ?? full.gcash_expenses)),
    });
  } catch {
    return attachWithdrawals(shift);
  }
}

app.get('/api/shift/history', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT cs.*, u1.name AS opened_by_name, u2.name AS closed_by_name
       FROM cash_shifts cs
       LEFT JOIN users u1 ON u1.id = cs.opened_by
       LEFT JOIN users u2 ON u2.id = cs.closed_by
       WHERE cs.status = 'closed'
       ORDER BY cs.closed_at DESC
       LIMIT 30`
    );
    const enriched = [];
    for (const row of result.rows) {
      enriched.push(await enrichShiftRow(row));
    }
    res.json(enriched);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load shift history' });
  }
});

app.get('/api/shift/:id', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT cs.*, u1.name AS opened_by_name, u2.name AS closed_by_name
       FROM cash_shifts cs
       LEFT JOIN users u1 ON u1.id = cs.opened_by
       LEFT JOIN users u2 ON u2.id = cs.closed_by
       WHERE cs.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Shift not found' });
    res.json(await enrichShiftRow(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load shift detail' });
  }
});

// Money transfers: cash <-> gcash (monitoring only, no real bank integration)
app.get('/api/transfers', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT t.*, u.name AS created_by_name
      FROM money_transfers t
      LEFT JOIN users u ON u.id = t.created_by
      ORDER BY t.created_at DESC LIMIT 50
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load transfers' });
  }
});

app.post('/api/transfers', requireAuth, async (req, res) => {
  const { from_wallet, to_wallet, amount, note } = req.body;
  const valid = ['cash','gcash'];
  if (!valid.includes(from_wallet) || !valid.includes(to_wallet)) {
    return res.status(400).json({ error: 'Invalid wallets. Use cash or gcash.' });
  }
  if (from_wallet === to_wallet) {
    return res.status(400).json({ error: 'From and To must be different.' });
  }
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Amount must be > 0' });
  try {
    const result = await pool.query(
      `INSERT INTO money_transfers (from_wallet, to_wallet, amount, note, created_by) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [from_wallet, to_wallet, amt, note || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create transfer' });
  }
});

// Profit withdrawals: owner takes profit home. Deducts from the Cash Drawer
// (like an expense) but is NEVER counted as an expense in profit reports,
// so Net Profit = Gross − real expenses stays correct.
app.get('/api/profit-withdrawals', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT w.*, u.name AS created_by_name
      FROM profit_withdrawals w
      LEFT JOIN users u ON u.id = w.created_by
      ORDER BY w.created_at DESC LIMIT 50
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load profit withdrawals' });
  }
});

app.post('/api/profit-withdrawals', requireAuth, async (req, res) => {
  const { amount, source_wallet, note } = req.body;
  const wallet = source_wallet === 'gcash' ? 'gcash' : 'cash';
  const amt = Number(amount);
  if (!amt || amt <= 0) return res.status(400).json({ error: 'Amount must be > 0' });
  try {
    const result = await pool.query(
      `INSERT INTO profit_withdrawals (amount, source_wallet, note, created_by) VALUES ($1,$2,$3,$4) RETURNING *`,
      [amt, wallet, note || null, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record profit withdrawal' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});