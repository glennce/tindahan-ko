import { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import StatCard from '../components/StatCard';
import { pctChange, downloadCsv, firstOfMonth, today } from '../utils';
import { Eye, Wallet, Smartphone, Receipt, Download, ArrowLeftRight, History, Trash2, Package, Info } from 'lucide-react';

const TABS = [
  { key: 'drawer', label: 'Drawer', icon: Wallet },
  { key: 'transfers', label: 'Transfers', icon: ArrowLeftRight },
  { key: 'expenses', label: 'Expenses', icon: Receipt },
  { key: 'history', label: 'History', icon: History },
];

const expenseIcon = {
  'Restock': '📦', 'Store Supplies': '🛍️', 'Utilities': '⚡', 'Rent': '🏠', 'Transportation': '🚗', 'Other': '📦',
};

const ACTIVITY_TYPES = [
  { key: 'all', label: 'All' },
  { key: 'shift', label: 'Cash Counts' },
  { key: 'expense', label: 'Expenses' },
  { key: 'transfer', label: 'Transfers' },
  { key: 'withdrawal', label: 'Profit Taken' },
];
const ACTIVITY_STYLE = {
  shift: { label: 'Cash Count', className: 'bg-primary-container text-on-primary' },
  expense: { label: 'Expense', className: 'bg-error-container text-error' },
  transfer: { label: 'Transfer', className: 'bg-secondary-container text-secondary' },
  withdrawal: { label: 'Profit Taken', className: 'bg-tertiary-container text-tertiary' },
};

export default function Shift() {
  const [activeTab, setActiveTab] = useState('drawer');
  const [data, setData] = useState(null);
  const [closingShift, setClosingShift] = useState(null);
  const [closingCash, setClosingCash] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedShift, setSelectedShift] = useState(null);
  const [expenseForm, setExpenseForm] = useState({ category: 'Store Supplies', amount: '', description: '', payment_method: 'cash' });
  const [reportStart, setReportStart] = useState(firstOfMonth());
  const [reportEnd, setReportEnd] = useState(today());
  const [reportData, setReportData] = useState(undefined);
  const [transferForm, setTransferForm] = useState({ from_wallet: 'cash', to_wallet: 'gcash', amount: '', note: '' });
  const [withdrawForm, setWithdrawForm] = useState({ amount: '', source_wallet: 'cash', note: '' });
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const { showToast } = useToast();
  const { user } = useAuth();

  const loadCurrent = () => {
    apiFetch('/shift/current').then((res) => res.json()).then(setData);
  };
  const loadReport = () => {
    apiFetch(`/reports/expenses?start=${reportStart}&end=${reportEnd}`)
      .then(async (res) => {
        const json = await res.json();
        // Owner-only endpoint: cashiers get 403 — don't store the error shape or the expense cards crash
        if (res.ok && json && typeof json.total_expenses !== 'undefined') setReportData(json);
        else setReportData(null);
      })
      .catch(() => setReportData(null));
  };

  const [activityType, setActivityType] = useState('all');
  const [activityPage, setActivityPage] = useState(1);
  const [activityData, setActivityData] = useState(null);
  const loadActivity = (pageNum, type) => {
    const t = type ?? activityType;
    const pg = pageNum ?? activityPage;
    apiFetch(`/shift/activity?type=${t}&page=${pg}&limit=25`)
      .then((res) => res.json())
      .then(setActivityData)
      .catch(() => {});
  };
  const changeActivityType = (t) => {
    setActivityType(t);
    setActivityPage(1);
    loadActivity(1, t);
  };
  const changeActivityPage = (p) => {
    setActivityPage(p);
    loadActivity(p, undefined);
  };

  const handleExportActivity = async () => {
    try {
      const res = await apiFetch(`/shift/activity?type=${activityType}&all=1`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      const rows = [['Date/Time', 'Type', 'Details', 'Wallet', 'Amount', 'By'],
        ...json.rows.map((r) => {
          const amt = Number(r.amount ?? 0);
          const signed = r.type === 'expense' || r.type === 'withdrawal' ? -amt : amt;
          return [
            new Date(r.occurred_at).toLocaleString(),
            ACTIVITY_STYLE[r.type]?.label || r.type,
            r.type === 'shift' ? `Cash counted (diff ₱${Number(r.extra ?? 0).toFixed(2)})${r.note ? ` · ${r.note}` : ''}` : `${r.title}${r.note ? ` · ${r.note}` : ''}`,
            r.wallet || '',
            signed.toFixed(2),
            r.created_by_name || '',
          ];
        })];
      downloadCsv(`cash-drawer-history-${new Date().toISOString().slice(0, 10)}.csv`, rows);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  useEffect(() => {
    loadCurrent();
    loadReport();
    loadActivity();
    const interval = setInterval(loadCurrent, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => { loadReport(); }, [reportStart, reportEnd]);

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
      loadActivity();
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
      loadActivity();
      showToast(`Transferred ₱${transferForm.amount} from ${transferForm.from_wallet} to ${transferForm.to_wallet}`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleTakeProfit = async (e) => {
    e?.preventDefault();
    if (!withdrawForm.amount || Number(withdrawForm.amount) <= 0) {
      showToast('Enter a valid amount', 'error');
      return;
    }
    try {
      const res = await apiFetch('/profit-withdrawals', {
        method: 'POST',
        body: JSON.stringify({ ...withdrawForm, amount: Number(withdrawForm.amount) }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setWithdrawForm({ amount: '', source_wallet: 'cash', note: '' });
      loadCurrent();
      loadActivity();
      showToast(`Profit taken ₱${Number(withdrawForm.amount).toFixed(2)} — drawer deducted, net profit untouched`);
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
      loadReport();
      loadActivity();
      showToast('Shift closed');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleExport = () => {
    if (!reportData || !reportData.recent) return;
    const rows = [['Date', 'Category', 'Amount', 'Payment Method', 'Description'], ...reportData.recent.map((ex) => [new Date(ex.created_at).toLocaleString(), ex.category, ex.amount, ex.payment_method || 'cash', ex.description || ''])];
    downloadCsv(`expenses-report-${reportStart}-to-${reportEnd}.csv`, rows);
  };

  const handleConvertExpense = async (id) => {
    if (!window.confirm('Move this to Profit Taken? Net Profit goes back up by this amount; drawer cash stays exactly the same.')) return;
    try {
      const res = await apiFetch(`/expenses/${id}/convert-to-withdrawal`, { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      loadCurrent();
      loadReport();
      loadActivity();
      showToast('Moved to Profit Taken — net profit fixed');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const handleDeleteExpense = async (id) => {
    if (!window.confirm('Delete this expense? This cannot be undone.')) return;
    try {
      const res = await apiFetch(`/expenses/${id}`, { method: 'DELETE' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      loadCurrent();
      loadReport();
      loadActivity();
      showToast('Expense deleted');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const viewShiftDetail = (id) => {
    apiFetch(`/shift/${id}`).then((res) => res.json()).then(setSelectedShift);
  };

  const handleResetDrawer = async () => {
    setShowResetConfirm(false);
    try {
      const res = await apiFetch('/shift/reset', { method: 'POST' });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      loadCurrent();
      loadActivity();
      showToast('Cash Drawer reset — counting from zero starting today');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  if (!data) return <p className="text-on-surface-variant">Loading...</p>;

  const { shift, running, pending, closed } = data;
  const profit = data.profit || { today_gross: 0, taken_today_cash: 0, taken_today_gcash: 0, taken_today_total: 0, total_gross: 0, taken_total: 0, available_total: 0 };
  const expectedForClose = closingShift?.status === 'pending_count'
    ? Number(closingShift.expected_cash)
    : running.expected_cash;

  const isClosed = shift.status === 'closed';
  const closedData = closed || { total_cash: 0, total_gcash: 0, cash_sales: 0, gcash_sales: 0, cash_utang_payments: 0, gcash_utang_payments: 0, cash_expenses: 0, gcash_expenses: 0, closed_days: 0 };
  const totalCash = Number(closedData.total_cash ?? 0);
  const totalGcash = Number(closedData.total_gcash ?? 0);
  const closedDays = Number(closedData.closed_days ?? 0);
  const cashExpenses = running.cash_expenses ?? 0;
  const gcashExpenses = running.gcash_expenses ?? 0;
  // No starting cash: today's pending is just today's cash in
  // (cash sales + cash credit payments). Count it each morning and the
  // KPI below keeps accumulating every counted actual.
  const todayCashPending = Number(running.cash_sales ?? 0) + Number(running.cash_utang_payments ?? 0);
  const todayGcashPending = Number(running.gcash_sales ?? 0) + Number(running.gcash_utang_payments ?? 0);
  const todayCashNet = todayCashPending;
  const todayGcashNet = todayGcashPending;
  // Live totals: all counted actuals + today's sales so far.
  // Expenses/transfers after the last count are already deducted inside totalCash/totalGcash.
  const liveCash = isClosed ? totalCash : totalCash + todayCashNet;
  const liveGcash = isClosed ? totalGcash : totalGcash + todayGcashNet;

  return (
    <div>
      <h1 className="text-2xl font-bold text-on-surface mb-1">Cash Drawer</h1>
      <p className="text-on-surface-variant mb-6">Count the actual cash every morning — the totals above keep adding up each time you count.</p>

      {/* KPI Cards — Always visible */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-surface border border-outline-variant rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary-container flex items-center justify-center shrink-0">
            <Wallet className="text-on-primary" size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-on-surface-variant text-xs uppercase tracking-wide">Total Cash in Hand{closedDays > 0 ? ` (${closedDays} day${closedDays === 1 ? '' : 's'} cumulative)` : ''}</p>
            <p className="text-2xl font-bold text-on-surface">₱{Number(liveCash).toFixed(2)}</p>
            {!isClosed
              ? <p className="text-xs text-secondary truncate">Counted ₱{Number(totalCash).toFixed(2)}{Number(closedData.cash_withdrawals ?? 0) > 0 ? ` (after profit taken ₱${Number(closedData.cash_withdrawals).toFixed(2)})` : ''} + today +₱{Number(todayCashNet).toFixed(2)}</p>
              : <p className="text-xs text-on-surface-variant truncate">Today closed: counted ₱{Number(shift.closing_cash).toFixed(2)} · Expected ₱{Number(shift.expected_cash).toFixed(2)}</p>}
          </div>
        </div>
        <div className="bg-surface border border-outline-variant rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-secondary-container flex items-center justify-center shrink-0">
            <Smartphone className="text-secondary" size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-on-surface-variant text-xs uppercase tracking-wide">Total GCash{closedDays > 0 ? ` (${closedDays} day${closedDays === 1 ? '' : 's'} cumulative)` : ''}</p>
            <p className="text-2xl font-bold text-on-surface">₱{Number(liveGcash).toFixed(2)}</p>
            <p className="text-xs text-on-surface-variant truncate">Counted · Sales ₱{Number(closedData.gcash_sales ?? 0).toFixed(2)} - Expenses ₱{Number(closedData.gcash_expenses ?? 0).toFixed(2)}{Number(closedData.gcash_withdrawals ?? 0) > 0 ? ` - Profit taken ₱${Number(closedData.gcash_withdrawals).toFixed(2)}` : ''}</p>
            {!isClosed && <p className="text-xs text-secondary truncate">Counted ₱{Number(totalGcash).toFixed(2)} + today +₱{Number(todayGcashNet).toFixed(2)}</p>}
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
            <div className="space-y-4">
            <div className="bg-surface border border-outline-variant rounded-xl p-4 sm:p-6">
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
                    <div className="flex justify-between text-on-surface-variant"><span>Expected Cash (today's sales)</span><span>₱{Number(shift.expected_cash).toFixed(2)}</span></div>
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
              ) : (
                <>
                  <div className="space-y-2 text-sm mb-4">
                    <div className="flex justify-between text-secondary"><span>Cash Sales (today)</span><span>+₱{Number(running.cash_sales).toFixed(2)}</span></div>
                    <div className="flex justify-between text-secondary"><span>Credit Payments Cash (today)</span><span>+₱{Number(running.cash_utang_payments).toFixed(2)}</span></div>
                    <div className="flex justify-between font-bold text-on-surface pt-2 border-t border-outline-variant text-base"><span>Today's Cash — Pending</span><span>₱{Number(todayCashPending).toFixed(2)}</span></div>
                    <p className="text-xs text-secondary">Count the drawer in the morning, take it to your wallet, then enter the actual — totals above keep adding up.</p>
                    <div className="pt-2 border-t border-outline-variant space-y-2">
                      <div className="flex justify-between text-secondary"><span>GCash Sales (today)</span><span>+₱{Number(running.gcash_sales).toFixed(2)}</span></div>
                      <div className="flex justify-between font-bold text-on-surface pt-1 border-t border-outline-variant"><span>Today's GCash — Pending</span><span>₱{Number(todayGcashPending).toFixed(2)}</span></div>
                      <p className="text-xs text-secondary">Pending — no expense deducted</p>
                    </div>
                  </div>
                  <p className="text-xs text-on-surface-variant mb-2">KPI above = all counted actuals + today's sales so far.</p>
                  <button onClick={() => setClosingShift(shift)} className="w-full bg-primary text-on-primary font-semibold py-2.5 rounded-lg text-sm">Enter Actual Cash</button>
                </>
              )}
            </div>

            <div className="bg-surface border border-outline-variant rounded-xl p-4 sm:p-6">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-full bg-primary-container flex items-center justify-center"><Wallet className="text-on-primary" size={16} /></div>
                <h2 className="font-semibold text-on-surface">Take Profit Home</h2>
              </div>
              <p className="text-xs text-on-surface-variant mb-4">Takes cash out of the drawer WITHOUT recording an expense — Net Profit stays correct. Use Expenses only for real store costs.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4 text-center">
                <div className="bg-surface-container-low rounded-lg p-3">
                  <p className="text-xs text-on-surface-variant">Total Gross Profit</p>
                  <p className="text-lg font-bold text-secondary">₱{Number(profit.total_gross ?? 0).toFixed(2)}</p>
                </div>
                <div className="bg-surface-container-low rounded-lg p-3">
                  <p className="text-xs text-on-surface-variant">Taken Home (all)</p>
                  <p className="text-lg font-bold text-on-surface">₱{Number(profit.taken_total ?? 0).toFixed(2)}</p>
                </div>
                <div className="bg-surface-container-low rounded-lg p-3">
                  <p className="text-xs text-on-surface-variant">Available to Take</p>
                  <p className="text-lg font-bold text-primary">₱{Number(profit.available_total ?? 0).toFixed(2)}</p>
                </div>
              </div>
              <form onSubmit={handleTakeProfit} className="space-y-3">
                <div>
                  <label className="text-sm text-on-surface-variant">Amount</label>
                  <input type="number" step="0.01" value={withdrawForm.amount} onChange={(e) => setWithdrawForm((f) => ({ ...f, amount: e.target.value }))} placeholder="e.g. 500" className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1" />
                  {withdrawForm.amount && Number(withdrawForm.amount) > Number(profit.available_total ?? 0) && (
                    <p className="text-xs text-error mt-1">⚠ More than available profit (₱{Number(profit.available_total ?? 0).toFixed(2)}) — taking home profit already withdrawn.</p>
                  )}
                </div>
                <div>
                  <label className="text-sm text-on-surface-variant">Take From</label>
                  <div className="flex gap-2 mt-1">
                    {['cash','gcash'].map((m) => (
                      <button key={m} type="button" onClick={() => setWithdrawForm((f) => ({ ...f, source_wallet: m }))} className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize border ${withdrawForm.source_wallet===m ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-low text-on-surface-variant border-outline-variant'}`}>{m === 'cash' ? 'Cash' : 'GCash'}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-sm text-on-surface-variant">Note (optional)</label>
                  <input type="text" value={withdrawForm.note} onChange={(e) => setWithdrawForm((f) => ({ ...f, note: e.target.value }))} placeholder="e.g. Today's profit" className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1" />
                </div>
                <button type="submit" className="w-full bg-primary text-on-primary font-semibold py-3 rounded-lg">Take Profit Home</button>
              </form>
            </div>
            </div>
          )}

          {activeTab === 'transfers' && (
            <div className="space-y-4">
              <div className="bg-surface border border-outline-variant rounded-xl p-4 sm:p-6">
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
            </div>
          )}

          {activeTab === 'expenses' && (
            <div className="space-y-4">
              <div className="bg-surface-container-low border border-outline-variant rounded-xl p-3 sm:p-4 flex items-start gap-3">
                <Package className="text-primary mt-0.5 shrink-0" size={20} />
                <div className="text-sm">
                  <p className="font-medium text-on-surface">Buying new stock for the store?</p>
                  <p className="text-on-surface-variant text-xs mt-0.5">
                    Every purchase must be recorded so your Cash in Hand stays accurate. Best: use{' '}
                    <span className="font-medium text-primary">Inventory → Stock In</span> — it logs the cost automatically.
                    Buying outside the app (sari-sari store top-ups, supplier runs)? Log it below as{' '}
                    <span className="font-medium text-primary">Restock</span>, with the full amount you paid.
                  </p>
                </div>
              </div>
              <div className="bg-surface border border-outline-variant rounded-xl p-4 sm:p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-8 h-8 rounded-full bg-error-container flex items-center justify-center"><Receipt className="text-error" size={16} /></div>
                  <h2 className="font-semibold text-on-surface">Record Expense</h2>
                </div>
                <p className="text-xs text-on-surface-variant mb-3">Deducts from previous counted total, not from Today's pending.</p>
                <form onSubmit={handleAddExpense} className="space-y-3">
                  <div>
                    <label className="text-sm text-on-surface-variant">Category</label>
                    <select value={expenseForm.category} onChange={(e) => setExpenseForm((f) => ({ ...f, category: e.target.value }))} className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1">
                      <option>Restock</option><option>Store Supplies</option><option>Utilities</option><option>Rent</option><option>Transportation</option><option>Other</option>
                    </select>
                    {expenseForm.category === 'Restock' && (
                      <p className="text-xs text-on-surface-variant mt-1 flex items-start gap-1.5">
                        <Info size={13} className="mt-0.5 shrink-0 text-primary" />
                        Stock purchase — the full amount you paid the supplier will be deducted from the drawer (Cash or GCash, based on the method below).
                      </p>
                    )}
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
                    <input type="date" value={reportStart} onChange={(e) => setReportStart(e.target.value)} className="border border-outline-variant rounded-lg px-2 py-2 text-sm" />
                    <span className="text-on-surface-variant text-sm">to</span>
                    <input type="date" value={reportEnd} onChange={(e) => setReportEnd(e.target.value)} className="border border-outline-variant rounded-lg px-2 py-2 text-sm" />
                    <button onClick={handleExport} className="border border-outline-variant text-primary text-sm font-medium px-3 py-1.5 rounded-lg flex items-center gap-1"><Download size={16} /> Export CSV</button>
                  </div>
                </div>
                {reportData === undefined ? (
                  <p className="text-on-surface-variant text-sm">Loading...</p>
                ) : !reportData ? (
                  <p className="text-on-surface-variant text-sm">Expense report is available to owners only.</p>
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
                      {user?.role === 'owner' && reportData.recent.length > 0 && (
                        <p className="text-xs text-on-surface-variant px-3 pt-2">Took profit home but logged it here by mistake? Hit <span className="font-medium text-primary">→ Profit</span> on that row — it moves to Profit Taken, Net Profit is fixed, drawer cash unchanged.</p>
                      )}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm min-w-[700px]">
                          <thead className="bg-surface-container-low text-on-surface-variant">
                            <tr>
                              <th className="px-4 py-3">Date &amp; Time</th>
                              <th className="px-4 py-3">Category</th>
                              <th className="px-4 py-3">Amount</th>
                              <th className="px-4 py-3">Payment Method</th>
                              <th className="px-4 py-3">Recorded By</th>
                              <th className="px-4 py-3">Description</th>
                              {user?.role === 'owner' && <th className="px-4 py-3 text-right">Action</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {reportData.recent.map((ex)=>(
                              <tr key={ex.id} className="border-t border-outline-variant">
                                <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{new Date(ex.created_at).toLocaleString()}</td>
                                <td className="px-4 py-3 text-on-surface"><span className="flex items-center gap-1"><span>{expenseIcon[ex.category]||'📦'}</span>{ex.category}</span></td>
                                <td className="px-4 py-3 text-error font-medium">₱{Number(ex.amount).toFixed(2)}</td>
                                <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${ex.payment_method==='gcash' ? 'bg-secondary-container text-secondary' : 'bg-primary-container text-on-primary'}`}>{ex.payment_method || 'cash'}</span></td>
                                <td className="px-4 py-3 text-on-surface-variant">{ex.created_by_name || '—'}</td>
                                <td className="px-4 py-3 text-on-surface-variant">{ex.description || '—'}</td>
                                {user?.role === 'owner' && (
                                  <td className="px-4 py-3 text-right whitespace-nowrap">
                                    <button onClick={() => handleConvertExpense(ex.id)} title="This was actually profit you took home — move it out of expenses" className="text-primary text-xs font-medium border border-outline-variant rounded-lg px-2 py-1 mr-1 hover:bg-primary-container">→ Profit</button>
                                    <button onClick={() => handleDeleteExpense(ex.id)} title="Delete this expense" className="p-1.5 text-error hover:bg-error-container rounded-md align-middle"><Trash2 size={16} /></button>
                                  </td>
                                )}
                              </tr>
                            ))}
                            {reportData.recent.length===0 && <tr><td colSpan={user?.role === 'owner' ? 7 : 6} className="px-4 py-6 text-center text-on-surface-variant">No expenses in this period.</td></tr>}
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
              <div className="p-4 border-b border-outline-variant flex flex-col lg:flex-row lg:justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-on-surface">History</h2>
                  <p className="text-xs text-on-surface-variant">Everything in the Cash Drawer — counted days, expenses, money transfers, profit take-homes.</p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <select value={activityType} onChange={(e) => changeActivityType(e.target.value)} className="border border-outline-variant rounded-lg px-2 py-1.5 text-sm">
                    {ACTIVITY_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                  {user?.role === 'owner' && (
                    <button
                      onClick={() => setShowResetConfirm(true)}
                      className="border border-error text-error text-sm font-medium px-3 py-1.5 rounded-lg"
                    >
                      Reset to Zero
                    </button>
                  )}
                  <button onClick={handleExportActivity} className="border border-outline-variant text-primary text-sm font-medium px-3 py-1.5 rounded-lg flex items-center gap-1">
                    <Download size={16} /> Export CSV
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[800px]">
                  <thead className="bg-surface-container-low text-on-surface-variant">
                    <tr><th className="px-4 py-3">Date &amp; Time</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Details</th><th className="px-4 py-3">Wallet</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">By</th><th className="px-4 py-3 text-right">Details View</th></tr>
                  </thead>
                  <tbody>
                    {(activityData?.rows || []).map((r) => {
                      const style = ACTIVITY_STYLE[r.type] || { label: r.type, className: 'bg-surface-container-low text-on-surface-variant' };
                      const amt = Number(r.amount ?? 0);
                      return (
                        <tr key={`${r.type}-${r.ref_id}`} className="border-t border-outline-variant">
                          <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">
                            {r.type === 'shift'
                              ? new Date(r.event_date).toLocaleDateString()
                              : new Date(r.occurred_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${style.className}`}>{style.label}</span></td>
                          <td className="px-4 py-3">
                            <p className="text-on-surface">{r.type === 'shift' ? `Cash counted — ${r.event_date ? new Date(r.event_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}` : r.title}</p>
                            {(r.type === 'shift' ? `Diff ₱${Number(r.extra ?? 0).toFixed(2)}${r.note ? ` · ${r.note}` : ''}` : (r.note || '')) && (
                              <p className="text-on-surface-variant text-xs">{r.type === 'shift' ? `Diff ₱${Number(r.extra ?? 0).toFixed(2)}${r.note ? ` · ${r.note}` : ''}` : (r.note || '—')}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 capitalize text-on-surface-variant">{r.wallet || '—'}</td>
                          <td className="px-4 py-3 text-right font-medium whitespace-nowrap">
                            {r.type === 'shift'
                              ? <span className="text-on-surface">₱{amt.toFixed(2)}</span>
                              : r.type === 'expense' || r.type === 'withdrawal'
                                ? <span className="text-error">-₱{amt.toFixed(2)}</span>
                                : <span className="text-secondary">₱{amt.toFixed(2)}</span>}
                          </td>
                          <td className="px-4 py-3 text-on-surface-variant">{r.created_by_name || '—'}</td>
                          <td className="px-4 py-3 text-right">
                            {r.type === 'shift' && (
                              <button onClick={() => viewShiftDetail(r.ref_id)} className="p-1.5 text-primary hover:bg-primary-container hover:text-on-primary rounded-md"><Eye size={18} /></button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {activityData && activityData.rows.length === 0 && (
                      <tr><td colSpan={7} className="px-4 py-6 text-center text-on-surface-variant">No history entries{activityType !== 'all' ? ' for this type' : ''}.</td></tr>
                    )}
                    {!activityData && (
                      <tr><td colSpan={7} className="px-4 py-6 text-center text-on-surface-variant">Loading...</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {activityData && activityData.pages > 0 && (
                <div className="p-3 border-t border-outline-variant flex flex-wrap justify-between items-center gap-2">
                  <p className="text-xs text-on-surface-variant">Page {activityData.page} of {activityData.pages} · {activityData.total} records</p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => changeActivityPage(activityPage - 1)}
                      disabled={activityPage <= 1}
                      className="border border-outline-variant text-on-surface text-sm font-medium px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => changeActivityPage(activityPage + 1)}
                      disabled={activityPage >= (activityData.pages || 1)}
                      className="border border-outline-variant text-on-surface text-sm font-medium px-3 py-1.5 rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
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
              <p className="text-on-surface-variant mb-2">{new Date(selectedShift.shift_date).toLocaleDateString()} · closed {selectedShift.closed_at ? new Date(selectedShift.closed_at).toLocaleString() : ''}</p>
              <div className="flex justify-between text-on-surface-variant"><span>Cash Sales</span><span>+₱{Number(selectedShift.cash_sales ?? 0).toFixed(2)}</span></div>
              <div className="flex justify-between text-on-surface-variant"><span>Credit Payments (Cash)</span><span>+₱{Number(selectedShift.cash_utang_payments ?? 0).toFixed(2)}</span></div>
              <div className="flex justify-between text-on-surface-variant"><span>Cash Expenses</span><span className="text-error">-₱{Number(selectedShift.cash_expenses ?? 0).toFixed(2)}</span></div>
              <div className="flex justify-between text-on-surface-variant"><span>Profit Taken Home</span><span className="text-error">-₱{Number(selectedShift.profit_taken ?? ((Number(selectedShift.cash_withdrawals ?? 0)) + (Number(selectedShift.gcash_withdrawals ?? 0)))).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-on-surface"><span>Expected Cash</span><span>₱{Number(selectedShift.expected_cash).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold text-on-surface"><span>Actual Cash Counted</span><span>₱{Number(selectedShift.closing_cash).toFixed(2)}</span></div>
              <div className={`flex justify-between font-bold ${Number(selectedShift.difference) === 0 ? 'text-secondary' : 'text-error'}`}><span>Difference</span><span>₱{Number(selectedShift.difference).toFixed(2)}</span></div>
              <div className="pt-2 border-t border-outline-variant space-y-2">
                <p className="text-xs font-semibold text-on-surface">Debt from credit (utang)</p>
                <div className="flex justify-between text-error font-medium"><span>New credit given that day</span><span>₱{Number(selectedShift.utang_charged ?? 0).toFixed(2)}</span></div>
                <p className="text-xs text-on-surface-variant">Not cash in hand — collect via Utang payments.</p>
              </div>
              <div className="pt-2 border-t border-outline-variant space-y-2">
                <p className="text-xs font-semibold text-on-surface">Paid using GCash</p>
                <div className="flex justify-between text-on-surface-variant"><span>GCash Sales</span><span>+₱{Number(selectedShift.gcash_sales ?? 0).toFixed(2)}</span></div>
                <div className="flex justify-between text-on-surface-variant"><span>Credit Payments (GCash)</span><span>+₱{Number(selectedShift.gcash_utang_payments ?? 0).toFixed(2)}</span></div>
                <div className="flex justify-between text-on-surface-variant"><span>GCash Expenses</span><span className="text-error">-₱{Number(selectedShift.gcash_expenses ?? 0).toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-on-surface"><span>GCash Received (net of expenses)</span><span>₱{Number(selectedShift.gcash_in_hand ?? ((Number(selectedShift.gcash_sales ?? 0) + Number(selectedShift.gcash_utang_payments ?? 0)) - Number(selectedShift.gcash_expenses ?? 0))).toFixed(2)}</span></div>
                {(selectedShift.expected_gcash !== undefined && selectedShift.expected_gcash !== null) && (
                  <div className="flex justify-between text-on-surface-variant text-xs"><span>Expected GCash (before expenses)</span><span>₱{Number(selectedShift.expected_gcash).toFixed(2)}</span></div>
                )}
              </div>
              {selectedShift.notes && <div className="pt-2 border-t border-outline-variant"><p className="text-xs text-on-surface-variant mb-1">Notes</p><p className="text-on-surface">{selectedShift.notes}</p></div>}
            </div>
          </div>
        </>
      )}

      <ConfirmModal
        isOpen={showResetConfirm}
        title="Reset Cash Drawer to zero?"
        message="This clears all counted shift history. KPIs restart at ₱0 and count sales + expenses from today onwards. Sales records are kept. This cannot be undone."
        confirmLabel="Reset to Zero"
        onConfirm={handleResetDrawer}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
}
