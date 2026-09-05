import { apiFetch } from '../api';
import { useState, useEffect } from 'react';
import ProductModal from '../components/ProductModal';
import StockInModal from '../components/StockInModal';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/ConfirmModal';
import { formatStock } from '../utils';

const API = '/products';

const AUDIT_REASONS = [
  { value: 'unrecorded_sale', label: 'Sold but not recorded' },
  { value: 'theft', label: 'Theft / missing' },
  { value: 'damaged', label: 'Damaged' },
  { value: 'expired', label: 'Expired' },
  { value: 'miscount_correction', label: 'Miscount correction' },
  { value: 'supplier_shortage', label: 'Supplier shortage' },
  { value: 'return_correction', label: 'Return correction' },
  { value: 'other', label: 'Other' },
];

function reasonLabel(v) {
  return (AUDIT_REASONS.find((r) => r.value === v) || {}).label || v;
}

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
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;
  const [view, setView] = useState('products');
  const [adjustments, setAdjustments] = useState([]);
  const [auditSummary, setAuditSummary] = useState(null);
  const [auditForm, setAuditForm] = useState({ product_id: '', counted_qty: '', reason: 'unrecorded_sale', notes: '' });
  const [auditSearch, setAuditSearch] = useState('');
  const [auditProductSearch, setAuditProductSearch] = useState('');
  const [auditProductCategory, setAuditProductCategory] = useState('All');

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
  const QUICK_COUNT = 6; // "All" + 5 real categories shown as pills
  const quickCategories = categories.slice(0, QUICK_COUNT);
  const moreCategories = categories.slice(QUICK_COUNT);
  const activeInMore = moreCategories.includes(activeCategory);

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.sku || '').toLowerCase().includes(search.toLowerCase()) ||
      (p.category || '').toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === 'All' || p.category === activeCategory;
    return matchesSearch && matchesCategory;
  });
  
    const totalPages = Math.max(Math.ceil(filteredProducts.length / PER_PAGE), 1);
    const paginatedProducts = filteredProducts.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const fetchAudits = () => {
    apiFetch('/stock-adjustments').then((res) => res.json()).then((d) => Array.isArray(d) && setAdjustments(d)).catch(() => {});
    apiFetch('/stock-adjustments/summary').then((res) => res.json()).then(setAuditSummary).catch(() => {});
  };

  const handleAuditSave = async (e) => {
    e?.preventDefault();
    if (!auditForm.product_id) { showToast('Select a product to audit', 'error'); return; }
    if (auditForm.counted_qty === '' || Number(auditForm.counted_qty) < 0) { showToast('Enter a valid physical count', 'error'); return; }
    try {
      const res = await apiFetch('/stock-adjustments', {
        method: 'POST',
        body: JSON.stringify({ product_id: Number(auditForm.product_id), counted_qty: Number(auditForm.counted_qty), reason: auditForm.reason, notes: auditForm.notes }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Audit failed');
      const diff = Number(result.difference);
      setAuditForm({ product_id: '', counted_qty: '', reason: 'unrecorded_sale', notes: '' });
      fetchProducts();
      fetchAudits();
      showToast(diff < 0 ? `Shortage of ${Math.abs(diff)} recorded — stock corrected` : `Overage of ${diff} recorded — stock corrected`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchAudits();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, activeCategory]);

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
      fetchProducts();
      showToast('Stock updated');
      return true;
    } catch (err) {
      showToast(err.message, 'error');
      throw err;
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

  const selectedAuditProduct = products.find((p) => String(p.id) === String(auditForm.product_id));
  const auditVariance = selectedAuditProduct && auditForm.counted_qty !== ''
    ? Number(auditForm.counted_qty) - Number(selectedAuditProduct.stock_quantity)
    : null;
  const filteredAudits = adjustments.filter((a) =>
    !auditSearch || (a.product_name || '').toLowerCase().includes(auditSearch.toLowerCase()) || (a.reason || '').toLowerCase().includes(auditSearch.toLowerCase())
  );
  const auditProductOptions = products.filter((p) => {
    const q = auditProductSearch.trim().toLowerCase();
    const matchesSearch = !q ||
      p.name.toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q);
    const matchesCategory = auditProductCategory === 'All' || p.category === auditProductCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div>
      <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-3 mb-4">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-on-surface">Inventory</h1>
          <p className="text-on-surface-variant">Manage your product catalog and stock levels.</p>
        </div>
        {view === 'products' && (
        <div className="mb-4">
          <input
            type="text"
            placeholder="Search products, SKU, or categories..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border border-outline-variant rounded-lg px-4 py-2 mb-3"
          />
          <div className="flex gap-2 flex-wrap items-center">
            {quickCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${
                  activeCategory === cat
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-low text-on-surface-variant'
                }`}
              >
                {cat}
              </button>
            ))}
            {moreCategories.length > 0 && (
              <select
                value={activeInMore ? activeCategory : ''}
                onChange={(e) => setActiveCategory(e.target.value)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border-none cursor-pointer ${
                  activeInMore
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-low text-on-surface-variant'
                }`}
              >
                <option value="" disabled>{activeInMore ? activeCategory : 'More'}</option>
                {moreCategories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            )}
          </div>
        </div>
        )}
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

      <div className="flex gap-1 mb-6">
        {[{ key: 'products', label: 'Products' }, { key: 'audit', label: `Stock Audit${auditSummary?.shortage_counts ? ` (${auditSummary.shortage_counts})` : ''}` }].map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${view === t.key ? 'bg-primary-container text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-low'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === 'audit' && (
        <div className="space-y-4">
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4">
            <h2 className="font-semibold text-orange-800 text-sm mb-1">Find sold-but-unrecorded & missing stock</h2>
            <p className="text-orange-700 text-xs">Count the physical stock on your shelf, enter it below. If the shelf has fewer pieces than the system, the gap is logged as shrinkage — suspected unrecorded sale, theft, damage, etc. — and system stock is corrected.</p>
          </div>

          {auditSummary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-surface border border-outline-variant rounded-xl p-4">
                <p className="text-on-surface-variant text-xs">Shortages (30d)</p>
                <p className="text-2xl font-bold text-error">{auditSummary.shortage_counts}</p>
                <p className="text-xs text-on-surface-variant">₱{Number(auditSummary.shortage_value).toFixed(2)} cost value</p>
              </div>
              <div className="bg-surface border border-outline-variant rounded-xl p-4">
                <p className="text-on-surface-variant text-xs">Suspected unrecorded sales</p>
                <p className="text-2xl font-bold text-on-surface">{Number(auditSummary.unrecorded_units)} pcs</p>
                <p className="text-xs text-on-surface-variant">₱{Number(auditSummary.unrecorded_value).toFixed(2)} cost value</p>
              </div>
              <div className="bg-surface border border-outline-variant rounded-xl p-4">
                <p className="text-on-surface-variant text-xs">Theft / missing value</p>
                <p className="text-2xl font-bold text-on-surface">₱{Number(auditSummary.theft_value).toFixed(2)}</p>
                <p className="text-xs text-on-surface-variant">last 30 days</p>
              </div>
              <div className="bg-surface border border-outline-variant rounded-xl p-4">
                <p className="text-on-surface-variant text-xs">Overages (found extra)</p>
                <p className="text-2xl font-bold text-secondary">{auditSummary.overage_counts}</p>
                <p className="text-xs text-on-surface-variant">of {auditSummary.total_counts} audits</p>
              </div>
            </div>
          )}

          <div className="bg-surface border border-outline-variant rounded-xl p-4 lg:p-6">
            <h2 className="font-semibold text-on-surface mb-3">Record a physical count</h2>
            <form onSubmit={handleAuditSave} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="lg:col-span-2">
                <label className="text-sm text-on-surface-variant">Find product to audit</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1 mb-2">
                  <input
                    type="text"
                    placeholder="Search name, SKU, or category..."
                    value={auditProductSearch}
                    onChange={(e) => {
                      const q = e.target.value;
                      setAuditProductSearch(q);
                      setAuditForm((f) => {
                        if (!f.product_id) return f;
                        const stillThere = products.some((p) =>
                          String(p.id) === String(f.product_id) &&
                          (p.name.toLowerCase().includes(q.trim().toLowerCase()) ||
                            (p.sku || '').toLowerCase().includes(q.trim().toLowerCase()) ||
                            (p.category || '').toLowerCase().includes(q.trim().toLowerCase())) &&
                          (auditProductCategory === 'All' || p.category === auditProductCategory)
                        );
                        return stillThere ? f : { ...f, product_id: '' };
                      });
                    }}
                    className="border border-outline-variant rounded-lg px-3 py-2 text-sm"
                  />
                  <select value={auditProductCategory} onChange={(e) => {
                    const c = e.target.value;
                    setAuditProductCategory(c);
                    setAuditForm((f) => {
                      if (!f.product_id) return f;
                      const stillThere = products.some((p) =>
                        String(p.id) === String(f.product_id) &&
                        (c === 'All' || p.category === c)
                      );
                      return stillThere ? f : { ...f, product_id: '' };
                    });
                  }} className="border border-outline-variant rounded-lg px-3 py-2 text-sm">
                    {categories.map((c) => (
                      <option key={c} value={c}>{c === 'All' ? 'All categories' : c}</option>
                    ))}
                  </select>
                </div>
                <label className="text-sm text-on-surface-variant">Product ({auditProductOptions.length} found)</label>
                <select value={auditForm.product_id} onChange={(e) => setAuditForm((f) => ({ ...f, product_id: e.target.value }))} className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1">
                  <option value="">Select product...</option>
                  {auditProductOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} — system: {p.stock_quantity}</option>
                  ))}
                </select>
                {auditProductOptions.length === 0 && (
                  <p className="text-xs text-on-surface-variant mt-1">No products match — clear the search or pick another category.</p>
                )}
              </div>
              <div>
                <label className="text-sm text-on-surface-variant">System stock</label>
                <input type="text" disabled value={selectedAuditProduct ? selectedAuditProduct.stock_quantity : '—'} className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1 bg-surface-container-low" />
              </div>
              <div>
                <label className="text-sm text-on-surface-variant">Physical count (actual on shelf)</label>
                <input type="number" min="0" value={auditForm.counted_qty} onChange={(e) => setAuditForm((f) => ({ ...f, counted_qty: e.target.value }))} placeholder="e.g. 12" className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1" />
              </div>
              <div>
                <label className="text-sm text-on-surface-variant">What happened to the gap?</label>
                <select value={auditForm.reason} onChange={(e) => setAuditForm((f) => ({ ...f, reason: e.target.value }))} className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1">
                  {AUDIT_REASONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm text-on-surface-variant">Note (optional)</label>
                <input type="text" value={auditForm.notes} onChange={(e) => setAuditForm((f) => ({ ...f, notes: e.target.value }))} placeholder="e.g. cctv checked, shelf recount..." className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1" />
              </div>
              {auditVariance !== null && auditVariance !== 0 && (
                <p className={`lg:col-span-2 text-sm font-medium ${auditVariance < 0 ? 'text-error' : 'text-secondary'}`}>
                  Variance: {auditVariance > 0 ? `+${auditVariance}` : auditVariance} pcs {auditVariance < 0 ? 'short — will deduct from system stock' : 'over — will add to system stock'}
                </p>
              )}
              <button type="submit" className="lg:col-span-2 w-full bg-primary text-on-primary font-semibold py-3 rounded-lg">Save count & correct stock</button>
            </form>
          </div>

          <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
            <div className="p-4 border-b border-outline-variant flex flex-col sm:flex-row sm:justify-between gap-2">
              <h2 className="font-semibold text-on-surface">Audit history — shrinkage log</h2>
              <input type="text" placeholder="Search product or reason..." value={auditSearch} onChange={(e) => setAuditSearch(e.target.value)} className="border border-outline-variant rounded-lg px-3 py-1.5 text-sm" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[720px]">
                <thead className="bg-surface-container-low text-on-surface-variant">
                  <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">System → Counted</th><th className="px-4 py-3">Variance</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">By</th></tr>
                </thead>
                <tbody>
                  {filteredAudits.map((a) => (
                    <tr key={a.id} className="border-t border-outline-variant">
                      <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-on-surface font-medium">{a.product_name}{a.notes ? <span className="block text-xs font-normal text-on-surface-variant">{a.notes}</span> : null}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{a.system_qty} → {a.counted_qty}</td>
                      <td className={`px-4 py-3 font-bold ${Number(a.difference) < 0 ? 'text-error' : 'text-secondary'}`}>{Number(a.difference) > 0 ? `+${a.difference}` : a.difference} <span className="block text-xs font-normal text-on-surface-variant">₱{Number(a.cost_impact).toFixed(2)}</span></td>
                      <td className="px-4 py-3"><span className="px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">{reasonLabel(a.reason)}</span></td>
                      <td className="px-4 py-3 text-on-surface-variant">{a.created_by_name || '—'}</td>
                    </tr>
                  ))}
                  {filteredAudits.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-on-surface-variant">No audits yet. Do your first physical count above.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {view === 'products' && (
        <>
      <div className="mb-4"></div>

      {/* Mobile: stacked cards, hidden at lg and above */}
      <div className="lg:hidden space-y-3">
        {paginatedProducts.map((product) => {
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
                <p className="text-on-surface-variant text-xs mt-1">{formatStock(product)}</p>
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
            {paginatedProducts.map((product) => {
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
                    <p className="text-on-surface-variant text-xs mt-1">{formatStock(product)}</p>
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

      <div className="flex justify-between items-center mt-4 text-sm text-on-surface-variant">
        <span>
          Showing {filteredProducts.length === 0 ? 0 : (page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filteredProducts.length)} of {filteredProducts.length}
        </span>
        <div className="flex gap-1">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-1 border border-outline-variant rounded disabled:opacity-40"
          >
            Previous
          </button>
          <span className="px-2 py-1">{page} / {totalPages}</span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-1 border border-outline-variant rounded disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
        </>
      )}

      <ProductModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        initialData={editingProduct}
        knownCategories={categories.filter((c) => c !== 'All')}
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