const requireAuth = require('./authMiddleware');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

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
      { id: user.id, name: user.name, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Real database-backed route
app.get('/api/products', requireAuth, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.post('/api/products', requireAuth, async (req, res) => {
  const { name, sku, category, cost_price, selling_price, stock_quantity, low_stock_threshold, supplier } = req.body;

  if (!name || selling_price === undefined) {
    return res.status(400).json({ error: 'Name and selling price are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO products (name, sku, category, cost_price, selling_price, stock_quantity, low_stock_threshold, supplier)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [name, sku, category, cost_price || 0, selling_price, stock_quantity || 0, low_stock_threshold || 10, supplier]
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
app.put('/api/products/:id', requireAuth, async (req, res) => {
  const { name, sku, category, cost_price, selling_price, stock_quantity, low_stock_threshold, supplier } = req.body;
  try {
    const result = await pool.query(
      `UPDATE products
       SET name = $1, sku = $2, category = $3, cost_price = $4, selling_price = $5,
           stock_quantity = $6, low_stock_threshold = $7, supplier = $8
       WHERE id = $9
       RETURNING *`,
      [name, sku, category, cost_price, selling_price, stock_quantity, low_stock_threshold, supplier, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Delete a product
app.delete('/api/products/:id', requireAuth, async (req, res) => {
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

    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
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
      const subtotal = item.quantity * item.unit_price;

      await client.query(
        `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [sale.id, item.product_id, item.quantity, item.unit_price, subtotal]
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

    if (payment_method === 'utang') {
      const custResult = await client.query(
        `SELECT name, credit_limit FROM customers WHERE id = $1`,
        [customer_id]
      );
      if (custResult.rows.length === 0) {
        throw new Error('Customer not found');
      }
      const { name: customerName, credit_limit } = custResult.rows[0];
      const creditLimit = Number(credit_limit);
    
      const lastUtang = await client.query(
        `SELECT balance_after FROM utang_transactions WHERE customer_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
        [customer_id]
      );
      const previousBalance = lastUtang.rows.length ? Number(lastUtang.rows[0].balance_after) : 0;
      const newBalance = previousBalance + total_amount;
    
      if (newBalance > creditLimit) {
        const available = Math.max(creditLimit - previousBalance, 0);
        throw new Error(
          `This sale exceeds ${customerName}'s credit limit. Available credit: ₱${available.toFixed(2)}`
        );
      }
    
      await client.query(
        `INSERT INTO utang_transactions (customer_id, sale_id, type, amount, balance_after, note)
         VALUES ($1, $2, 'charge', $3, $4, $5)`,
        [customer_id, sale.id, total_amount, newBalance, 'Sale purchase']
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

app.post('/api/sales/:id/void', requireAuth, async (req, res) => {
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

    if (sale.payment_method === 'utang' && sale.customer_id) {
      const lastUtang = await client.query(
        `SELECT balance_after FROM utang_transactions WHERE customer_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
        [sale.customer_id]
      );
      const previousBalance = lastUtang.rows.length ? Number(lastUtang.rows[0].balance_after) : 0;
      const newBalance = previousBalance - Number(sale.total_amount);

      await client.query(
        `INSERT INTO utang_transactions (customer_id, sale_id, type, amount, balance_after, note)
         VALUES ($1, $2, 'payment', $3, $4, 'Sale voided')`,
        [sale.customer_id, sale.id, sale.total_amount, newBalance]
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

app.get('/api/dashboard', async (req, res) => {
  try {
    const salesToday = await pool.query(`
      SELECT COALESCE(SUM(total_amount),0) AS total_sales, COUNT(*) AS transaction_count
      FROM sales WHERE created_at::date = CURRENT_DATE
    `);

    const profitToday = await pool.query(`
      SELECT COALESCE(SUM((si.unit_price - p.cost_price) * si.quantity),0) AS gross_profit,
             COALESCE(SUM(si.quantity),0) AS items_sold
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN products p ON p.id = si.product_id
      WHERE s.created_at::date = CURRENT_DATE
    `);

    const lowStock = await pool.query(`
      SELECT id, name, stock_quantity FROM products
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
      WHERE s.created_at::date = CURRENT_DATE
      GROUP BY p.id, p.name
      ORDER BY qty_sold DESC
      LIMIT 4
    `);

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

// List all customers with their current balance (ledger pattern again)
app.get('/api/utang', async (req, res) => {
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
app.get('/api/utang/:customerId', async (req, res) => {
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
app.post('/api/utang/payment', async (req, res) => {
  const { customer_id, amount, note } = req.body;
  if (!customer_id || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Valid customer_id and amount are required' });
  }
  try {
    const lastEntry = await pool.query(
      `SELECT balance_after FROM utang_transactions WHERE customer_id = $1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [customer_id]
    );
    const currentBalance = lastEntry.rows.length ? Number(lastEntry.rows[0].balance_after) : 0;

    // New check — reject payments larger than what's actually owed
    if (Number(amount) > currentBalance) {
      return res.status(400).json({
        error: `Payment exceeds current balance. Customer owes ₱${currentBalance.toFixed(2)}.`,
      });
    }

    const newBalance = currentBalance - Number(amount);

    const result = await pool.query(
      `INSERT INTO utang_transactions (customer_id, type, amount, balance_after, note)
       VALUES ($1, 'payment', $2, $3, $4) RETURNING *`,
      [customer_id, amount, newBalance, note || 'Payment received']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to record payment' });
  }
});

app.get('/api/transactions', requireAuth, async (req, res) => {
  const { start = '2000-01-01', end = '2100-12-31', type = 'All', status = 'All', page = 1, limit = 10 } = req.query;
  const offset = (Number(page) - 1) * Number(limit);
  const params = [start, end, type, status];

  const cte = `
    WITH combined AS (
      SELECT 'sale' AS source, s.id, s.created_at,
             COALESCE(c.name, '- Walk-in -') AS customer_name,
             s.total_amount AS amount,
             CASE WHEN s.payment_method = 'utang' THEN 'Sale (Utang)'
                  WHEN s.payment_method = 'gcash' THEN 'Sale (GCash)'
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
       WHERE created_at::date BETWEEN $1 AND $2
         AND ($3 = 'All' OR type_label = $3)
         AND ($4 = 'All' OR status = $4)
       ORDER BY created_at DESC
       LIMIT $5 OFFSET $6`,
      [...params, Number(limit), offset]
    );
    const countResult = await pool.query(
      `${cte}
       SELECT COUNT(*) FROM combined
       WHERE created_at::date BETWEEN $1 AND $2
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

app.get('/api/transactions/:source/:id', requireAuth, async (req, res) => {
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
app.get('/api/expenses', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM expenses ORDER BY created_at DESC LIMIT 20');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch expenses' });
  }
});

app.post('/api/expenses', async (req, res) => {
  const { category, amount, description } = req.body;
  if (!category || !amount) {
    return res.status(400).json({ error: 'Category and amount are required' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO expenses (category, amount, description) VALUES ($1, $2, $3) RETURNING *`,
      [category, amount, description]
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

app.post('/api/products/:id/restock', requireAuth, async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});