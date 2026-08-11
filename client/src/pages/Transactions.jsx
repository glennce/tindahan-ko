import { useState, useEffect } from 'react';

const API = 'http://localhost:5000/api/transactions';

function Transactions() {
  const [transactions, setTransactions] = useState([]);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetch(API).then((res) => res.json()).then(setTransactions);
  }, []);

  const viewDetail = (id) => {
    fetch(`${API}/${id}`).then((res) => res.json()).then(setSelected);
  };

  const badgeColor = {
    cash: 'bg-secondary-container text-secondary',
    gcash: 'bg-primary-container text-on-primary',
    utang: 'bg-error-container text-error',
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-on-surface mb-1">Transaction History</h1>
      <p className="text-on-surface-variant mb-6">A full log of every sale recorded.</p>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-surface border border-outline-variant rounded-xl overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-container-low text-on-surface-variant">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Items</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => viewDetail(t.id)}
                  className="border-t border-outline-variant cursor-pointer hover:bg-surface-container-low"
                >
                  <td className="px-4 py-3 text-on-surface-variant">#{t.id}</td>
                  <td className="px-4 py-3 text-on-surface">{t.customer_name || 'Walk-in'}</td>
                  <td className="px-4 py-3 text-on-surface-variant">{t.item_count}</td>
                  <td className="px-4 py-3 text-on-surface font-medium">
                    ₱{Number(t.total_amount).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${badgeColor[t.payment_method]}`}>
                      {t.payment_method}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-on-surface-variant">
                    {new Date(t.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="bg-surface border border-outline-variant rounded-xl p-4">
          {!selected ? (
            <p className="text-on-surface-variant text-sm">Click a row to see line items.</p>
          ) : (
            <>
              <h2 className="font-semibold text-on-surface mb-1">Sale #{selected.id}</h2>
              <p className="text-on-surface-variant text-sm mb-3">
                {selected.customer_name || 'Walk-in'} · {new Date(selected.created_at).toLocaleString()}
              </p>
              <div className="space-y-2">
                {selected.items.map((item) => (
                  <div key={item.id} className="flex justify-between text-sm border-t border-outline-variant pt-2">
                    <span className="text-on-surface">{item.product_name} × {item.quantity}</span>
                    <span className="text-on-surface-variant">₱{Number(item.subtotal).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-bold text-on-surface mt-3 pt-3 border-t border-outline-variant">
                <span>Total</span>
                <span>₱{Number(selected.total_amount).toFixed(2)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Transactions;