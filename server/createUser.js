const bcrypt = require('bcrypt');
const pool = require('./db');
require('dotenv').config();

async function createUser() {
  const name = process.argv[2];
  const email = process.argv[3];
  const password = process.argv[4];

  if (!name || !email || !password) {
    console.log('Usage: node createUser.js "Your Name" you@example.com yourpassword');
    process.exit(1);
  }

  const password_hash = await bcrypt.hash(password, 10);

  const result = await pool.query(
    `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email`,
    [name, email, password_hash]
  );

  console.log('User created:', result.rows[0]);
  process.exit(0);
}

createUser();