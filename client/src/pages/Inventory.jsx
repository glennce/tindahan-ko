import { apiFetch } from '../api';
import { useState, useEffect } from 'react';
import ProductModal from '../components/ProductModal';
import RepackModal from '../components/RepackModal';
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
  const [repackOpen, setRepackOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const { showToast } = useToast();
  const [page, setPage] = useState(1);
  const PER_PAGE = 20;
  const [view, setView] = useState('products');
  const [adjustments, setAdjustments] = useState([]);
  const [auditSummary, setAuditSummary] = useState(null);
  const [quickCounts, setQuickCounts] = useState({});
  const [quickReason, setQuickReason] = useState('unrecorded_sale');
  const [quickNotes, setQuickNotes] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditProductSearch, setAuditProductSearch] = useState('');
  const [auditProductCategory, setAuditProductCategory] = useState('All');
  const [auditPage, setAuditPage] = useState(1);
  const AUDIT_PER_PAGE = 20;
  // Bulk Stock In (audit-style): one row per product, one save for all
  const [stockinRows, setStockinRows] = useState({});
  const [stockinSearch, setStockinSearch] = useState('');
  const [stockinCategory, setStockinCategory] = useState('All');
  const [stockinSaving, setStockinSaving] = useState(false);
  const [restockLogs, setRestockLogs] = useState([]);
  const [restockSearch, setRestockSearch] = useState('');
  const [restockPage, setRestockPage] = useState(1);
  const RESTOCK_PER_PAGE = 20;
  const [stockinPage, setStockinPage] = useState(1);
  const STOCKIN_PER_PAGE = 20;
  const [auditCountPage, setAuditCountPage] = useState(1);
  const AUDIT_COUNT_PER_PAGE = 20;

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
    apiFetch('/restock-logs').then((res) => res.json()).then((d) => Array.isArray(d) && setRestockLogs(d)).catch(() => {});
  };

  // One button updates every entered shelf count at once
  const quickPendingCount = Object.values(quickCounts).filter((v) => v !== '' && v != null).length;
  const handleBulkSave = async () => {
    const entries = Object.entries(quickCounts).filter(([, v]) => v !== '' && v != null);
    if (entries.length === 0) { showToast('Enter at least one shelf count', 'error'); return; }
    const byId = Object.fromEntries(products.map((p) => [String(p.id), p]));
    const invalid = entries.filter(([, v]) => { const n = Number(v); return !Number.isFinite(n) || n < 0; });
    if (invalid.length > 0) {
      showToast(`Invalid count for: ${invalid.map(([id]) => byId[id]?.name || `#${id}`).join(', ')}`, 'error');
      return;
    }
    setBulkSaving(true);
    try {
      const res = await apiFetch('/stock-adjustments/bulk', {
        method: 'POST',
        body: JSON.stringify({
          items: entries.map(([id, v]) => ({ product_id: Number(id), counted_qty: Number(v) })),
          reason: quickReason,
          notes: quickNotes,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Bulk update failed');
      const savedIds = new Set((result.saved || []).map((s) => String(s.product_id)));
      const skippedIds = new Set((result.skipped || []).map((s) => String(s.product_id)));
      setQuickCounts((prev) => {
        const next = { ...prev };
        for (const id of [...savedIds, ...skippedIds]) delete next[id];
        return next;
      });
      fetchProducts();
      fetchAudits();
      const skipped = (result.skipped || []).length;
      showToast(
        skipped > 0
          ? `Updated ${savedIds.size} product${savedIds.size === 1 ? '' : 's'} (${skipped} unchanged — skipped)`
          : `Updated ${savedIds.size} product${savedIds.size === 1 ? '' : 's'} — stocks corrected`
      );
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setBulkSaving(false);
    }
  };

  useEffect(() => {
    fetchProducts();
    fetchAudits();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, activeCategory]);

  useEffect(() => {
    setAuditPage(1);
  }, [auditSearch]);

  useEffect(() => {
    setRestockPage(1);
  }, [restockSearch]);

  useEffect(() => {
    setStockinPage(1);
  }, [stockinSearch, stockinCategory]);

  useEffect(() => {
    setAuditCountPage(1);
  }, [auditProductSearch, auditProductCategory]);

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

  const setStockinField = (id, field, value) => {
    setStockinRows((prev) => ({ ...prev, [id]: { packs: '', loose: '', costPack: '', ...(prev[id] || {}), [field]: value } }));
  };

  const stockinPiecesFor = (p, row) => {
    if (!row) return 0;
    const packs = Number(row.packs) || 0;
    const loose = Number(String(row.loose).replace(/[^0-9]/g, '')) || 0;
    if (packs < 0 || loose < 0) return -1;
    return p.units_per_pack ? packs * p.units_per_pack + loose : packs + loose;
  };

  const stockinCostPerPieceFor = (p, row) => {
    if (!row?.costPack) return null;
    const packPrice = Number(row.costPack);
    if (!Number.isFinite(packPrice) || packPrice < 0) return -1;
    if (p.units_per_pack) return Math.round((packPrice / p.units_per_pack) * 10000) / 10000;
    return packPrice;
  };

  // One button adds stock to every filled-in row at once
  const stockinPendingCount = Object.entries(stockinRows).filter(([id, row]) => {
    if (!row) return false;
    const p = products.find((x) => String(x.id) === String(id));
    if (!p) return false;
    return stockinPiecesFor(p, row) > 0;
  }).length;

  const handleBulkStockIn = async () => {
    const byId = Object.fromEntries(products.map((p) => [String(p.id), p]));
    const items = [];
    for (const [id, row] of Object.entries(stockinRows)) {
      const p = byId[id];
      if (!p || !row) continue;
      const pieces = stockinPiecesFor(p, row);
      if (pieces <= 0) continue;
      const costPerPiece = stockinCostPerPieceFor(p, row);
      if (pieces < 0 || costPerPiece === -1) {
        showToast(`Invalid entry for: ${p.name}`, 'error');
        return;
      }
      items.push({ product_id: Number(id), quantity: pieces, cost_price: costPerPiece });
    }
    if (items.length === 0) { showToast('Enter at least one stock-in quantity', 'error'); return; }
    setStockinSaving(true);
    try {
      const res = await apiFetch(`${API}/restock/bulk`, {
        method: 'POST',
        body: JSON.stringify({ items }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Stock-in failed');
      const savedIds = new Set((result.saved || []).map((s) => String(s.id)));
      setStockinRows((prev) => {
        const next = { ...prev };
        for (const id of savedIds) delete next[id];
        return next;
      });
      fetchProducts();
      fetchAudits();
      showToast(`Stocked in ${savedIds.size} product${savedIds.size === 1 ? '' : 's'}`);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setStockinSaving(false);
    }
  };

  const handleRepack = async (data) => {
    try {
      const res = await apiFetch(`${API}/repack`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Repack failed');
      fetchProducts();
      showToast(`Repacked ${result.log.source_qty} ${result.log.source_name} → ${result.log.dest_qty} ${result.log.dest_name}`);
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

  const filteredAudits = adjustments.filter((a) =>
    !auditSearch || (a.product_name || '').toLowerCase().includes(auditSearch.toLowerCase()) || (a.reason || '').toLowerCase().includes(auditSearch.toLowerCase())
  );
  const auditTotalPages = Math.max(Math.ceil(filteredAudits.length / AUDIT_PER_PAGE), 1);
  const paginatedAudits = filteredAudits.slice((auditPage - 1) * AUDIT_PER_PAGE, auditPage * AUDIT_PER_PAGE);
  // Quick-count list: same products, grouped by category for fast shelf updates
  const quickList = products.filter((p) => {
    const q = auditProductSearch.trim().toLowerCase();
    const matchesSearch = !q ||
      p.name.toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q);
    const matchesCategory = auditProductCategory === 'All' || (p.category || '') === auditProductCategory;
    return matchesSearch && matchesCategory;
  });
  const quickGroups = [...categories.filter((c) => c !== 'All'), ''];
  // Quick-count list is paginated (same 20/page pattern as Products) so long
  // catalogs stay usable; category headers are kept for items on this page.
  const auditCountTotalPages = Math.max(Math.ceil(quickList.length / AUDIT_COUNT_PER_PAGE), 1);
  const safeAuditCountPage = Math.min(auditCountPage, auditCountTotalPages);
  const paginatedQuickList = quickList.slice((safeAuditCountPage - 1) * AUDIT_COUNT_PER_PAGE, safeAuditCountPage * AUDIT_COUNT_PER_PAGE);
  const quickVisibleGroups = quickGroups
    .map((c) => ({ name: c || 'Uncategorized', items: paginatedQuickList.filter((p) => (p.category || '') === c) }))
    .filter((g) => g.items.length > 0);
  // Bulk stock-in list: same products, same grouping as audit
  const stockinList = products.filter((p) => {
    const q = stockinSearch.trim().toLowerCase();
    const matchesSearch = !q ||
      p.name.toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q);
    const matchesCategory = stockinCategory === 'All' || (p.category || '') === stockinCategory;
    return matchesSearch && matchesCategory;
  });
  // Paginate the stock-in entry list (20/page, same as Products); category headers kept for this page.
  const stockinTotalPages = Math.max(Math.ceil(stockinList.length / STOCKIN_PER_PAGE), 1);
  const safeStockinPage = Math.min(stockinPage, stockinTotalPages);
  const paginatedStockinList = stockinList.slice((safeStockinPage - 1) * STOCKIN_PER_PAGE, safeStockinPage * STOCKIN_PER_PAGE);
  const stockinVisibleGroups = quickGroups
    .map((c) => ({ name: c || 'Uncategorized', items: paginatedStockinList.filter((p) => (p.category || '') === c) }))
    .filter((g) => g.items.length > 0);
  // Restock audit history
  const filteredRestocks = restockLogs.filter((r) =>
    !restockSearch || (r.product_name || '').toLowerCase().includes(restockSearch.toLowerCase())
  );
  const restockTotalPages = Math.max(Math.ceil(filteredRestocks.length / RESTOCK_PER_PAGE), 1);
  const paginatedRestocks = filteredRestocks.slice((restockPage - 1) * RESTOCK_PER_PAGE, restockPage * RESTOCK_PER_PAGE);

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
            onClick={() => setView('stockin')}
            className="border border-primary text-primary font-medium px-4 py-2 rounded-lg"
          >
            Stock In
          </button>
          <button
            onClick={() => setRepackOpen(true)}
            className="border border-primary text-primary font-medium px-4 py-2 rounded-lg"
          >
            Repack
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
        {[{ key: 'products', label: 'Products' }, { key: 'stockin', label: `Stock In${stockinPendingCount > 0 ? ` (${stockinPendingCount})` : ''}` }, { key: 'audit', label: `Stock Audit${auditSummary?.shortage_counts ? ` (${auditSummary.shortage_counts})` : ''}` }].map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${view === t.key ? 'bg-primary-container text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-low'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === 'stockin' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h2 className="font-semibold text-blue-800 text-sm mb-1">Restock many products at once</h2>
            <p className="text-blue-700 text-xs">Fill in packs / loose pieces / cost per pack for every delivery below, then hit one button — same inputs as the old Stock In form, just all on one page.</p>
          </div>

          <div className="bg-surface border border-outline-variant rounded-xl p-4 lg:p-6">
            <h2 className="font-semibold text-on-surface mb-1">Bulk stock in</h2>
            <p className="text-xs text-on-surface-variant mb-3">Enter what arrived and hit Save — stocks add up instantly.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
              <input
                type="text"
                placeholder="Search name, SKU, or category..."
                value={stockinSearch}
                onChange={(e) => setStockinSearch(e.target.value)}
                className="border border-outline-variant rounded-lg px-3 py-2 text-sm"
              />
              <select value={stockinCategory} onChange={(e) => setStockinCategory(e.target.value)} className="border border-outline-variant rounded-lg px-3 py-2 text-sm">
                {categories.map((c) => (
                  <option key={c} value={c}>{c === 'All' ? 'All categories' : c}</option>
                ))}
              </select>
            </div>
            {stockinVisibleGroups.length === 0 && (
              <p className="text-sm text-on-surface-variant text-center py-4">No products match — clear the search or pick another category.</p>
            )}
            {stockinVisibleGroups.map((g) => (
              <div key={g.name} className="mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-1">{g.name} ({g.items.length})</h3>
                <div className="space-y-1.5">
                  {g.items.map((p) => {
                    const row = stockinRows[p.id] || { packs: '', loose: '', costPack: '' };
                    const pieces = stockinPiecesFor(p, row);
                    const costPerPiece = stockinCostPerPieceFor(p, row);
                    const hasEntry = pieces > 0;
                    return (
                      <div key={p.id} className={`border rounded-lg px-3 py-2 ${hasEntry ? 'border-primary bg-primary-container/20' : 'border-outline-variant'}`}>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-on-surface truncate">{p.name}</p>
                            <p className="text-xs text-on-surface-variant">Now: {formatStock(p)}
                              {hasEntry && (
                                <span className="font-medium text-secondary"> → +{pieces} = {Number(p.stock_quantity) + pieces}</span>
                              )}
                            </p>
                          </div>
                          {p.units_per_pack ? (
                            <span className="text-[11px] text-on-surface-variant whitespace-nowrap">{p.units_per_pack} {p.unit_label}s/pack</span>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2">
                          <div>
                            <label className="text-[11px] font-medium text-on-surface-variant">{p.units_per_pack ? 'Per Pack' : 'Packs / Qty'}</label>
                            <input
                              type="number" min="0" value={row.packs}
                              onChange={(e) => setStockinField(p.id, 'packs', e.target.value)}
                              placeholder="0"
                              className="w-full border border-outline-variant rounded-lg px-2 py-1.5 text-sm text-right"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-medium text-on-surface-variant">{p.units_per_pack ? `Loose ${p.unit_label}s` : 'Loose pcs'}</label>
                            <input
                              type="text" inputMode="numeric" value={row.loose}
                              onChange={(e) => setStockinField(p.id, 'loose', e.target.value.replace(/[^0-9]/g, ''))}
                              placeholder="0"
                              className="w-full border border-outline-variant rounded-lg px-2 py-1.5 text-sm text-right"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-medium text-on-surface-variant">{p.units_per_pack ? 'Cost/pack ₱' : 'Cost ₱'}</label>
                            <input
                              type="number" min="0" step="0.01" value={row.costPack}
                              onChange={(e) => setStockinField(p.id, 'costPack', e.target.value)}
                              placeholder={p.units_per_pack ? `₱${(Number(p.cost_price) * p.units_per_pack).toFixed(2)}` : `₱${p.cost_price}`}
                              className="w-full border border-outline-variant rounded-lg px-2 py-1.5 text-sm text-right"
                            />
                          </div>
                        </div>
                        {row.costPack && costPerPiece > 0 && (
                          <p className="text-[11px] text-on-surface-variant mt-1">
                            = ₱{Number(costPerPiece).toFixed(2)} per {p.units_per_pack ? (p.unit_label || 'pc') : 'pc'}. Leave blank to keep current cost.
                          </p>
                        )}
                        {!row.costPack && (
                          <p className="text-[11px] text-on-surface-variant mt-1">Leave cost blank to keep current cost.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="flex justify-between items-center mt-2 mb-1 text-sm text-on-surface-variant">
              <span>
                Showing {stockinList.length === 0 ? 0 : (safeStockinPage - 1) * STOCKIN_PER_PAGE + 1}–{Math.min(safeStockinPage * STOCKIN_PER_PAGE, stockinList.length)} of {stockinList.length}
              </span>
              <div className="flex gap-1 items-center">
                <button
                  disabled={safeStockinPage <= 1}
                  onClick={() => setStockinPage((p) => p - 1)}
                  className="px-3 py-1 border border-outline-variant rounded disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="px-2 py-1">{safeStockinPage} / {stockinTotalPages}</span>
                <button
                  disabled={safeStockinPage >= stockinTotalPages}
                  onClick={() => setStockinPage((p) => p + 1)}
                  className="px-3 py-1 border border-outline-variant rounded disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
            <button
              onClick={handleBulkStockIn} disabled={stockinSaving || stockinPendingCount === 0}
              className="w-full bg-primary text-on-primary font-semibold py-3 rounded-lg disabled:opacity-50 mt-1"
            >
              {stockinSaving ? 'Saving...' : stockinPendingCount > 0 ? `Confirm Stock In (${stockinPendingCount})` : 'Confirm Stock In'}
            </button>
          </div>

          <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
            <div className="p-4 border-b border-outline-variant flex flex-col sm:flex-row sm:justify-between gap-2">
              <h2 className="font-semibold text-on-surface">Restock history — stock-in log</h2>
              <input type="text" placeholder="Search product..." value={restockSearch} onChange={(e) => setRestockSearch(e.target.value)} className="border border-outline-variant rounded-lg px-3 py-1.5 text-sm" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[720px]">
                <thead className="bg-surface-container-low text-on-surface-variant">
                  <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Product</th><th className="px-4 py-3">Added</th><th className="px-4 py-3">Before → After</th><th className="px-4 py-3">Cost</th><th className="px-4 py-3">By</th></tr>
                </thead>
                <tbody>
                  {paginatedRestocks.map((r) => (
                    <tr key={r.id} className="border-t border-outline-variant">
                      <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-on-surface font-medium">{r.product_name}</td>
                      <td className="px-4 py-3 font-bold text-secondary">+{r.qty_added}</td>
                      <td className="px-4 py-3 text-on-surface-variant">{r.old_qty} → {r.new_qty}</td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {r.old_cost != null || r.new_cost != null
                          ? `₱${Number(r.old_cost ?? 0).toFixed(2)} → ₱${Number(r.new_cost ?? 0).toFixed(2)}`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">{r.created_by_name || '—'}</td>
                    </tr>
                  ))}
                  {filteredRestocks.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-on-surface-variant">No restocks yet. Stock in products above and every delivery will be logged here.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center px-4 py-3 text-sm text-on-surface-variant border-t border-outline-variant">
              <span>
                Showing {filteredRestocks.length === 0 ? 0 : (restockPage - 1) * RESTOCK_PER_PAGE + 1}–{Math.min(restockPage * RESTOCK_PER_PAGE, filteredRestocks.length)} of {filteredRestocks.length}
              </span>
              <div className="flex gap-1 items-center">
                <button
                  disabled={restockPage <= 1}
                  onClick={() => setRestockPage((p) => p - 1)}
                  className="px-3 py-1 border border-outline-variant rounded disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="px-2 py-1">{restockPage} / {restockTotalPages}</span>
                <button
                  disabled={restockPage >= restockTotalPages}
                  onClick={() => setRestockPage((p) => p + 1)}
                  className="px-3 py-1 border border-outline-variant rounded disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
            <h2 className="font-semibold text-on-surface mb-1">Quick shelf count</h2>
            <p className="text-xs text-on-surface-variant mb-3">Type what you actually see on the shelf and hit Save — system stock corrects instantly and the gap is logged below.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
              <input
                type="text"
                placeholder="Search name, SKU, or category..."
                value={auditProductSearch}
                onChange={(e) => setAuditProductSearch(e.target.value)}
                className="border border-outline-variant rounded-lg px-3 py-2 text-sm"
              />
              <select value={auditProductCategory} onChange={(e) => setAuditProductCategory(e.target.value)} className="border border-outline-variant rounded-lg px-3 py-2 text-sm">
                {categories.map((c) => (
                  <option key={c} value={c}>{c === 'All' ? 'All categories' : c}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-1">
              <select value={quickReason} onChange={(e) => setQuickReason(e.target.value)} className="border border-outline-variant rounded-lg px-3 py-2 text-sm">
                {AUDIT_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <input type="text" value={quickNotes} onChange={(e) => setQuickNotes(e.target.value)} placeholder="Note for all saves (optional)" className="border border-outline-variant rounded-lg px-3 py-2 text-sm" />
            </div>
            <p className="text-xs text-on-surface-variant mb-3">Gap reason + note above apply to every save below.</p>
            {quickVisibleGroups.length === 0 && (
              <p className="text-sm text-on-surface-variant text-center py-4">No products match — clear the search or pick another category.</p>
            )}
            {quickVisibleGroups.map((g) => (
              <div key={g.name} className="mb-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant mb-1">{g.name} ({g.items.length})</h3>
                <div className="space-y-1.5">
                  {g.items.map((p) => {
                    const raw = quickCounts[p.id];
                    const diff = raw === '' || raw == null ? null : Number(raw) - Number(p.stock_quantity);
                    return (
                      <div key={p.id} className="flex items-center gap-2 border border-outline-variant rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-on-surface truncate">{p.name}</p>
                          <p className="text-xs text-on-surface-variant">System: {p.stock_quantity}
                            {diff !== null && !Number.isNaN(diff) && diff !== 0 && (
                              <span className={`font-medium ${diff < 0 ? 'text-error' : 'text-secondary'}`}> → {diff > 0 ? `+${diff}` : diff}</span>
                            )}
                          </p>
                        </div>
                        <input
                          type="number" min="0" value={raw ?? ''}
                          onChange={(e) => setQuickCounts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                          placeholder="Shelf"
                          className="w-24 border border-outline-variant rounded-lg px-2 py-1.5 text-sm text-right"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="flex justify-between items-center mt-2 mb-1 text-sm text-on-surface-variant">
              <span>
                Showing {quickList.length === 0 ? 0 : (safeAuditCountPage - 1) * AUDIT_COUNT_PER_PAGE + 1}–{Math.min(safeAuditCountPage * AUDIT_COUNT_PER_PAGE, quickList.length)} of {quickList.length}
              </span>
              <div className="flex gap-1 items-center">
                <button
                  disabled={safeAuditCountPage <= 1}
                  onClick={() => setAuditCountPage((p) => p - 1)}
                  className="px-3 py-1 border border-outline-variant rounded disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="px-2 py-1">{safeAuditCountPage} / {auditCountTotalPages}</span>
                <button
                  disabled={safeAuditCountPage >= auditCountTotalPages}
                  onClick={() => setAuditCountPage((p) => p + 1)}
                  className="px-3 py-1 border border-outline-variant rounded disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
            <button
              onClick={handleBulkSave} disabled={bulkSaving || quickPendingCount === 0}
              className="w-full bg-primary text-on-primary font-semibold py-3 rounded-lg disabled:opacity-50 mt-1"
            >
              {bulkSaving ? 'Updating...' : quickPendingCount > 0 ? `Update All (${quickPendingCount})` : 'Update All'}
            </button>
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
                  {paginatedAudits.map((a) => (
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
            <div className="flex justify-between items-center px-4 py-3 text-sm text-on-surface-variant border-t border-outline-variant">
              <span>
                Showing {filteredAudits.length === 0 ? 0 : (auditPage - 1) * AUDIT_PER_PAGE + 1}–{Math.min(auditPage * AUDIT_PER_PAGE, filteredAudits.length)} of {filteredAudits.length}
              </span>
              <div className="flex gap-1 items-center">
                <button
                  disabled={auditPage <= 1}
                  onClick={() => setAuditPage((p) => p - 1)}
                  className="px-3 py-1 border border-outline-variant rounded disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="px-2 py-1">{auditPage} / {auditTotalPages}</span>
                <button
                  disabled={auditPage >= auditTotalPages}
                  onClick={() => setAuditPage((p) => p + 1)}
                  className="px-3 py-1 border border-outline-variant rounded disabled:opacity-40"
                >
                  Next
                </button>
              </div>
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

      <RepackModal
        isOpen={repackOpen}
        onClose={() => setRepackOpen(false)}
        onSave={handleRepack}
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