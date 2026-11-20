import { useState, useEffect } from 'react';

const emptyForm = {
  name: '', sku: '', category: '', cost_price: '', selling_price: '',
  stock_quantity: '', low_stock_threshold: '10', supplier: '',
  units_per_pack: '', unit_label: ''
};

function ProductModal({ isOpen, onClose, onSave, initialData, knownCategories = [], products = [] }) {
  const [form, setForm] = useState(emptyForm);
  const [addingNewCategory, setAddingNewCategory] = useState(false);
  // Combo / prepared product (e.g. brewed coffee = Kopiko sachet + Styro cup).
  // isCombo switches the form from "own stock" to "components" mode.
  const [isCombo, setIsCombo] = useState(false);
  const [components, setComponents] = useState([]); // [{ product_id, quantity }]

  // When editing, pre-fill the form with the product's existing data.
  // When adding, reset to blank. This runs every time the modal opens.
  useEffect(() => {
    const existing = Array.isArray(initialData?.components) ? initialData.components : [];
    setForm(initialData ? { ...initialData } : emptyForm);
    setIsCombo(existing.length > 0);
    setComponents(
      existing.map((c) => ({ product_id: Number(c.product_id), quantity: Number(c.quantity) }))
    );
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

  // ---- Combo / prepared product helpers ---------------------------------
  const selfId = initialData ? Number(initialData.id) : null;
  const comboRows = components
    .map((c) => ({ ...c, product: products.find((p) => Number(p.id) === Number(c.product_id)) }))
    .filter((c) => c.product);
  // Combo cost = Σ (component cost × qty) — kept in sync with the server.
  const comboCost = comboRows.reduce(
    (sum, c) => sum + Number(c.quantity) * Number(c.product.cost_price || 0),
    0
  );
  // Candidates: not the combo itself, not already added, and not a combo
  // itself (recipes are one level deep only).
  const availableProducts = products.filter(
    (p) =>
      Number(p.id) !== selfId &&
      !components.some((c) => Number(c.product_id) === Number(p.id)) &&
      !(Array.isArray(p.components) && p.components.length > 0)
  );
  const comboInvalid =
    isCombo &&
    (components.length === 0 ||
      components.some((c) => !(Number(c.quantity) > 0)));

  const addComponent = (id) => {
    const pid = Number(id);
    if (!pid) return;
    setComponents((prev) =>
      prev.some((c) => Number(c.product_id) === pid)
        ? prev
        : [...prev, { product_id: pid, quantity: 1 }]
    );
  };
  const setComponentQty = (pid, qty) =>
    setComponents((prev) =>
      prev.map((c) => (Number(c.product_id) === Number(pid) ? { ...c, quantity: qty } : c))
    );
  const removeComponent = (pid) =>
    setComponents((prev) => prev.filter((c) => Number(c.product_id) !== Number(pid)));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (comboInvalid) return;
    onSave({
      ...form,
      // Explicit components list: [] turns the product back into a regular one.
      components: isCombo
        ? components.map((c) => ({ product_id: Number(c.product_id), quantity: Number(c.quantity) }))
        : [],
      ...(isCombo
        ? { cost_price: Math.round(comboCost * 10000) / 10000 }
        : {}),
    });
  };

  

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl p-4 sm:p-6 w-full max-w-md shadow-lg max-h-[90vh] overflow-y-auto">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-on-surface-variant">
                {isCombo
                  ? 'Cost Price (₱) — from components'
                  : hasPack
                    ? 'Cost Price per Pack (₱)'
                    : 'Cost Price (₱)'}
              </label>
              {isCombo ? (
                <input
                  type="number" step="0.01" disabled
                  value={Math.round(comboCost * 100) / 100}
                  className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1 bg-surface-container text-on-surface-variant"
                />
              ) : hasPack ? (
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
          {/* Combo / prepared product: built from other products at sale time */}
          <div className="border border-outline-variant rounded-lg p-3 bg-surface-container-low">
            <label className="flex items-center gap-2 text-sm font-medium text-on-surface">
              <input
                type="checkbox"
                checked={isCombo}
                onChange={(e) => setIsCombo(e.target.checked)}
                className="h-4 w-4"
              />
              Prepared / combo product
            </label>
            <p className="text-xs text-on-surface-variant mt-1">
              Something you assemble yourself (e.g. brewed coffee served in a Styro cup). It sells as one line
              in the POS, but each sale deducts the stock of its components.
            </p>
            {isCombo && (
              <div className="mt-3 space-y-2">
                <select
                  value=""
                  onChange={(e) => addComponent(e.target.value)}
                  className="w-full border border-outline-variant rounded-lg px-3 py-2 text-sm bg-surface"
                >
                  <option value="">
                    {availableProducts.length === 0
                      ? 'No products available to add'
                      : 'Add a component product...'}
                  </option>
                  {availableProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — ₱{p.selling_price}
                      {Number(p.stock_quantity) > 0 ? ` (${p.stock_quantity} left)` : ' (out of stock)'}
                    </option>
                  ))}
                </select>
                {comboRows.map((c) => (
                  <div
                    key={c.product_id}
                    className="flex items-center gap-2 bg-surface border border-outline-variant rounded-lg px-2 py-1.5"
                  >
                    <span className="flex-1 min-w-0 truncate text-sm text-on-surface">{c.product.name}</span>
                    <span className="text-xs text-on-surface-variant shrink-0">× qty</span>
                    <input
                      type="number" min="1" step="1"
                      value={c.quantity}
                      onChange={(e) => setComponentQty(c.product_id, e.target.value)}
                      className="w-16 border border-outline-variant rounded px-2 py-1 text-sm text-right"
                    />
                    <button
                      type="button"
                      onClick={() => removeComponent(c.product_id)}
                      className="text-error text-sm px-1 py-1"
                      title="Remove component"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {comboInvalid && (
                  <p className="text-xs text-error">
                    {components.length === 0
                      ? 'Add at least one component.'
                      : 'Every component needs a quantity of at least 1.'}
                  </p>
                )}
                {comboRows.length > 0 && (
                  <p className="text-xs text-on-surface-variant">
                    Cost ₱{comboCost.toFixed(2)} per combo (auto from components) · Stock is managed by the
                    components, not by this product.
                  </p>
                )}
              </div>
            )}
          </div>
          {!isCombo && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          )}
          <div>
            <label className="text-sm font-medium text-on-surface-variant">Supplier</label>
            <input
              name="supplier" value={form.supplier || ''} onChange={handleChange}
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
            />
          </div>
          {!isCombo && (
          <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={comboInvalid}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary font-medium disabled:opacity-50"
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