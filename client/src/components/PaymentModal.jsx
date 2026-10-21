import { useState, useEffect } from 'react';

function PaymentModal({ isOpen, onClose, onSave, customers, preselectedCustomer }) {
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  // Which debt bucket the payment applies to: 'store' = product utang
  // (counts in Cash Drawer), 'cash' = monitoring-only cash loan repayment.
  const [target, setTarget] = useState('store');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setCustomerId(preselectedCustomer ? String(preselectedCustomer.customer_id) : '');
      setAmount('');
      setMethod('cash');
      setNote('');
      setError(null);
      // Default the bucket to whatever the preselected customer actually owes.
      if (preselectedCustomer) {
        const pre = customers.find((c) => c.customer_id === preselectedCustomer.customer_id) || preselectedCustomer;
        setTarget(Number(pre.store_balance || 0) > 0 ? 'store' : 'cash');
      } else {
        setTarget('store');
      }
    }
  }, [isOpen, preselectedCustomer, customers]);

  if (!isOpen) return null;

  const selected = customers.find((c) => c.customer_id === Number(customerId));

  // Breakdown of the selected customer's balance, straight from the ledger API.
  const cashLoan = selected ? Math.max(Number(selected.cash_loan_balance || 0), 0) : 0;
  const storeOwed = selected ? Math.max(Number(selected.balance || 0) - cashLoan, 0) : 0;
  const bucketOwed = target === 'cash' ? cashLoan : storeOwed;

  const pickCustomer = (id) => {
    setCustomerId(id);
    setError(null);
    // Auto-target the bucket the customer actually owes (a customer can owe
    // only cash loan, only store credit, or both).
    const c = customers.find((x) => x.customer_id === Number(id));
    if (c) {
      const loan = Math.max(Number(c.cash_loan_balance || 0), 0);
      const store = Math.max(Number(c.balance || 0) - loan, 0);
      setTarget(store > 0 ? 'store' : loan > 0 ? 'cash' : 'store');
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    setError(null);
    if (!customerId) {
      setError('Select a customer.');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setError('Enter a valid amount.');
      return;
    }
    if (!selected) {
      setError('Customer not found.');
      return;
    }
    if (bucketOwed <= 0) {
      setError(
        target === 'cash'
          ? 'This customer has no outstanding cash loan. Use Store Credit instead.'
          : 'This customer has no store-credit balance.'
      );
      return;
    }
    if (Number(amount) > bucketOwed + 0.005) {
      setError(
        target === 'cash'
          ? `Exceeds cash-loan balance of ₱${cashLoan.toFixed(2)}.`
          : `Exceeds store-credit balance of ₱${storeOwed.toFixed(2)}.${cashLoan > 0 ? ` Switch to Cash Loan Repayment for the ₱${cashLoan.toFixed(2)} loan.` : ''}`
      );
      return;
    }
    onSave({
      customer_id: Number(customerId),
      amount: Number(amount),
      payment_method: method,
      note,
      target,
      store_balance: storeOwed,
      cash_loan_balance: cashLoan,
    });
  };

  const bucketBadge = (active) =>
    `rounded-lg border p-2 text-xs ${
      active
        ? 'border-primary bg-primary/10 text-on-surface'
        : 'border-outline-variant text-on-surface-variant bg-surface-container-low'
    }`;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl w-full max-w-md shadow-lg flex flex-col max-h-[90vh] overflow-y-auto">
        <div className="px-4 py-3 border-b border-outline-variant flex justify-between items-center shrink-0">
          <h2 className="font-semibold text-on-surface">Record Payment</h2>
          <button onClick={onClose} className="text-on-surface-variant text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-on-surface-variant">Customer</label>
            <select
              value={customerId}
              onChange={(e) => pickCustomer(e.target.value)}
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
            >
              <option value="">Select customer...</option>
              {customers.filter((c) => Number(c.balance) > 0).map((c) => {
                const loan = Math.max(Number(c.cash_loan_balance || 0), 0);
                const store = Math.max(Number(c.balance || 0) - loan, 0);
                const parts = [];
                if (store > 0) parts.push(`Store ₱${store.toFixed(2)}`);
                if (loan > 0) parts.push(`Loan ₱${loan.toFixed(2)}`);
                return (
                  <option key={c.customer_id} value={c.customer_id}>
                    {c.name} — ₱{Number(c.balance).toFixed(2)}{parts.length > 0 ? ` (${parts.join(' · ')})` : ''}
                  </option>
                );
              })}
            </select>
          </div>

          {selected && (
            <div className="grid grid-cols-2 gap-2">
              <div className={bucketBadge(target === 'store')}>
                <span className="block font-medium">Store Credit</span>
                <span className="text-sm font-semibold block">₱{storeOwed.toFixed(2)}</span>
                <span className="text-[10px] block opacity-75">
                  {storeOwed > 0 ? 'Utang sa tindahan (products)' : 'Nothing owed'}
                </span>
              </div>
              <div className={bucketBadge(target === 'cash')}>
                <span className="block font-medium">Cash Loan</span>
                <span className="text-sm font-semibold block">₱{cashLoan.toFixed(2)}</span>
                <span className="text-[10px] block opacity-75">
                  {cashLoan > 0 ? 'Monitoring only (cash lent)' : 'Nothing owed'}
                </span>
              </div>
            </div>
          )}

          <div>
            <label className="text-sm font-medium text-on-surface-variant">Repayment For</label>
            <select
              value={target}
              onChange={(e) => { setTarget(e.target.value); setError(null); }}
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
            >
              {storeOwed > 0 && <option value="store">Store Credit — ₱{storeOwed.toFixed(2)}</option>}
              {cashLoan > 0 && <option value="cash">Cash Loan — ₱{cashLoan.toFixed(2)}</option>}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-on-surface-variant">Amount Paid</label>
            <input
              type="number" step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1 text-lg font-semibold"
            />
            {selected && (
              <p className="text-xs text-on-surface-variant mt-1">
                Max: ₱{bucketOwed.toFixed(2)} ({target === 'cash' ? 'cash loan' : 'store credit'})
              </p>
            )}
          </div>

          <div>
            <label className="text-sm font-medium text-on-surface-variant">Payment Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
            >
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-on-surface-variant">Notes (Optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Enter any notes here..."
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1 resize-none"
            />
          </div>

          {error && <p className="text-error text-sm">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 rounded-lg bg-primary text-on-primary font-medium">
              Save Payment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default PaymentModal;
