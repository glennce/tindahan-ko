const requireAuth = require('./authMiddleware');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./db');
const UTANG_MARKUP_PER_UNIT = 2.00; // ₱2 added per unit when payment_method is 'utang'
const requireRole = require('./requireRole');

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
    // Ensure products has per-pack columns (deployed has them, local may not)
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS units_per_pack INTEGER`);
    await pool.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS unit_label VARCHAR(50)`);
    // Ensure sales has discount/subtotal/status if local DB is old (safe no-op if exists)
    await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS subtotal NUMERIC DEFAULT 0`);
    await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0`);
    await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'completed'`);
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'owner'`);
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
  const { customer_id, items, payment_method, amount_tendered, discount_amount } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'Sale must include at least one item' });
  }
  if (payment_method === 'utang' && !customer_id) {
    return res.status(400).json({ error: 'Utang sales require a customer' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const markupPerUnit = (payment_method === 'utang' || payment_method === 'split') ? UTANG_MARKUP_PER_UNIT : 0;
    const subtotal = items.reduce(
      (sum, item) => sum + item.quantity * (item.unit_price + markupPerUnit),
      0
    );
    const discount = Number(discount_amount) || 0;
    const total_amount = Math.max(subtotal - discount, 0);
    const change_amount = payment_method === 'cash' ? (amount_tendered - total_amount) : null;

    const saleResult = await client.query(
      `INSERT INTO sales (customer_id, subtotal, discount_amount, total_amount, payment_method, amount_tendered, change_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [customer_id || null, subtotal, discount, total_amount, payment_method, amount_tendered || null, change_amount]
    );
    const sale = saleResult.rows[0];

    for (const item of items) {
    const effectiveUnitPrice = item.unit_price + markupPerUnit;
    const itemSubtotal = item.quantity * effectiveUnitPrice;

    await client.query(
      `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal)
       VALUES ($1, $2, $3, $4, $5)`,
      [sale.id, item.product_id, item.quantity, effectiveUnitPrice, itemSubtotal]
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

    if (payment_method === 'utang' || payment_method === 'split') {
      const custResult = await client.query(
        `SELECT name, credit_limit FROM customers WHERE id = $1`,
        [customer_id]
      );
      if (custResult.rows.length === 0) {
        throw new Error('Customer not found');
      }
      const { name: customerName, credit_limit } = custResult.rows[0];
      const creditLimit = Number(credit_limit);
    
      // For a split sale, only the remainder after cash goes on credit.
      // For a pure utang sale, the whole total goes on credit.
      const utangPortion =
        payment_method === 'split'
          ? total_amount - Number(amount_tendered || 0)
          : total_amount;
    
      if (payment_method === 'split' && (!amount_tendered || Number(amount_tendered) <= 0 || Number(amount_tendered) >= total_amount)) {
        throw new Error('Split sales require a cash amount greater than ₱0 and less than the total.');
      }
    
      const lastUtang = await client.query(
        `SELECT balance_after FROM utang_transactions WHERE customer_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
        [customer_id]
      );
      const previousBalance = lastUtang.rows.length ? Number(lastUtang.rows[0].balance_after) : 0;
      const newBalance = previousBalance + utangPortion;
    
      if (newBalance > creditLimit) {
        const available = Math.max(creditLimit - previousBalance, 0);
        throw new Error(
          `This sale exceeds ${customerName}'s credit limit. Available credit: ₱${available.toFixed(2)}`
        );
      }
    
      await client.query(
        `INSERT INTO utang_transactions (customer_id, sale_id, type, amount, balance_after, note)
         VALUES ($1, $2, 'charge', $3, $4, $5)`,
        [customer_id, sale.id, utangPortion, newBalance, payment_method === 'split' ? 'Split sale (partial credit)' : 'Sale purchase']
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
          ? Number(sale.total_amount) - Number(sale.amount_tendered)
          : Number(sale.total_amount);

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
      SELECT COALESCE(SUM((si.unit_price - p.cost_price) * si.quantity),0) AS gross_profit,
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
      const map = Object.fromEntries(result.rows.map((r) => [r.bucket.toISOString().slice(0, 10), Number(r.total)]));

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

// One customer's full transaction history
app.get('/api/utang/:customerId', requireAuth, async (req, res) => {
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

// Record a payment against a customer's balance
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

    const newBalance = currentBalance - Number(amount);

    const result = await pool.query(
      `INSERT INTO utang_transactions (customer_id, type, amount, balance_after, payment_method, note)
       VALUES ($1, 'payment', $2, $3, $4, $5) RETURNING *`,
      [customer_id, amount, newBalance, payment_method || 'cash', note || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record payment' });
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
    res.json({
      total_outstanding: Number(outstanding.rows[0].total),
      customers_with_balance: Number(outstanding.rows[0].customer_count),
      payments_today: Number(paymentsToday.rows[0].total),
      payments_today_count: Number(paymentsToday.rows[0].count),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load utang summary' });
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

    if (source === 'utang_payment') {
      const payment = await pool.query(
        `SELECT ut.*, c.name AS customer_name FROM utang_transactions ut
         JOIN customers c ON c.id = ut.customer_id WHERE ut.id = $1`,
        [id]
      );
      if (payment.rows.length === 0) return res.status(404).json({ error: 'Not found' });
      return res.json({ source: 'utang_payment', ...payment.rows[0] });
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
       FROM sales WHERE created_at::date BETWEEN $1 AND $2`,
      [start, end]
    );

    const profit = await pool.query(
      `SELECT COALESCE(SUM((si.unit_price - p.cost_price) * si.quantity),0) AS gross_profit
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
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
       FROM sales WHERE created_at::date BETWEEN $1 AND $2
       GROUP BY day ORDER BY day`,
      [start, end]
    );

    const categories = await pool.query(
      `SELECT COALESCE(p.category, 'Uncategorized') AS category, SUM(si.subtotal) AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
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
      trend: trend.rows,
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
        `SELECT COALESCE(SUM((si.unit_price - p.cost_price) * si.quantity),0) AS gross_profit
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

    const trend = await pool.query(
      `SELECT (s.created_at AT TIME ZONE 'Asia/Manila')::date AS day,
              SUM((si.unit_price - p.cost_price) * si.quantity) AS profit
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
      net_profit: netProfit,
      margin_pct: currentGross > 0 ? (currentGross / (currentGross + totalExpenses)) * 100 : 0,
      trend: trend.rows,
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
      SELECT id, name, category, stock_quantity, low_stock_threshold, units_per_pack, unit_label
      FROM products WHERE stock_quantity > 0 AND stock_quantity <= low_stock_threshold
      ORDER BY stock_quantity ASC
    `);
    const outOfStockList = await pool.query(`
      SELECT id, name, category, stock_quantity, low_stock_threshold, units_per_pack, unit_label
      FROM products WHERE stock_quantity <= 0
      ORDER BY name ASC
    `);

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
        COALESCE(SUM(amount) FILTER (WHERE type = 'payment'), 0) AS paid
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
      top_debtors: topDebtors.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load utang report' });
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

app.post('/api/products/:id/restock', requireAuth, requireRole('owner'), async (req, res) => {
  const { quantity, cost_price } = req.body;
  const qty = Number(quantity);

  if (!qty || qty <= 0) {
    return res.status(400).json({ error: 'Quantity must be a positive number' });
  }

  try {
    const result = await pool.query(
      `UPDATE products
       SET stock_quantity = stock_quantity + $1,
           cost_price = COALESCE($2, cost_price)
       WHERE id = $3
       RETURNING *`,
      [qty, cost_price || null, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to restock product' });
  }
});

async function computeExpectedCash(openingCash, startTime, endTime, client = pool) {
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
    `SELECT COALESCE(SUM(total_amount), 0) AS total
     FROM sales
     WHERE status = 'completed' AND payment_method = 'gcash' AND created_at BETWEEN $1 AND $2`,
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
    [startTime, endTime]
  );
  const gcashExpenses = await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM expenses WHERE created_at BETWEEN $1 AND $2 AND payment_method = 'gcash'`,
    [startTime, endTime]
  );
  const totalExpenses = Number(cashExpenses.rows[0].total) + Number(gcashExpenses.rows[0].total);

  const cashInHand =
    Number(openingCash) +
    Number(cashSales.rows[0].total) +
    Number(cashUtangPayments.rows[0].total) -
    Number(cashExpenses.rows[0].total);
  const gcashInHand =
    Number(gcashSales.rows[0].total) +
    Number(gcashUtangPayments.rows[0].total) -
    Number(gcashExpenses.rows[0].total);

  return {
    cash_sales: Number(cashSales.rows[0].total),
    gcash_sales: Number(gcashSales.rows[0].total),
    cash_utang_payments: Number(cashUtangPayments.rows[0].total),
    gcash_utang_payments: Number(gcashUtangPayments.rows[0].total),
    utang_charged: Number(utangCharged.rows[0].total),
    cash_expenses: Number(cashExpenses.rows[0].total),
    gcash_expenses: Number(gcashExpenses.rows[0].total),
    expenses: totalExpenses,
    // legacy
    expected_cash: cashInHand,
    // new KPI: total money in drawer/wallet (cash) and total gcash
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

async function ensureTodayShift() {
  const today = manilaToday();
  let result = await pool.query(`SELECT * FROM cash_shifts WHERE shift_date = $1`, [today]);
  if (result.rows.length === 0) {
    result = await pool.query(
      `INSERT INTO cash_shifts (shift_date, status) VALUES ($1, 'active') RETURNING *`,
      [today]
    );
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
    const dateStr = shift.shift_date.toISOString().slice(0, 10);
    const { start, end } = manilaDayBounds(dateStr);
    const running = await computeExpectedCash(shift.opening_cash || 0, start, end);
    await pool.query(
      `UPDATE cash_shifts SET status = 'pending_count', expected_cash = $1, gcash_sales = $2, utang_charged = $3 WHERE id = $4`,
      [running.expected_cash, running.gcash_sales, running.utang_charged, shift.id]
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
    const { start } = manilaDayBounds(today);
    const running = await computeExpectedCash(shift.opening_cash || 0, start, new Date());

    const pending = await pool.query(
      `SELECT cs.*, u.name AS opened_by_name FROM cash_shifts cs
       LEFT JOIN users u ON u.id = cs.opened_by
       WHERE status = 'pending_count' ORDER BY shift_date ASC`
    );

    res.json({ shift, running, pending: pending.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load current shift' });
  }
});

app.post('/api/shift/opening-cash', requireAuth, async (req, res) => {
  const { opening_cash } = req.body;
  if (opening_cash === undefined || Number(opening_cash) < 0) {
    return res.status(400).json({ error: 'Enter a valid opening cash amount' });
  }
  try {
    const today = manilaToday();
    const result = await pool.query(
      `UPDATE cash_shifts SET opening_cash = $1, opened_by = $2
       WHERE shift_date = $3 AND status = 'active' RETURNING *`,
      [opening_cash, req.user.id, today]
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

    let { expected_cash: expected, gcash_sales: gcash, utang_charged: utangCharged } = shift;

    if (shift.status === 'active') {
      const dateStr = shift.shift_date.toISOString().slice(0, 10);
      const { start } = manilaDayBounds(dateStr);
      const running = await computeExpectedCash(shift.opening_cash || 0, start, new Date());
      expected = running.expected_cash;
      gcash = running.gcash_sales;
      utangCharged = running.utang_charged;
    }

    const difference = Number(closing_cash) - Number(expected);
    const result = await pool.query(
      `UPDATE cash_shifts
       SET closed_by = $1, closing_cash = $2, expected_cash = $3, difference = $4,
           gcash_sales = $5, utang_charged = $6, status = 'closed', closed_at = NOW(), notes = $7
       WHERE id = $8 RETURNING *`,
      [req.user.id, closing_cash, expected, difference, gcash, utangCharged, notes || null, shift.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to close shift' });
  }
});

app.get('/api/shift/history', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT cs.*, u1.name AS opened_by_name, u2.name AS closed_by_name
       FROM cash_shifts cs
       JOIN users u1 ON u1.id = cs.opened_by
       LEFT JOIN users u2 ON u2.id = cs.closed_by
       WHERE cs.status = 'closed'
       ORDER BY cs.closed_at DESC
       LIMIT 30`
    );
    res.json(result.rows);
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
       JOIN users u1 ON u1.id = cs.opened_by
       LEFT JOIN users u2 ON u2.id = cs.closed_by
       WHERE cs.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Shift not found' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load shift detail' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});