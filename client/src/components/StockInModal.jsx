import { useState, useEffect } from 'react';

function StockInModal({ isOpen, onClose, onSave, products }) {
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [newCostPrice, setNewCostPrice] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (isOpen) {
      setProductId('');
      setQuantity('');
      setNewCostPrice('');
      setSearch('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedProduct = products.find((p) => p.id === Number(productId));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!productId || !quantity || Number(quantity) <= 0) return;
    const actualPieces = selectedProduct?.units_per_pack
      ? Number(quantity) * selectedProduct.units_per_pack
      : Number(quantity);
    onSave(productId, {
      quantity: actualPieces,
      cost_price: newCostPrice ? Number(newCostPrice) : null,
    });
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.category || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl p-6 w-full max-w-md shadow-lg">
        <h2 className="text-xl font-semibold text-on-surface mb-4">Stock In</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-sm font-medium text-on-surface-variant">Product *</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search product..."
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1 mb-2"
            />
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
              size={5}
              className="w-full border border-outline-variant rounded-lg px-3 py-2"
            >
              <option value="">Select product...</option>
              {filteredProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (currently {p.stock_quantity} in stock)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-on-surface-variant">
              {selectedProduct?.units_per_pack ? `Packs Received *` : `Quantity Received *`}
            </label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              placeholder={selectedProduct?.units_per_pack ? 'e.g. 5' : 'e.g. 24'}
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
            />
            {selectedProduct && quantity && (
              <p className="text-xs text-on-surface-variant mt-1">
                {selectedProduct.units_per_pack ? (
                  <>
                    Adding {Number(quantity) * selectedProduct.units_per_pack} {selectedProduct.unit_label}s
                    — new stock level: {selectedProduct.stock_quantity + Number(quantity) * selectedProduct.units_per_pack} {selectedProduct.unit_label}s
                  </>
                ) : (
                  <>New stock level will be: {selectedProduct.stock_quantity + Number(quantity)} pcs</>
                )}
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-on-surface-variant">
              New Cost Price (₱) — optional
            </label>
            <input
              type="number"
              step="0.01"
              value={newCostPrice}
              onChange={(e) => setNewCostPrice(e.target.value)}
              placeholder={selectedProduct ? `Current: ₱${selectedProduct.cost_price}` : '0.00'}
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
            />
            <p className="text-xs text-on-surface-variant mt-1">
              Leave blank to keep the current cost price.
            </p>
          </div>

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
              Confirm Stock In
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default StockInModal;