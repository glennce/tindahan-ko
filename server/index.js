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

// Real database-backed route
app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM products ORDER BY id');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.post('/api/products', async (req, res) => {
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
app.get('/api/products/:id', async (req, res) => {
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
app.put('/api/products/:id', async (req, res) => {
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
app.delete('/api/products/:id', async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});