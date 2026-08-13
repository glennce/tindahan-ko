import { apiFetch } from '../api';
import { useState, useEffect } from 'react';
import ProductModal from '../components/ProductModal';
import StockInModal from '../components/StockInModal';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/ConfirmModal';

const API = '/products';

function Inventory() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [stockInOpen, setStockInOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const { showToast } = useToast();

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

  const categories = ['All', ...new Set(products.map((p) => p.category).filter(Boolean))];

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.category || '').toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === 'All' || p.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

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
      const res = await apiFetch(url, {
        method,
        body: JSON.stringify(formData),
      });
      if (!res.ok) throw new Error('Save failed');
      setModalOpen(false);
      fetchProducts();
      showToast(isEditing ? 'Product updated' : 'Product added'); // refresh the list with the latest data from the server
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleStockIn = async (productId, data) => {
    try {
      const res = await apiFetch(`${API}/${productId}/restock`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Restock failed');
      setStockInOpen(false);
      fetchProducts();
      showToast('Stock updated');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const requestDelete = (id) => {
    setPendingDeleteId(id);
  };

  const confirmDelete = async () => {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    try {
      const res = await apiFetch(`${API}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      fetchProducts();
      showToast('Product deleted');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  if (loading) return <p className="text-on-surface-variant">Loading products...</p>;
  if (error) return <p className="text-error">Error: {error}</p>;

  function getStatus(product) {
    if (product.stock_quantity <= 0) return { label: 'Out of Stock', className: 'bg-error-container text-error' };
    if (product.stock_quantity <= product.low_stock_threshold) return { label: 'Low Stock', className: 'bg-orange-100 text-orange-700' };
    return { label: 'Available', className: 'bg-secondary-container text-secondary' };
  }

  return (
    <div>
      <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-on-surface">Inventory</h1>
          <p className="text-on-surface-variant">Manage your product catalog and stock levels.</p>
        </div>
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search products, SKU, or categories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-outline-variant rounded-lg px-4 py-2 mb-3"
          />
          <div className="flex gap-2 flex-wrap">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium ${
                  activeCategory === cat
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-low text-on-surface-variant'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setStockInOpen(true)}
            className="border border-primary text-primary font-medium px-4 py-2 rounded-lg"
          >
            Stock In
          </button>
          <button
            onClick={openAddModal}
            className="bg-primary text-on-primary font-medium px-4 py-2 rounded-lg"
          >
            + Add Product
          </button>
        </div>
      </div>

      {/* Mobile: stacked cards, hidden at lg and above */}
      <div className="lg:hidden space-y-3">
        {filteredProducts.map((product) => {
          const status = getStatus(product);
          return (
            <div key={product.id} className="bg-surface border border-outline-variant rounded-xl p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-on-surface">{product.name}</p>
                  <p className="text-on-surface-variant text-sm">{product.category || '—'}</p>
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.className}`}>
                  {status.label}
                </span>
              </div>
              <div className="flex justify-between items-center mt-3">
                <span className="text-primary font-semibold">₱{product.selling_price}</span>
                <div className="space-x-3">
                  <button onClick={() => openEditModal(product)} className="text-primary text-sm font-medium">
                    Edit
                  </button>
                  <button onClick={() => requestDelete(product.id)} className="text-error text-sm font-medium">
                    Delete
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: table, hidden below lg */}
      <div className="hidden lg:block bg-surface border border-outline-variant rounded-xl overflow-hidden">
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
            {filteredProducts.map((product) => {
              const status = getStatus(product);
              return (
                <tr key={product.id} className="border-t border-outline-variant">
                  <td className="px-4 py-3 font-medium text-on-surface">{product.name}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{product.category || '—'}</td>
                  <td className="px-4 py-3 text-on-surface-variant">₱{product.selling_price}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.className}`}>
                      {status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 space-x-3">
                    <button onClick={() => openEditModal(product)} className="text-primary text-sm font-medium">
                      Edit
                    </button>
                    <button onClick={() => requestDelete(product.id)} className="text-error text-sm font-medium">
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

      <StockInModal
        isOpen={stockInOpen}
        onClose={() => setStockInOpen(false)}
        onSave={handleStockIn}
        products={products}
      />
      
      <ConfirmModal
        isOpen={!!pendingDeleteId}
        title="Delete this product?"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

export default Inventory;