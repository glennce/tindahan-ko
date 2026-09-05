import { useState, useEffect } from 'react';

function PaymentModal({ isOpen, onClose, onSave, customers, preselectedCustomer }) {
  const [customerId, setCustomerId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('cash');
  const [note, setNote] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setCustomerId(preselectedCustomer ? String(preselectedCustomer.customer_id) : '');
      setAmount('');
      setMethod('cash');
      setNote('');
      setError(null);
    }
  }, [isOpen, preselectedCustomer]);

  if (!isOpen) return null;

  const selected = customers.find((c) => c.customer_id === Number(customerId));

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
    if (selected && Number(amount) > Number(selected.balance)) {
      setError(`Exceeds current balance of ₱${Number(selected.balance).toFixed(2)}.`);
      return;
    }
    onSave({ customer_id: Number(customerId), amount: Number(amount), payment_method: method, note });
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl w-full max-w-md shadow-lg overflow-hidden">
        <div className="px-4 py-3 border-b border-outline-variant flex justify-between items-center">
          <h2 className="font-semibold text-on-surface">Record Payment</h2>
          <button onClick={onClose} className="text-on-surface-variant text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-on-surface-variant">Customer</label>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
            >
              <option value="">Select customer...</option>
              {customers.filter((c) => Number(c.balance) > 0).map((c) => (
                <option key={c.customer_id} value={c.customer_id}>
                  {c.name} — ₱{Number(c.balance).toFixed(2)} owed
                </option>
              ))}
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