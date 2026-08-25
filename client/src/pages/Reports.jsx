import { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { TrendingUp, Activity, Package, CreditCard, Receipt, Download } from 'lucide-react';
import { formatStock } from '../utils';

const TABS = [
  { key: 'sales', label: 'Sales', icon: TrendingUp },
  { key: 'profit', label: 'Profit', icon: Activity },
  { key: 'inventory', label: 'Inventory', icon: Package },
  { key: 'utang', label: 'Utang', icon: CreditCard },
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

function Reports() {
  const [activeTab, setActiveTab] = useState('sales');
  const [start, setStart] = useState(firstOfMonth());
  const [end, setEnd] = useState(today());
  const [data, setData] = useState(null);

  const loadReport = () => {
    setData(null);
    apiFetch(`/reports/${activeTab}?start=${start}&end=${end}`)
      .then((res) => res.json())
      .then(setData);
  };

  const selectTab = (key) => {
    setData(null);
    setActiveTab(key);
  };

  useEffect(() => {
    loadReport();
  }, [activeTab, start, end]);

  const handleExportCsv = () => {
    if (!data) return;
    let rows = [];
    if (activeTab === 'sales') {
      rows = [['Date', 'Total'], ...data.trend.map((t) => [t.day, t.total])];
    } else if (activeTab === 'profit') {
      rows = [['Date', 'Profit'], ...data.trend.map((t) => [t.day, t.profit])];
    } else if (activeTab === 'inventory') {
      rows = [['Product', 'Qty Sold'], ...data.top_movers.map((p) => [p.name, p.qty_sold])];
    } else if (activeTab === 'utang') {
      rows = [['Customer', 'Balance'], ...data.top_debtors.map((c) => [c.name, c.balance])];
    }
    downloadCsv(`${activeTab}-report-${start}-to-${end}.csv`, rows);
  };

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Business Performance</h1>
          <p className="text-on-surface-variant">{start} to {end}</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
            className="border border-outline-variant rounded-lg px-2 py-1 text-sm" />
          <span className="text-on-surface-variant">to</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
            className="border border-outline-variant rounded-lg px-2 py-1 text-sm" />
          <button
            onClick={handleExportCsv}
            className="border border-outline-variant text-primary text-sm font-medium px-3 py-1.5 rounded-lg flex items-center gap-1"
          >
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Tab sidebar */}
        <div className="flex lg:flex-col gap-1 overflow-x-auto lg:w-40 shrink-0">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => selectTab(tab.key)}
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

        {/* Report content */}
        <div className="flex-1">
          {!data ? (
            <p className="text-on-surface-variant text-sm">Loading...</p>
          ) : (
            <>
              {activeTab === 'sales' && <SalesReport data={data} />}
              {activeTab === 'profit' && <ProfitReport data={data} />}
              {activeTab === 'inventory' && <InventoryReport data={data} />}
              {activeTab === 'utang' && <UtangReport data={data} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
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

function BarChart({ items, valueKey, labelFormatter }) {
  const max = Math.max(...items.map((i) => Number(i[valueKey])), 1);
  return (
    <div className="flex items-end gap-1 h-40">
      {items.map((item, idx) => (
        <div key={idx} className="flex-1 flex flex-col justify-end items-center h-full">
          <div
            className="w-full bg-primary rounded-t min-h-[2px]"
            style={{ height: `${(Number(item[valueKey]) / max) * 100}%` }}
            title={`₱${Number(item[valueKey]).toFixed(2)}${labelFormatter ? ' — ' + labelFormatter(item) : ''}`}
          />
        </div>
      ))}
    </div>
  );
}

function SalesReport({ data }) {
  const [showAllCategories, setShowAllCategories] = useState(false);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="Total Sales" value={`₱${data.total_sales.toFixed(2)}`}
          change={pctChange(data.total_sales, data.prev_total_sales)} icon={TrendingUp} />
        <StatCard label="Transactions" value={data.transaction_count} icon={Activity} />
      </div>
      <div className="bg-surface border border-outline-variant rounded-xl p-4">
        <h2 className="font-semibold text-on-surface mb-4">Sales Trend</h2>
        {data.trend.length === 0 ? (
          <p className="text-on-surface-variant text-sm">No sales in this range.</p>
        ) : (
          <BarChart items={data.trend} valueKey="total" labelFormatter={(t) => t.day} />
        )}
      </div>
      <div className="bg-surface border border-outline-variant rounded-xl p-4">
        <h2 className="font-semibold text-on-surface mb-3">Sales by Category</h2>
        {(showAllCategories ? data.categories : data.categories.slice(0, 5)).map((c) => {
          const maxRev = Math.max(...data.categories.map((x) => Number(x.revenue)), 1);
          return (
            <div key={c.category} className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-on-surface">{c.category}</span>
                <span className="text-on-surface-variant">₱{Number(c.revenue).toFixed(2)}</span>
              </div>
              <div className="w-full h-2 bg-surface-container-high rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full" style={{ width: `${(c.revenue / maxRev) * 100}%` }} />
              </div>
            </div>
          );
        })}
        {data.categories.length > 5 && (
          <button
            onClick={() => setShowAllCategories((v) => !v)}
            className="text-primary text-sm font-medium mt-2"
          >
            {showAllCategories ? 'Show less' : `Show ${data.categories.length - 5} more`}
          </button>
        )}
      </div>
    </div>
  );
}

function ProfitReport({ data }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Gross Profit" value={`₱${data.gross_profit.toFixed(2)}`}
          change={pctChange(data.gross_profit, data.prev_gross_profit)} icon={TrendingUp} />
        <StatCard label="Total Expenses" value={`₱${data.total_expenses.toFixed(2)}`} icon={Receipt} />
        <StatCard label="Net Profit" value={`₱${data.net_profit.toFixed(2)}`} icon={Activity} />
      </div>
      <div className="bg-surface border border-outline-variant rounded-xl p-4">
        <h2 className="font-semibold text-on-surface mb-4">Profit Trend</h2>
        {data.trend.length === 0 ? (
          <p className="text-on-surface-variant text-sm">No data in this range.</p>
        ) : (
          <BarChart items={data.trend} valueKey="profit" labelFormatter={(t) => t.day} />
        )}
      </div>
    </div>
  );
}

function InventoryReport({ data }) {
  const handleExportLowStock = () => {
    const rows = [
      ['Product', 'Category', 'Current Stock', 'Status'],
      ...data.low_stock_list.map((p) => [p.name, p.category || '', formatStock(p), 'Low Stock']),
      ...data.out_of_stock_list.map((p) => [p.name, p.category || '', formatStock(p), 'Out of Stock']),
    ];
    downloadCsv(`low-and-out-of-stock-${new Date().toISOString().slice(0, 10)}.csv`, rows);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 flex-1">
          <StatCard label="Total Stock Value (Cost)" value={`₱${data.total_stock_value.toFixed(2)}`} icon={Package} />
          <div className="bg-surface border border-outline-variant rounded-xl p-4 flex gap-4">
            <div><p className="text-secondary font-bold text-xl">{data.available}</p><p className="text-xs text-on-surface-variant">Available</p></div>
            <div><p className="text-orange-500 font-bold text-xl">{data.low_stock}</p><p className="text-xs text-on-surface-variant">Low Stock</p></div>
            <div><p className="text-error font-bold text-xl">{data.out_of_stock}</p><p className="text-xs text-on-surface-variant">Out of Stock</p></div>
          </div>
        </div>
      </div>

      {(data.low_stock > 0 || data.out_of_stock > 0) && (
        <div className="bg-surface border border-outline-variant rounded-xl p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold text-on-surface">Restock List</h2>
            <button
              onClick={handleExportLowStock}
              className="border border-outline-variant text-primary text-sm font-medium px-3 py-1.5 rounded-lg flex items-center gap-1"
            >
              <Download size={16} /> Export Restock List
            </button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {data.out_of_stock_list.map((p) => (
              <div key={p.id} className="flex justify-between text-sm py-1.5 border-t border-outline-variant">
                <span className="text-on-surface">{p.name}</span>
                <span className="text-error font-medium">Out of Stock</span>
              </div>
            ))}
            {data.low_stock_list.map((p) => (
              <div key={p.id} className="flex justify-between text-sm py-1.5 border-t border-outline-variant">
                <span className="text-on-surface">{p.name}</span>
                <span className="text-orange-600 font-medium">{formatStock(p)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface border border-outline-variant rounded-xl p-4">
          <h2 className="font-semibold text-on-surface mb-3">Top Movers</h2>
          {data.top_movers.map((p) => (
            <div key={p.id} className="flex justify-between text-sm py-2 border-t border-outline-variant">
              <span className="text-on-surface">{p.name}</span>
              <span className="text-primary font-medium">{p.qty_sold} sold</span>
            </div>
          ))}
        </div>
        <div className="bg-surface border border-outline-variant rounded-xl p-4">
          <h2 className="font-semibold text-on-surface mb-3">Slow Movers</h2>
          {data.slow_movers.length === 0 ? (
            <p className="text-on-surface-variant text-sm">Everything sold at least once.</p>
          ) : data.slow_movers.map((p) => (
            <div key={p.id} className="flex justify-between text-sm py-2 border-t border-outline-variant">
              <span className="text-on-surface">{p.name}</span>
              <span className="text-on-surface-variant">{p.stock_quantity} pcs untouched</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UtangReport({ data }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Total Outstanding" value={`₱${data.total_outstanding.toFixed(2)}`} icon={CreditCard} />
        <StatCard label="Charged This Period" value={`₱${data.charged_this_period.toFixed(2)}`} icon={TrendingUp} />
        <StatCard label="Paid This Period" value={`₱${data.paid_this_period.toFixed(2)}`} icon={Activity} />
      </div>
      <div className="bg-surface border border-outline-variant rounded-xl p-4">
        <h2 className="font-semibold text-on-surface mb-3">Top Debtors</h2>
        {data.top_debtors.length === 0 ? (
          <p className="text-on-surface-variant text-sm">No outstanding balances.</p>
        ) : data.top_debtors.map((c) => (
          <div key={c.id} className="flex justify-between text-sm py-2 border-t border-outline-variant">
            <span className="text-on-surface">{c.name}</span>
            <span className="text-error font-medium">₱{Number(c.balance).toFixed(2)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Reports;