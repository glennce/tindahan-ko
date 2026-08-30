import { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { useToast } from '../context/ToastContext';
import { Eye, Wallet, Smartphone, Receipt, Download, ArrowLeftRight, History } from 'lucide-react';

const TABS = [
  { key: 'drawer', label: 'Drawer', icon: Wallet },
  { key: 'transfers', label: 'Transfers', icon: ArrowLeftRight },
  { key: 'expenses', label: 'Expenses', icon: Receipt },
  { key: 'history', label: 'History', icon: History },
];

function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function pctChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}
function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function StatCard({ label, value, change, icon: Icon }) {
  return (
    <div className="bg-surface border border-outline-variant rounded-xl p-4">
      <div className="flex justify-between items-start">
        <p className="text-on-surface-variant text-sm">{label}</p>
        {Icon && <div className="bg-primary-container/20 text-primary p-1.5 rounded-md"><Icon size={16} /></div>}
      </div>
      <p className="text-2xl font-bold text-on-surface mt-2">{value}</p>
      {change !== undefined && (
        <p className={`text-xs mt-1 ${change >= 0 ? 'text-secondary' : 'text-error'}`}>
          {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}% vs previous period
        </p>
      )}
    </div>
  );
}
const expenseIcon = {
  'Store Supplies': '🛍️', 'Utilities': '⚡', 'Rent': '🏠', 'Transportation': '🚗', 'Other': '📦',
};

