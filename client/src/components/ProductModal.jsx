import { useState, useEffect } from 'react';

const emptyForm = {
  name: '', sku: '', category: '', cost_price: '', selling_price: '',
  stock_quantity: '', low_stock_threshold: '10', supplier: '',
  units_per_pack: '', unit_label: ''
};

function ProductModal({ isOpen, onClose, onSave, initialData, knownCategories = [] }) {
  const [form, setForm] = useState(emptyForm);
  const [addingNewCategory, setAddingNewCategory] = useState(false);

  // When editing, pre-fill the form with the product's existing data.
  // When adding, reset to blank. This runs every time the modal opens.
  useEffect(() => {
    setForm(initialData ? { ...initialData } : emptyForm);
    setAddingNewCategory(false);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // Cost price is stored per piece/stick, but entered per pack when units_per_pack is set
  // e.g. Camel ₱145/pack ÷ 20 sticks = ₱7.25/stick stored.
  const unitsPerPack = Number(form.units_per_pack) || 0;
  const hasPack = unitsPerPack > 0;
  const costPerPackDisplay =
    form.cost_price === '' || form.cost_price == null || !hasPack
      ? hasPack
        ? ''
        : form.cost_price
      : String(Math.round(Number(form.cost_price) * unitsPerPack * 100) / 100);

  const handleCostPerPackChange = (e) => {
    const value = e.target.value;
    if (value === '') {
      setForm((prev) => ({ ...prev, cost_price: '' }));
      return;
    }
    const perPiece = Math.round((Number(value) / unitsPerPack) * 10000) / 10000;
    setForm((prev) => ({ ...prev, cost_price: perPiece }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-surface rounded-xl p-6 w-full max-w-md shadow-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold text-on-surface mb-4">
          {initialData ? 'Edit Product' : 'Add New Product'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-sm font-medium text-on-surface-variant">Product Name *</label>
            <input
              name="name" value={form.name} onChange={handleChange} required
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-on-surface-variant">SKU</label>
              <input
                name="sku" value={form.sku || ''} onChange={handleChange}
                className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-on-surface-variant">Category</label>
              {addingNewCategory || knownCategories.length === 0 ? (
                <div className="flex gap-2 mt-1">
                  <input
                    name="category" value={form.category || ''} onChange={handleChange}
                    placeholder="Type a new category"
                    className="w-full border border-outline-variant rounded-lg px-3 py-2"
                  />
                  {knownCategories.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAddingNewCategory(false)}
                      className="px-3 py-2 rounded-lg border border-outline-variant text-on-surface-variant text-sm whitespace-nowrap"
                    >
                      Choose existing
                    </button>
                  )}
                </div>
              ) : (
                <select
                  name="category"
                  value={form.category || ''}
                  onChange={(e) => {
                    if (e.target.value === '__new__') {
                      setAddingNewCategory(true);
                      setForm((prev) => ({ ...prev, category: '' }));
                    } else {
                      handleChange(e);
                    }
                  }}
                  className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
                >
                  <option value="">Select category...</option>
                  {knownCategories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                  <option value="__new__">+ Add new category</option>
                </select>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-on-surface-variant">
                {hasPack ? 'Cost Price per Pack (₱)' : 'Cost Price (₱)'}
              </label>
              {hasPack ? (
                <>
                  <input
                    type="number" step="0.01" min="0" value={costPerPackDisplay}
                    onChange={handleCostPerPackChange}
                    placeholder="e.g. 145"
                    className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
                  />
                  {form.cost_price !== '' && form.cost_price != null && (
                    <p className="text-xs text-on-surface-variant mt-1">
                      = ₱{Number(form.cost_price)} per {form.unit_label || 'pc'}
                    </p>
                  )}
                </>
              ) : (
                <input
                  type="number" step="0.01" name="cost_price" value={form.cost_price}
                  onChange={handleChange}
                  className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
                />
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-on-surface-variant">Selling Price (₱) *</label>
              <input
                type="number" step="0.01" name="selling_price" value={form.selling_price}
                onChange={handleChange} required
                className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-on-surface-variant">Stock Quantity</label>
              <input
                type="number" name="stock_quantity" value={form.stock_quantity}
                onChange={handleChange}
                className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-on-surface-variant">Low Stock Alert</label>
              <input
                type="number" name="low_stock_threshold" value={form.low_stock_threshold}
                onChange={handleChange}
                className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-on-surface-variant">Supplier</label>
            <input
              name="supplier" value={form.supplier || ''} onChange={handleChange}
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-on-surface-variant">Units per Pack</label>
              <input
                type="number" name="units_per_pack" value={form.units_per_pack || ''} onChange={handleChange}
                placeholder="e.g. 20"
                className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-on-surface-variant">Unit Name</label>
              <input
                name="unit_label" value={form.unit_label || ''} onChange={handleChange}
                placeholder="e.g. stick"
                className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
              />
            </div>
          </div>
          <p className="text-xs text-on-surface-variant -mt-2">
            Optional — only fill this in for products sold by pack but tracked by individual pieces (e.g. cigarettes).
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-primary text-on-primary font-medium"
            >
              Save Product
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ProductModal;