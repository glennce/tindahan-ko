import { apiFetch } from '../api';
import { useState, useEffect } from 'react';
import { useRef } from 'react';

const UTANG_API = '/utang';

function Utang() {
  const detailRef = useRef(null);
  const [ledger, setLedger] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [history, setHistory] = useState([]);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [error, setError] = useState(null);

  const loadLedger = () => {
    apiFetch(UTANG_API).then((res) => res.json()).then(setLedger);
  };

  useEffect(() => {
    loadLedger();
  }, []);

  const selectCustomer = (customer) => {
    setSelectedCustomer(customer);
    setPaymentAmount('');
    setError(null);
    apiFetch(`${UTANG_API}/${customer.customer_id}`)
      .then((res) => res.json())
      .then(setHistory);
      detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const recordPayment = async () => {
    if (!paymentAmount || Number(paymentAmount) <= 0) {
      setError('Enter a valid payment amount.');
      return;
    }
    try {
      const res = await apiFetch(`${UTANG_API}/payment`, {
        method: 'POST',
        body: JSON.stringify({
          customer_id: selectedCustomer.customer_id,
          amount: Number(paymentAmount),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setPaymentAmount('');
      loadLedger();
      selectCustomer(selectedCustomer); // refresh this customer's history too
    } catch (err) {
      setError(err.message);
    }
  };

  const totalOutstanding = ledger.reduce((sum, c) => sum + Number(c.balance), 0);

  return (
    <div ref={detailRef} className="bg-surface border border-outline-variant rounded-xl p-4">
      <h1 className="text-2xl font-bold text-on-surface mb-1">Utang Management</h1>
      <p className="text-on-surface-variant mb-6">Track and manage customer credit balances.</p>

      <div className="bg-surface border border-outline-variant rounded-xl p-4 mb-6 inline-block">
        <p className="text-on-surface-variant text-sm">Total Outstanding</p>
        <p className="text-2xl font-bold text-error">₱{totalOutstanding.toFixed(2)}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Ledger list */}
        <div className="bg-surface border border-outline-variant rounded-xl p-4">
          <h2 className="font-semibold text-on-surface mb-3">Utang Ledger</h2>
          {ledger.map((c) => (
            <button
              key={c.customer_id}
              onClick={() => selectCustomer(c)}
              className={`w-full text-left flex justify-between items-center py-3 border-t border-outline-variant ${
                selectedCustomer?.customer_id === c.customer_id ? 'bg-surface-container-low' : ''
              }`}
            >
              <span className="text-on-surface font-medium">{c.name}</span>
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
              <h2 className="font-semibold text-on-surface text-lg">{selectedCustomer.name}</h2>
              <p className="text-on-surface-variant text-sm mb-4">
                Credit limit: ₱{Number(selectedCustomer.credit_limit).toFixed(2)}
              </p>

              <div className="flex gap-2 mb-4">
                <input
                  type="number"
                  placeholder="Payment amount"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="flex-1 border border-outline-variant rounded-lg px-3 py-2"
                />
                <button
                  onClick={recordPayment}
                  className="bg-primary text-on-primary px-4 py-2 rounded-lg font-medium"
                >
                  Record Payment
                </button>
              </div>
              {error && <p className="text-error text-sm mb-3">{error}</p>}

              <h3 className="text-sm font-medium text-on-surface-variant mb-2">Transaction History</h3>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {history.map((h) => (
                  <div key={h.id} className="flex justify-between text-sm border-t border-outline-variant pt-2">
                    <div>
                      <p className="text-on-surface capitalize">{h.type}</p>
                      <p className="text-on-surface-variant text-xs">
                        {new Date(h.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={h.type === 'payment' ? 'text-secondary' : 'text-error'}>
                        {h.type === 'payment' ? '-' : '+'}₱{Number(h.amount).toFixed(2)}
                      </p>
                      <p className="text-on-surface-variant text-xs">
                        Bal: ₱{Number(h.balance_after).toFixed(2)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Utang;