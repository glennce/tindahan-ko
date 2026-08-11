import { useState, useEffect } from 'react';

function StockInModal({ isOpen, onClose, onSave, products }) {
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [newCostPrice, setNewCostPrice] = useState('');

  useEffect(() => {
    if (isOpen) {
      setProductId('');
      setQuantity('');
      setNewCostPrice('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedProduct = products.find((p) => p.id === Number(productId));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!productId || !quantity || Number(quantity) <= 0) return;
    onSave(productId, {
      quantity: Number(quantity),
      cost_price: newCostPrice ? Number(newCostPrice) : null,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl p-6 w-full max-w-md shadow-lg">
        <h2 className="text-xl font-semibold text-on-surface mb-4">Stock In</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-sm font-medium text-on-surface-variant">Product *</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
            >
              <option value="">Select product...</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (currently {p.stock_quantity} in stock)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-on-surface-variant">Quantity Received *</label>
            <input
              type="number"
              min="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              placeholder="e.g. 24"
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
            />
            {selectedProduct && quantity && (
              <p className="text-xs text-on-surface-variant mt-1">
                New stock level will be: {selectedProduct.stock_quantity + Number(quantity)} pcs
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