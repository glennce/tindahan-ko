import { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import PaymentModal from '../components/PaymentModal';
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
};

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
          <p className="text-on-surface-variant">Track and manage customer credit balances.</p>
        </div>
        <button
          onClick={() => { setSelectedCustomer(null); setPaymentModalOpen(true); }}
          className="bg-primary-container text-on-primary font-medium px-4 py-2 rounded-full text-sm"
        >
          + New Payment
        </button>
      </div>

      {/* Metric cards */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-surface border border-outline-variant rounded-xl p-4">
            <p className="text-on-surface-variant text-sm">Total Outstanding</p>
            <p className="text-2xl font-bold text-on-surface">₱{summary.total_outstanding.toFixed(2)}</p>
          </div>
          <div className="bg-surface border border-outline-variant rounded-xl p-4">
            <p className="text-on-surface-variant text-sm">Customers w/ Balance</p>
            <p className="text-2xl font-bold text-on-surface">{summary.customers_with_balance}</p>
          </div>
          <div className="bg-surface border border-outline-variant rounded-xl p-4">
            <p className="text-on-surface-variant text-sm">Payments Today</p>
            <p className="text-2xl font-bold text-on-surface">₱{summary.payments_today.toFixed(2)}</p>
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

              <div className="grid grid-cols-2 gap-4 bg-surface-container-low p-4 rounded-lg border border-outline-variant mb-4">
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

              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-medium text-on-surface-variant">Transaction History</h3>
                <button
                  onClick={handleExportStatement}
                  disabled={exporting}
                  className="border border-outline-variant text-primary text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1 disabled:opacity-50"
                >
                  <Download size={14} /> {exporting ? 'Exporting...' : 'Export Excel'}
                </button>
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto mb-4">
                {history.length === 0 && (
                  <p className="text-on-surface-variant text-sm text-center py-4">No history yet.</p>
                )}
                {history.map((h) => {
                  const icon = historyIcon[h.type];
                  const canViewProducts = h.sale_id && h.type === 'charge';
                  return (
                    <div key={h.id} className="flex justify-between items-center py-2 border-t border-outline-variant gap-2">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`w-8 h-8 rounded-full ${icon.bg} ${icon.color} flex items-center justify-center text-xs font-bold shrink-0`}>
                          {h.type === 'payment' ? '₱' : '+'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-on-surface text-sm capitalize truncate">
                            {h.type === 'payment' ? `Payment (${h.payment_method || 'cash'})` : 'Charge'}
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
                          <p className={h.type === 'payment' ? 'text-secondary font-medium text-sm' : 'text-error font-medium text-sm'}>
                            {h.type === 'payment' ? '-' : '+'}₱{Number(h.amount).toFixed(2)}
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

              <button
                onClick={() => setPaymentModalOpen(true)}
                className="w-full bg-primary text-on-primary font-semibold py-3 rounded-lg"
              >
                Record Payment
              </button>
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