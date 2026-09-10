import { useState, useEffect } from 'react';
import { apiFetch } from '../api';

function RepackModal({ isOpen, onClose, onSave, products }) {
  const [sourceId, setSourceId] = useState('');
  const [sourceQty, setSourceQty] = useState('');
  const [destId, setDestId] = useState('');
  const [destQty, setDestQty] = useState('');
  const [notes, setNotes] = useState('');
  const [sourceSearch, setSourceSearch] = useState('');
  const [destSearch, setDestSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (isOpen) {
      setSourceId('');
      setSourceQty('');
      setDestId('');
      setDestQty('');
      setNotes('');
      setSourceSearch('');
      setDestSearch('');
      apiFetch('/repack-logs').then((r) => r.json()).then((d) => Array.isArray(d) && setLogs(d)).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const source = products.find((p) => p.id === Number(sourceId));
  const dest = products.find((p) => p.id === Number(destId));
  const useQty = Number(sourceQty) || 0;
  const makeQty = Number(destQty) || 0;
  const valid =
    source && dest && source.id !== dest.id && useQty > 0 && makeQty > 0 &&
    useQty <= Number(source.stock_quantity);
  const impliedCost =
    source && makeQty > 0
      ? (useQty * Number(source.cost_price || 0)) / makeQty
      : 0;

  const filterProducts = (q) => {
    const s = q.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(s) ||
        (p.sku || '').toLowerCase().includes(s) ||
        (p.category || '').toLowerCase().includes(s)
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!valid || saving) return;
    try {
      setSaving(true);
      await onSave({
        source_product_id: source.id,
        source_qty: useQty,
        dest_product_id: dest.id,
        dest_qty: makeQty,
        notes,
      });
      onClose();
    } catch {
      // error toast is handled by parent — keep form values for retry
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl p-6 w-full max-w-md shadow-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold text-on-surface mb-1">Repack / Convert</h2>
        <p className="text-xs text-on-surface-variant mb-4">
          Turn bulk stock into sellable pieces — e.g. 2 × ¼ Sugar → 15 × ₱2 Sugar, or 1 twin-pack coffee → 2 singles.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-sm font-medium text-on-surface-variant">From (bulk) *</label>
            <input
              type="text"
              value={sourceSearch}
              onChange={(e) => setSourceSearch(e.target.value)}
              placeholder="Search bulk product..."
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1 mb-2"
            />
            <select
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              required
              size={4}
              className="w-full border border-outline-variant rounded-lg px-3 py-2"
            >
              <option value="">Select product...</option>
              {filterProducts(sourceSearch).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (currently {p.stock_quantity} in stock)
                </option>
              ))}
            </select>
            <label className="text-sm font-medium text-on-surface-variant mt-2 block">Quantity used *</label>
            <input
              type="number" min="0" step="any" value={sourceQty}
              onChange={(e) => setSourceQty(e.target.value)}
              placeholder="e.g. 2"
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
            />
          </div>

          <div>
            <label className="text-sm font-medium text-on-surface-variant">To (pieces) *</label>
            <input
              type="text"
              value={destSearch}
              onChange={(e) => setDestSearch(e.target.value)}
              placeholder="Search piece product..."
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1 mb-2"
            />
            <select
              value={destId}
              onChange={(e) => setDestId(e.target.value)}
              required
              size={4}
              className="w-full border border-outline-variant rounded-lg px-3 py-2"
            >
              <option value="">Select product...</option>
              {filterProducts(destSearch).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} (currently {p.stock_quantity} in stock)
                </option>
              ))}
            </select>
            <label className="text-sm font-medium text-on-surface-variant mt-2 block">Quantity produced *</label>
            <input
              type="number" min="0" step="any" value={destQty}
              onChange={(e) => setDestQty(e.target.value)}
              placeholder="e.g. 15"
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
            />
          </div>

          {source && useQty > 0 && useQty > Number(source.stock_quantity) && (
            <p className="text-xs text-error">Not enough {source.name} — only {source.stock_quantity} in stock.</p>
          )}
          {source && dest && source.id === dest.id && (
            <p className="text-xs text-error">Source and destination must be different products.</p>
          )}

          {source && dest && useQty > 0 && makeQty > 0 && (
            <div className="bg-surface-container-low rounded-lg p-2">
              <p className="text-xs text-on-surface-variant">
                {source.name}: <span className="font-medium text-on-surface">{source.stock_quantity} → {Number(source.stock_quantity) - useQty}</span>
                <br />
                {dest.name}: <span className="font-medium text-on-surface">{dest.stock_quantity} → {Number(dest.stock_quantity) + makeQty}</span>
                {Number(source.cost_price || 0) > 0 && (
                  <>
                    <br />
                    Implied cost ≈ ₱{impliedCost.toFixed(2)}/pc produced (cost prices unchanged)
                  </>
                )}
              </p>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-on-surface-variant">Notes (optional)</label>
            <input
              type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. afternoon repack"
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant"
            >
              Cancel
            </button>
            <button
              type="submit" disabled={!valid || saving}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary font-medium disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Confirm Repack'}
            </button>
          </div>
        </form>

        {logs.length > 0 && (
          <div className="mt-4 border-t border-outline-variant pt-3">
            <h3 className="text-sm font-semibold text-on-surface mb-2">Recent repacks</h3>
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {logs.slice(0, 8).map((l) => (
                <p key={l.id} className="text-xs text-on-surface-variant">
                  <span className="text-on-surface font-medium">{l.source_qty} {l.source_name}</span>
                  {' → '}
                  <span className="text-on-surface font-medium">{l.dest_qty} {l.dest_name}</span>
                  <span className="block">{new Date(l.created_at).toLocaleString()}{l.created_by_name ? ` · ${l.created_by_name}` : ''}</span>
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default RepackModal;