export default function Shift() {
  const [activeTab, setActiveTab] = useState('drawer');
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [openingCashInput, setOpeningCashInput] = useState('');
  const [closingShift, setClosingShift] = useState(null);
  const [closingCash, setClosingCash] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedShift, setSelectedShift] = useState(null);
  const [expenseForm, setExpenseForm] = useState({ category: 'Store Supplies', amount: '', description: '', payment_method: 'cash' });
  const [reportStart, setReportStart] = useState(firstOfMonth());
  const [reportEnd, setReportEnd] = useState(today());
  const [reportData, setReportData] = useState(null);
  const [transfers, setTransfers] = useState([]);
  const [transferForm, setTransferForm] = useState({ from_wallet: 'cash', to_wallet: 'gcash', amount: '', note: '' });
  const { showToast } = useToast();

  const loadCurrent = () => {
    apiFetch('/shift/current').then((res) => res.json()).then(setData);
  };
  const loadHistory = () => {
    apiFetch('/shift/history').then((res) => res.json()).then(setHistory);
  };
  const loadReport = () => {
    apiFetch(`/reports/expenses?start=${reportStart}&end=${reportEnd}`).then((res) => res.json()).then(setReportData);
  };
  const loadTransfers = () => {
    apiFetch('/transfers').then((res) => res.json()).then(setTransfers).catch(() => {});
  };

  useEffect(() => {
    loadCurrent();
    loadHistory();
    loadReport();
    loadTransfers();
    const interval = setInterval(loadCurrent, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { loadReport(); }, [reportStart, reportEnd]);

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

  const handleAddExpense = async (e) => {
    e?.preventDefault();
    if (!expenseForm.category || !expenseForm.amount || Number(expenseForm.amount) <= 0) {
      showToast('Enter category and valid amount', 'error');
      return;
    }
    try {
      const res = await apiFetch('/expenses', {
        method: 'POST',
        body: JSON.stringify({ ...expenseForm, amount: Number(expenseForm.amount) }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setExpenseForm({ category: 'Store Supplies', amount: '', description: '', payment_method: 'cash' });
      loadCurrent();
      loadReport();
      showToast(`Expense recorded — deducted from ${expenseForm.payment_method === 'gcash' ? 'GCash' : 'Cash'}`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    if (!transferForm.amount || Number(transferForm.amount) <= 0) {
      showToast('Enter valid amount', 'error');
      return;
    }
    if (transferForm.from_wallet === transferForm.to_wallet) {
      showToast('From and To must be different', 'error');
      return;
    }
    try {
      const res = await apiFetch('/transfers', {
        method: 'POST',
        body: JSON.stringify({ ...transferForm, amount: Number(transferForm.amount) }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setTransferForm({ from_wallet: 'cash', to_wallet: 'gcash', amount: '', note: '' });
      loadCurrent();
      loadTransfers();
      showToast(`Transferred ₱${transferForm.amount} from ${transferForm.from_wallet} to ${transferForm.to_wallet}`);
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
      loadReport();
      showToast('Shift closed');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleExport = () => {
    if (!reportData) return;
    const rows = [['Date', 'Category', 'Amount', 'Payment Method', 'Description'], ...reportData.recent.map((ex) => [new Date(ex.created_at).toLocaleString(), ex.category, ex.amount, ex.payment_method || 'cash', ex.description || ''])];
    downloadCsv(`expenses-report-${reportStart}-to-${reportEnd}.csv`, rows);
  };

  const viewShiftDetail = (id) => {
    apiFetch(`/shift/${id}`).then((res) => res.json()).then(setSelectedShift);
  };

  if (!data) return <p className="text-on-surface-variant">Loading...</p>;

  const { shift, running, pending, closed } = data;
  const expectedForClose = closingShift?.status === 'pending_count'
    ? Number(closingShift.expected_cash)
    : running.expected_cash;

  const isClosed = shift.status === 'closed';
  const closedData = closed || { total_cash: 0, total_gcash: 0, cash_sales: 0, gcash_sales: 0, cash_utang_payments: 0, gcash_utang_payments: 0, cash_expenses: 0, gcash_expenses: 0 };
  const totalCash = Number(closedData.total_cash ?? 0);
  const totalGcash = Number(closedData.total_gcash ?? 0);
  const cashExpenses = running.cash_expenses ?? 0;
  const gcashExpenses = running.gcash_expenses ?? 0;
  const todayCashPending = Number(shift?.opening_cash || 0) + Number(running.cash_sales ?? 0) + Number(running.cash_utang_payments ?? 0);
  const todayGcashPending = Number(running.gcash_sales ?? 0) + Number(running.gcash_utang_payments ?? 0);

  return (
    <div>
      <h1 className="text-2xl font-bold text-on-surface mb-1">Cash Drawer</h1>
      <p className="text-on-surface-variant mb-6">Cash & GCash monitoring — transfers and expenses deduct from previous counted total.</p>

      {/* KPI Cards — Always visible */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-surface border border-outline-variant rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center shrink-0">
            <Wallet className="text-on-primary" size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-on-surface-variant text-xs uppercase tracking-wide">Total Cash in Hand — Counted</p>
            <p className="text-2xl font-bold text-on-surface">₱{Number(totalCash).toFixed(2)}</p>
            <p className="text-xs text-secondary truncate">Today pending: ₱{Number(todayCashPending).toFixed(2)} → added after count</p>
            {isClosed && <p className="text-xs text-on-surface-variant truncate">Today closed: counted ₱{Number(shift.closing_cash).toFixed(2)} · Expected ₱{Number(shift.expected_cash).toFixed(2)}</p>}
          </div>
        </div>
        <div className="bg-surface border border-outline-variant rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-secondary-container flex items-center justify-center shrink-0">
            <Smartphone className="text-secondary" size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-on-surface-variant text-xs uppercase tracking-wide">Total GCash — Counted</p>
            <p className="text-2xl font-bold text-on-surface">₱{Number(totalGcash).toFixed(2)}</p>
            <p className="text-xs text-on-surface-variant truncate">Counted · Sales ₱{Number(closedData.gcash_sales ?? 0).toFixed(2)} - Expenses ₱{Number(closedData.gcash_expenses ?? 0).toFixed(2)}</p>
            <p className="text-xs text-secondary truncate">Today pending GCash sales: ₱{Number(todayGcashPending).toFixed(2)} → added after count</p>
          </div>
        </div>
      </div>

      {pending.length > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
          <h2 className="font-semibold text-orange-800 mb-3">Needs Cash Count ({pending.length})</h2>
          <div className="space-y-2">
            {pending.map((p) => (
              <div key={p.id} className="flex justify-between items-center bg-white rounded-lg p-3">
                <div>
                  <p className="text-on-surface font-medium">{new Date(p.shift_date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</p>
                  <p className="text-on-surface-variant text-sm">Expected: ₱{Number(p.expected_cash).toFixed(2)}</p>
                </div>
                <button onClick={() => setClosingShift(p)} className="bg-primary text-on-primary text-sm font-medium px-4 py-2 rounded-lg">Count Cash</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sidebar like Reports */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex lg:flex-col gap-1 overflow-x-auto lg:w-44 shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-primary-container text-on-primary'
                  : 'text-on-surface-variant hover:bg-surface-container-low'
              }`}
            >
              <tab.icon size={16} /> {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0">
          {activeTab === 'drawer' && (
            <div className="bg-surface border border-outline-variant rounded-xl p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="font-semibold text-on-surface">Today — {new Date(shift.shift_date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h2>
                <span className={`${isClosed ? 'bg-primary-container text-on-primary' : 'bg-secondary-container text-secondary'} px-2 py-1 rounded-full text-xs font-medium`}>{isClosed ? 'Closed' : 'Active'}</span>
              </div>
              {isClosed ? (
                <>
                  <div className="bg-secondary-container/30 border border-secondary-container rounded-lg p-3 mb-4">
                    <p className="text-sm font-semibold text-secondary">Day Ended — Actual Cash Recorded</p>
                    <p className="text-xs text-on-surface-variant">Closed at {shift.closed_at ? new Date(shift.closed_at).toLocaleString() : ''}</p>
                  </div>
                  <div className="space-y-2 text-sm mb-4">
                    <div className="flex justify-between text-on-surface-variant"><span>Starting Cash</span><span>₱{Number(shift.opening_cash).toFixed(2)}</span></div>
                    <div className="flex justify-between text-on-surface-variant"><span>Expected Cash</span><span>₱{Number(shift.expected_cash).toFixed(2)}</span></div>
                    <div className="flex justify-between font-bold text-on-surface text-base pt-2 border-t border-outline-variant"><span>Actual Cash Counted</span><span>₱{Number(shift.closing_cash).toFixed(2)}</span></div>
                    <div className={`flex justify-between font-bold ${Number(shift.difference) === 0 ? 'text-secondary' : 'text-error'}`}><span>Difference</span><span>₱{Number(shift.difference).toFixed(2)}</span></div>
                    <div className="pt-2 border-t border-outline-variant space-y-2">
                      <div className="flex justify-between font-bold text-on-surface"><span>GCash — Final</span><span>₱{Number(running.gcash_sales).toFixed(2)}</span></div>
                      <div className="flex justify-between text-error"><span>GCash Expenses</span><span>-₱{Number(gcashExpenses).toFixed(2)}</span></div>
                    </div>
                    {shift.notes && <p className="text-xs text-on-surface-variant pt-2 border-t border-outline-variant">Notes: {shift.notes}</p>}
                  </div>
                  <p className="text-xs text-on-surface-variant">Tomorrow auto-creates at 00:00 Manila.</p>
                </>
              ) : shift.opening_cash === null ? (
                <>
                  <p className="text-on-surface-variant text-sm mb-3">Set today's starting cash — sales tracked either way.</p>
                  <label className="text-sm text-on-surface-variant">Starting Cash</label>
                  <input type="number" value={openingCashInput} onChange={(e) => setOpeningCashInput(e.target.value)} placeholder="e.g. 2000" className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1 mb-3" />
                  <button onClick={handleSetOpeningCash} className="w-full bg-primary text-on-primary font-semibold py-3 rounded-lg">Record Starting Cash</button>
                </>
              ) : (
                <>
                  <div className="space-y-2 text-sm mb-4">
                    <div className="flex justify-between text-on-surface-variant"><span>Starting Cash</span><span>₱{Number(shift.opening_cash).toFixed(2)}</span></div>
                    <div className="flex justify-between text-secondary"><span>Cash Sales (today)</span><span>+₱{Number(running.cash_sales).toFixed(2)}</span></div>
                    <div className="flex justify-between text-secondary"><span>Credit Payments Cash (today)</span><span>+₱{Number(running.cash_utang_payments).toFixed(2)}</span></div>
                    <div className="flex justify-between font-bold text-on-surface pt-2 border-t border-outline-variant text-base"><span>Today's Cash — Pending</span><span>₱{Number(todayCashPending).toFixed(2)}</span></div>
                    <p className="text-xs text-secondary">Pending — no expense deducted (expenses go to Counted above)</p>
                    <div className="pt-2 border-t border-outline-variant space-y-2">
                      <div className="flex justify-between text-secondary"><span>GCash Sales (today)</span><span>+₱{Number(running.gcash_sales).toFixed(2)}</span></div>
                      <div className="flex justify-between font-bold text-on-surface pt-1 border-t border-outline-variant"><span>Today's GCash — Pending</span><span>₱{Number(todayGcashPending).toFixed(2)}</span></div>
                      <p className="text-xs text-secondary">Pending — no expense deducted</p>
                    </div>
                  </div>
                  <p className="text-xs text-on-surface-variant mb-2">KPI above shows only counted days. Today's added after count.</p>
                  <button onClick={() => setClosingShift(shift)} className="w-full border border-outline-variant text-on-surface font-medium py-2.5 rounded-lg text-sm">Close Day — Enter Actual Cash</button>
                </>
              )}
            </div>
          )}

          {activeTab === 'transfers' && (
            <div className="space-y-4">
              <div className="bg-surface border border-outline-variant rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center"><ArrowLeftRight className="text-on-primary" size={16} /></div>
                  <h2 className="font-semibold text-on-surface">Money Transfer — Cash ↔ GCash</h2>
                </div>
                <p className="text-xs text-on-surface-variant mb-3">Monitoring only — move money between your wallets. Deducts from previous counted total.</p>
                <form onSubmit={handleTransfer} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm text-on-surface-variant">From</label>
                      <select value={transferForm.from_wallet} onChange={(e) => setTransferForm((f) => ({ ...f, from_wallet: e.target.value }))} className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1">
                        <option value="cash">Cash</option>
                        <option value="gcash">GCash</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm text-on-surface-variant">To</label>
                      <select value={transferForm.to_wallet} onChange={(e) => setTransferForm((f) => ({ ...f, to_wallet: e.target.value }))} className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1">
                        <option value="gcash">GCash</option>
                        <option value="cash">Cash</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-on-surface-variant">Amount</label>
                    <input type="number" step="0.01" value={transferForm.amount} onChange={(e) => setTransferForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1" />
                  </div>
                  <div>
                    <label className="text-sm text-on-surface-variant">Note (optional)</label>
                    <input type="text" value={transferForm.note} onChange={(e) => setTransferForm((f) => ({ ...f, note: e.target.value }))} placeholder="e.g. Cash to GCash for supplier" className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1" />
                  </div>
                  <button type="submit" className="w-full bg-primary text-on-primary font-semibold py-3 rounded-lg">Transfer</button>
                </form>
              </div>
              <div className="bg-surface border border-outline-variant rounded-xl p-4">
                <h3 className="font-semibold text-on-surface mb-3">Recent Transfers — Monitoring</h3>
                {transfers.length === 0 ? <p className="text-on-surface-variant text-sm">No transfers yet.</p> : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {transfers.map((t) => (
                      <div key={t.id} className="flex justify-between items-center text-sm border-b border-outline-variant pb-2">
                        <div>
                          <p className="text-on-surface capitalize">{t.from_wallet} → {t.to_wallet} <span className="text-on-surface-variant text-xs">· {new Date(t.created_at).toLocaleString()}</span></p>
                          <p className="text-on-surface-variant text-xs">{t.note || '—'}</p>
                        </div>
                        <span className="font-medium text-on-surface">₱{Number(t.amount).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'expenses' && (
            <div className="space-y-4">
              <div className="bg-surface border border-outline-variant rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-error-container flex items-center justify-center"><Receipt className="text-error" size={16} /></div>
                  <h2 className="font-semibold text-on-surface">Record Expense</h2>
                </div>
                <p className="text-xs text-on-surface-variant mb-3">Deducts from previous counted total, not from Today's pending.</p>
                <form onSubmit={handleAddExpense} className="space-y-3">
                  <div>
                    <label className="text-sm text-on-surface-variant">Category</label>
                    <select value={expenseForm.category} onChange={(e) => setExpenseForm((f) => ({ ...f, category: e.target.value }))} className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1">
                      <option>Store Supplies</option><option>Utilities</option><option>Rent</option><option>Transportation</option><option>Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm text-on-surface-variant">Amount</label>
                    <input type="number" step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))} placeholder="0.00" className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1" />
                  </div>
                  <div>
                    <label className="text-sm text-on-surface-variant">Payment Method</label>
                    <div className="flex gap-2 mt-1">
                      {['cash','gcash'].map((m) => (
                        <button key={m} type="button" onClick={() => setExpenseForm((f) => ({ ...f, payment_method: m }))} className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize border ${expenseForm.payment_method===m ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-low text-on-surface-variant border-outline-variant'}`}>{m === 'cash' ? 'Cash' : 'GCash'}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-on-surface-variant">Description</label>
                    <input type="text" value={expenseForm.description} onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))} placeholder="Details..." className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1" />
                  </div>
                  <button type="submit" className="w-full bg-error text-on-error font-semibold py-3 rounded-lg">Deduct from {expenseForm.payment_method === 'gcash' ? 'GCash' : 'Cash'}</button>
                </form>
              </div>
              <div className="bg-surface border border-outline-variant rounded-xl p-4">
                <div className="flex flex-col lg:flex-row lg:justify-between gap-3 mb-4">
                  <h2 className="font-semibold text-on-surface">Expense Report</h2>
                  <div className="flex flex-wrap gap-2 items-center">
                    <input type="date" value={reportStart} onChange={(e) => setReportStart(e.target.value)} className="border border-outline-variant rounded-lg px-2 py-1 text-sm" />
                    <span className="text-on-surface-variant text-sm">to</span>
                    <input type="date" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} className="border border-outline-variant rounded-lg px-2 py-1 text-sm" />
                    <button onClick={handleExport} className="border border-outline-variant text-primary text-sm font-medium px-3 py-1.5 rounded-lg flex items-center gap-1"><Download size={16} /> Export CSV</button>
                  </div>
                </div>
                {!reportData ? (
                  <p className="text-on-surface-variant text-sm">Loading...</p>
                ) : (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
                      <StatCard label="Total Expenses" value={`₱${reportData.total_expenses.toFixed(2)}`} change={pctChange(reportData.total_expenses, reportData.prev_total_expenses)} icon={Receipt} />
                      <StatCard label="Cash Expenses" value={`₱${Number(reportData.cash_total ?? 0).toFixed(2)}`} change={reportData.prev_cash_total !== undefined ? pctChange(reportData.cash_total, reportData.prev_cash_total) : undefined} icon={Receipt} />
                      <StatCard label="GCash Expenses" value={`₱${Number(reportData.gcash_total ?? 0).toFixed(2)}`} change={reportData.prev_gcash_total !== undefined ? pctChange(reportData.gcash_total, reportData.prev_gcash_total) : undefined} icon={Receipt} />
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                      <div className="bg-surface-container-low rounded-lg p-3">
                        <h3 className="font-medium text-on-surface text-sm mb-2">By Category</h3>
                        {reportData.by_category.length === 0 ? <p className="text-on-surface-variant text-sm">No expenses.</p> : reportData.by_category.map((c) => (
                          <div key={c.category} className="flex justify-between text-sm py-1.5 border-t border-outline-variant/50">
                            <span className="text-on-surface">{c.category}</span><span className="text-error font-medium">₱{Number(c.total).toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      <div className="bg-surface-container-low rounded-lg p-3">
                        <h3 className="font-medium text-on-surface text-sm mb-2">By Payment Method</h3>
                        {reportData.by_payment && reportData.by_payment.length > 0 ? reportData.by_payment.map((p) => (
                          <div key={p.payment_method} className="flex justify-between text-sm py-1">
                            <span className="capitalize text-on-surface-variant">{p.payment_method}</span><span className="text-error font-medium">₱{Number(p.total).toFixed(2)}</span>
                          </div>
                        )) : <p className="text-on-surface-variant text-sm">No data.</p>}
                      </div>
                    </div>
                    <div className="border border-outline-variant rounded-xl overflow-hidden">
                      <div className="p-3 bg-surface-container-low border-b border-outline-variant flex justify-between items-center">
                        <h3 className="font-medium text-on-surface text-sm">Detailed — All Necessary Columns</h3>
                        <span className="text-xs text-on-surface-variant">{reportData.recent.length} records</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm min-w-[700px]">
                          <thead className="bg-surface-container-low text-on-surface-variant">
                            <tr>
                              <th className="px-4 py-3">Date &amp; Time</th>
                              <th className="px-4 py-3">Category</th>
                              <th className="px-4 py-3">Amount</th>
                              <th className="px-4 py-3">Payment Method</th>
                              <th className="px-4 py-3">Description</th>
                            </tr>
                          </thead>
                          <tbody>
                            {reportData.recent.map((ex)=>(
                              <tr key={ex.id} className="border-t border-outline-variant">
                                <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{new Date(ex.created_at).toLocaleString()}</td>
                                <td className="px-4 py-3 text-on-surface"><span className="flex items-center gap-1"><span>{expenseIcon[ex.category]||'📦'}</span>{ex.category}</span></td>
                                <td className="px-4 py-3 text-error font-medium">₱{Number(ex.amount).toFixed(2)}</td>
                                <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${ex.payment_method==='gcash' ? 'bg-secondary-container text-secondary' : 'bg-primary-container text-on-primary'}`}>{ex.payment_method || 'cash'}</span></td>
                                <td className="px-4 py-3 text-on-surface-variant">{ex.description || '—'}</td>
                              </tr>
                            ))}
                            {reportData.recent.length===0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-on-surface-variant">No expenses in this period.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
              <div className="p-4 border-b border-outline-variant"><h2 className="font-semibold text-on-surface">Shift History</h2></div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[600px]">
                  <thead className="bg-surface-container-low text-on-surface-variant">
                    <tr><th className="px-4 py-3">Date</th><th className="px-4 py-3">Opening</th><th className="px-4 py-3">Closing</th><th className="px-4 py-3">Difference</th><th className="px-4 py-3 text-right">Actions</th></tr>
                  </thead>
                  <tbody>
                    {history.map((s) => (
                      <tr key={s.id} className="border-t border-outline-variant">
                        <td className="px-4 py-3 text-on-surface-variant">{new Date(s.shift_date).toLocaleDateString()}</td>
                        <td className="px-4 py-3 text-on-surface">₱{Number(s.opening_cash).toFixed(2)}</td>
                        <td className="px-4 py-3 text-on-surface">₱{Number(s.closing_cash).toFixed(2)}</td>
                        <td className={`px-4 py-3 font-medium ${Number(s.difference) === 0 ? 'text-secondary' : 'text-error'}`}>₱{Number(s.difference).toFixed(2)}</td>
                        <td className="px-4 py-3 text-right"><button onClick={() => viewShiftDetail(s.id)} className="p-1.5 text-primary hover:bg-primary-container hover:text-on-primary rounded-md"><Eye size={18} /></button></td>
                      </tr>
                    ))}
                    {history.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-on-surface-variant">No shifts closed yet.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {closingShift && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl w-full max-w-sm shadow-lg p-6">
            <h2 className="text-lg font-semibold text-on-surface mb-1">Count Cash — {new Date(closingShift.shift_date).toLocaleDateString()}</h2>
            <p className="text-on-surface-variant text-sm mb-4">Expected: ₱{expectedForClose.toFixed(2)}</p>
            <label className="text-sm text-on-surface-variant">Actual Cash Counted</label>
            <input type="number" value={closingCash} onChange={(e) => setClosingCash(e.target.value)} className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1 mb-3" />
            {closingCash && <p className={`text-sm mb-3 ${Number(closingCash) - expectedForClose === 0 ? 'text-secondary' : 'text-error'}`}>Difference: ₱{(Number(closingCash) - expectedForClose).toFixed(2)} {Number(closingCash) - expectedForClose !== 0 && ' ⚠ Mismatch'}</p>}
            <label className="text-sm text-on-surface-variant">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1 mb-4 resize-none" />
            <div className="flex gap-2">
              <button onClick={() => { setClosingShift(null); setClosingCash(''); setNotes(''); }} className="flex-1 border border-outline-variant text-on-surface py-2.5 rounded-lg text-sm font-medium">Cancel</button>
              <button onClick={handleClose} className="flex-1 bg-primary text-on-primary py-2.5 rounded-lg text-sm font-medium">Confirm</button>
            </div>
          </div>
        </div>
      )}

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
              <div className="flex justify-between text-on-surface-variant"><span>Starting Cash</span><span>₱{Number(selectedShift.opening_cash).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-on-surface"><span>Expected Cash</span><span>₱{Number(selectedShift.expected_cash).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-on-surface"><span>Actual Cash Counted</span><span>₱{Number(selectedShift.closing_cash).toFixed(2)}</span></div>
              <div className={`flex justify-between font-bold ${Number(selectedShift.difference) === 0 ? 'text-secondary' : 'text-error'}`}><span>Difference</span><span>₱{Number(selectedShift.difference).toFixed(2)}</span></div>
              <div className="pt-2 border-t border-outline-variant space-y-2">
                <p className="text-xs text-on-surface-variant">For reference only</p>
                <div className="flex justify-between text-on-surface-variant"><span>GCash Sales</span><span>₱{Number(selectedShift.gcash_sales).toFixed(2)}</span></div>
                <div className="flex justify-between text-on-surface-variant"><span>New Utang Charged</span><span>₱{Number(selectedShift.utang_charged).toFixed(2)}</span></div>
              </div>
              {selectedShift.notes && <div className="pt-2 border-t border-outline-variant"><p className="text-xs text-on-surface-variant mb-1">Notes</p><p className="text-on-surface">{selectedShift.notes}</p></div>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
