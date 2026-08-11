import { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('http://localhost:5000/api/products')
      .then((res) => res.json())
      .then((data) => {
        setProducts(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  if (loading) return <p>Loading products...</p>;
  if (error) return <p>Error: {error}</p>;

  return (
    <div>
      <h1>Tindahan Ko — Products</h1>
      <ul>
        {products.map((product) => (
          <li key={product.id}>
            {product.name} — ₱{product.selling_price} ({product.stock_quantity} in stock)
          </li>
        ))}
      </ul>
    </div>
  );
}

export default App;