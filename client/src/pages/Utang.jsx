import { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import PaymentModal from '../components/PaymentModal';
import CustomerModal from '../components/CustomerModal';
import { useToast } from '../context/ToastContext';
import { Eye, Download } from 'lucide-react';

const UTANG_API = '/utang';

function downloadCsv(filename, rows) {
  // \ufeff BOM first so Excel opens UTF-8 correctly
  const csv = '﻿' + rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function initials(name) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

const historyIcon = {
  charge: { bg: 'bg-error-container', color: 'text-error' },
  payment: { bg: 'bg-secondary-container', color: 'text-secondary' },
  cash_loan: { bg: 'bg-orange-100', color: 'text-orange-700' },
  cash_loan_payment: { bg: 'bg-blue-100', color: 'text-blue-700' },
};

function historyLabel(h) {
  if (h.type === 'cash_loan') return 'Cash Loan (monitoring only)';
  if (h.type === 'cash_loan_payment') return `Cash Repayment (${h.payment_method || 'cash'})`;
  if (h.type === 'payment') return `Payment (${h.payment_method || 'cash'})`;
  return 'Charge';
}

function Utang() {
  const [ledger, setLedger] = useState([]);
  const [summary, setSummary] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [history, setHistory] = useState([]);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [debtSale, setDebtSale] = useState(null);
  const [loadingDebtSale, setLoadingDebtSale] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [historyFilter, setHistoryFilter] = useState('all');
  const [lendOpen, setLendOpen] = useState(false);
  const [lendCustomerId, setLendCustomerId] = useState('');
  const [lendAmount, setLendAmount] = useState('');
  const [lendNote, setLendNote] = useState('');
  const [lendError, setLendError] = useState(null);
  const [lendSaving, setLendSaving] = useState(false);
  const [repayOpen, setRepayOpen] = useState(false);
  const [repayCustomerId, setRepayCustomerId] = useState('');
  const [repayAmount, setRepayAmount] = useState('');
  const [repayMethod, setRepayMethod] = useState('cash');
  const [repayNote, setRepayNote] = useState('');
  const [repayError, setRepayError] = useState(null);
  const [repaySaving, setRepaySaving] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  // When quick-adding a customer from inside the Lend Cash modal, prefill
  // the lend dropdown with the new customer once saved.
  const [lendAfterAdd, setLendAfterAdd] = useState(false);
  const { showToast } = useToast();

  const loadAll = () => {
    apiFetch(UTANG_API)
      .then((res) => res.json())
      .then((d) => Array.isArray(d) && setLedger(d))
      .catch((err) => console.error(err));
    apiFetch(`${UTANG_API}/summary`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load summary');
        setSummary(data);
      })
      .catch((err) => console.error(err));
  };

  useEffect(() => {
    loadAll();
  }, []);

  const selectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setHistoryFilter('all');
    apiFetch(`${UTANG_API}/${customer.customer_id}`)
      .then((res) => res.json())
      .then((d) => setHistory(Array.isArray(d) ? d : []))
      .catch(() => setHistory([]));
  };

  const handleSavePayment = async (payload) => {
    try {
      const res = await apiFetch(`${UTANG_API}/payment`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setPaymentModalOpen(false);
      loadAll();
      showToast('Payment recorded');
      const updated = ledger.find((c) => c.customer_id === payload.customer_id);
      if (updated) selectCustomer({ ...updated, customer_id: payload.customer_id });
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Quick-add customer without leaving the Utang page. Refreshes the ledger
  // and selects the new customer; if launched from the Lend Cash modal,
  // prefills the lend dropdown too.
  const handleSaveCustomer = async (formData) => {
    try {
      const res = await apiFetch('/customers', {
        method: 'POST',
        body: JSON.stringify(formData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add customer');
      setCustomerModalOpen(false);
      showToast('Customer added');
      if (lendAfterAdd && Number(formData.credit_limit || 0) <= 0) {
        showToast('Note: credit limit is ₱0 — raise it (Customers → Edit) before lending.', 'error');
      }
      const fresh = await apiFetch(UTANG_API).then((r) => r.json());
      if (Array.isArray(fresh)) {
        setLedger(fresh);
        const created = fresh.find((c) => c.customer_id === data.id);
        if (created) selectCustomer(created);
        if (lendAfterAdd) {
          setLendCustomerId(String(data.id));
          setLendAfterAdd(false);
        }
      } else {
        loadAll();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  // Breakdown of the selected customer's balance. Cash loans are tracked
  // with type='cash_loan' / 'cash_loan_payment', so they can be separated
  // from store credit (charges/payments) without extra backend calls.
  const cashLoaned = history
    .filter((h) => h.type === 'cash_loan')
    .reduce((s, h) => s + Number(h.amount || 0), 0);
  const cashRepaid = history
    .filter((h) => h.type === 'cash_loan_payment')
    .reduce((s, h) => s + Number(h.amount || 0), 0);
  const cashBalance = Math.max(cashLoaned - cashRepaid, 0);
  const storeBalance = selectedCustomer
    ? Math.max(Number(selectedCustomer.balance || 0) - cashBalance, 0)
    : 0;

  const visibleHistory = history.filter((h) => {
    if (historyFilter === 'store') return h.type === 'charge' || h.type === 'payment';
    if (historyFilter === 'cash') return h.type === 'cash_loan' || h.type === 'cash_loan_payment';
    return true;
  });

  const openLend = () => {
    setLendCustomerId(selectedCustomer ? String(selectedCustomer.customer_id) : '');
    setLendAmount('');
    setLendNote('');
    setLendError(null);
    setLendOpen(true);
  };

  const openCashRepay = () => {
    setRepayCustomerId(selectedCustomer ? String(selectedCustomer.customer_id) : '');
    setRepayAmount('');
    setRepayMethod('cash');
    setRepayNote('');
    setRepayError(null);
    setRepayOpen(true);
  };

  const handleLendCash = async (e) => {
    e?.preventDefault();
    setLendError(null);
    if (!lendCustomerId) { setLendError('Select a customer.'); return; }
    if (!lendAmount || Number(lendAmount) <= 0) { setLendError('Enter a valid amount.'); return; }
    // Surface the credit-limit block up front: new customers default to ₱0
    // limit, so any loan is rejected until the limit is raised.
    const lendTo = ledger.find((c) => c.customer_id === Number(lendCustomerId));
    const lendAvailable = lendTo ? Number(lendTo.credit_limit || 0) - Number(lendTo.balance || 0) : 0;
    if (lendTo && Number(lendAmount) > lendAvailable + 0.005) {
      setLendError(
        `${lendTo.name} only has ₱${Math.max(lendAvailable, 0).toFixed(2)} available credit. Raise their limit first (Customers → Edit).`
      );
      return;
    }
    setLendSaving(true);
    try {
      const res = await apiFetch(`${UTANG_API}/cash-loan`, {
        method: 'POST',
        body: JSON.stringify({ customer_id: Number(lendCustomerId), amount: Number(lendAmount), note: lendNote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record cash loan');
      setLendOpen(false);
      loadAll();
      showToast('Cash loan recorded (monitoring only)');
      const updated = ledger.find((c) => c.customer_id === Number(lendCustomerId));
      if (updated) selectCustomer({ ...updated, customer_id: Number(lendCustomerId) });
      else setSelectedCustomer(null);
    } catch (err) {
      setLendError(err.message || 'Failed to record cash loan');
    } finally {
      setLendSaving(false);
    }
  };

  const handleCashRepay = async (e) => {
    e?.preventDefault();
    setRepayError(null);
    if (!repayCustomerId) { setRepayError('Select a customer.'); return; }
    if (!repayAmount || Number(repayAmount) <= 0) { setRepayError('Enter a valid amount.'); return; }
    setRepaySaving(true);
    try {
      const res = await apiFetch(`${UTANG_API}/cash-loan/payment`, {
        method: 'POST',
        body: JSON.stringify({
          customer_id: Number(repayCustomerId),
          amount: Number(repayAmount),
          payment_method: repayMethod,
          note: repayNote,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to record cash-loan repayment');
      setRepayOpen(false);
      loadAll();
      showToast('Cash repayment recorded (monitoring only)');
      const updated = ledger.find((c) => c.customer_id === Number(repayCustomerId));
      if (updated) selectCustomer({ ...updated, customer_id: Number(repayCustomerId) });
    } catch (err) {
      setRepayError(err.message || 'Failed to record cash-loan repayment');
    } finally {
      setRepaySaving(false);
    }
  };
  const viewDebtProducts = async (saleId) => {
    try {
      setLoadingDebtSale(true);
      const res = await apiFetch(`/sales/${saleId}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load sale details');
      setDebtSale(data);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoadingDebtSale(false);
    }
  };

  // Export what this customer STILL owes (outstanding charges only, not settled
  // history): every unpaid charge itemized so they can see their debts.
  // Oldest charges are treated as paid first (FIFO), so the list covers the
  // current balance from the newest charges backwards.
  const handleExportStatement = async () => {
    if (!selectedCustomer) return;
    setExporting(true);
    try {
      const res = await apiFetch(`${UTANG_API}/${selectedCustomer.customer_id}/statement`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Export failed');
      const money = (n) => Number(n || 0).toFixed(2);
      const day = (t) => new Date(t).toLocaleDateString();
      // FIFO: payments settle the oldest charges first
      let remaining = Number(data.total_paid || 0);
      const outstanding = [];
      for (const c of data.charges) {
        const amt = Number(c.amount || 0);
        const covered = Math.min(remaining, amt);
        remaining -= covered;
        const unpaid = amt - covered;
        if (unpaid > 0.005) outstanding.push({ ...c, unpaid, partial: covered > 0.005 });
      }
      const rows = [
        ['Tindahan Ko - Outstanding Debt'],
        ['Customer', data.customer.name],
        ['Generated', new Date().toLocaleString()],
        ['Outstanding Balance (PHP)', money(data.customer.balance)],
        [],
        ['OUTSTANDING CHARGES - What you still owe'],
        ['Date', 'Sale #', 'Product', 'Qty', 'Unit Price (PHP)', 'Subtotal (PHP)'],
      ];
      if (outstanding.length === 0) {
        rows.push(['No outstanding debt — all settled.']);
      }
      for (const c of outstanding) {
        const saleRef = c.sale_id ? `#${c.sale_id}` : '—';
        if (c.items.length === 0) {
          rows.push([day(c.created_at), saleRef, c.note || 'Charge', '', '', money(c.unpaid)]);
        } else {
          for (const it of c.items) {
            rows.push([day(c.created_at), saleRef, it.product_name, it.quantity, money(it.unit_price), money(it.subtotal)]);
          }
          rows.push(['', '', '', '', c.partial ? `Still unpaid (of ${money(c.amount)})` : 'Charge total (PHP)', money(c.unpaid)]);
        }
      }
      if (outstanding.length > 0) {
        rows.push(['', '', '', '', 'Total Still Unpaid (PHP)', money(outstanding.reduce((s, c) => s + c.unpaid, 0))]);
      }
      // Cash loans are tracked separately (monitoring only, not in drawer).
      // FIFO within cash loans: repayments settle the oldest loans first.
      const cashLoans = data.cash_loans || [];
      const cashRepaidTotal = Number(data.total_cash_repaid || 0);
      let cashRemaining = cashRepaidTotal;
      const cashOutstanding = [];
      for (const c of cashLoans) {
        const amt = Number(c.amount || 0);
        const covered = Math.min(cashRemaining, amt);
        cashRemaining -= covered;
        const unpaid = amt - covered;
        if (unpaid > 0.005) cashOutstanding.push({ ...c, unpaid });
      }
      rows.push([], ['CASH LOANS - Monitoring only (not counted in Cash Drawer)']);
      rows.push(['Date', 'Note', 'Loaned (PHP)', 'Still Unpaid (PHP)']);
      if (cashOutstanding.length === 0) {
        rows.push([cashLoans.length === 0 ? 'No cash loans.' : 'All cash loans settled.']);
      }
      for (const c of cashOutstanding) {
        rows.push([day(c.created_at), c.note || 'Cash loan', money(c.amount), money(c.unpaid)]);
      }
      if (cashOutstanding.length > 0) {
        rows.push(['', '', 'Cash Still Unpaid (PHP)', money(cashOutstanding.reduce((s, c) => s + c.unpaid, 0))]);
      }
      const safeName = String(data.customer.name).replace(/\s+/g, '-');
      downloadCsv(`outstanding-debt-${safeName}-${new Date().toISOString().slice(0, 10)}.csv`, rows);
      showToast('Outstanding debt exported');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setExporting(false);
    }
  };

  const filteredLedger = ledger.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const percentUsed = selectedCustomer && Number(selectedCustomer.credit_limit) > 0
    ? Math.min((Number(selectedCustomer.balance) / Number(selectedCustomer.credit_limit)) * 100, 100)
    : 0;

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Utang Management</h1>
          <p className="text-on-surface-variant">Track store credit and cash loans. Cash loans are monitoring only — not counted in Cash Drawer.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setLendAfterAdd(false); setCustomerModalOpen(true); }}
            className="border border-outline-variant text-on-surface font-medium px-4 py-2 rounded-full text-sm"
          >
            + New Customer
          </button>
          <button
            onClick={openLend}
            className="border border-outline-variant text-on-surface font-medium px-4 py-2 rounded-full text-sm"
          >
            + Lend Cash
          </button>
          <button
            onClick={() => { setSelectedCustomer(null); setPaymentModalOpen(true); }}
            className="bg-primary-container text-on-primary font-medium px-4 py-2 rounded-full text-sm"
          >
            + New Payment
          </button>
        </div>
      </div>

      {/* Metric cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-surface border border-outline-variant rounded-xl p-4">
            <p className="text-on-surface-variant text-sm">Total Outstanding</p>
            <p className="text-2xl font-bold text-on-surface">₱{Number(summary.total_outstanding || 0).toFixed(2)}</p>
          </div>
          <div className="bg-surface border border-outline-variant rounded-xl p-4">
            <p className="text-on-surface-variant text-sm">Cash Loans <span className="text-xs">(monitoring)</span></p>
            <p className="text-2xl font-bold text-on-surface">₱{Number(summary.cash_loans_outstanding || 0).toFixed(2)}</p>
            <p className="text-on-surface-variant text-xs">Not in Cash Drawer</p>
          </div>
          <div className="bg-surface border border-outline-variant rounded-xl p-4">
            <p className="text-on-surface-variant text-sm">Customers w/ Balance</p>
            <p className="text-2xl font-bold text-on-surface">{summary.customers_with_balance}</p>
          </div>
          <div className="bg-surface border border-outline-variant rounded-xl p-4">
            <p className="text-on-surface-variant text-sm">Payments Today</p>
            <p className="text-2xl font-bold text-on-surface">₱{Number(summary.payments_today || 0).toFixed(2)}</p>
            <p className="text-on-surface-variant text-xs">{summary.payments_today_count} transactions</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ledger list */}
        <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
          <div className="p-4 border-b border-outline-variant flex justify-between items-center">
            <h2 className="font-semibold text-on-surface">Utang Ledger</h2>
            <input
              type="text"
              placeholder="Search customer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-outline-variant rounded-lg px-3 py-1.5 text-sm w-40"
            />
          </div>
          {filteredLedger.map((c) => (
            <button
              key={c.customer_id}
              onClick={() => selectCustomer(c)}
              className={`w-full text-left flex items-center gap-3 px-4 py-3 border-t border-outline-variant ${
                selectedCustomer?.customer_id === c.customer_id ? 'bg-surface-container-low' : ''
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center font-bold text-on-surface text-sm shrink-0">
                {initials(c.name)}
              </div>
              <span className="flex-1 text-on-surface font-medium">{c.name}</span>
              <span className={Number(c.balance) > 0 ? 'text-error font-medium' : 'text-on-surface-variant'}>
                ₱{Number(c.balance).toFixed(2)}
              </span>
            </button>
          ))}
        </div>

        {/* Detail panel */}
        <div className="bg-surface border border-outline-variant rounded-xl p-4">
          {!selectedCustomer ? (
            <p className="text-on-surface-variant text-sm">Select a customer to view details.</p>
          ) : (
            <>
              <div className="flex items-center gap-4 mb-4">
                <div className="w-14 h-14 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-bold text-lg">
                  {initials(selectedCustomer.name)}
                </div>
                <div>
                  <h2 className="font-semibold text-on-surface text-lg">{selectedCustomer.name}</h2>
                  <p className="text-on-surface-variant text-sm">Regular Customer</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-surface-container-low p-4 rounded-lg border border-outline-variant mb-3">
                <div>
                  <p className="text-xs text-on-surface-variant">Current Balance</p>
                  <p className="text-lg font-bold text-error">₱{Number(selectedCustomer.balance).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-xs text-on-surface-variant">Credit Limit</p>
                  <p className="text-lg font-bold text-on-surface">₱{Number(selectedCustomer.credit_limit).toFixed(2)}</p>
                </div>
                <div className="col-span-2 w-full bg-outline-variant rounded-full h-2 mt-1">
                  <div className="bg-error h-2 rounded-full" style={{ width: `${percentUsed}%` }} />
                </div>
                <div className="col-span-2 text-right text-xs text-on-surface-variant">
                  {percentUsed.toFixed(0)}% of limit reached
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="border border-outline-variant rounded-lg p-3">
                  <p className="text-xs text-on-surface-variant">Store Credit</p>
                  <p className="text-base font-bold text-error">₱{storeBalance.toFixed(2)}</p>
                </div>
                <div className="border border-outline-variant rounded-lg p-3">
                  <p className="text-xs text-on-surface-variant">Cash Loan <span className="text-[10px]">(monitoring)</span></p>
                  <p className="text-base font-bold text-on-surface">₱{cashBalance.toFixed(2)}</p>
                </div>
              </div>

              <div className="flex justify-between items-center mb-2">
                <div className="flex gap-1">
                  {['all', 'store', 'cash'].map((f) => (
                    <button
                      key={f}
                      onClick={() => setHistoryFilter(f)}
                      className={`text-xs font-medium px-3 py-1.5 rounded-full capitalize ${
                        historyFilter === f ? 'bg-primary-container text-on-primary' : 'text-on-surface-variant hover:bg-surface-container-low'
                      }`}
                    >
                      {f === 'all' ? 'All' : f === 'store' ? 'Store' : 'Cash'}
                    </button>
                  ))}
                </div>
                <button
                  onClick={handleExportStatement}
                  disabled={exporting}
                  className="border border-outline-variant text-primary text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-50"
                >
                  <Download size={14} /> {exporting ? 'Exporting...' : 'Export Excel'}
                </button>
              </div>
              <h3 className="text-sm font-medium text-on-surface-variant mb-1">Transaction History</h3>
              <div className="space-y-1 max-h-64 overflow-y-auto mb-4">
                {visibleHistory.length === 0 && (
                  <p className="text-on-surface-variant text-sm text-center py-4">No history yet.</p>
                )}
                {visibleHistory.map((h) => {
                  const icon = historyIcon[h.type] || historyIcon.charge;
                  const canViewProducts = h.sale_id && h.type === 'charge';
                  const isDecrease = h.type === 'payment' || h.type === 'cash_loan_payment';
                  return (
                    <div key={h.id} className="flex justify-between items-center py-2 border-t border-outline-variant gap-2">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`w-8 h-8 rounded-full ${icon.bg} ${icon.color} flex items-center justify-center text-xs font-bold shrink-0`}>
                          {h.type === 'cash_loan' ? '₱' : isDecrease ? '₱' : '+'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-on-surface text-sm capitalize truncate">
                            {historyLabel(h)}
                          </p>
                          <p className="text-on-surface-variant text-xs truncate">
                            {new Date(h.created_at).toLocaleDateString()}
                            {h.note ? ` · ${h.note}` : ''}
                            {h.sale_id ? ` · #${h.sale_id}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          <p className={isDecrease ? 'text-secondary font-medium text-sm' : 'text-error font-medium text-sm'}>
                            {isDecrease ? '-' : '+'}₱{Number(h.amount).toFixed(2)}
                          </p>
                          <p className="text-on-surface-variant text-xs">Bal: ₱{Number(h.balance_after).toFixed(2)}</p>
                        </div>
                        {canViewProducts && (
                          <button
                            onClick={() => viewDebtProducts(h.sale_id)}
                            disabled={loadingDebtSale}
                            className="p-1.5 text-primary hover:bg-primary-container hover:text-on-primary rounded-md transition-colors"
                            title="View debt products"
                          >
                            <Eye size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2">
                <button
                  onClick={() => setPaymentModalOpen(true)}
                  className="w-full bg-primary text-on-primary font-semibold py-3 rounded-lg"
                >
                  Record Payment
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={openLend}
                    className="w-full border border-outline-variant text-on-surface font-medium py-2.5 rounded-lg text-sm"
                  >
                    Lend Cash
                  </button>
                  <button
                    onClick={openCashRepay}
                    disabled={cashBalance <= 0}
                    className="w-full border border-outline-variant text-on-surface font-medium py-2.5 rounded-lg text-sm disabled:opacity-50"
                  >
                    Cash Repayment
                  </button>
                </div>
                <p className="text-xs text-on-surface-variant text-center">Cash loans are monitoring only — not counted in Cash Drawer.</p>
              </div>
            </>
          )}
        </div>
      </div>

      <PaymentModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        onSave={handleSavePayment}
        customers={ledger}
        preselectedCustomer={selectedCustomer}
      />

      <CustomerModal
        isOpen={customerModalOpen}
        onClose={() => { setCustomerModalOpen(false); setLendAfterAdd(false); }}
        onSave={handleSaveCustomer}
        initialData={null}
      />

      {lendOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl w-full max-w-md shadow-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-outline-variant flex justify-between items-center">
              <h2 className="font-semibold text-on-surface">Lend Cash</h2>
              <button onClick={() => setLendOpen(false)} className="text-on-surface-variant text-xl">✕</button>
            </div>
            <form onSubmit={handleLendCash} className="p-4 space-y-3">
              <p className="text-xs text-on-surface-variant bg-surface-container-low border border-outline-variant rounded-lg p-2">
                Monitoring only — cash loans are NOT counted in Cash Drawer.
              </p>
              <div>
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-on-surface-variant">Customer</label>
                  <button
                    type="button"
                    onClick={() => { setLendAfterAdd(true); setCustomerModalOpen(true); }}
                    className="text-primary text-xs font-medium"
                  >
                    + New
                  </button>
                </div>
                <select
                  value={lendCustomerId}
                  onChange={(e) => setLendCustomerId(e.target.value)}
                  className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
                >
                  <option value="">Select customer...</option>
                  {ledger.map((c) => {
                    const avail = Number(c.credit_limit || 0) - Number(c.balance || 0);
                    return (
                      <option key={c.customer_id} value={c.customer_id}>
                        {c.name} — avail ₱{avail.toFixed(2)}
                      </option>
                    );
                  })}
                </select>
                {(() => {
                  const sel = ledger.find((c) => c.customer_id === Number(lendCustomerId));
                  if (!sel) return null;
                  const avail = Number(sel.credit_limit || 0) - Number(sel.balance || 0);
                  return (
                    <p className={`text-xs mt-1 ${avail <= 0 ? 'text-error' : 'text-on-surface-variant'}`}>
                      Available credit: ₱{avail.toFixed(2)}
                      {avail <= 0 && ' — raise the limit first (Customers → Edit).'}
                    </p>
                  );
                })()}
              </div>
              <div>
                <label className="text-sm font-medium text-on-surface-variant">Amount Lent</label>
                <input
                  type="number" step="0.01" min="0"
                  value={lendAmount}
                  onChange={(e) => setLendAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1 text-lg font-semibold"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-on-surface-variant">Note (Optional)</label>
                <textarea
                  value={lendNote}
                  onChange={(e) => setLendNote(e.target.value)}
                  rows={2}
                  placeholder="e.g. Emergency cash loan..."
                  className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1 resize-none"
                />
              </div>
              {lendError && <p className="text-error text-sm">{lendError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setLendOpen(false)} className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant">
                  Cancel
                </button>
                <button type="submit" disabled={lendSaving} className="px-4 py-2 rounded-lg bg-primary text-on-primary font-medium disabled:opacity-50">
                  {lendSaving ? 'Saving...' : 'Save Loan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {repayOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl w-full max-w-md shadow-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-outline-variant flex justify-between items-center">
              <h2 className="font-semibold text-on-surface">Cash Repayment</h2>
              <button onClick={() => setRepayOpen(false)} className="text-on-surface-variant text-xl">✕</button>
            </div>
            <form onSubmit={handleCashRepay} className="p-4 space-y-3">
              <p className="text-xs text-on-surface-variant bg-surface-container-low border border-outline-variant rounded-lg p-2">
                Monitoring only — repayments are NOT counted in Cash Drawer.
              </p>
              <div>
                <label className="text-sm font-medium text-on-surface-variant">Customer</label>
                <select
                  value={repayCustomerId}
                  onChange={(e) => setRepayCustomerId(e.target.value)}
                  className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
                >
                  <option value="">Select customer...</option>
                  {ledger.filter((c) => Number(c.balance) > 0).map((c) => (
                    <option key={c.customer_id} value={c.customer_id}>
                      {c.name} — ₱{Number(c.balance).toFixed(2)} owed
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-on-surface-variant">Amount Repaid</label>
                <input
                  type="number" step="0.01" min="0"
                  value={repayAmount}
                  onChange={(e) => setRepayAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1 text-lg font-semibold"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-on-surface-variant">Received As (info only)</label>
                <select
                  value={repayMethod}
                  onChange={(e) => setRepayMethod(e.target.value)}
                  className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
                >
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-on-surface-variant">Note (Optional)</label>
                <textarea
                  value={repayNote}
                  onChange={(e) => setRepayNote(e.target.value)}
                  rows={2}
                  placeholder="Enter any notes here..."
                  className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1 resize-none"
                />
              </div>
              {repayError && <p className="text-error text-sm">{repayError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setRepayOpen(false)} className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant">
                  Cancel
                </button>
                <button type="submit" disabled={repaySaving} className="px-4 py-2 rounded-lg bg-primary text-on-primary font-medium disabled:opacity-50">
                  {repaySaving ? 'Saving...' : 'Save Repayment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {debtSale && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setDebtSale(null)} />
          <div className="fixed inset-y-0 right-0 w-full max-w-md bg-surface shadow-2xl z-50 flex flex-col border-l border-outline-variant">
            <div className="flex justify-between items-center px-4 py-3 border-b border-outline-variant">
              <h2 className="font-semibold text-on-surface">Debt Products · #{debtSale.id}</h2>
              <button onClick={() => setDebtSale(null)} className="text-on-surface-variant text-xl">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <p className="text-on-surface-variant text-sm mb-3">
                {debtSale.customer_name || selectedCustomer?.name || 'Walk-in'} · {new Date(debtSale.created_at).toLocaleString()} · <span className="capitalize">{debtSale.payment_method}</span>
                {debtSale.status === 'voided' && <span className="text-error"> · Voided</span>}
              </p>
              <div className="space-y-2 mb-3">
                {(debtSale.items || []).map((item) => (
                  <div key={item.id} className="flex justify-between text-sm border-t border-outline-variant pt-2">
                    <span className="text-on-surface">{item.product_name} × {item.quantity}</span>
                    <span className="text-on-surface-variant">₱{Number(item.subtotal).toFixed(2)}</span>
                  </div>
                ))}
                {(debtSale.items || []).length === 0 && (
                  <p className="text-on-surface-variant text-sm text-center py-4">No products found.</p>
                )}
              </div>
              <div className="text-sm space-y-1 border-t border-outline-variant pt-2">
                <div className="flex justify-between text-on-surface-variant">
                  <span>Subtotal</span><span>₱{Number(debtSale.subtotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-error">
                  <span>Discount</span><span>-₱{Number(debtSale.discount_amount).toFixed(2)}</span>
                </div>
                {debtSale.payment_method === 'split' && (
                  <>
                    <div className="flex justify-between text-on-surface-variant">
                      <span>Cash Paid</span><span>₱{Number(debtSale.amount_tendered || 0).toFixed(2)}</span>
                    </div>
                    {Number(debtSale.gcash_amount || 0) > 0 && (
                      <div className="flex justify-between text-on-surface-variant">
                        <span>GCash Paid</span><span>₱{Number(debtSale.gcash_amount).toFixed(2)}</span>
                      </div>
                    )}
                    {(Number(debtSale.total_amount) - Number(debtSale.amount_tendered || 0) - Number(debtSale.gcash_amount || 0)) > 0.01 && (
                      <div className="flex justify-between text-error">
                        <span>Charged to Utang</span>
                        <span>₱{(Number(debtSale.total_amount) - Number(debtSale.amount_tendered || 0) - Number(debtSale.gcash_amount || 0)).toFixed(2)}</span>
                      </div>
                    )}
                  </>
                )}
                <div className="flex justify-between font-bold text-on-surface pt-1 border-t border-outline-variant">
                  <span>Total</span><span>₱{Number(debtSale.total_amount).toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Utang;