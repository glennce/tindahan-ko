import { apiFetch } from '../api';
import { useState, useEffect } from 'react';
import ProductModal from '../components/ProductModal';

const API = '/products';

function Inventory() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  const fetchProducts = () => {
    setLoading(true);
    apiFetch(API)
      .then((res) => res.json())
      .then((data) => {
        setProducts(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const openAddModal = () => {
    setEditingProduct(null);
    setModalOpen(true);
  };

  const openEditModal = (product) => {
    setEditingProduct(product);
    setModalOpen(true);
  };

  const handleSave = async (formData) => {
    const isEditing = Boolean(editingProduct);
    const url = isEditing ? `${API}/${editingProduct.id}` : API;
    const method = isEditing ? 'PUT' : 'POST';

    try {
      const res = await fetch(url, {
        method,
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error('Save failed');
      setModalOpen(false);
      fetchProducts(); // refresh the list with the latest data from the server
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    try {
      const res = await apiFetch(`${API}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      fetchProducts();
    } catch (err) {
      alert(err.message);
    }
  };

  if (loading) return <p className="text-on-surface-variant">Loading products...</p>;
  if (error) return <p className="text-error">Error: {error}</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-on-surface">Inventory</h1>
          <p className="text-on-surface-variant">Manage your product catalog and stock levels.</p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-primary text-on-primary font-medium px-4 py-2 rounded-lg"
        >
          + Add Product
        </button>
      </div>

      <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-surface-container-low text-on-surface-variant text-sm">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => {
              const isLow = product.stock_quantity <= product.low_stock_threshold;
              return (
                <tr key={product.id} className="border-t border-outline-variant">
                  <td className="px-4 py-3 font-medium text-on-surface">{product.name}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{product.category || '—'}</td>
                  <td className="px-4 py-3 text-on-surface-variant">₱{product.selling_price}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      isLow ? 'bg-error-container text-error' : 'bg-secondary-container text-secondary'
                    }`}>
                      {product.stock_quantity} pcs
                    </span>
                  </td>
                  <td className="px-4 py-3 space-x-3">
                    <button onClick={() => openEditModal(product)} className="text-primary text-sm font-medium">
                      Edit
                    </button>
                    <button onClick={() => handleDelete(product.id)} className="text-error text-sm font-medium">
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ProductModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        initialData={editingProduct}
      />
    </div>
  );
}

export default Inventory;