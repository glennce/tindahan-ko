import { useState, useEffect, useMemo, Component } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../api';

/* Catches render crashes inside one dashboard so a single bad value can't
   blank the whole app — shows the actual error instead of a white screen. */
class DashBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(e) {
    return { error: e };
  }
  componentDidUpdate(prevProps) {
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }
  render() {
    if (this.state.error) {
      return (
        <div className="bg-surface border border-error rounded-xl p-8 text-center">
          <p className="text-error font-medium mb-1">This tab hit a display error</p>
          <p className="text-on-surface-variant text-xs mb-1">{String(this.state.error?.message || this.state.error)}</p>
          <p className="text-on-surface-variant text-xs mb-4">Screenshot this message and send it so it can be fixed.</p>
          <button onClick={() => { this.setState({ error: null }); this.props.onRetry?.(); }} className="bg-primary text-on-primary text-sm font-medium px-4 py-2 rounded-lg">
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import {
  TrendingUp, Package, Users, Download, Search, AlertTriangle,
  Clock, Wrench, Plus, ArrowLeftRight, ClipboardCheck, FileText,
  CircleDollarSign, ShoppingCart, Wallet, Smartphone, PiggyBank,
} from 'lucide-react';
import { formatStock } from '../utils';

const TABS = [
  { key: 'inventory', label: 'Inventory', icon: Package, title: 'Inventory Overview', sub: 'What is the current status of products and stock?' },
  { key: 'sales', label: 'Sales Analytics', icon: TrendingUp, title: 'Sales Analytics', sub: 'What patterns are happening and what may happen next?' },
  { key: 'customers', label: 'Customers & Utang', icon: Users, title: 'Customer Analytics', sub: 'Who is buying, how are they paying, and who owes?' },
];

const PALETTE = ['#2563eb', '#60a5fa', '#22c55e', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6', '#94a3b8'];

function manilaToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
}
function firstOfMonth() {
  return manilaToday().slice(0, 8) + '01';
}
function today() {
  return manilaToday();
}
function pctChange(current, previous) {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}
function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
const peso = (n) => `₱${Number(n || 0).toFixed(2)}`;

/* ---------- small chart primitives (no external deps) ---------- */
function Kpi({ icon: Icon, label, value, delta, invert }) {
  const up = (delta ?? 0) >= 0;
  const good = invert ? !up : up;
  return (
    <div className="bg-surface border border-outline-variant rounded-xl p-3 min-w-0">
      <div className="flex items-center gap-2">
        {Icon && <div className="w-8 h-8 rounded-full bg-primary-container/15 text-primary flex items-center justify-center shrink-0"><Icon size={16} /></div>}
        <p className="text-on-surface-variant text-xs truncate">{label}</p>
      </div>
      <p className="text-xl font-bold text-on-surface mt-1 truncate">{value}</p>
      {delta !== undefined && delta !== null && (
        <p className={`text-[11px] mt-0.5 ${good ? 'text-secondary' : 'text-error'}`}>
          {up ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}% vs prev period
        </p>
      )}
    </div>
  );
}

function Card({ title, sub, action, children, className = '' }) {
  return (
    <div className={`bg-surface border border-outline-variant rounded-xl p-4 min-w-0 ${className}`}>
      <div className="flex justify-between items-center gap-2 mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-on-surface text-sm">{title}</h3>
          {sub && <p className="text-[11px] text-on-surface-variant">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Donut({ items, centerTop, centerBottom }) {
  const total = items.reduce((s, i) => s + Number(i.value || 0), 0) || 1;
  const R = 54;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex flex-col sm:flex-row items-center gap-4">
      <div className="relative shrink-0">
        <svg width="150" height="150" viewBox="0 0 150 150">
          <circle cx="75" cy="75" r={R} fill="none" stroke="#eef2ff" strokeWidth="22" />
          {items.map((it, idx) => {
            const frac = Number(it.value || 0) / total;
            const el = (
              <circle
                key={idx}
                cx="75" cy="75" r={R} fill="none"
                stroke={it.color || PALETTE[idx % PALETTE.length]}
                strokeWidth="22"
                strokeDasharray={`${frac * C} ${C}`}
                strokeDashoffset={-offset * C}
                transform="rotate(-90 75 75)"
                strokeLinecap="butt"
              />
            );
            offset += frac;
            return el;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-lg font-bold text-on-surface leading-none">{centerTop}</p>
          <p className="text-[10px] text-on-surface-variant mt-1">{centerBottom}</p>
        </div>
      </div>
      <div className="flex-1 w-full space-y-1.5 min-w-0">
        {items.map((it, idx) => (
          <div key={idx} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: it.color || PALETTE[idx % PALETTE.length] }} />
            <span className="text-on-surface truncate flex-1">{it.label}</span>
            <span className="text-on-surface-variant whitespace-nowrap">{it.display ?? Number(it.value || 0).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HBar({ label, value, max, color = '#2563eb', right }) {
  return (
    <div className="mb-2.5">
      <div className="flex justify-between text-xs mb-1 gap-2">
        <span className="text-on-surface truncate">{label}</span>
        <span className="text-on-surface-variant whitespace-nowrap">{right}</span>
      </div>
      <div className="w-full h-2.5 bg-surface-container-high rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.min((Number(value) / (max || 1)) * 100, 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function TrendChart({ points, forecast = [], height = 140 }) {
  const all = [...points, ...forecast];
  const max = Math.max(...all.map((v) => Number(v)), 1);
  const W = 560;
  const H = height;
  const stepX = (i, n) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (v) => H - 8 - (Number(v) / max) * (H - 24);
  const line = (arr, off) =>
    arr.map((v, i) => `${i === 0 ? 'M' : 'L'}${stepX(off + i, points.length + forecast.length).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height }}>
      {[0.25, 0.5, 0.75].map((f) => (
        <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="#e5e7eb" strokeWidth="1" />
      ))}
      {points.length > 1 && <path d={line(points, 0)} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinejoin="round" />}
      {points.map((v, i) => (
        <circle key={i} cx={stepX(i, points.length + forecast.length)} cy={y(v)} r="2.5" fill="#2563eb" />
      ))}
      {forecast.length > 0 && (
        <path d={`M${stepX(points.length - 1, points.length + forecast.length)},${y(points[points.length - 1])} ` + line(forecast, points.length).replace(/^M[^L]*L?/, 'L')} fill="none" stroke="#93c5fd" strokeWidth="2" strokeDasharray="5 4" />
      )}
    </svg>
  );
}

function StatusPill({ status }) {
  const map = {
    Available: 'bg-green-100 text-green-700',
    'Low Stock': 'bg-orange-100 text-orange-700',
    'Out of Stock': 'bg-error-container text-error',
    Borrowed: 'bg-blue-100 text-blue-700',
    Reserved: 'bg-amber-100 text-amber-700',
    Overdue: 'bg-red-100 text-red-700',
    'Lost / Damaged': 'bg-red-100 text-red-700',
    'Under Maintenance': 'bg-indigo-100 text-indigo-700',
  };
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${map[status] || 'bg-surface-container-high text-on-surface-variant'}`}>{status}</span>;
}

function stockStatus(p) {
  if (Number(p.stock_quantity) <= 0) return 'Out of Stock';
  if (Number(p.stock_quantity) <= Number(p.low_stock_threshold ?? 10)) return 'Low Stock';
  return 'Available';
}

/* ================= main page ================= */
export default function Reports() {
  const [activeTab, setActiveTab] = useState('inventory');
  const [start, setStart] = useState(firstOfMonth());
  const [end, setEnd] = useState(today());
  const [loading, setLoading] = useState(false);
  const [bundle, setBundle] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  const tab = TABS.find((t) => t.key === activeTab);

  // Throws on HTTP error so a failed primary fetch lands in the error card
  // instead of rendering a stale tab or hanging on "Loading…".
  const fetchJson = (url) =>
    apiFetch(url).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
      return j;
    });

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Clear the previous tab's data immediately so the date filter and tab
      // switches always show fresh results (never stale numbers).
      setLoading(true);
      setBundle(null);
      setLoadError(null);
      try {
        if (activeTab === 'inventory') {
          const [invR, prodR] = await Promise.all([
            fetchJson(`/reports/inventory?start=${start}&end=${end}`),
            apiFetch('/products').then((r) => r.json()).catch(() => []),
          ]);
          if (!cancelled) setBundle({ inv: invR, products: Array.isArray(prodR) ? prodR : [] });
        } else if (activeTab === 'sales') {
          const [salesR, profitR, prodR, txnR] = await Promise.all([
            fetchJson(`/reports/sales?start=${start}&end=${end}`),
            apiFetch(`/reports/profit?start=${start}&end=${end}`).then((r) => r.json()).catch(() => null),
            apiFetch(`/reports/product-sales?start=${start}&end=${end}`).then((r) => r.json()).catch(() => null),
            apiFetch(`/transactions?start=${start}&end=${end}&page=1&limit=8`).then((r) => r.json()).catch(() => null),
          ]);
          if (!cancelled) setBundle({ sales: salesR, profit: profitR, prodSales: prodR, txns: txnR });
        } else {
          const [utangR, ledgerR, salesR] = await Promise.all([
            fetchJson(`/reports/utang?start=${start}&end=${end}`),
            apiFetch('/utang').then((r) => r.json()).catch(() => []),
            apiFetch(`/reports/sales?start=${start}&end=${end}`).then((r) => r.json()).catch(() => null),
          ]);
          if (!cancelled) setBundle({ utang: utangR, ledger: Array.isArray(ledgerR) ? ledgerR : [], sales: salesR });
        }
      } catch (e) {
        if (!cancelled) setLoadError(e.message || 'Failed to load report');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [activeTab, start, end, reloadKey]);

  const handleExport = () => {
    if (!bundle) return;
    if (activeTab === 'inventory' && bundle.products) {
      downloadCsv(`inventory-report-${start}-to-${end}.csv`, [
        ['Product', 'Category', 'Stock', 'Status', 'Cost', 'Price'],
        ...bundle.products.map((p) => [p.name, p.category || '', p.stock_quantity, stockStatus(p), p.cost_price, p.selling_price]),
      ]);
    } else if (activeTab === 'sales' && bundle.sales) {
      downloadCsv(`sales-report-${start}-to-${end}.csv`, [
        ['Date', 'Total'],
        ...(bundle.sales.trend || []).map((t) => [String(t.day ?? '').slice(0, 10), t.total]),
      ]);
    } else if (activeTab === 'customers' && bundle.ledger) {
      downloadCsv(`customer-utang-report-${start}-to-${end}.csv`, [
        ['Customer', 'Balance', 'Credit Limit'],
        ...bundle.ledger.map((c) => [c.name, c.balance, c.credit_limit]),
      ]);
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto">
      {/* header like reference: title + date pill + export */}
      <div className="flex flex-col xl:flex-row xl:items-center gap-3 mb-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center shrink-0">
            <tab.icon size={20} />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-on-surface leading-tight">{tab.title}</h1>
            <p className="text-on-surface-variant text-xs">{tab.sub}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 border border-outline-variant rounded-lg px-2 py-1.5 bg-surface text-sm">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="bg-transparent text-xs outline-none" />
            <span className="text-on-surface-variant text-xs">–</span>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="bg-transparent text-xs outline-none" />
          </div>
          <button onClick={handleExport} className="border border-outline-variant bg-surface text-on-surface text-xs font-medium px-3 py-2 rounded-lg flex items-center gap-1.5">
            <Download size={14} /> Export Report
          </button>
        </div>
      </div>

      {/* tab pills */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium whitespace-nowrap ${activeTab === t.key ? 'bg-primary text-on-primary' : 'bg-surface border border-outline-variant text-on-surface-variant'}`}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {!bundle ? (
        loading ? (
          <p className="text-on-surface-variant text-sm">Loading report…</p>
        ) : (
          <div className="bg-surface border border-outline-variant rounded-xl p-8 text-center">
            <p className="text-on-surface font-medium mb-1">Could not load this report</p>
            <p className="text-on-surface-variant text-xs mb-4">{loadError || 'Unknown error. Check your connection and date range.'}</p>
            <button onClick={() => setReloadKey((k) => k + 1)} className="bg-primary text-on-primary text-sm font-medium px-4 py-2 rounded-lg">
              Retry
            </button>
          </div>
        )
      ) : (
        <DashBoundary
          key={activeTab}
          resetKey={`${activeTab}-${start}-${end}-${reloadKey}`}
          onRetry={() => setReloadKey((k) => k + 1)}
        >
          {activeTab === 'inventory' && <InventoryDash bundle={bundle} start={start} end={end} />}
          {activeTab === 'sales' && <SalesDash bundle={bundle} start={start} end={end} />}
          {activeTab === 'customers' && <CustomerDash bundle={bundle} start={start} end={end} />}
        </DashBoundary>
      )}

      <p className="text-center text-[11px] text-on-surface-variant mt-6">Data refreshed: {new Date().toLocaleString()} · Tindahan Ko Reports</p>
    </div>
  );
}

/* ================= 1. INVENTORY (Collection Tracking style) ================= */
function InventoryDash({ bundle, start, end }) {
  const { inv, products } = bundle;
  const [q, setQ] = useState('');
  const totalUnits = useMemo(() => products.reduce((s, p) => s + Number(p.stock_quantity || 0), 0), [products]);
  const totalTitles = products.length;
  const avail = products.filter((p) => stockStatus(p) === 'Available').length;
  const lowN = products.filter((p) => stockStatus(p) === 'Low Stock').length;
  const outN = products.filter((p) => stockStatus(p) === 'Out of Stock').length;

  const byCat = useMemo(() => {
    const m = {};
    products.forEach((p) => { const c = p.category || 'Others'; m[c] = (m[c] || 0) + 1; });
    return Object.entries(m).map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length], display: `${value} (${((value / (totalTitles || 1)) * 100).toFixed(1)}%)` }));
  }, [products, totalTitles]);

  const byStatus = [
    { label: 'Available', value: products.filter((p) => stockStatus(p) === 'Available').reduce((s, p) => s + Number(p.stock_quantity || 0), 0), color: '#2563eb' },
    { label: 'Low Stock', value: products.filter((p) => stockStatus(p) === 'Low Stock').reduce((s, p) => s + Number(p.stock_quantity || 0), 0), color: '#8b5cf6' },
    { label: 'Out of Stock', value: outN, color: '#ef4444' },
  ];
  const statusMax = Math.max(...byStatus.map((s) => Number(s.value)), 1);

  const filtered = products.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || (p.category || '').toLowerCase().includes(q.toLowerCase())).slice(0, 10);

  return (
    <div className="space-y-4">
      {/* KPI row — 8 cards like reference */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5">
        <Kpi icon={Package} label="Total Products" value={totalTitles.toLocaleString()} />
        <Kpi icon={ClipboardCheck} label="Total Units" value={totalUnits.toLocaleString()} />
        <Kpi icon={TrendingUp} label="Available" value={avail.toLocaleString()} />
        <Kpi icon={Users} label="Low Stock" value={lowN} />
        <Kpi icon={Clock} label="Out of Stock" value={outN} />
        <Kpi icon={CircleDollarSign} label="Stock Value" value={peso(inv.total_stock_value)} />
        <Kpi icon={AlertTriangle} label="Top Movers" value={inv.top_movers?.length ?? 0} />
        <Kpi icon={Wrench} label="Slow Movers" value={inv.slow_movers?.length ?? 0} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title="Products by Category" sub={`By titles · ${start} to ${end}`}>
          {byCat.length === 0 ? <p className="text-xs text-on-surface-variant">No products.</p> : <Donut items={byCat} centerTop={totalTitles.toLocaleString()} centerBottom="Total Products" />}
        </Card>
        <Card title="Units by Status" sub="Available vs low vs out">
          <Donut items={byStatus.map((s) => ({ ...s, display: `${Number(s.value).toLocaleString()}` }))} centerTop={totalUnits.toLocaleString()} centerBottom="Total Units" />
        </Card>
        <Card title="Stock Health Summary" sub={`For ${totalUnits.toLocaleString()} units`}>
          <HBar label="Available products" value={avail} max={Math.max(totalTitles, 1)} color="#22c55e" right={`${avail} (${((avail / (totalTitles || 1)) * 100).toFixed(1)}%)`} />
          <HBar label="Low stock" value={lowN} max={Math.max(totalTitles, 1)} color="#f59e0b" right={`${lowN} (${((lowN / (totalTitles || 1)) * 100).toFixed(1)}%)`} />
          <HBar label="Out of stock" value={outN} max={Math.max(totalTitles, 1)} color="#ef4444" right={`${outN} (${((outN / (totalTitles || 1)) * 100).toFixed(1)}%)`} />
          <HBar label="Top movers (sold in range)" value={inv.top_movers?.length ?? 0} max={Math.max(totalTitles, 1)} color="#2563eb" right={`${inv.top_movers?.length ?? 0}`} />
          <HBar label="Slow / untouched" value={inv.slow_movers?.length ?? 0} max={Math.max(totalTitles, 1)} color="#94a3b8" right={`${inv.slow_movers?.length ?? 0}`} />
          <p className="text-[11px] text-on-surface-variant mt-2">Status assessed for {totalTitles} products · {statusMax.toLocaleString()} max bucket</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card
          className="xl:col-span-2"
          title="Recent Product Status"
          action={
            <div className="flex gap-1.5">
              <div className="flex items-center gap-1 border border-outline-variant rounded-lg px-2 py-1">
                <Search size={13} className="text-on-surface-variant" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or category…" className="text-xs bg-transparent outline-none w-44" />
              </div>
            </div>
          }
        >
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-left text-xs min-w-[640px]">
              <thead className="text-on-surface-variant border-b border-outline-variant">
                <tr><th className="py-2 pr-2">Product</th><th className="py-2 pr-2">Category</th><th className="py-2 pr-2">Stock</th><th className="py-2 pr-2">Price</th><th className="py-2">Status</th></tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-b border-outline-variant/50">
                    <td className="py-2 pr-2 font-medium text-on-surface">{p.name}</td>
                    <td className="py-2 pr-2 text-on-surface-variant">{p.category || '—'}</td>
                    <td className="py-2 pr-2 text-on-surface-variant">{formatStock(p)}</td>
                    <td className="py-2 pr-2 text-on-surface">{peso(p.selling_price)}</td>
                    <td className="py-2"><StatusPill status={stockStatus(p)} /></td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-on-surface-variant">No products found.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-on-surface-variant mt-2">Showing {filtered.length} of {products.length} products</p>
        </Card>

        <div className="space-y-4">
          <Card title="Items Requiring Attention">
            <AttentionRow icon={Clock} color="text-error" label="Out of Stock" sub="Needs immediate restock" value={outN} />
            <AttentionRow icon={AlertTriangle} color="text-error" label="Low Stock" sub="At or below threshold" value={lowN} />
            <AttentionRow icon={Wrench} color="text-primary" label="Slow Movers" sub="Untouched in this period" value={inv.slow_movers?.length ?? 0} />
            <AttentionRow icon={FileText} color="text-secondary" label="Stock Value at Risk" sub="Low + out-of-stock value" value={peso(inv.total_stock_value)} />
          </Card>
          <Card title="Quick Actions">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <QuickBtn icon={Plus} label="Add Product" to="/inventory" />
              <QuickBtn icon={ArrowLeftRight} label="Stock In" to="/inventory" />
              <QuickBtn icon={ClipboardCheck} label="Stock Audit" to="/inventory" />
              <QuickBtn icon={FileText} label="Restock List" onClick={() => downloadCsv(`restock-${today()}.csv`, [['Product', 'Stock'], ...[...(inv.low_stock_list || []), ...(inv.out_of_stock_list || [])].map((p) => [p.name, p.stock_quantity])])} />
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ================= 2. SALES (Library Analytics style) ================= */
function SalesDash({ bundle }) {
  const { sales, profit, prodSales, txns } = bundle;
  const pts = (sales.trend || []).map((t) => Number(t.total || 0));
  const forecast = useMemo(() => {
    if (pts.length === 0) return [];
    const last7 = pts.slice(-7);
    const avg = last7.reduce((s, v) => s + v, 0) / last7.length;
    const first = last7[0] || avg;
    const last = last7[last7.length - 1] || avg;
    const slope = (last - first) / Math.max(last7.length - 1, 1);
    return Array.from({ length: 7 }, (_, i) => Math.max(avg + slope * (i + 1) * 0.5, 0));
  }, [sales.trend]);
  const avgSale = sales.transaction_count ? sales.total_sales / sales.transaction_count : 0;
  const catItems = (sales.categories || []).map((c, i) => ({ label: c.category, value: Number(c.revenue || 0), color: PALETTE[i % PALETTE.length], display: peso(c.revenue) }));
  const peak = useMemo(() => {
    if (!sales.trend?.length) return null;
    return sales.trend.reduce((a, b) => (Number(b.total) > Number(a.total) ? b : a));
  }, [sales.trend]);
  const topProducts = prodSales?.top_products?.slice(0, 5) ?? [];
  const recentTxns = txns?.transactions?.slice(0, 5) ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
        <Kpi icon={CircleDollarSign} label="Total Sales" value={peso(sales.total_sales)} delta={pctChange(sales.total_sales, sales.prev_total_sales)} />
        <Kpi icon={ShoppingCart} label="Transactions" value={sales.transaction_count} />
        <Kpi icon={Wallet} label="Avg. Sale" value={peso(avgSale)} />
        <Kpi icon={TrendingUp} label="Gross Profit" value={peso(profit?.gross_profit ?? 0)} delta={profit ? pctChange(profit.gross_profit, profit.prev_gross_profit) : undefined} />
        <Kpi icon={PiggyBank} label="Net Profit" value={peso(profit?.net_profit ?? 0)} />
        <Kpi icon={FileText} label="Expenses" value={peso(profit?.total_expenses ?? 0)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-1" title="1. Sales Trend" sub={`Actual + 7-day forecast · ${(sales.trend || []).length} days`}>
          <div className="flex items-center gap-3 text-[11px] mb-1">
            <span className="flex items-center gap-1 text-on-surface"><span className="w-4 h-0.5 bg-primary inline-block" /> Actual</span>
            <span className="flex items-center gap-1 text-on-surface-variant"><span className="w-4 border-t-2 border-dashed border-blue-300 inline-block" /> Forecast</span>
          </div>
          {pts.length === 0 ? <p className="text-xs text-on-surface-variant">No sales in range.</p> : <TrendChart points={pts} forecast={forecast} />}
          <p className="text-[11px] text-on-surface-variant mt-1">Forecast = trailing 7-day average with trend · {peak ? `peak ${String(peak.day).slice(0, 10)} (${peso(peak.total)})` : ''}</p>
        </Card>
        <Card title="2. Top Categories" sub={`${catItems.length} categories`}>
          {catItems.length === 0 ? <p className="text-xs text-on-surface-variant">No category sales.</p> : <Donut items={catItems.slice(0, 6)} centerTop={peso(sales.total_sales)} centerBottom="Total Sales" />}
        </Card>
        <Card title="3. Daily Sales Bars" sub="Same trend, bar view">
          {pts.length === 0 ? <p className="text-xs text-on-surface-variant">No data.</p> : (
            <div className="flex items-end gap-1 h-36">
              {pts.map((v, i) => (
                <div key={i} className="flex-1 bg-primary rounded-t min-h-[3px]" style={{ height: `${(v / Math.max(...pts, 1)) * 100}%` }} title={peso(v)} />
              ))}
              {forecast.map((v, i) => (
                <div key={`f${i}`} className="flex-1 bg-blue-200 rounded-t min-h-[3px] opacity-70" style={{ height: `${(v / Math.max(...pts, ...forecast, 1)) * 100}%` }} title={`Forecast ${peso(v)}`} />
              ))}
            </div>
          )}
          <p className="text-[11px] text-primary font-medium mt-1">Peak: {peak ? `${String(peak.day).slice(0, 10)} · ${peso(peak.total)}` : '—'}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card title="4. High-Demand Products" sub="Top sellers in range">
          {topProducts.length === 0 ? <p className="text-xs text-on-surface-variant">No product data — widen the date range.</p> : topProducts.map((p, i) => (
            <div key={p.id} className="flex justify-between text-xs py-1.5 border-t border-outline-variant/50 first:border-0">
              <span className="text-on-surface truncate">{i + 1}. {p.name}</span>
              <span className="text-on-surface-variant whitespace-nowrap ml-2">{p.qty_sold} sold · {peso(p.revenue)}</span>
            </div>
          ))}
        </Card>
        <Card title="5. Profit Trend" sub="Gross profit per day">
          {(profit?.trend?.length ?? 0) === 0 ? <p className="text-xs text-on-surface-variant">No profit data.</p> : <TrendChart points={profit.trend.map((t) => Number(t.profit || 0))} height={120} />}
          <div className="flex gap-2 mt-2 text-xs">
            <div className="flex-1 bg-surface-container-low rounded-lg p-2 text-center"><p className="text-secondary font-bold">{profit ? pctChange(profit.gross_profit, profit.prev_gross_profit).toFixed(1) : 0}%</p><p className="text-[10px] text-on-surface-variant">vs prev period</p></div>
            <div className="flex-1 bg-surface-container-low rounded-lg p-2 text-center"><p className="font-bold text-on-surface">{peso(profit?.net_profit)}</p><p className="text-[10px] text-on-surface-variant">net profit target</p></div>
          </div>
        </Card>
        <Card title="6. Insights">
          <Insight text={`Sales are ${pctChange(sales.total_sales, sales.prev_total_sales) >= 0 ? 'up' : 'down'} ${Math.abs(pctChange(sales.total_sales, sales.prev_total_sales)).toFixed(1)}% vs the previous equivalent period.`} />
          <Insight text={catItems[0] ? `${catItems[0].label} leads at ${peso(catItems[0].value)} — consider keeping its bestsellers stocked.` : 'No category leader yet in this range.'} />
          <Insight text={peak ? `Peak sales on ${String(peak.day).slice(0, 10)} — staff and stock up around that weekday.` : 'No peak day detected.'} />
          <Insight text={`Net profit ${peso(profit?.net_profit ?? 0)} after ${peso(profit?.total_expenses ?? 0)} expenses (${(profit?.margin_pct ?? 0).toFixed?.(1) ?? '—'}% margin).`} />
        </Card>
      </div>

      <Card title="7. Recent Transactions" action={<span className="text-[11px] text-on-surface-variant">{recentTxns.length} latest</span>}>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-left text-xs min-w-[720px]">
            <thead className="text-on-surface-variant border-b border-outline-variant">
              <tr><th className="py-2 pr-2">Date</th><th className="py-2 pr-2">Customer</th><th className="py-2 pr-2">Type</th><th className="py-2 pr-2">Amount</th><th className="py-2">Status</th></tr>
            </thead>
            <tbody>
              {recentTxns.map((t) => (
                <tr key={`${t.source}-${t.id}`} className="border-b border-outline-variant/50">
                  <td className="py-2 pr-2 text-on-surface-variant">{new Date(t.created_at).toLocaleString()}</td>
                  <td className="py-2 pr-2 text-on-surface">{t.customer_name}</td>
                  <td className="py-2 pr-2 text-on-surface-variant">{t.type_label}</td>
                  <td className="py-2 pr-2 text-on-surface font-medium">{peso(t.amount)}</td>
                  <td className="py-2"><StatusPill status={t.status === 'completed' ? 'Available' : t.status} /></td>
                </tr>
              ))}
              {recentTxns.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-on-surface-variant">No transactions in range.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ================= 3. CUSTOMERS (Usage Analytics style) ================= */
function CustomerDash({ bundle, start, end }) {
  const { utang, ledger, sales } = bundle;
  const withBal = (ledger || []).filter((c) => Number(c.balance) > 0).sort((a, b) => Number(b.balance) - Number(a.balance));
  const top5 = withBal.slice(0, 5);
  const maxBal = Math.max(...withBal.map((c) => Number(c.balance)), 1);
  const collRate = utang.charged_this_period ? (Number(utang.paid_this_period) / Number(utang.charged_this_period)) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2.5">
        <Kpi icon={Users} label="Customers Owning" value={withBal.length} />
        <Kpi icon={CircleDollarSign} label="Total Outstanding" value={peso(utang.total_outstanding)} />
        <Kpi icon={TrendingUp} label="Charged (Period)" value={peso(utang.charged_this_period)} />
        <Kpi icon={Wallet} label="Collected (Period)" value={peso(utang.paid_this_period)} />
        <Kpi icon={PiggyBank} label="Collection Rate" value={`${collRate.toFixed(1)}%`} />
        <Kpi icon={Smartphone} label="Period Sales" value={peso(sales?.total_sales ?? 0)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-1" title="1. Debt by Customer" sub="Top balances">
          {top5.length === 0 ? <p className="text-xs text-on-surface-variant">No outstanding balances. 🎉</p> : top5.map((c) => (
            <HBar key={c.customer_id ?? c.id} label={c.name} value={Number(c.balance)} max={maxBal} color="#ef4444" right={peso(c.balance)} />
          ))}
        </Card>
        <Card title="2. Collection vs New Credit" sub={`${start} to ${end}`}>
          <HBar label="New credit given" value={Number(utang.charged_this_period)} max={Math.max(Number(utang.charged_this_period), Number(utang.paid_this_period), 1)} color="#f59e0b" right={peso(utang.charged_this_period)} />
          <HBar label="Collected back" value={Number(utang.paid_this_period)} max={Math.max(Number(utang.charged_this_period), Number(utang.paid_this_period), 1)} color="#22c55e" right={peso(utang.paid_this_period)} />
          <HBar label="Still outstanding (all time)" value={Number(utang.total_outstanding)} max={Math.max(Number(utang.total_outstanding), Number(utang.charged_this_period), 1)} color="#ef4444" right={peso(utang.total_outstanding)} />
          <p className="text-[11px] text-on-surface-variant mt-2">Collection rate in period: {collRate.toFixed(1)}% (paid ÷ charged).</p>
        </Card>
        <div className="space-y-4">
          <Card title="Quick Reports">
            <QuickReport icon={FileText} label="Debtors Report" sub="Who owes, how much" onClick={() => downloadCsv(`debtors-${today()}.csv`, [['Customer', 'Balance'], ...withBal.map((c) => [c.name, c.balance])])} />
            <QuickReport icon={AlertTriangle} label="Over-Limit Watch" sub="Balance ≥ 80% of limit" onClick={() => downloadCsv(`over-limit-${today()}.csv`, [['Customer', 'Balance', 'Limit'], ...withBal.filter((c) => Number(c.credit_limit) > 0 && Number(c.balance) / Number(c.credit_limit) >= 0.8).map((c) => [c.name, c.balance, c.credit_limit])])} />
            <QuickReport icon={TrendingUp} label="Top Balances" sub="Highest debtors" onClick={() => downloadCsv(`top-debtors-${today()}.csv`, [['Customer', 'Balance'], ...(utang.top_debtors || []).map((c) => [c.name, c.balance])])} />
          </Card>
        </div>
      </div>

      <Card title="Recent Debtor Activity" sub={`${withBal.length} customers with balance`}>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-left text-xs min-w-[640px]">
            <thead className="text-on-surface-variant border-b border-outline-variant">
              <tr><th className="py-2 pr-2">Customer</th><th className="py-2 pr-2">Balance</th><th className="py-2 pr-2">Credit Limit</th><th className="py-2 pr-2">Usage</th><th className="py-2">Status</th></tr>
            </thead>
            <tbody>
              {withBal.slice(0, 10).map((c) => {
                const usage = Number(c.credit_limit) > 0 ? (Number(c.balance) / Number(c.credit_limit)) * 100 : 0;
                return (
                  <tr key={c.customer_id ?? c.id} className="border-b border-outline-variant/50">
                    <td className="py-2 pr-2 font-medium text-on-surface">{c.name}</td>
                    <td className="py-2 pr-2 text-error font-medium">{peso(c.balance)}</td>
                    <td className="py-2 pr-2 text-on-surface-variant">{peso(c.credit_limit)}</td>
                    <td className="py-2 pr-2"><div className="w-24 h-2 bg-surface-container-high rounded-full overflow-hidden"><div className={`h-full rounded-full ${usage >= 90 ? 'bg-error' : usage >= 70 ? 'bg-orange-400' : 'bg-secondary'}`} style={{ width: `${Math.min(usage, 100)}%` }} /></div></td>
                    <td className="py-2"><StatusPill status={usage >= 90 ? 'Overdue' : usage >= 70 ? 'Reserved' : 'Borrowed'} /></td>
                  </tr>
                );
              })}
              {withBal.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-on-surface-variant">No outstanding balances.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ---------- shared rows ---------- */
function AttentionRow({ icon: Icon, color, label, sub, value }) {
  return (
    <div className="flex items-center gap-2.5 py-2 border-b border-outline-variant/50 last:border-0">
      <Icon size={16} className={`${color} shrink-0`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-on-surface">{label}</p>
        <p className="text-[11px] text-on-surface-variant truncate">{sub}</p>
      </div>
      <span className="text-sm font-bold text-on-surface whitespace-nowrap">{value}</span>
    </div>
  );
}
function QuickBtn({ icon: Icon, label, to, onClick }) {
  const navigate = useNavigate();
  const cls = 'flex items-center gap-1.5 border border-outline-variant rounded-lg px-2.5 py-2 text-on-surface hover:bg-surface-container-low text-left w-full';
  const inner = <><Icon size={14} className="text-primary shrink-0" /><span className="truncate">{label}</span></>;
  if (to) return <button onClick={() => navigate(to)} className={cls}>{inner}</button>;
  return <button onClick={onClick} className={cls}>{inner}</button>;
}
function QuickReport({ icon: Icon, label, sub, onClick }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2.5 border border-outline-variant rounded-lg p-2.5 mb-2 hover:bg-surface-container-low text-left">
      <Icon size={16} className="text-primary shrink-0" />
      <span className="flex-1 min-w-0"><span className="block text-xs font-medium text-on-surface">{label}</span><span className="block text-[11px] text-on-surface-variant truncate">{sub}</span></span>
      <span className="text-on-surface-variant">›</span>
    </button>
  );
}
function Insight({ text }) {
  return (
    <div className="flex gap-2 py-1.5 border-b border-outline-variant/50 last:border-0 text-xs">
      <TrendingUp size={14} className="text-primary shrink-0 mt-0.5" />
      <p className="text-on-surface">{text}</p>
    </div>
  );
}
