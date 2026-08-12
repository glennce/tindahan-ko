import { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { Eye } from 'lucide-react';

const API = '/transactions';
const TYPE_OPTIONS = ['All', 'Sale (Cash)', 'Sale (GCash)', 'Sale (Utang)', 'Utang Payment'];
const STATUS_OPTIONS = ['All', 'completed', 'voided'];

function sevenDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

function Transactions() {
  const [start, setStart] = useState(sevenDaysAgo());
  const [end, setEnd] = useState(today());
  const [type, setType] = useState('All');
  const [status, setStatus] = useState('All');
  const [page, setPage] = useState(1);
  const limit = 10;

  const [data, setData] = useState({ transactions: [], total: 0 });
  const [selected, setSelected] = useState(null);

  const loadTransactions = () => {
    const params = new URLSearchParams({ start, end, type, status, page, limit });
    apiFetch(`${API}?${params}`).then((res) => res.json()).then(setData);
  };

  useEffect(() => {
    loadTransactions();
  }, [start, end, type, status, page]);

  const viewDetail = (t) => {
    apiFetch(`${API}/${t.source}/${t.id}`).then((res) => res.json()).then(setSelected);
  };

  const handleVoid = async (saleId) => {
    if (!confirm('Void this sale? This restores stock and reverses any utang charge.')) return;
    try {
      const res = await apiFetch(`/sales/${saleId}/void`, { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      loadTransactions();
      setSelected(null);
    } catch (err) {
      alert(err.message);
    }
  };

  const clearFilters = () => {
    setStart(sevenDaysAgo());
    setEnd(today());
    setType('All');
    setStatus('All');
    setPage(1);
  };

  const totalPages = Math.max(Math.ceil(data.total / limit), 1);
  const badgeColor = {
    'Sale (Cash)': 'bg-secondary-container text-secondary',
    'Sale (GCash)': 'bg-primary-container text-on-primary',
    'Sale (Utang)': 'bg-error-container text-error',
    'Utang Payment': 'bg-orange-100 text-orange-700',
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-on-surface mb-1">Transaction History</h1>
      <p className="text-on-surface-variant mb-6">Review and manage past sales and payments.</p>

      {/* Filters */}
      <div className="bg-surface border border-outline-variant rounded-xl p-4 mb-6 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-on-surface-variant block mb-1">From</label>
          <input type="date" value={start} onChange={(e) => { setStart(e.target.value); setPage(1); }}
            className="border border-outline-variant rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs text-on-surface-variant block mb-1">To</label>
          <input type="date" value={end} onChange={(e) => { setEnd(e.target.value); setPage(1); }}
            className="border border-outline-variant rounded-lg px-2 py-1.5 text-sm" />
        </div>
        <div>
          <label className="text-xs text-on-surface-variant block mb-1">Type</label>
          <select value={type} onChange={(e) => { setType(e.target.value); setPage(1); }}
            className="border border-outline-variant rounded-lg px-2 py-1.5 text-sm">
            {TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-on-surface-variant block mb-1">Status</label>
          <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="border border-outline-variant rounded-lg px-2 py-1.5 text-sm capitalize">
            {STATUS_OPTIONS.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
          </select>
        </div>
        <button onClick={clearFilters} className="border border-outline-variant text-on-surface-variant text-sm px-3 py-1.5 rounded-lg">
          Clear
        </button>
      </div>

        <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-container-low text-on-surface-variant">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.transactions.map((t) => (
                <tr
                  key={`${t.source}-${t.id}`}
                  className={`border-t border-outline-variant hover:bg-surface-container-low ${
                    t.status === 'voided' ? 'opacity-50' : ''
                  }`}
                >
                  <td className="px-4 py-3 text-on-surface-variant">#{t.id}</td>
                  <td className="px-4 py-3 text-on-surface">{t.customer_name}</td>
                  <td className={`px-4 py-3 font-medium ${t.status === 'voided' ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
                    ₱{Number(t.amount).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${badgeColor[t.type_label]}`}>
                      {t.type_label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${
                      t.status === 'voided' ? 'bg-error-container text-error' : 'bg-secondary-container text-secondary'
                    }`}>
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => viewDetail(t)}
                      className="p-1.5 text-primary hover:bg-primary-container hover:text-on-primary rounded-md transition-colors"
                      title="View Details"
                    >
                      <Eye size={18} />
                    </button>
                  </td>
                </tr>
              ))}
              {data.transactions.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-on-surface-variant">No transactions in this range.</td></tr>
              )}
            </tbody>
          </table>

          <div className="flex justify-between items-center px-4 py-3 border-t border-outline-variant text-sm text-on-surface-variant">
            <span>Showing {data.transactions.length === 0 ? 0 : (page - 1) * limit + 1} to {(page - 1) * limit + data.transactions.length} of {data.total} entries</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
                className="px-2 py-1 border border-outline-variant rounded disabled:opacity-40">‹</button>
              <span className="px-2 py-1">{page} / {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}
                className="px-2 py-1 border border-outline-variant rounded disabled:opacity-40">›</button>
            </div>
          </div>
        </div>

        {selected && (
          <>
            <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setSelected(null)} />
            <div className="fixed inset-y-0 right-0 w-full max-w-md bg-surface shadow-2xl z-50 flex flex-col border-l border-outline-variant">
              <div className="flex justify-between items-center px-4 py-3 border-b border-outline-variant">
                <h2 className="font-semibold text-on-surface">Transaction Details</h2>
                <button onClick={() => setSelected(null)} className="text-on-surface-variant text-xl">
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {selected.source === 'sale' ? (
                  <>
                    <p className="text-on-surface-variant text-sm mb-3">
                      #{selected.id} · {selected.customer_name || 'Walk-in'} · {new Date(selected.created_at).toLocaleString()}
                    </p>
                    <div className="space-y-2 mb-3">
                      {selected.items.map((item) => (
                        <div key={item.id} className="flex justify-between text-sm border-t border-outline-variant pt-2">
                          <span className="text-on-surface">{item.product_name} × {item.quantity}</span>
                          <span className="text-on-surface-variant">₱{Number(item.subtotal).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="text-sm space-y-1 border-t border-outline-variant pt-2">
                      <div className="flex justify-between text-on-surface-variant">
                        <span>Subtotal</span><span>₱{Number(selected.subtotal).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-error">
                        <span>Discount</span><span>-₱{Number(selected.discount_amount).toFixed(2)}</span>
                      </div>
                      {selected.payment_method === 'cash' && (
                        <>
                          <div className="flex justify-between text-on-surface-variant">
                            <span>Cash Received</span><span>₱{Number(selected.amount_tendered).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-on-surface-variant">
                            <span>Change</span><span>₱{Number(selected.change_amount).toFixed(2)}</span>
                          </div>
                        </>
                      )}
                      <div className="flex justify-between font-bold text-on-surface pt-1 border-t border-outline-variant">
                        <span>Total</span><span>₱{Number(selected.total_amount).toFixed(2)}</span>
                      </div>
                    </div>
                    {selected.status === 'completed' && (
                      <button
                        onClick={() => handleVoid(selected.id)}
                        className="w-full mt-4 border border-error text-error text-sm font-medium py-2 rounded-lg"
                      >
                        Void Sale
                      </button>
                    )}
                    {selected.status === 'voided' && (
                      <p className="text-error text-sm font-medium mt-4 text-center">This sale has been voided.</p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-on-surface-variant text-sm mb-3">
                      #{selected.id} · {selected.customer_name} · {new Date(selected.created_at).toLocaleString()}
                    </p>
                    <div className="flex justify-between font-bold text-on-surface border-t border-outline-variant pt-2">
                      <span>Amount Paid</span><span>₱{Number(selected.amount).toFixed(2)}</span>
                    </div>
                    <p className="text-on-surface-variant text-sm mt-2">
                      Balance after payment: ₱{Number(selected.balance_after).toFixed(2)}
                    </p>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>
  );
}

export default Transactions;