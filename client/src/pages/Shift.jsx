import { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { useToast } from '../context/ToastContext';
import { Eye } from 'lucide-react';

function Shift() {
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [notes, setNotes] = useState('');
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const { showToast } = useToast();
  const [selectedShift, setSelectedShift] = useState(null);

  const loadCurrent = () => {
    apiFetch('/shift/current').then((res) => res.json()).then(setCurrent);
  };
  const loadHistory = () => {
    apiFetch('/shift/history').then((res) => res.json()).then(setHistory);
  };
  
  const viewShiftDetail = (id) => {
    apiFetch(`/shift/${id}`).then((res) => res.json()).then(setSelectedShift);
  };

  useEffect(() => {
    loadCurrent();
    loadHistory();
    // Refresh running totals every 30s while this page is open
    const interval = setInterval(loadCurrent, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleOpenShift = async () => {
    if (!openingCash || Number(openingCash) < 0) {
      showToast('Enter a valid opening cash amount', 'error');
      return;
    }
    try {
      const res = await apiFetch('/shift/open', {
        method: 'POST',
        body: JSON.stringify({ opening_cash: Number(openingCash) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setOpeningCash('');
      loadCurrent();
      showToast('Shift opened');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleCloseShift = async () => {
    if (!closingCash || Number(closingCash) < 0) {
      showToast('Enter a valid closing cash amount', 'error');
      return;
    }
    try {
      const res = await apiFetch('/shift/close', {
        method: 'POST',
        body: JSON.stringify({ closing_cash: Number(closingCash), notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCloseModalOpen(false);
      setClosingCash('');
      setNotes('');
      loadCurrent();
      loadHistory();
      showToast('Shift closed');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-on-surface mb-1">Cash Drawer</h1>
      <p className="text-on-surface-variant mb-6">Track cash from open to close.</p>

      {!current?.shift ? (
        <div className="bg-surface border border-outline-variant rounded-xl p-6 max-w-md">
          <h2 className="font-semibold text-on-surface mb-3">Open a New Shift</h2>
          <label className="text-sm text-on-surface-variant">Starting Cash</label>
          <input
            type="number"
            value={openingCash}
            onChange={(e) => setOpeningCash(e.target.value)}
            placeholder="e.g. 2000"
            className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1 mb-3"
          />
          <button
            onClick={handleOpenShift}
            className="w-full bg-primary text-on-primary font-semibold py-3 rounded-lg"
          >
            Open Shift
          </button>
        </div>
      ) : (
        <div className="bg-surface border border-outline-variant rounded-xl p-6 max-w-md">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="font-semibold text-on-surface">Shift In Progress</h2>
              <p className="text-on-surface-variant text-sm">
                Opened by {current.shift.opened_by_name} · {new Date(current.shift.opened_at).toLocaleString()}
              </p>
            </div>
            <span className="bg-secondary-container text-secondary px-2 py-1 rounded-full text-xs font-medium">
              Open
            </span>
          </div>

            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between text-on-surface-variant">
                <span>Starting Cash</span><span>₱{Number(current.shift.opening_cash).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant">
                <span>Cash Sales</span><span>+₱{current.running.cash_sales.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-on-surface-variant">
                <span>Credit Payments (Cash)</span><span>+₱{current.running.cash_utang_payments.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-error">
                <span>Expenses</span><span>-₱{current.running.expenses.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-on-surface pt-2 border-t border-outline-variant">
                <span>Expected Cash Now</span><span>₱{current.running.expected_cash.toFixed(2)}</span>
              </div>
              <div className="pt-2 border-t border-outline-variant space-y-2">
                <p className="text-xs text-on-surface-variant">For reference — not part of cash drawer</p>
                <div className="flex justify-between text-on-surface-variant">
                  <span>GCash Sales</span><span>₱{current.running.gcash_sales.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-on-surface-variant">
                  <span>New Utang Charged</span><span>₱{current.running.utang_charged.toFixed(2)}</span>
                </div>
              </div>
            </div>

          <button
            onClick={() => setCloseModalOpen(true)}
            className="w-full border border-error text-error font-semibold py-3 rounded-lg"
          >
            Close Shift
          </button>
        </div>
      )}

      {closeModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl w-full max-w-sm shadow-lg p-6">
            <h2 className="text-lg font-semibold text-on-surface mb-1">Close Shift</h2>
            <p className="text-on-surface-variant text-sm mb-4">
              Expected: ₱{current.running.expected_cash.toFixed(2)}
            </p>
            <label className="text-sm text-on-surface-variant">Actual Cash Counted</label>
            <input
              type="number"
              value={closingCash}
              onChange={(e) => setClosingCash(e.target.value)}
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1 mb-3"
            />
            {closingCash && (
              <p className={`text-sm mb-3 ${
                Number(closingCash) - current.running.expected_cash === 0
                  ? 'text-secondary'
                  : 'text-error'
              }`}>
                Difference: ₱{(Number(closingCash) - current.running.expected_cash).toFixed(2)}
                {Number(closingCash) - current.running.expected_cash !== 0 && ' ⚠ Mismatch'}
              </p>
            )}
            <label className="text-sm text-on-surface-variant">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1 mb-4 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setCloseModalOpen(false)}
                className="flex-1 border border-outline-variant text-on-surface py-2.5 rounded-lg text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleCloseShift}
                className="flex-1 bg-error text-white py-2.5 rounded-lg text-sm font-medium"
              >
                Confirm Close
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden mt-6">
        <div className="p-4 border-b border-outline-variant">
          <h2 className="font-semibold text-on-surface">Shift History</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-container-low text-on-surface-variant">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Opened / Closed By</th>
                <th className="px-4 py-3">Opening</th>
                <th className="px-4 py-3">Closing</th>
                <th className="px-4 py-3">Difference</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.map((s) => (
                <tr key={s.id} className="border-t border-outline-variant">
                  <td className="px-4 py-3 text-on-surface-variant">{new Date(s.closed_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{s.opened_by_name} / {s.closed_by_name}</td>
                  <td className="px-4 py-3 text-on-surface">₱{Number(s.opening_cash).toFixed(2)}</td>
                  <td className="px-4 py-3 text-on-surface">₱{Number(s.closing_cash).toFixed(2)}</td>
                  <td className={`px-4 py-3 font-medium ${Number(s.difference) === 0 ? 'text-secondary' : 'text-error'}`}>
                    ₱{Number(s.difference).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => viewShiftDetail(s.id)}
                      className="p-1.5 text-primary hover:bg-primary-container hover:text-on-primary rounded-md transition-colors"
                      title="View Details"
                    >
                      <Eye size={18} />
                    </button>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-on-surface-variant">No shifts closed yet.</td></tr>
              )}
            </tbody>
        </table>
      </div>

        {selectedShift && (
          <>
            <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setSelectedShift(null)} />
            <div className="fixed inset-y-0 right-0 w-full max-w-md bg-surface shadow-2xl z-50 flex flex-col border-l border-outline-variant">
              <div className="flex justify-between items-center px-4 py-3 border-b border-outline-variant">
                <h2 className="font-semibold text-on-surface">Shift Detail</h2>
                <button onClick={() => setSelectedShift(null)} className="text-on-surface-variant text-xl">✕</button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 text-sm">
                <p className="text-on-surface-variant mb-2">
                  {new Date(selectedShift.opened_at).toLocaleString()} — {new Date(selectedShift.closed_at).toLocaleString()}
                </p>
                <div className="flex justify-between text-on-surface-variant">
                  <span>Opened By</span><span>{selectedShift.opened_by_name}</span>
                </div>
                <div className="flex justify-between text-on-surface-variant">
                  <span>Closed By</span><span>{selectedShift.closed_by_name}</span>
                </div>
                <div className="flex justify-between text-on-surface-variant pt-2 border-t border-outline-variant">
                  <span>Starting Cash</span><span>₱{Number(selectedShift.opening_cash).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-on-surface">
                  <span>Expected Cash</span><span>₱{Number(selectedShift.expected_cash).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-on-surface">
                  <span>Actual Cash Counted</span><span>₱{Number(selectedShift.closing_cash).toFixed(2)}</span>
                </div>
                <div className={`flex justify-between font-bold ${Number(selectedShift.difference) === 0 ? 'text-secondary' : 'text-error'}`}>
                  <span>Difference</span><span>₱{Number(selectedShift.difference).toFixed(2)}</span>
                </div>
                <div className="pt-2 border-t border-outline-variant space-y-2">
                  <p className="text-xs text-on-surface-variant">For reference only</p>
                  <div className="flex justify-between text-on-surface-variant">
                    <span>GCash Sales</span><span>₱{Number(selectedShift.gcash_sales).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-on-surface-variant">
                    <span>New Utang Charged</span><span>₱{Number(selectedShift.utang_charged).toFixed(2)}</span>
                  </div>
                </div>
                {selectedShift.notes && (
                  <div className="pt-2 border-t border-outline-variant">
                    <p className="text-xs text-on-surface-variant mb-1">Notes</p>
                    <p className="text-on-surface">{selectedShift.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

    </div>
  );
}

export default Shift;