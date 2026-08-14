import { apiFetch } from '../api';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Wallet, TrendingUp, Receipt, CreditCard, PackageSearch, ReceiptText } from 'lucide-react';
import { formatStock } from '../utils';

const API = '/dashboard';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function initials(name) {
  return name.split(' ').map((n) => n[0]).slice(0, 2).join('').toUpperCase();
}

function relativeDate(dateStr) {
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((today - date) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
}

function formatTrendLabel(label, granularity) {
  if (granularity === 'hour') {
    if (label === 0) return '12AM';
    if (label === 12) return '12PM';
    return label < 12 ? `${label}AM` : `${label - 12}PM`;
  }
  const d = new Date(label);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [trendRange, setTrendRange] = useState('today');
  const [trend, setTrend] = useState(null);

  useEffect(() => {
    apiFetch(API)
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load dashboard');
        setData(json);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    apiFetch(`/dashboard/trend?range=${trendRange}`)
      .then((res) => res.json())
      .then(setTrend);
  }, [trendRange]);

  if (error) return <p className="text-error">Error: {error}</p>;
  if (!data) return <p className="text-on-surface-variant">Loading dashboard...</p>;

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">{greeting()}, {user?.name}</h1>
          <p className="text-on-surface-variant">Here's your store summary for today.</p>
        </div>
        <button
          onClick={() => navigate('/pos')}
          className="bg-primary text-on-primary font-medium px-4 py-2 rounded-lg flex items-center gap-1 self-start"
        >
          + New Sale
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface border border-outline-variant rounded-xl p-4">
          <div className="flex justify-between items-start">
            <p className="text-on-surface-variant text-sm">Today's Sales</p>
            <div className="bg-primary-container/20 text-primary p-1.5 rounded-md">
              <Wallet size={18} />
            </div>
          </div>
          <p className="text-2xl font-bold text-on-surface mt-2">₱{data.today_sales.toFixed(2)}</p>
        </div>

        <div className="bg-surface border border-outline-variant rounded-xl p-4">
          <div className="flex justify-between items-start">
            <p className="text-on-surface-variant text-sm">Gross Profit</p>
            <div className="bg-primary-container/20 text-primary p-1.5 rounded-md">
              <TrendingUp size={18} />
            </div>
          </div>
          <p className="text-2xl font-bold text-on-surface mt-2">₱{data.gross_profit.toFixed(2)}</p>
        </div>

        <div className="bg-surface border border-outline-variant rounded-xl p-4">
          <div className="flex justify-between items-start">
            <p className="text-on-surface-variant text-sm">Transactions</p>
            <div className="bg-primary-container/20 text-primary p-1.5 rounded-md">
              <Receipt size={18} />
            </div>
          </div>
          <p className="text-2xl font-bold text-on-surface mt-2">{data.transaction_count}</p>
          <p className="text-on-surface-variant text-xs">{data.items_sold} items sold</p>
        </div>

        <div className="bg-error-container rounded-xl p-4">
          <div className="flex justify-between items-start">
            <p className="text-error text-sm">Outstanding Utang</p>
            <div className="bg-error/10 text-error p-1.5 rounded-md">
              <CreditCard size={18} />
            </div>
          </div>
          <p className="text-2xl font-bold text-error mt-2">₱{data.total_outstanding_utang.toFixed(2)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sales Trend chart — new */}
        <div className="lg:col-span-2 bg-surface border border-outline-variant rounded-xl p-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-on-surface">Sales Trend</h2>
            <select
              value={trendRange}
              onChange={(e) => setTrendRange(e.target.value)}
              className="border border-outline-variant rounded-lg px-2 py-1 text-sm"
            >
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </div>

          {!trend ? (
            <p className="text-on-surface-variant text-sm">Loading...</p>
          ) : trend.trend.every((t) => t.total === 0) ? (
            <p className="text-on-surface-variant text-sm">No sales in this range.</p>
          ) : (
            <>
              <div className="flex items-end gap-1 h-40">
                {trend.trend.map((t) => {
                  const maxTotal = Math.max(...trend.trend.map((x) => x.total), 1);
                  return (
                    <div key={t.label} className="flex-1 flex flex-col justify-end items-center gap-1 h-full">
                      <div
                        className="w-full bg-primary rounded-t min-h-[2px]"
                        style={{ height: `${(t.total / maxTotal) * 100}%` }}
                        title={`₱${t.total.toFixed(2)}`}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-on-surface-variant text-xs mt-2">
                <span>{formatTrendLabel(trend.trend[0].label, trend.granularity)}</span>
                <span>{formatTrendLabel(trend.trend[Math.ceil(trend.trend.length / 2)].label, trend.granularity)}</span>
                <span>{formatTrendLabel(trend.trend[trend.trend.length - 1].label, trend.granularity)}</span>
              </div>
            </>
          )}
        </div>
        
        {/* Top Selling — same content you already had, just moved here */}
        <div className="bg-surface border border-outline-variant rounded-xl p-4">
          <h2 className="font-semibold text-on-surface mb-3">Top Selling Today</h2>
          {data.top_selling.length === 0 && (
            <p className="text-on-surface-variant text-sm">No sales yet today.</p>
          )}
          {data.top_selling.map((p, i) => (
            <div key={p.id} className="flex items-center gap-3 py-2 border-t border-outline-variant text-sm">
              <div className="w-8 h-8 rounded-md bg-surface-container-high flex items-center justify-center text-xs font-bold text-on-surface-variant shrink-0">
                #{i + 1}
              </div>
              <div className="flex-1">
                <p className="text-on-surface font-medium">{p.name}</p>
                <p className="text-on-surface-variant text-xs">{p.qty_sold} sold today</p>
              </div>
              <span className="text-on-surface font-semibold">₱{Number(p.revenue).toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
        
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
        {/* Restock Needed */}
        <div className="bg-surface border border-outline-variant rounded-xl p-4">
          <h2 className="font-semibold text-on-surface mb-3 flex items-center gap-2">
            <PackageSearch size={18} className="text-orange-500" />
            Restock Needed ({data.low_stock_count})
          </h2>
          {data.low_stock_items.length === 0 && (
            <p className="text-on-surface-variant text-sm">All stock levels healthy.</p>
          )}
          {data.low_stock_items.map((p) => (
            <div key={p.id} className="flex justify-between items-center py-2 border-t border-outline-variant text-sm">
              <div>
                <p className="text-on-surface">{p.name}</p>
                <span className="text-error font-medium">{formatStock(p)}</span>
              </div>
              <button
                onClick={() => navigate('/inventory')}
                className="border border-outline-variant text-primary text-xs font-medium px-3 py-1.5 rounded-lg"
              >
                Restock
              </button>
            </div>
          ))}
        </div>
        
        {/* Outstanding Utang */}
        <div className="bg-surface border border-outline-variant rounded-xl p-4">
          <h2 className="font-semibold text-on-surface mb-3 flex items-center gap-2">
            <ReceiptText size={18} className="text-error" />
            Outstanding Utang
          </h2>
          {data.recent_utang.length === 0 && (
            <p className="text-on-surface-variant text-sm">No outstanding balances.</p>
          )}
          {data.recent_utang.map((c) => (
            <div key={c.customer_id} className="flex items-center gap-3 py-2 border-t border-outline-variant text-sm">
              <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-bold text-xs shrink-0">
                {initials(c.name)}
              </div>
              <span className="flex-1 text-on-surface">{c.name}</span>
              <span className="text-on-surface-variant text-xs">{relativeDate(c.created_at)}</span>
              <span className="text-error font-semibold w-20 text-right">₱{Number(c.balance_after).toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;