import { apiFetch } from '../api';
import { useState, useEffect } from 'react';

const API = '/dashboard';

function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    apiFetch(API)
      .then((res) => res.json())
      .then(setData)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-error">Error: {error}</p>;
  if (!data) return <p className="text-on-surface-variant">Loading dashboard...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-on-surface mb-1">Dashboard</h1>
      <p className="text-on-surface-variant mb-6">Here's your store summary for today.</p>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-surface border border-outline-variant rounded-xl p-4">
          <p className="text-on-surface-variant text-sm">Today's Sales</p>
          <p className="text-2xl font-bold text-on-surface">₱{data.today_sales.toFixed(2)}</p>
        </div>
        <div className="bg-surface border border-outline-variant rounded-xl p-4">
          <p className="text-on-surface-variant text-sm">Gross Profit</p>
          <p className="text-2xl font-bold text-on-surface">₱{data.gross_profit.toFixed(2)}</p>
        </div>
        <div className="bg-surface border border-outline-variant rounded-xl p-4">
          <p className="text-on-surface-variant text-sm">Transactions</p>
          <p className="text-2xl font-bold text-on-surface">{data.transaction_count}</p>
          <p className="text-on-surface-variant text-xs">{data.items_sold} items sold</p>
        </div>
        <div className="bg-error-container rounded-xl p-4">
          <p className="text-error text-sm">Outstanding Utang</p>
          <p className="text-2xl font-bold text-error">
            ₱{data.total_outstanding_utang.toFixed(2)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-surface border border-outline-variant rounded-xl p-4">
          <h2 className="font-semibold text-on-surface mb-3">
            Restock Needed ({data.low_stock_count})
          </h2>
          {data.low_stock_items.length === 0 && (
            <p className="text-on-surface-variant text-sm">All stock levels healthy.</p>
          )}
          {data.low_stock_items.map((p) => (
            <div key={p.id} className="flex justify-between py-2 border-t border-outline-variant text-sm">
              <span className="text-on-surface">{p.name}</span>
              <span className="text-error font-medium">{p.stock_quantity} pcs</span>
            </div>
          ))}
        </div>

        <div className="bg-surface border border-outline-variant rounded-xl p-4">
          <h2 className="font-semibold text-on-surface mb-3">Top Selling Today</h2>
          {data.top_selling.length === 0 && (
            <p className="text-on-surface-variant text-sm">No sales yet today.</p>
          )}
          {data.top_selling.map((p) => (
            <div key={p.id} className="flex justify-between py-2 border-t border-outline-variant text-sm">
              <span className="text-on-surface">{p.name}</span>
              <span className="text-primary font-medium">{p.qty_sold} sold</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface border border-outline-variant rounded-xl p-4 mt-4">
        <h2 className="font-semibold text-on-surface mb-3">Outstanding Utang</h2>
        {data.recent_utang.length === 0 && (
          <p className="text-on-surface-variant text-sm">No outstanding balances.</p>
        )}
        {data.recent_utang.map((c) => (
          <div key={c.customer_id} className="flex justify-between py-2 border-t border-outline-variant text-sm">
            <span className="text-on-surface">{c.name}</span>
            <span className="text-error font-medium">₱{Number(c.balance_after).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Dashboard;