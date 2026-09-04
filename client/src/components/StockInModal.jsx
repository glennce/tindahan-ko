import { useState, useEffect } from 'react';

function StockInModal({ isOpen, onClose, onSave, products }) {
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [looseUnits, setLooseUnits] = useState('');
  const [newCostPrice, setNewCostPrice] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setProductId('');
      setQuantity('');
      setLooseUnits('');
      setNewCostPrice('');
      setSearch('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedProduct = products.find((p) => p.id === Number(productId));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!productId) return;
    const packs = Number(quantity) || 0;
    const loose = Number(looseUnits) || 0;
    if (packs <= 0 && loose <= 0) return;
    if (packs < 0 || loose < 0) return;
    const actualPieces = selectedProduct?.units_per_pack
      ? packs * selectedProduct.units_per_pack + loose
      : packs + loose;
    if (actualPieces <= 0) return;
    try {
      setSaving(true);
      // New Cost Price is entered per pack — convert to per-piece before saving,
      // since cost_price is stored per piece/stick (e.g. ₱145/pack ÷ 20 = ₱7.25/stick).
      let costPerPiece = null;
      if (newCostPrice) {
        const packPrice = Number(newCostPrice);
        if (selectedProduct?.units_per_pack) {
          costPerPiece = Math.round((packPrice / selectedProduct.units_per_pack) * 10000) / 10000;
        } else {
          costPerPiece = packPrice;
        }
      }
      await onSave(productId, {
        quantity: actualPieces,
        cost_price: costPerPiece,
      });
      // Stay in modal for next restock — just clear inputs
      setProductId('');
      setQuantity('');
      setLooseUnits('');
      setNewCostPrice('');
    } catch {
      // error toast is handled by parent — keep form values for retry
    } finally {
      setSaving(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q)
    );
  });

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
              placeholder="Search product, SKU..."
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
                  {p.name}{p.sku ? ` [${p.sku}]` : ''} (currently {p.stock_quantity} in stock)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-on-surface-variant">
                Per Pack *
              </label>
              <input
                type="number"
                min="0"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder={selectedProduct?.units_per_pack ? `e.g. 5 packs` : `e.g. 5`}
                className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
              />
              {selectedProduct?.units_per_pack ? (
                <p className="text-xs text-on-surface-variant mt-1">
                  {selectedProduct.units_per_pack} {selectedProduct.unit_label}s per pack
                </p>
              ) : (
                <p className="text-xs text-on-surface-variant mt-1">Packs</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium text-on-surface-variant">
                By Piece / Stick / Bottle
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={looseUnits}
                onChange={(e) => setLooseUnits(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder={selectedProduct?.units_per_pack ? `e.g. 10 ${selectedProduct.unit_label}s` : `e.g. 10 pcs`}
                className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
              />
              <p className="text-xs text-on-surface-variant mt-1">
                {selectedProduct?.units_per_pack ? `Loose ${selectedProduct.unit_label}s` : `Loose pcs`}
              </p>
            </div>
          </div>
          <p className="text-xs text-on-surface-variant">Fill either or both: e.g. Camel 20/pack → 5 packs + 10 sticks = 110 sticks</p>

          {selectedProduct && (quantity || looseUnits) && (
            <div className="bg-surface-container-low rounded-lg p-2">
              <p className="text-xs text-on-surface-variant">
                {selectedProduct.units_per_pack ? (
                  <>
                    Adding <span className="font-medium text-on-surface">{(Number(quantity) || 0) * selectedProduct.units_per_pack + (Number(looseUnits) || 0)} {selectedProduct.unit_label}s</span>
                    {Number(quantity) > 0 && Number(looseUnits) > 0 && ` (${Number(quantity)} packs × ${selectedProduct.units_per_pack} + ${Number(looseUnits)} loose)`}
                    {Number(quantity) > 0 && !Number(looseUnits) && ` (${Number(quantity)} packs)`}
                    {!Number(quantity) && Number(looseUnits) > 0 && ` (${Number(looseUnits)} loose)`}
                    <br />
                    New stock level: <span className="font-medium text-on-surface">{selectedProduct.stock_quantity + (Number(quantity) || 0) * selectedProduct.units_per_pack + (Number(looseUnits) || 0)} {selectedProduct.unit_label}s</span>
                  </>
                ) : (
                  <>
                    Adding <span className="font-medium text-on-surface">{(Number(quantity) || 0) + (Number(looseUnits) || 0)} pcs</span>
                    {Number(quantity) > 0 && Number(looseUnits) > 0 && ` (${Number(quantity)} packs + ${Number(looseUnits)} loose)`}
                    <br />
                    New stock level: <span className="font-medium text-on-surface">{selectedProduct.stock_quantity + (Number(quantity) || 0) + (Number(looseUnits) || 0)} pcs</span>
                  </>
                )}
              </p>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-on-surface-variant">
              {selectedProduct?.units_per_pack
                ? `New Cost Price per Pack (₱) — optional`
                : `New Cost Price (₱) — optional`}
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={newCostPrice}
              onChange={(e) => setNewCostPrice(e.target.value)}
              placeholder={
                selectedProduct
                  ? selectedProduct.units_per_pack
                    ? `Current: ₱${(Number(selectedProduct.cost_price) * selectedProduct.units_per_pack).toFixed(2)}/pack (₱${selectedProduct.cost_price}/${selectedProduct.unit_label || 'pc'})`
                    : `Current: ₱${selectedProduct.cost_price}`
                  : '0.00'
              }
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
            />
            <p className="text-xs text-on-surface-variant mt-1">
              {selectedProduct?.units_per_pack ? (
                newCostPrice ? (
                  <>
                    = ₱{(Number(newCostPrice) / selectedProduct.units_per_pack).toFixed(2)} per {selectedProduct.unit_label || 'pc'} ({selectedProduct.units_per_pack} per pack). Saved as cost per {selectedProduct.unit_label || 'pc'}.
                  </>
                ) : (
                  <>Enter the price per pack (e.g. Camel ₱145/pack = ₱7.25/stick). Leave blank to keep the current cost price.</>
                )
              ) : (
                <>Leave blank to keep the current cost price.</>
              )}
            </p>
          </div>

          <p className="text-xs text-on-surface-variant">Modal stays open so you can restock the next product. Click Done when finished.</p>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant"
            >
              Done
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary font-medium disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Confirm Stock In'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default StockInModal;