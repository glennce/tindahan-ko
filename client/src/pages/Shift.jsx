import { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { useToast } from '../context/ToastContext';
import { Eye, Wallet, Smartphone, Receipt } from 'lucide-react';

function Shift() {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [openingCashInput, setOpeningCashInput] = useState('');
  const [closingShift, setClosingShift] = useState(null);
  const [closingCash, setClosingCash] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedShift, setSelectedShift] = useState(null);
  const [expenseCategory, setExpenseCategory] = useState('');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseDesc, setExpenseDesc] = useState('');
  const [expenseMethod, setExpenseMethod] = useState('cash');
  const [expensesToday, setExpensesToday] = useState([]);
  const { showToast } = useToast();

  const loadCurrent = () => {
    apiFetch('/shift/current').then((res) => res.json()).then(setData);
    apiFetch('/expenses').then((res) => res.json()).then((all) => {
      // filter to today (Manila) client-side as fallback
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
      const todays = (all || []).filter((e) => {
        const d = new Date(e.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
        return d === today;
      });
      setExpensesToday(todays);
    }).catch(() => {});
  };
  const loadHistory = () => {
    apiFetch('/shift/history').then((res) => res.json()).then(setHistory);
  };

  useEffect(() => {
    loadCurrent();
    loadHistory();
    const interval = setInterval(loadCurrent, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleSetOpeningCash = async () => {
    if (!openingCashInput || Number(openingCashInput) < 0) {
      showToast('Enter a valid amount', 'error');
      return;
    }
    try {
      const res = await apiFetch('/shift/opening-cash', {
        method: 'POST',
        body: JSON.stringify({ opening_cash: Number(openingCashInput) }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setOpeningCashInput('');
      loadCurrent();
      showToast('Starting cash recorded');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleAddExpense = async () => {
    if (!expenseCategory || !expenseAmount || Number(expenseAmount) <= 0) {
      showToast('Enter category and valid amount', 'error');
      return;
    }
    try {
      const res = await apiFetch('/expenses', {
        method: 'POST',
        body: JSON.stringify({
          category: expenseCategory,
          amount: Number(expenseAmount),
          description: expenseDesc,
          payment_method: expenseMethod,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setExpenseCategory('');
      setExpenseAmount('');
      setExpenseDesc('');
      loadCurrent();
      showToast(`Expense recorded — deducted from ${expenseMethod === 'gcash' ? 'GCash' : 'Cash'}`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleClose = async () => {
    if (!closingCash || Number(closingCash) < 0) {
      showToast('Enter a valid closing cash amount', 'error');
      return;
    }
    try {
      const res = await apiFetch(`/shift/${closingShift.id}/close`, {
        method: 'POST',
        body: JSON.stringify({ closing_cash: Number(closingCash), notes }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setClosingShift(null);
      setClosingCash('');
      setNotes('');
      loadCurrent();
      loadHistory();
      showToast('Shift closed');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const viewShiftDetail = (id) => {
    apiFetch(`/shift/${id}`).then((res) => res.json()).then(setSelectedShift);
  };

  if (!data) return <p className="text-on-surface-variant">Loading...</p>;

  const { shift, running, pending } = data;
  const expectedForClose = closingShift?.status === 'pending_count'
    ? Number(closingShift.expected_cash)
    : running.expected_cash;

  const isClosed = shift.status === 'closed';
  // Always real-time: KPI reflects live drawer (opening + sales + payments - expenses) even after day ended
  const totalCash = running.total_cash ?? running.expected_cash ?? 0;
  const totalGcash = running.total_gcash ?? running.gcash_sales ?? 0;
  const cashExpenses = running.cash_expenses ?? 0;
  const gcashExpenses = running.gcash_expenses ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-bold text-on-surface mb-1">Cash Drawer</h1>
      <p className="text-on-surface-variant mb-6">From today onward — yesterday is ignored. Cash & GCash tracked separately.</p>

      {/* KPI Cards - Real-time (deducts live), shows day-end actual as secondary when closed */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-surface border border-outline-variant rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center shrink-0">
            <Wallet className="text-on-primary" size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-on-surface-variant text-xs uppercase tracking-wide">Total Cash in Hand — Real Time</p>
            <p className="text-2xl font-bold text-on-surface">₱{Number(totalCash).toFixed(2)}</p>
            <p className="text-xs text-on-surface-variant truncate">
              Opening ₱{Number(shift?.opening_cash || 0).toFixed(2)} + Cash sales ₱{Number(running.cash_sales || 0).toFixed(2)} + Cash payments ₱{Number(running.cash_utang_payments || 0).toFixed(2)} - Cash expenses ₱{Number(cashExpenses).toFixed(2)}
            </p>
            {isClosed && (
              <p className="text-xs text-secondary truncate">Day ended: counted ₱{Number(shift.closing_cash).toFixed(2)} · Expected ₱{Number(shift.expected_cash).toFixed(2)} · Diff ₱{Number(shift.difference).toFixed(2)}</p>
            )}
          </div>
        </div>
        <div className="bg-surface border border-outline-variant rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-secondary-container flex items-center justify-center shrink-0">
            <Smartphone className="text-secondary" size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-on-surface-variant text-xs uppercase tracking-wide">Total GCash — Real Time</p>
            <p className="text-2xl font-bold text-on-surface">₱{Number(totalGcash).toFixed(2)}</p>
            <p className="text-xs text-on-surface-variant truncate">
              GCash sales ₱{Number(running.gcash_sales || 0).toFixed(2)} + GCash payments ₱{Number(running.gcash_utang_payments || 0).toFixed(2)} - GCash expenses ₱{Number(gcashExpenses).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Pending reconciliation — days waiting to be counted */}
      {pending.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
          <h2 className="font-semibold text-orange-800 mb-3">
            Needs Cash Count ({pending.length})
          </h2>
          <div className="space-y-2">
            {pending.map((p) => (
              <div key={p.id} className="flex justify-between items-center bg-white rounded-lg p-3">
                <div>
                  <p className="text-on-surface font-medium">
                    {new Date(p.shift_date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
                  </p>
                  <p className="text-on-surface-variant text-sm">
                    Expected: ₱{Number(p.expected_cash).toFixed(2)}
                  </p>
                </div>
                <button
                  onClick={() => setClosingShift(p)}
                  className="bg-primary text-on-primary text-sm font-medium px-4 py-2 rounded-lg"
                >
                  Count Cash
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Today */}
        <div className="bg-surface border border-outline-variant rounded-xl p-6">
          <div className="flex justify-between items-start mb-4">
            <h2 className="font-semibold text-on-surface">
              Today — {new Date(shift.shift_date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
            </h2>
            <span className={`${isClosed ? 'bg-primary-container text-on-primary' : 'bg-secondary-container text-secondary'} px-2 py-1 rounded-full text-xs font-medium`}>
              {isClosed ? 'Closed' : 'Active'}
            </span>
          </div>

          {isClosed ? (
            <>
              <div className="bg-secondary-container/30 border border-secondary-container rounded-lg p-3 mb-4">
                <p className="text-sm font-semibold text-secondary">Day Ended — Actual Cash Recorded</p>
                <p className="text-xs text-on-surface-variant">Closed at {shift.closed_at ? new Date(shift.closed_at).toLocaleString() : ''}</p>
              </div>
              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between text-on-surface-variant">
                  <span>Starting Cash</span><span>₱{Number(shift.opening_cash).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-on-surface-variant">
                  <span>Expected Cash</span><span>₱{Number(shift.expected_cash).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-on-surface text-base pt-2 border-t border-outline-variant">
                  <span>Actual Cash Counted</span><span>₱{Number(shift.closing_cash).toFixed(2)}</span>
                </div>
                <div className={`flex justify-between font-bold ${Number(shift.difference) === 0 ? 'text-secondary' : 'text-error'}`}>
                  <span>Difference</span><span>₱{Number(shift.difference).toFixed(2)}</span>
                </div>
                <div className="pt-2 border-t border-outline-variant space-y-2">
                  <div className="flex justify-between font-bold text-on-surface">
                    <span>GCash Sales — Final</span><span>₱{Number(running.gcash_sales).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-on-surface-variant">
                    <span>GCash Payments</span><span>+₱{Number(running.gcash_utang_payments || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-error">
                    <span>GCash Expenses</span><span>-₱{Number(gcashExpenses).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-on-surface pt-1 border-t border-outline-variant">
                    <span>GCash Total — Final</span><span>₱{Number(totalGcash).toFixed(2)}</span>
                  </div>
                </div>
                {shift.notes && <p className="text-xs text-on-surface-variant pt-2 border-t border-outline-variant">Notes: {shift.notes}</p>}
              </div>
              <p className="text-xs text-on-surface-variant">Tomorrow will auto-create a new active shift at 00:00 Manila.</p>
            </>
          ) : shift.opening_cash === null ? (
            <>
              <p className="text-on-surface-variant text-sm mb-3">
                Set today's starting cash whenever you're ready — sales are already being tracked either way. Yesterday is ignored.
              </p>
              <label className="text-sm text-on-surface-variant">Starting Cash</label>
              <input
                type="number"
                value={openingCashInput}
                onChange={(e) => setOpeningCashInput(e.target.value)}
                placeholder="e.g. 2000"
                className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1 mb-3"
              />
              <button
                onClick={handleSetOpeningCash}
                className="w-full bg-primary text-on-primary font-semibold py-3 rounded-lg"
              >
                Record Starting Cash
              </button>
            </>
          ) : (
            <>
              <div className="space-y-2 text-sm mb-4">
                <div className="flex justify-between text-on-surface-variant">
                  <span>Starting Cash</span><span>₱{Number(shift.opening_cash).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-secondary">
                  <span>Cash Sales</span><span>+₱{Number(running.cash_sales).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-secondary">
                  <span>Credit Payments (Cash)</span><span>+₱{Number(running.cash_utang_payments).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-error">
                  <span>Cash Expenses</span><span>-₱{Number(cashExpenses).toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-on-surface pt-2 border-t border-outline-variant text-base">
                  <span>Cash in Hand — Real Time</span><span>₱{Number(totalCash).toFixed(2)}</span>
                </div>
                <div className="pt-2 border-t border-outline-variant space-y-2">
                  <div className="flex justify-between text-secondary">
                    <span>GCash Sales</span><span>+₱{Number(running.gcash_sales).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-secondary">
                    <span>GCash Payments</span><span>+₱{Number(running.gcash_utang_payments || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-error">
                    <span>GCash Expenses</span><span>-₱{Number(gcashExpenses).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-on-surface pt-1 border-t border-outline-variant">
                    <span>GCash Total — Real Time</span><span>₱{Number(totalGcash).toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex justify-between text-on-surface-variant text-xs pt-2">
                  <span>New Utang Charged (not in drawer)</span><span>₱{Number(running.utang_charged).toFixed(2)}</span>
                </div>
              </div>
              <p className="text-xs text-on-surface-variant mb-2">
                Counts from 00:00 today (Manila) — previous days ignored. Updates live every 30s.
              </p>
              <button
                onClick={() => setClosingShift(shift)}
                className="w-full border border-outline-variant text-on-surface font-medium py-2.5 rounded-lg text-sm"
              >
                Close Day — Enter Actual Cash
              </button>
            </>
          )}
        </div>

        {/* Record Expense */}
        <div className="bg-surface border border-outline-variant rounded-xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-full bg-error-container flex items-center justify-center">
              <Receipt className="text-error" size={16} />
            </div>
            <h2 className="font-semibold text-on-surface">Record Expense</h2>
          </div>
          <p className="text-xs text-on-surface-variant mb-3">Spends are deducted immediately from the corresponding wallet above. Use when buying stock, etc.</p>
          <div className="space-y-3">
            <div>
              <label className="text-sm text-on-surface-variant">Category</label>
              <input
                type="text"
                value={expenseCategory}
                onChange={(e) => setExpenseCategory(e.target.value)}
                placeholder="e.g. Stock purchase, Transport"
                className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
              />
            </div>
            <div>
              <label className="text-sm text-on-surface-variant">Amount</label>
              <input
                type="number"
                value={expenseAmount}
                onChange={(e) => setExpenseAmount(e.target.value)}
                placeholder="0.00"
                className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
              />
            </div>
            <div>
              <label className="text-sm text-on-surface-variant">Payment Method</label>
              <div className="flex gap-2 mt-1">
                {['cash','gcash'].map((m) => (
                  <button
                    key={m}
                    onClick={() => setExpenseMethod(m)}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize border ${expenseMethod===m ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-low text-on-surface-variant border-outline-variant'}`}
                  >
                    {m === 'cash' ? 'Cash' : 'GCash'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-on-surface-variant mt-1">
                Will deduct from <span className="font-medium">{expenseMethod === 'gcash' ? 'GCash' : 'Cash in Hand'}</span>
              </p>
            </div>
            <div>
              <label className="text-sm text-on-surface-variant">Note (optional)</label>
              <input
                type="text"
                value={expenseDesc}
                onChange={(e) => setExpenseDesc(e.target.value)}
                placeholder="Details..."
                className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
              />
            </div>
            <button
              onClick={handleAddExpense}
              className="w-full bg-error text-on-error font-semibold py-3 rounded-lg"
            >
              Deduct Expense
            </button>
            {expensesToday.length > 0 && (
              <div className="pt-3 border-t border-outline-variant">
                <p className="text-xs font-medium text-on-surface-variant mb-2">Today's expenses</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {expensesToday.map((e) => (
                    <div key={e.id} className="flex justify-between text-xs border-t border-outline-variant pt-1">
                      <span className="text-on-surface truncate flex-1">{e.category} <span className="text-on-surface-variant">· {e.payment_method || 'cash'}</span></span>
                      <span className="text-error font-medium">-₱{Number(e.amount).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Close modal — used for both pending days and early-close */}
      {closingShift && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl w-full max-w-sm shadow-lg p-6">
            <h2 className="text-lg font-semibold text-on-surface mb-1">
              Count Cash — {new Date(closingShift.shift_date).toLocaleDateString()}
            </h2>
            <p className="text-on-surface-variant text-sm mb-4">
              Expected: ₱{expectedForClose.toFixed(2)}
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
                Number(closingCash) - expectedForClose === 0 ? 'text-secondary' : 'text-error'
              }`}>
                Difference: ₱{(Number(closingCash) - expectedForClose).toFixed(2)}
                {Number(closingCash) - expectedForClose !== 0 && ' ⚠ Mismatch'}
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
                onClick={() => { setClosingShift(null); setClosingCash(''); setNotes(''); }}
                className="flex-1 border border-outline-variant text-on-surface py-2.5 rounded-lg text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleClose}
                className="flex-1 bg-primary text-on-primary py-2.5 rounded-lg text-sm font-medium"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History */}
      <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
        <div className="p-4 border-b border-outline-variant">
          <h2 className="font-semibold text-on-surface">Shift History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm min-w-[600px]">
            <thead className="bg-surface-container-low text-on-surface-variant">
              <tr>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Opening</th>
                <th className="px-4 py-3">Closing</th>
                <th className="px-4 py-3">Difference</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {history.map((s) => (
                <tr key={s.id} className="border-t border-outline-variant">
                  <td className="px-4 py-3 text-on-surface-variant">{new Date(s.shift_date).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-on-surface">₱{Number(s.opening_cash).toFixed(2)}</td>
                  <td className="px-4 py-3 text-on-surface">₱{Number(s.closing_cash).toFixed(2)}</td>
                  <td className={`px-4 py-3 font-medium ${Number(s.difference) === 0 ? 'text-secondary' : 'text-error'}`}>
                    ₱{Number(s.difference).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => viewShiftDetail(s.id)}
                      className="p-1.5 text-primary hover:bg-primary-container hover:text-on-primary rounded-md"
                    >
                      <Eye size={18} />
                    </button>
                  </td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-on-surface-variant">No shifts closed yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
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
              <p className="text-on-surface-variant mb-2">{new Date(selectedShift.shift_date).toLocaleDateString()}</p>
              <div className="flex justify-between text-on-surface-variant">
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
